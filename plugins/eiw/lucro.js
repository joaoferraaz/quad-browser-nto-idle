// Plugin (Evolution): Lucro do farm
// Bits ganhos nas kills menos o que saiu da carteira (cura, compra automática VIP, loja).
window.__qb.define('eiw-lucro', (api) => {
  let cfg = {}, lossSince = 0, warned = false;
  return {
    start(s) { cfg = s || {}; },
    configure(s) { cfg = s || {}; },
    tick(b) {
      if (!b.inGame || b.netPh == null) return null;
      const losing = b.farming && b.netPh < 0 && b.windowMin >= 3;
      if (!losing) { lossSince = 0; warned = false; }
      else if (!lossSince) lossSince = Date.now();
      if (losing && !warned && cfg.lossMin > 0 && Date.now() - lossSince > cfg.lossMin * 60e3) {
        warned = true;
        api.emit('alert', { key: 'loss', level: 'warn', text: `Farm no prejuízo: ${Math.round(b.netPh).toLocaleString('pt-BR')} Bits/h (cura e compras gastam mais do que as kills rendem)` });
      }
      return { earnedPh: b.earnedPh, spentPh: b.spentPh, netPh: b.netPh, losing };
    },
  };
});
