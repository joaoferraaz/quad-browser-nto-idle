// Plugin (Evolution): Painel das contas + alertas
// Avisa uma vez quando a condição começa e de novo só depois que ela some.
window.__qb.define('eiw-painel', (api) => {
  let cfg = {}, off = null, seenRare = new Set(), lastEvo = 0;
  const armed = {};
  const fire = (key, on, level, text) => {
    if (on && !armed[key]) { armed[key] = true; api.emit('alert', { key, level, text }); }
    else if (!on) armed[key] = false;
  };

  function onEvent(e) {
    const d = e.d || {}, me = api.state().name;
    if (e.n === 'wild_respawned' && cfg.rare && (d.prismatic || d.special) && !seenRare.has(d.uid + '|' + e.t)) {
      seenRare.add(d.uid + '|' + e.t);
      api.emit('alert', { key: 'rare', level: 'info', text: `${d.prismatic ? 'Prismático' : 'Especial'} por perto: ${d.species} Lv ${d.level}` });
    }
    if (e.n === 'pm_message' && cfg.pm && d.from && d.from !== me) {
      api.emit('alert', { key: 'pm', level: 'info', text: `PM de ${d.from}: ${String(d.message || d.text || '').slice(0, 120)}` });
    }
    if (e.n === 'chat_message' && d.from && d.from !== me && !String(d.from).startsWith('[')) {
      const t = String(d.message || '').toLowerCase();
      const words = [cfg.mention ? me : '', ...String(cfg.keywords || '').split(',')].map((w) => (w || '').trim().toLowerCase()).filter(Boolean);
      if (words.some((w) => t.includes(w))) api.emit('alert', { key: 'kw', level: 'info', text: `${d.from}: ${String(d.message).slice(0, 120)}` });
    }
  }

  return {
    start(s) { cfg = s || {}; off = api.onEvent(onEvent); },
    configure(s) { cfg = s || {}; },
    stop() { off?.(); },
    tick(b) {
      const now = Date.now();
      fire('offline', !b.connected && b.disconnectedFor > 30e3, 'warn', 'Desconectou do jogo há mais de 30 s');
      if (!b.inGame) return null;
      const p = b.partner;
      fire('hp', !!p && p.hpPct != null && p.hpPct * 100 < cfg.hpPct, 'danger', `${p?.name || 'Digimon ativo'} com ${Math.round((p?.hpPct || 0) * 100)}% de vida`);
      fire('points', cfg.points && b.tamer?.free > 0, 'ok', `${b.tamer?.free} ponto(s) de Tamer livre(s) para distribuir`);
      fire('idle', cfg.idleMin > 0 && b.connected && b.lastOwn > 0 && now - b.lastOwn > cfg.idleMin * 60e3, 'warn', `Sem caçar há mais de ${cfg.idleMin} min (Auto-Farm desligado?)`);
      if (b.evolved && b.evolved.t > lastEvo) { lastEvo = b.evolved.t; api.emit('alert', { key: 'evo', level: 'ok', text: `Evoluiu para ${b.evolved.to}` }); }
      // travou: nem os pings do servidor chegam mais
      if (cfg.watchdogMin > 0 && b.connected && b.lastRaw && now - b.lastRaw > cfg.watchdogMin * 60e3 && !armed.frozen) {
        armed.frozen = true; api.emit('reload', { text: `Sem resposta do servidor há ${cfg.watchdogMin} min, recarregando` });
      }
      return { alerts: Object.keys(armed).filter((k) => armed[k] && k !== 'frozen') };
    },
  };
});
