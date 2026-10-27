// Quad Browser · gerenciador de plugins (processo principal)
// Injeta os plugins nas abas do jogo, lê o retrato de cada conta a cada 2s,
// dispara alertas/notificações e grava o histórico de caçadas.
const { ipcMain, Notification, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const POLL_MS = 2000;
const HOSTS = ['ntoidle.app', ...String(process.env.QB_PLUGIN_HOSTS || '').split(',').filter(Boolean)];

// catálogo: cada plugin pode ser ligado/desligado e escolhido por janela
const MANIFEST = [
  {
    id: 'painel',
    name: 'Painel das contas + alertas',
    desc: 'Faixa de status em cada janela (level, vida, stamina, exp/h, task, poções, mochila) e avisos com notificação do Windows. Recarrega a janela se o jogo travar.',
    settings: [
      { key: 'notify', label: 'Notificação do Windows', type: 'bool', def: true },
      { key: 'staminaH', label: 'Avisar stamina abaixo de', type: 'number', def: 40, min: 0, max: 42, step: 0.5, suffix: 'h' },
      { key: 'potMin', label: 'Avisar poção abaixo de', type: 'number', def: 100, min: 0, max: 100000, suffix: 'un.' },
      { key: 'hpPct', label: 'Avisar vida abaixo de', type: 'number', def: 25, min: 0, max: 100, suffix: '%' },
      { key: 'bagFree', label: 'Avisar mochila com até', type: 'number', def: 3, min: 0, max: 50, suffix: 'espaços livres' },
      { key: 'idleMin', label: 'Avisar parado há mais de', type: 'number', def: 3, min: 0, max: 120, suffix: 'min (0 = não)' },
      { key: 'watchdogMin', label: 'Recarregar se travar por', type: 'number', def: 2, min: 0, max: 30, suffix: 'min (0 = não)' },
      { key: 'pm', label: 'Avisar mensagem privada', type: 'bool', def: true },
      { key: 'mention', label: 'Avisar quando citarem meu nome', type: 'bool', def: true },
      { key: 'keywords', label: 'Palavras-chave no chat', type: 'text', def: '', placeholder: 'ex.: rinnegan, vendo set' },
    ],
  },
  {
    id: 'compacto',
    name: 'HUD compacto',
    desc: 'Na grade, esconde as janelas do jogo e mostra um mini-HUD (vida, ki, exp, alvo). Em foco, volta tudo como estava. Não altera o layout salvo do jogo.',
    settings: [
      { key: 'mode', label: 'Quando compactar', type: 'select', def: 'auto', options: [['auto', 'Automático (grade sim, foco não)'], ['sempre', 'Sempre'], ['nunca', 'Nunca (só desliga)']] },
      { key: 'miniHud', label: 'Mostrar mini-HUD', type: 'bool', def: true },
      { key: 'hideTopbar', label: 'Esconder a barra de cima do jogo', type: 'bool', def: true },
      { key: 'keep', label: 'Janelas do jogo que continuam visíveis', type: 'text', def: '', placeholder: 'ex.: battle, hunt, minimap' },
    ],
  },
  {
    id: 'layout',
    core: true, // recurso padrão do app: sempre ligado, não aparece na lista de plugins
    name: 'Layout fixo',
    desc: 'Guarda a posição das janelas do jogo (mochila, batalha, chat...) separada para a grade e para a tela inteira, e devolve cada uma para o lugar quando você troca. Arrume uma vez em cada modo.',
    settings: [],
  },
  {
    id: 'historico',
    name: 'Histórico de caçadas',
    desc: 'Grava cada caçada (mapa, tempo, exp, gold, mortes, poções gastas) para comparar mapas, ver o lucro de verdade, prever level e exportar CSV.',
    settings: [
      { key: 'minMin', label: 'Ignorar caçadas com menos de', type: 'number', def: 5, min: 0, max: 120, suffix: 'min' },
    ],
  },
];

const FILES = ['sdk', ...MANIFEST.map((m) => m.id)];

function createPluginHost({ app, state, getUi, onFocusPanel, panels = 4 }) {
  const dataDir = () => app.getPath('userData');
  const cfgPath = () => path.join(dataDir(), 'plugins.json');
  const huntsPath = () => path.join(dataDir(), 'hunts.json');

  // ---------- config ----------
  let cfg = {};
  function defaults(m) { return { on: true, wins: Array(panels).fill(true), set: Object.fromEntries(m.settings.map((s) => [s.key, s.def])) }; }
  function load() {
    let raw = {};
    try { raw = JSON.parse(fs.readFileSync(cfgPath(), 'utf8')); } catch {}
    for (const m of MANIFEST) {
      const d = defaults(m), r = raw[m.id] || {};
      cfg[m.id] = { on: r.on ?? d.on, wins: d.wins.map((v, i) => r.wins?.[i] ?? v), set: { ...d.set, ...(r.set || {}) } };
    }
  }
  const save = () => { try { fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(cfgPath(), JSON.stringify(cfg, null, 2)); } catch (e) { console.error(e); } };
  const CORE = new Set(MANIFEST.filter((m) => m.core).map((m) => m.id));
  const enabledFor = (id, p) => CORE.has(id) || (cfg[id]?.on && cfg[id].wins[p]);

  // ---------- histórico ----------
  let hunts = [];
  try { hunts = JSON.parse(fs.readFileSync(huntsPath(), 'utf8')); if (!Array.isArray(hunts)) hunts = []; } catch { hunts = []; }
  let huntsDirty = false;
  const saveHunts = () => { if (!huntsDirty) return; huntsDirty = false; try { fs.writeFileSync(huntsPath(), JSON.stringify(hunts)); } catch (e) { console.error(e); } };
  setInterval(saveHunts, 15000);

  function finalize(live) {
    if (!live) return;
    const s = live.session, h = live.hist || {};
    const ms = h.activeMs > 60e3 ? h.activeMs : s.ms;
    if (ms < (cfg.historico?.set.minMin ?? 5) * 60e3 || !s.exp) return;
    const key = `${live.name}|${s.start}`;
    const rec = {
      key, panel: live.panel, char: live.name, level: live.level, zone: live.zone || '?',
      start: s.start, end: live.at, ms, kills: s.kills, exp: s.exp, gold: s.gold, deaths: s.deaths,
      potHp: h.usedHp || 0, potKi: h.usedKi || 0, potCost: ((h.usedHp || 0) + (h.usedKi || 0)) * (live.potPrice || 0),
      // essências: o maior entre o loot da sessão e o que entrou na mochila
      pura: Math.max(s.pura || 0, h.gotPura || 0), ess: Math.max(s.ess || 0, h.gotEss || 0),
    };
    const i = hunts.findIndex((x) => x.key === key);
    if (i >= 0) hunts[i] = rec; else hunts.unshift(rec);
    if (hunts.length > 3000) hunts.length = 3000;
    huntsDirty = true;
  }

  // ---------- por aba ----------
  const tabs = new Map(); // wc.id -> { p, tab, snap, alerts[], live, pendingSince, injected }

  function isGame(url) { try { const h = new URL(url).hostname; return HOSTS.some((x) => h === x || h.endsWith('.' + x) || h === x.split(':')[0]); } catch { return false; } }

  const src = {};
  // QB_PLUGIN_DEV=1 relê os arquivos a cada injeção (para editar plugin sem reiniciar o app)
  const read = (f) => (!process.env.QB_PLUGIN_DEV && src[f]) || (src[f] = fs.readFileSync(path.join(__dirname, f + '.js'), 'utf8'));

  async function inject(rec) {
    const wc = rec.tab.view.webContents;
    if (wc.isDestroyed() || !isGame(wc.getURL())) { rec.injected = false; return; }
    const want = MANIFEST.filter((m) => enabledFor(m.id, rec.p)).map((m) => m.id);
    try {
      if (!want.length) { rec.injected = false; await wc.executeJavaScript(`window.__qb && __qb.active().forEach(id => __qb.disable(id))`, true); return; }
      await wc.executeJavaScript(read('sdk'), true);
      for (const id of want) await wc.executeJavaScript(read(id), true);
      const calls = MANIFEST.map((m) => want.includes(m.id)
        ? `__qb.enable(${JSON.stringify(m.id)}, ${JSON.stringify(cfg[m.id].set)});`
        : `__qb.disable(${JSON.stringify(m.id)});`).join('');
      await wc.executeJavaScript(calls + viewCall(rec.p), true);
      rec.injected = true;
    } catch (e) { console.warn('[plugins] injeção falhou', e.message); }
  }

  const viewCall = (p) => {
    const r = state.panels[p]?.rect;
    return `__qb.setView(${JSON.stringify({ grid: state.mode === 'grid', w: r?.width || 0, h: r?.height || 0 })});`;
  };

  function attach(p, tab) {
    const wc = tab.view.webContents;
    const rec = { p, tab, snap: null, alerts: [], live: null, pendingSince: 0, injected: false };
    tabs.set(wc.id, rec);
    wc.on('did-finish-load', () => inject(rec));
    wc.on('did-start-navigation', (_e, _url, inPage, isMain) => { if (isMain && !inPage) { finalize(rec.live); rec.live = null; rec.snap = null; rec.injected = false; } });
    wc.once('destroyed', () => { finalize(rec.live); tabs.delete(wc.id); pushUi(); });
  }

  // ---------- leitura periódica ----------
  async function poll(rec) {
    const wc = rec.tab.view.webContents;
    if (wc.isDestroyed() || !rec.injected) return;
    const wd = cfg.painel?.on && cfg.painel.wins[rec.p] ? cfg.painel.set.watchdogMin : 0;
    if (rec.pendingSince) {
      // a página nem responde: travou de vez
      if (wd > 0 && Date.now() - rec.pendingSince > wd * 60e3) { rec.pendingSince = 0; alert(rec, { key: 'frozen', level: 'warn', text: 'A página parou de responder, recarregando' }); wc.reload(); }
      return;
    }
    rec.pendingSince = Date.now();
    let r = null;
    try { r = await wc.executeJavaScript('window.__qb ? __qb.drain() : null', true); } catch {}
    rec.pendingSince = 0;
    if (!r) return;
    rec.snap = r.snap;
    for (const ev of r.events || []) {
      if (ev.type === 'alert') alert(rec, ev);
      else if (ev.type === 'reload') { alert(rec, { key: 'frozen', level: 'warn', text: ev.text }); wc.reload(); }
    }
    // histórico: fecha a caçada quando a sessão muda ou acaba
    const s = r.snap.inGame ? r.snap.session : null;
    if (enabledFor('historico', rec.p) && s) {
      if (rec.live && (rec.live.session.start !== s.start || rec.live.name !== r.snap.name)) finalize(rec.live);
      rec.live = { panel: rec.p, name: r.snap.name, level: r.snap.level, zone: r.snap.zone || rec.live?.zone, session: s, hist: r.snap.historico, potPrice: r.snap.potPrice, at: Date.now() };
    } else if (rec.live) { finalize(rec.live); rec.live = null; }
  }

  function alert(rec, ev) {
    const who = rec.snap?.name ? ` · ${rec.snap.name}` : '';
    rec.alerts.unshift({ ...ev, at: Date.now() });
    rec.alerts = rec.alerts.slice(0, 20);
    getUi()?.webContents.send('plugin-alert', { p: rec.p, ...ev });
    if (cfg.painel?.set.notify && Notification.isSupported()) {
      const n = new Notification({ title: `J${rec.p + 1}${who}`, body: ev.text, silent: ev.level === 'ok', icon: path.join(__dirname, '..', 'build', 'icon.png') });
      n.on('click', () => onFocusPanel(rec.p, rec.tab));
      n.show();
    }
  }

  // escolhe qual aba representa cada janela (a ativa, se estiver no jogo)
  function panelInfo(p) {
    const recs = [...tabs.values()].filter((r) => r.p === p && r.snap);
    const act = state.panels[p]?.tabs[state.panels[p].activeTab];
    const rec = recs.find((r) => r.tab === act && r.snap.inGame) || recs.find((r) => r.snap.inGame) || recs[0];
    if (!rec) return null;
    return { snap: rec.snap, alerts: rec.alerts.slice(0, 5), live: !!rec.live };
  }

  function pushUi() {
    const ui = getUi(); if (!ui || ui.webContents.isDestroyed()) return;
    ui.webContents.send('plugins', {
      on: Object.fromEntries(MANIFEST.map((m) => [m.id, cfg[m.id].on])),
      wins: Object.fromEntries(MANIFEST.map((m) => [m.id, cfg[m.id].wins])),
      panels: Array.from({ length: panels }, (_, p) => panelInfo(p)),
      thresholds: cfg.painel.set,
    });
  }

  setInterval(async () => { await Promise.all([...tabs.values()].map(poll)); pushUi(); }, POLL_MS);

  // ---------- IPC ----------
  ipcMain.handle('plugins:get', () => ({ manifest: MANIFEST.filter((m) => !m.core), cfg }));
  ipcMain.handle('plugins:set', (_e, id, patch) => {
    if (!cfg[id]) return null;
    if (patch.on !== undefined) cfg[id].on = !!patch.on;
    if (Array.isArray(patch.wins)) cfg[id].wins = cfg[id].wins.map((v, i) => !!(patch.wins[i] ?? v));
    if (patch.set) cfg[id].set = { ...cfg[id].set, ...patch.set };
    save();
    for (const rec of tabs.values()) inject(rec);
    pushUi();
    return cfg[id];
  });
  ipcMain.handle('plugins:clearAlerts', (_e, p) => { for (const r of tabs.values()) if (r.p === p) r.alerts = []; pushUi(); });

  ipcMain.handle('hunts:get', () => {
    const live = [...tabs.values()].filter((r) => r.live).map((r) => ({ panel: r.p, char: r.live.name, zone: r.live.zone, ...r.live.session, hist: r.live.hist }));
    const chars = [...tabs.values()].filter((r) => r.snap?.inGame).map((r) => ({ panel: r.p, char: r.snap.name, level: r.snap.level, exp: r.snap.exp, expNext: r.snap.expNext }));
    return { hunts, live, chars };
  });
  ipcMain.handle('hunts:delete', (_e, key) => { hunts = hunts.filter((h) => h.key !== key); huntsDirty = true; saveHunts(); return true; });
  ipcMain.handle('hunts:export', async (_e, rows) => {
    const r = await dialog.showSaveDialog(getUi(), { title: 'Exportar histórico', defaultPath: `cacadas-${new Date().toISOString().slice(0, 10)}.csv`, filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (r.canceled || !r.filePath) return false;
    const cols = ['char', 'zone', 'level', 'start', 'end', 'minutos', 'kills', 'exp', 'exp_h', 'gold', 'gold_h', 'mortes', 'pot_vida', 'pot_ki', 'gasto_pot', 'lucro', 'ess_pura', 'ess_pura_h', 'ess_chakra', 'ess_chakra_h'];
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [cols.join(';'), ...(rows || hunts).map((h) => {
      const hrs = h.ms / 3.6e6;
      return [h.char, h.zone, h.level, new Date(h.start).toLocaleString('pt-BR'), new Date(h.end).toLocaleString('pt-BR'), Math.round(h.ms / 60000), h.kills, h.exp, Math.round(h.exp / hrs), h.gold, Math.round(h.gold / hrs), h.deaths, h.potHp, h.potKi, Math.round(h.potCost), Math.round(h.gold - h.potCost), h.pura || 0, ((h.pura || 0) / hrs).toFixed(2).replace('.', ','), h.ess || 0, ((h.ess || 0) / hrs).toFixed(2).replace('.', ',')].map(q).join(';');
    })];
    fs.writeFileSync(r.filePath, '﻿' + lines.join('\r\n'), 'utf8'); // BOM: Excel abre com acento certo
    return r.filePath;
  });

  load();
  return {
    attach,
    viewChanged() { for (const rec of tabs.values()) { const wc = rec.tab.view.webContents; if (rec.injected && !wc.isDestroyed()) wc.executeJavaScript(`window.__qb && ${viewCall(rec.p)}`, true).catch(() => {}); } },
    flush() { for (const rec of tabs.values()) finalize(rec.live); huntsDirty = true; saveHunts(); },
  };
}

module.exports = { createPluginHost, MANIFEST };
