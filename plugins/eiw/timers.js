// Plugin (Evolution): Central de timers
// Gera os relógios desta conta (e os do servidor) para a tela "Central de timers" do app.
// O app junta as 4 janelas, remove repetidos e notifica na hora certa.
window.__qb.define('eiw-timers', (api) => {
  let cfg = {}, off = null;
  const BRT_RESET_UTC = 8; // 05:00 em Brasília = 08:00 UTC

  const nextDaily = (now) => { const d = new Date(now); d.setUTCHours(BRT_RESET_UTC, 0, 0, 0); if (d <= now) d.setUTCDate(d.getUTCDate() + 1); return +d; };
  const nextWeekly = (now) => { const d = new Date(nextDaily(now)); while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1); return +d; };

  // lista de chefes do jogo (formato pode variar: aceita array ou objeto)
  function bossList(bt) {
    if (!bt) return [];
    const raw = Array.isArray(bt.d) ? bt.d : Array.isArray(bt.d?.bosses) ? bt.d.bosses : Array.isArray(bt.d?.timers) ? bt.d.timers
      : Object.entries(bt.d || {}).map(([k, v]) => (typeof v === 'object' ? { name: k, ...v } : { name: k, next: v }));
    return raw.map((o) => {
      const at = (() => { for (const [k, v] of Object.entries(o)) if (typeof v === 'number' && /next|respawn|at|in|left|remain|sec|ms/i.test(k)) return v > 1e12 ? v : v > 1e9 ? v * 1000 : /sec|_s$/i.test(k) || v < 1e5 ? bt.t + v * 1000 : bt.t + v; return null; })();
      return { name: o.name || o.boss || o.species, zone: o.zone_pt || o.zone || o.map || '', at };
    }).filter((x) => x.name && x.at);
  }

  function onEvent(e) {
    if (cfg.boss && e.n === 'chat_message' && e.d?.code === 'boss.spawned' && Array.isArray(e.d.args)) {
      const [boss, z] = e.d.args;
      api.emit('alert', { key: 'boss', level: 'info', global: true, text: `Chefe ${boss} apareceu em ${(z && (z.pt || z.zone)) || '?'}` });
    }
  }

  return {
    start(s) { cfg = s || {}; off = api.onEvent(onEvent); },
    configure(s) { cfg = s || {}; },
    stop() { off?.(); },
    tick(b) {
      const now = Date.now(), list = [];
      list.push({ key: 'eiw:reset:d', global: true, kind: 'reset', label: 'Reset das missões diárias', at: nextDaily(now), notify: cfg.notifyReset });
      list.push({ key: 'eiw:reset:w', global: true, kind: 'reset', label: 'Reset semanal (missões, guild, Liga)', at: nextWeekly(now), notify: cfg.notifyReset });
      if (!b.inGame) return { timers: list };
      for (const [name, x] of Object.entries(b.bosses || {})) list.push({ key: `eiw:boss:${name}:seen`, global: true, kind: 'boss', label: `${name} apareceu`, detail: x.zone, at: x.t });
      for (const x of bossList(b.bossTimers)) list.push({ key: `eiw:boss:${x.name}`, global: true, kind: 'boss', label: `Chefe ${x.name}`, detail: x.zone, at: x.at, notify: cfg.boss });
      for (const x of b.eggs || []) list.push({ key: `egg:${x.at}`, kind: 'egg', label: `${x.label} pronto na incubadora`, at: x.at, notify: cfg.notifyEgg });
      for (const x of b.buffs || []) list.push({ key: `buff:${x.label}`, kind: 'buff', label: `${x.label} acaba`, at: x.at, notify: cfg.notifyBuff });
      if (b.tamer?.eta) list.push({ key: 'lvl:tamer', kind: 'level', label: `Tamer Lv ${b.tamer.level + 1}`, at: b.tamer.eta, notify: cfg.notifyLevel });
      for (const m of b.party || []) if (m.eta) list.push({ key: `lvl:p${m.i}`, kind: 'level', label: `${m.name || `Digimon ${m.i + 1}`} sobe de nível`, at: m.eta, notify: cfg.notifyLevel && m.active });
      return { timers: list };
    },
  };
});
