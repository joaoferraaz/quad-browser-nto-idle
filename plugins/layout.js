// Plugin: Layout fixo
// O jogo empurra as janelas para dentro quando a tela encolhe (grade) e não devolve
// quando ela cresce (foco). Aqui cada modo tem a sua própria posição salva:
// o que você arruma na grade fica na grade, o que arruma em tela inteira fica lá.
window.__qb.define('layout', (api) => {
  let mode = null, downInWin = false, tResize = null, tSave = null;
  const KEY = (m) => `qb-layout-${m}`;
  const wins = () => [...document.querySelectorAll('#screen-game .win[data-win]')];
  const modeOf = (v) => (v.grid ? 'grid' : 'focus');
  const read = (m) => { try { return JSON.parse(localStorage.getItem(KEY(m))) || {}; } catch { return {}; } };
  const write = (m, o) => { try { localStorage.setItem(KEY(m), JSON.stringify(o)); } catch {} };
  const usable = (w) => !w.classList.contains('closed') && !w.classList.contains('docked') && getComputedStyle(w).display !== 'none';

  // guarda a posição atual das janelas visíveis no perfil do modo atual
  function snapshot() {
    if (!mode) return;
    const prof = read(mode);
    for (const w of wins()) {
      if (!usable(w)) continue;
      prof[w.dataset.win] = { l: w.style.left, t: w.style.top, w: w.style.width, h: w.style.height };
    }
    write(mode, prof);
  }

  // devolve cada janela para onde estava neste modo
  function restore() {
    if (!mode) return;
    const prof = read(mode);
    for (const w of wins()) {
      const s = prof[w.dataset.win];
      if (!s || w.classList.contains('docked')) continue;
      const l = parseFloat(s.l), t = parseFloat(s.t);
      if (Number.isFinite(l) && l < innerWidth - 40) w.style.left = s.l;
      if (Number.isFinite(t) && t < innerHeight - 30) w.style.top = s.t;
      if (s.w) w.style.width = s.w;
      if (s.h) w.style.height = s.h;
    }
  }

  // o jogo reposiciona logo depois do resize; restaurar em duas passadas garante a última palavra
  const restoreSoon = () => { clearTimeout(tResize); tResize = setTimeout(() => { restore(); setTimeout(restore, 500); }, 250); };

  const onDown = (e) => { downInWin = !!e.target.closest?.('#screen-game .win'); };
  const onUp = () => { if (downInWin) { clearTimeout(tSave); tSave = setTimeout(snapshot, 300); } downInWin = false; };

  return {
    start() {
      mode = modeOf(api.view());
      addEventListener('pointerdown', onDown, true);
      addEventListener('pointerup', onUp, true);
      addEventListener('resize', restoreSoon);
      // primeira vez neste modo: usa o arranjo atual como ponto de partida
      setTimeout(() => { if (!Object.keys(read(mode)).length) snapshot(); else restore(); }, 1500);
    },
    onView(v) {
      const next = modeOf(v);
      if (next === mode) return;
      mode = next;
      setTimeout(() => { if (!Object.keys(read(mode)).length) snapshot(); }, 1200);
      restoreSoon();
    },
    stop() {
      removeEventListener('pointerdown', onDown, true);
      removeEventListener('pointerup', onUp, true);
      removeEventListener('resize', restoreSoon);
    },
    tick() { return { mode }; },
  };
});
