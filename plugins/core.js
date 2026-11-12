// Quad Browser · núcleo comum dos runtimes de plugin (registro, liga/desliga, fila para o app)
// Cada jogo só fornece o "retrato" da conta (base) e o que mais os plugins dele precisam (extra).
if (!window.__qbMake) window.__qbMake = (game, base, extra = {}) => {
  const defs = {}, live = {}, queue = [];
  let view = { grid: true };
  return (window.__qb = {
    game,
    define(id, factory) { defs[id] = factory; },
    enable(id, settings) {
      if (!defs[id]) return false;
      if (live[id]) { live[id].configure?.(settings); return true; }
      const api = {
        id, base, view: () => view, ...extra,
        emit: (type, data) => { queue.push({ plugin: id, type, ...data, at: Date.now() }); if (queue.length > 200) queue.shift(); },
      };
      try { live[id] = defs[id](api); live[id].start?.(settings); } catch (e) { console.warn('[qb] falha ao iniciar', id, e); delete live[id]; return false; }
      return true;
    },
    disable(id) { try { live[id]?.stop?.(); } catch (e) { console.warn(e); } delete live[id]; },
    configure(id, settings) { live[id]?.configure?.(settings); },
    setView(v) { view = { ...view, ...v }; for (const k in live) live[k].onView?.(view); },
    active: () => Object.keys(live),
    // chamado pelo app a cada ~2s: devolve o retrato + eventos pendentes
    drain() {
      extra.beforeDrain?.();
      const snap = base();
      for (const k in live) { try { const x = live[k].tick?.(snap); if (x) snap[k] = x; } catch (e) { console.warn('[qb]', k, e); } }
      return { snap, events: queue.splice(0) };
    },
  });
};
void 0; // executeJavaScript devolve o último valor: nada a devolver aqui
