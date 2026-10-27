// Plugin: Histórico de caçadas
// Na página: acompanha a sessão do Hunt Analyzer e o consumo de poções.
// O app junta os retratos e grava cada caçada quando ela termina.
window.__qb.define('historico', (api) => {
  let cur = null; // { start, potHp, potKi, usedHp, usedKi, activeMs, lastAt }
  const KEY = 'qb-hist-cur';

  try { cur = JSON.parse(sessionStorage.getItem(KEY)); } catch { cur = null; }
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(cur)); } catch {} };

  return {
    start() {},
    stop() {},
    tick(b) {
      const s = b.session;
      if (!b.inGame || !s) return null;
      if (!cur || cur.start !== s.start) cur = { start: s.start, potHp: b.pots.hp, potKi: b.pots.ki, usedHp: 0, usedKi: 0, activeMs: 0, lastAt: Date.now() };
      if (cur.invPura == null) { cur.invPura = b.essInv.pura; cur.invEss = b.essInv.ess; cur.gotPura = 0; cur.gotEss = 0; }
      if (b.essInv.pura > cur.invPura) cur.gotPura += b.essInv.pura - cur.invPura;
      if (b.essInv.ess > cur.invEss) cur.gotEss += b.essInv.ess - cur.invEss;
      cur.invPura = b.essInv.pura; cur.invEss = b.essInv.ess;
      // só conta as quedas (comprar poção no meio não vira consumo negativo)
      if (b.pots.hp < cur.potHp) cur.usedHp += cur.potHp - b.pots.hp;
      if (b.pots.ki < cur.potKi) cur.usedKi += cur.potKi - b.pots.ki;
      cur.potHp = b.pots.hp; cur.potKi = b.pots.ki;
      const now = Date.now();
      if (b.mode === 'hunt') cur.activeMs += Math.min(10e3, now - cur.lastAt);
      cur.lastAt = now;
      save();
      return { start: cur.start, usedHp: cur.usedHp, usedKi: cur.usedKi, activeMs: cur.activeMs, gotPura: cur.gotPura, gotEss: cur.gotEss };
    },
  };
});
