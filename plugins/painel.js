// Plugin: Painel das contas + alertas
// Avisa uma vez quando a condição começa e só avisa de novo depois que ela some.
window.__qb.define('painel', (api) => {
  let cfg = {};
  const armed = {};          // chave -> condição já avisada?
  let huntingSince = 0;      // última vez visto caçando
  let leftWorldAt = 0, wasInGame = false;
  let offChat = null;

  const fire = (key, on, level, text) => {
    if (on && !armed[key]) { armed[key] = true; api.emit('alert', { key, level, text }); }
    else if (!on) armed[key] = false;
  };

  const hhmm = (ms) => { const m = Math.floor(ms / 60000); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };

  function onChat(m) {
    const p = api.player(); if (!p || !m || m.from === p.name) return;
    if (m.ch === 'pm' && cfg.pm) api.emit('alert', { key: 'pm', level: 'info', text: `PM de ${m.from}: ${String(m.text).slice(0, 120)}`, once: false });
    else if (m.ch !== 'sys' && m.ch !== 'log' && m.ch !== 'pm' && m.text) {
      const t = String(m.text).toLowerCase();
      const words = [cfg.mention ? p.name : '', ...String(cfg.keywords || '').split(',')].map((w) => w.trim().toLowerCase()).filter(Boolean);
      const hit = words.find((w) => t.includes(w));
      if (hit) api.emit('alert', { key: 'kw', level: 'info', text: `${m.from} (${m.ch}): ${String(m.text).slice(0, 120)}` });
    }
  }

  return {
    start(s) { cfg = s || {}; offChat = api.onChat(onChat); },
    configure(s) { cfg = s || {}; },
    stop() { offChat?.(); },
    tick(b) {
      const now = Date.now();

      // fora do mundo (desconectou / caiu na seleção de personagem)
      if (!b.inGame) {
        if (wasInGame && !leftWorldAt) leftWorldAt = now;
        fire('offline', wasInGame && leftWorldAt && now - leftWorldAt > 60e3, 'warn', 'Saiu do mundo ou desconectou há mais de 1 min');
        return { alerts: Object.keys(armed).filter((k) => armed[k]) };
      }
      wasInGame = true; leftWorldAt = 0; fire('offline', false);

      if (b.mode === 'hunt') huntingSince = now;
      else if (!huntingSince) huntingSince = now;

      fire('dead', b.mode === 'dead', 'danger', 'Personagem morreu');
      fire('hp', b.hpPct != null && b.mode !== 'dead' && b.hpPct * 100 < cfg.hpPct, 'danger', `Vida abaixo de ${cfg.hpPct}%`);
      fire('stamina', b.stamina < cfg.staminaH * 3600e3, 'warn', `Stamina em ${hhmm(b.stamina)} (abaixo de ${cfg.staminaH}h)`);
      fire('potHp', b.pots.hp < cfg.potMin, 'warn', `Heal Potion acabando: ${b.pots.hp}`);
      fire('potKi', b.pots.ki < cfg.potMin, 'warn', `Chakra Potion acabando: ${b.pots.ki}`);
      fire('bag', b.bag.cap > 0 && b.bag.cap - b.bag.used <= cfg.bagFree, 'warn', `Mochila quase cheia: ${b.bag.used}/${b.bag.cap}`);
      fire('task', !!b.task && b.task.need > 0 && b.task.have >= b.task.need, 'ok', 'Task concluída, pode entregar');
      fire('idle', cfg.idleMin > 0 && b.mode !== 'hunt' && b.mode !== 'dead' && now - huntingSince > cfg.idleMin * 60e3, 'warn', `Parado há mais de ${cfg.idleMin} min`);

      // travamento: o jogo parou de receber estado do servidor
      const ls = api.lastState();
      if (cfg.watchdogMin > 0 && ls && now - ls > cfg.watchdogMin * 60e3 && !armed.frozen) {
        armed.frozen = true;
        api.emit('reload', { text: `Sem atualização do jogo há ${cfg.watchdogMin} min, recarregando` });
      }
      if (ls && now - ls < 10e3) armed.frozen = false;

      return { alerts: Object.keys(armed).filter((k) => armed[k] && k !== 'frozen') };
    },
  };
});
