// Quad Browser · runtime dos plugins (roda dentro da página do jogo, mundo principal)
// Só LÊ o estado do cliente (window.NTO.ctx) e devolve um retrato para o app.
// Nenhum plugin envia comandos ao servidor do jogo.
(() => {
  if (window.__qb) return;

  let G = null;         // módulo /js/game.js do próprio jogo (derived, expForLevel, fmt...)
  let lastState = 0, boundClient = null, boundNet = null;
  const chatSubs = new Set();

  import('/js/game.js').then((m) => { G = m; }).catch(() => {});

  const ctx = () => window.NTO && window.NTO.ctx;
  const client = () => ctx()?.client || null;
  const player = () => client()?.p || null;

  // reassina eventos quando o jogo troca de conexão (reconectar, trocar personagem)
  function bind() {
    const c = client(), n = ctx()?.net;
    if (c && c !== boundClient) {
      boundClient = c;
      c.on('state', () => {
        if (c === boundClient) lastState = Date.now();
      });
    }
    if (n && n !== boundNet) {
      boundNet = n;
      n.on('chat', (m) => {
        if (n !== boundNet) return;
        chatSubs.forEach((f) => { try { f(m); } catch (e) { console.warn('[qb]', e); } });
      });
    }
  }

  const POTS = { hp: [2150, 7477], ki: [2149] };
  const ESS = { pura: 30313, ess: 30312 }; // Essência de Chakra Pura / Essência de Chakra
  const count = (p, ids) => (p.inventory || []).reduce((s, it) => s + (ids.includes(it.id) ? it.count : 0), 0);

  // retrato padronizado do personagem, compartilhado por todos os plugins
  function base() {
    const c = client(), p = player();
    if (!c || !p) return { inGame: false, at: Date.now() };
    const d = G ? G.derived(p) : null;
    const lo = G ? G.expForLevel(p.level) : 0, hi = G ? G.expForLevel(p.level + 1) : 1;
    const s = c.session, e = c.enemy;
    const dead = c.mode === 'dead' || document.querySelector('#screen-game')?.classList.contains('dead');
    const hrs = s ? Math.max(1 / 3600, (Date.now() - s.start) / 3.6e6) : 0;
    const cap = G ? G.invCap(p) : 0;
    return {
      inGame: true,
      at: Date.now(),
      name: p.name,
      level: p.level,
      exp: p.exp,
      expPct: hi > lo ? Math.max(0, Math.min(1, (p.exp - lo) / (hi - lo))) : 0,
      expNext: Math.max(0, hi - p.exp),
      hpPct: d ? Math.max(0, Math.min(1, p.hp / d.maxHp)) : null,
      kiPct: d ? Math.max(0, Math.min(1, p.mana / d.maxMana)) : null,
      stamina: p.stamina,
      mode: dead ? 'dead' : c.mode,
      zone: c.zone?.name || c.atDepot?.name || null,
      target: e ? { name: e.name, hp: e.hp } : null,
      session: s ? { start: s.start, kills: s.kills, exp: s.exp, gold: s.gold, deaths: s.deaths, eph: s.exp / hrs, gph: s.gold / hrs, ms: Date.now() - s.start,
        pura: s.loot?.[ESS.pura] || 0, ess: s.loot?.[ESS.ess] || 0, puraPh: (s.loot?.[ESS.pura] || 0) / hrs, essPh: (s.loot?.[ESS.ess] || 0) / hrs } : null,
      task: p.task ? { have: p.task.have, need: p.task.need, name: p.task.name || p.task.target || p.task.mon || '' } : null,
      pots: { hp: count(p, POTS.hp), ki: count(p, POTS.ki) },
      essInv: { pura: count(p, [ESS.pura]), ess: count(p, [ESS.ess]) },
      potPrice: G?.POTION_PRICE ?? null,
      bag: { used: (p.inventory || []).length, cap },
      gold: p.gold,
      lastState,
      mission: p.mission ? { title: p.mission.title, until: p.mission.until - (c.offset || 0) } : null,
      buffs: Object.entries(c.buffs || {}).map(([k, x]) => ({ name: x.name || k, until: x.until })).filter((x) => x.until > Date.now()),
    };
  }

  window.__qbMake('nto', base, {
    G: () => G, player, beforeDrain: bind,
    onChat: (f) => { chatSubs.add(f); return () => chatSubs.delete(f); },
    lastState: () => lastState,
  });
})();
