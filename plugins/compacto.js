// Plugin: HUD compacto
// Em grade, esconde as janelas do jogo por CSS (não mexe no layout salvo do jogo)
// e mostra um mini-HUD. Em foco, tudo volta como estava.
window.__qb.define('compacto', (api) => {
  let cfg = {}, on = false, peek = false, el = null, style = null, timer = null;

  const CSS = `
  body.qb-compact #screen-game .win:not(.qb-keep){display:none!important}
  body.qb-compact.qb-hidebar #toolbar, body.qb-compact.qb-hidebar #tb-toggle, body.qb-compact.qb-hidebar .toolbar{display:none!important}
  #qb-mini{position:fixed;left:10px;top:10px;z-index:2147483000;width:230px;padding:10px 12px 11px;border-radius:12px;
    background:linear-gradient(180deg,rgba(19,28,46,.92),rgba(10,15,26,.92));backdrop-filter:blur(6px);
    box-shadow:inset 0 0 0 1px rgba(255,255,255,.09),0 12px 30px -12px #000;color:#e8eef9;font:500 11.5px/1.3 Inter,system-ui,sans-serif;pointer-events:auto;user-select:none}
  #qb-mini .t{display:flex;align-items:baseline;gap:6px;margin-bottom:6px}
  #qb-mini .t b{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #qb-mini .t span{color:#8f9bb3;margin-left:auto;font:600 10.5px JetBrains Mono,monospace}
  #qb-mini .r{display:grid;grid-template-columns:34px 1fr 40px;align-items:center;gap:6px;margin:3px 0}
  #qb-mini .r small{color:#8f9bb3}
  #qb-mini .r em{font-style:normal;text-align:right;font:600 10.5px JetBrains Mono,monospace;color:#c7d0e0}
  #qb-mini .bar{height:6px;border-radius:4px;background:rgba(0,0,0,.45);overflow:hidden}
  #qb-mini .bar i{display:block;height:100%;border-radius:4px;transition:width .4s}
  #qb-mini .hp i{background:linear-gradient(90deg,#f43f5e,#fb7185)} #qb-mini .ki i{background:linear-gradient(90deg,#3b82f6,#60a5fa)}
  #qb-mini .xp i{background:linear-gradient(90deg,#8b5cf6,#c4b5fd)}
  #qb-mini .z{display:flex;justify-content:space-between;gap:8px;margin-top:7px;padding-top:7px;border-top:1px solid rgba(255,255,255,.07);color:#aab6cc}
  #qb-mini .z b{color:#e8eef9;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #qb-mini .tg{margin-top:5px;color:#fda4af;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #qb-mini .dot{width:7px;height:7px;border-radius:50%;display:inline-block;margin-right:5px;background:#64748b}
  #qb-mini .dot.hunt{background:#4ade80;box-shadow:0 0 8px #4ade80} #qb-mini .dot.dead{background:#f43f5e}
  #qb-mini button{all:unset;cursor:pointer;color:#8f9bb3;font-size:10.5px;margin-top:7px;display:block}
  #qb-mini button:hover{color:#e8eef9}`;

  const rate = (n) => (n < 10 ? (Math.round(n * 10) / 10).toLocaleString('pt-BR') : fmt(n));
  const fmt = (n) => api.G()?.fmt ? api.G().fmt(n) : String(Math.round(n));
  const MODE = { hunt: 'caçando', travel: 'viajando', loading: 'viajando', depot: 'no depot', idle: 'parado', dead: 'morto' };

  function apply() {
    const want = !peek && (cfg.mode === 'sempre' || (cfg.mode === 'auto' && api.view().grid));
    if (want === on && el) { keepList(); return; }
    on = want;
    document.body.classList.toggle('qb-compact', on);
    document.body.classList.toggle('qb-hidebar', on && !!cfg.hideTopbar);
    keepList();
    if (on && cfg.miniHud) { mount(); render(); }
    else if (!on && el && !peek) { el.remove(); el = null; }
    if (peek && el) render();
  }

  function keepList() {
    const keep = String(cfg.keep || '').split(',').map((s) => s.trim()).filter(Boolean);
    document.querySelectorAll('#screen-game .win[data-win]').forEach((w) => w.classList.toggle('qb-keep', keep.includes(w.dataset.win)));
  }

  function mount() {
    if (el) return;
    el = document.createElement('div'); el.id = 'qb-mini';
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { if (e.target.closest('button')) { peek = !peek; apply(); render(); } });
  }

  function render() {
    if (!el) return;
    const b = api.base();
    if (!b.inGame) { el.innerHTML = '<div class="t"><b>Fora do jogo</b></div>'; return; }
    const pct = (v) => `${Math.round((v || 0) * 100)}%`;
    el.innerHTML = `
      <div class="t"><b>${esc(b.name)}</b><span>Lv ${b.level}</span></div>
      <div class="r hp"><small>Vida</small><div class="bar"><i style="width:${pct(b.hpPct)}"></i></div><em>${pct(b.hpPct)}</em></div>
      <div class="r ki"><small>Ki</small><div class="bar"><i style="width:${pct(b.kiPct)}"></i></div><em>${pct(b.kiPct)}</em></div>
      <div class="r xp"><small>Exp</small><div class="bar"><i style="width:${pct(b.expPct)}"></i></div><em>${pct(b.expPct)}</em></div>
      <div class="z"><span><i class="dot ${b.mode}"></i>${MODE[b.mode] || b.mode}</span><b>${esc(b.zone || '')}</b></div>
      ${b.session ? `<div class="z"><span>Exp/h</span><b>${fmt(b.session.eph)}</b></div>` : ''}
      ${b.session ? `<div class="z"><span>Ess. Pura/h</span><b>${rate(b.session.puraPh)}</b></div><div class="z"><span>Ess. Chakra/h</span><b>${rate(b.session.essPh)}</b></div>` : ''}
      ${b.target ? `<div class="tg">Alvo: ${esc(b.target.name)} · ${b.target.hp}%</div>` : ''}
      <button>${peek ? 'Voltar ao compacto' : 'Mostrar o jogo completo'}</button>`;
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  return {
    start(s) {
      cfg = s || {};
      style = document.createElement('style'); style.id = 'qb-compact-css'; style.textContent = CSS;
      document.head.appendChild(style);
      timer = setInterval(() => { keepList(); render(); }, 1000);
      apply();
    },
    configure(s) { cfg = s || {}; if (!cfg.miniHud && el) { el.remove(); el = null; } on = !on; apply(); },
    onView() { peek = false; apply(); },
    stop() {
      clearInterval(timer); style?.remove(); el?.remove(); el = null;
      document.body.classList.remove('qb-compact', 'qb-hidebar');
      document.querySelectorAll('.qb-keep').forEach((w) => w.classList.remove('qb-keep'));
    },
    tick() { return { compact: on }; },
  };
});
