// Quad Browser · runtime dos plugins do Evolution Idle World
// Monta o retrato da conta a partir das mensagens que o servidor já envia ao jogo
// (capturadas pela escuta passiva do preload). Só leitura: nada é enviado.
(() => {
  if (window.__qb) return;
  const T = window.__qbTap;

  const WIN = 15 * 60e3; // janela das médias por hora
  const evSubs = new Set();

  const S = {
    name: null, bits: null, cash: null,
    tamer: null, partner: null, active: null, party: null, names: {},
    lastOwn: 0, lastAny: 0, heals: 0,
    kills: [], coinPts: [], txp: [], pxp: {},
    rare: [], bosses: {}, bossTimers: null, eggs: [], buffs: [], evolved: null, levelUps: 0,
  };

  const trim = (arr, keep = WIN) => { const c = Date.now() - keep; while (arr.length && arr[0].t < c) arr.shift(); };
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

  function setCoins(v, t) {
    if (num(v) == null) return;
    S.bits = v; S.coinPts.push({ t, v }); trim(S.coinPts);
  }

  // carteira e campos soltos que aparecem em várias mensagens
  function walletish(d, t) {
    if (!d || typeof d !== 'object') return;
    if (num(d.coins) != null) setCoins(d.coins, t);
    else if (num(d.bits) != null) setCoins(d.bits, t);
    for (const k of ['cash', 'eiw_coin', 'eiwcoin', 'eiw', 'eiwCoin']) if (num(d[k]) != null) { S.cash = d[k]; break; }
  }

  // procura nome do jogador e carteira em mensagens de login/atualização (formato pode mudar: busca tolerante)
  function scan(d, t, depth = 0) {
    if (!d || typeof d !== 'object' || depth > 3) return;
    walletish(d, t);
    for (const k of ['player', 'tamer', 'me', 'profile', 'user']) if (d[k] && typeof d[k] === 'object') {
      const o = d[k];
      if (!S.name && typeof (o.name || o.nick) === 'string') S.name = o.name || o.nick;
      scan(o, t, depth + 1);
    }
  }

  // tempo absoluto a partir de campos como next_at, respawn_in, ready_at, seconds...
  function timeOf(o) {
    if (!o || typeof o !== 'object') return null;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v !== 'number' || !/next|respawn|ready|until|end|finish|expire|at$|_at|left|remain|in$|_in|sec|ms/i.test(k)) continue;
      if (v > 1e12) return v;               // epoch em ms
      if (v > 1e9) return v * 1000;         // epoch em s
      if (/sec|_s$/i.test(k)) return Date.now() + v * 1000;
      if (v >= 0) return Date.now() + (v < 1e5 && !/ms/i.test(k) ? v * 1000 : v);
    }
    return null;
  }
  const nameOf = (o) => o && (o.name || o.boss || o.species || o.title || o.label || o.id);

  function updatePlayer(pu, t) {
    walletish(pu, t);
    if (num(pu.tamer_level) != null) {
      const prev = S.tamer;
      S.tamer = { level: pu.tamer_level, xp: pu.tamer_xp, next: pu.tamer_xp_to_next, free: pu.tamer_points_free || 0 };
      // xp acumulado do Tamer (soma o que faltava do nível anterior quando sobe)
      const last = S.txp[S.txp.length - 1];
      let acc = last ? last.acc : 0;
      if (last && prev) acc += prev.level === S.tamer.level ? Math.max(0, S.tamer.xp - prev.xp) : Math.max(0, prev.next - prev.xp) + S.tamer.xp;
      S.txp.push({ t, acc }); trim(S.txp);
    }
    if (num(pu.partner_level) != null) {
      S.partner = { level: pu.partner_level, hp: pu.partner_hp, max: pu.partner_max_hp, xp: pu.partner_xp, next: pu.partner_xp_to_next, atk: pu.partner_atk, def: pu.partner_def, spd: pu.partner_spd };
    }
    if (num(pu.active_index) != null) S.active = pu.active_index;
    if (Array.isArray(pu.party_xp)) {
      S.party = pu.party_xp;
      pu.party_xp.forEach((x, i) => {
        if (!Array.isArray(x)) return;
        const h = (S.pxp[i] ||= []), last = h[h.length - 1];
        let acc = last ? last.acc : 0;
        if (last) acc += x[0] >= last.xp ? x[0] - last.xp : Math.max(0, last.next - last.xp) + x[0];
        h.push({ t, xp: x[0], next: x[1], acc }); trim(h);
      });
    }
    if (pu.evolved_to) S.evolved = { t, to: pu.evolved_to };
  }

  function apply(e) {
    const d = e.d || {};
    S.lastAny = e.t;
    switch (e.n) {
      case 'attack_result': {
        const pu = d.player_update;
        if (pu && !S.name && d.attacker) S.name = d.attacker;
        const mine = !!pu || (S.name && d.attacker === S.name);
        if (!mine) break;
        S.lastOwn = e.t;
        if (d.result && d.result.killed && d.rewards) {
          S.kills.push({ t: e.t, xp: d.rewards.xp || 0, coins: d.rewards.coins || 0, drops: d.rewards.drops || [] });
          trim(S.kills);
          if (d.rewards.tamer_levels) S.levelUps += d.rewards.tamer_levels;
        }
        if (pu) updatePlayer(pu, e.t);
        break;
      }
      case 'item_used':
        if (d.code === 'item.healed') S.heals++;
        if (d.target_index != null && Array.isArray(d.args) && typeof d.args[0] === 'string') S.names[d.target_index] = d.args[0];
        if (d.target_index != null && d.target_index === S.active && S.partner && num(d.new_hp) != null) { S.partner.hp = d.new_hp; S.partner.max = d.max_hp ?? S.partner.max; }
        break;
      case 'shop_bought': case 'wallet_update': case 'vip_autobuy': walletish(d, e.t); break;
      case 'wild_respawned':
        if (d.prismatic || d.special || d.is_boss) { S.rare.push({ t: e.t, uid: d.uid, species: d.species, level: d.level, prismatic: !!d.prismatic, special: !!d.special, boss: !!d.is_boss }); if (S.rare.length > 40) S.rare.shift(); }
        break;
      case 'chat_message':
        if (d.code === 'boss.spawned' && Array.isArray(d.args)) {
          const [boss, z] = d.args;
          S.bosses[boss] = { t: e.t, zone: (z && (z.pt || z.zone)) || '' };
        }
        break;
      case 'boss_timers': S.bossTimers = { t: e.t, d }; break;
      case 'egg_incubated': case 'incubation_boosted': {
        const at = timeOf(d) || timeOf(d.egg) || timeOf(d.slot);
        if (at) { S.eggs = S.eggs.filter((x) => x.at > Date.now()); S.eggs.push({ at, label: nameOf(d.egg) || nameOf(d) || 'Ovo' }); }
        break;
      }
      case 'incubation_cancelled': S.eggs = []; break;
      case 'login_ok': case 'server_update': case 'tamer_tick': scan(d, e.t); break;
      default:
        // buffs e afins: guarda o que tiver nome + tempo de fim
        if (/buff/i.test(e.n)) { const at = timeOf(d); if (at) S.buffs = [...S.buffs.filter((b) => b.at > Date.now()), { at, label: nameOf(d) || 'Buff' }]; }
    }
    evSubs.forEach((f) => { try { f(e); } catch (err) { console.warn('[qb]', err); } });
  }

  if (T) { T.events.forEach(apply); T.subs.add(apply); }

  // média por hora de uma série acumulada
  const ratePh = (arr, key = 'acc') => {
    if (!arr || arr.length < 2) return null;
    const a = arr[0], b = arr[arr.length - 1], ms = b.t - a.t;
    return ms >= 60e3 ? (b[key] - a[key]) / (ms / 3.6e6) : null;
  };

  function base() {
    const now = Date.now();
    if (!T) return { game: 'eiw', inGame: false, noTap: true, at: now };
    const connected = T.open > 0 && T.closed < T.open;
    if (!S.name && S.bits == null) return { game: 'eiw', inGame: false, connected, at: now };
    trim(S.kills); trim(S.coinPts);
    const span = S.kills.length ? Math.max(60e3, now - Math.min(S.kills[0].t, S.coinPts[0]?.t ?? now)) : 0;
    const earned = S.kills.reduce((s, k) => s + k.coins, 0);
    const net = S.coinPts.length > 1 ? S.coinPts[S.coinPts.length - 1].v - S.coinPts[0].v : null;
    const coinSpan = S.coinPts.length > 1 ? Math.max(60e3, S.coinPts[S.coinPts.length - 1].t - S.coinPts[0].t) : 0;
    const txph = ratePh(S.txp);
    const ap = S.active != null ? ratePh(S.pxp[S.active]) : null;
    const p = S.partner;
    return {
      game: 'eiw', inGame: true, connected, at: now,
      disconnectedFor: connected ? 0 : (T.closed ? now - T.closed : 0),
      lastRaw: T.lastRaw, lastAny: S.lastAny, lastOwn: S.lastOwn,
      farming: now - S.lastOwn < 60e3,
      name: S.name, bits: S.bits, cash: S.cash,
      tamer: S.tamer && { ...S.tamer, pct: S.tamer.next ? S.tamer.xp / S.tamer.next : 0, xph: txph, eta: txph > 0 ? now + (S.tamer.next - S.tamer.xp) / txph * 3.6e6 : null },
      partner: p && { ...p, name: S.names[S.active] || null, hpPct: p.max ? p.hp / p.max : null, xph: ap, eta: ap > 0 ? now + (p.next - p.xp) / ap * 3.6e6 : null },
      party: (S.party || []).map((x, i) => {
        const r = ratePh(S.pxp[i]);
        return { i, name: S.names[i] || null, xp: x[0], next: x[1], active: i === S.active, xph: r, eta: r > 0 ? now + (x[1] - x[0]) / r * 3.6e6 : null };
      }),
      kph: span ? S.kills.length / (span / 3.6e6) : null,
      earnedPh: span ? earned / (span / 3.6e6) : null,
      netPh: coinSpan && net != null ? net / (coinSpan / 3.6e6) : null,
      spentPh: coinSpan && net != null && span ? Math.max(0, earned - net) / (coinSpan / 3.6e6) : null,
      windowMin: Math.round(Math.max(span, coinSpan) / 60e3),
      heals: S.heals,
      bosses: S.bosses, bossTimers: S.bossTimers, eggs: S.eggs.filter((x) => x.at > now - 3600e3), buffs: S.buffs,
      evolved: S.evolved, rare: S.rare.slice(-5),
    };
  }

  window.__qbMake('eiw', base, {
    state: () => S,
    onEvent: (f) => { evSubs.add(f); return () => evSubs.delete(f); },
  });
})();
