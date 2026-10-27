export const POTION_PRICE = 120;
export function expForLevel(L) { return Math.floor((50 * L * L * L - 150 * L * L + 400 * L) / 3); }
export function derived(p) { return { maxHp: 1450000, maxMana: 553200 }; }
export function invCap(p) { return 60; }
export function fmt(n) { n = Math.round(n); if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + 'B'; if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M'; if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(1) + 'K'; return String(n); }
