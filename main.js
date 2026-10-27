// Quad Browser: 4 janelas isoladas (cache/cookies/storage próprios), até 3 abas cada.
const { app, BrowserWindow, WebContentsView, ipcMain, session, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { createPluginHost } = require('./plugins/host');

const PANELS = 4;
const MAX_TABS = 3;
const DEFAULT_HOME = 'https://www.google.com';
const SEARCH = 'https://www.google.com/search?q=';

// ---------- configurações (página inicial por janela) ----------
// salvas em %APPDATA%\Quad Browser\config.json
let config = { sameHome: true, homes: Array(PANELS).fill(DEFAULT_HOME) };
const configPath = () => path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    config.sameHome = c.sameHome !== false;
    if (Array.isArray(c.homes)) config.homes = config.homes.map((h, i) => c.homes[i] || h);
  } catch { /* primeira execução ou arquivo inválido: usa o padrão */ }
  if (process.env.QB_HOME) config.homes = Array(PANELS).fill(process.env.QB_HOME);
}

function saveConfig() {
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
  } catch (e) { console.error('Falha ao salvar config:', e); }
}

const homeOf = (p) => config.homes[config.sameHome ? 0 : p] || DEFAULT_HOME;

let plugins = null;       // gerenciador de plugins (criado quando o app fica pronto)
let settingsOpen = false; // com o painel de configurações aberto, as páginas ficam ocultas

let win = null;
let ui = null;
let nextId = 1;

const state = {
  mode: 'grid',   // 'grid' (as 4) | 'focus' (uma específica)
  focused: 0,     // janela exibida no modo foco
  active: 0,      // janela que recebe atalhos/comandos
  panels: [],     // { partition, tabs: [tab], activeTab, rect }
};

// ---------- utilidades ----------
function normalize(input, fallback = DEFAULT_HOME) {
  const s = String(input || '').trim();
  if (!s) return fallback;
  if (/^(https?|file|about|chrome|data):/i.test(s)) return s;
  if (/^localhost(:\d+)?(\/|$)/i.test(s)) return 'http://' + s;
  if (!/\s/.test(s) && /\.[a-z]{2,}(:\d+)?(\/|$|\?|#)/i.test(s)) return 'https://' + s;
  return SEARCH + encodeURIComponent(s);
}

function history(wc) {
  const h = wc.navigationHistory;
  return {
    canBack: h ? h.canGoBack() : wc.canGoBack(),
    canFwd: h ? h.canGoForward() : wc.canGoForward(),
    back: () => (h ? h.goBack() : wc.goBack()),
    fwd: () => (h ? h.goForward() : wc.goForward()),
  };
}

const activeTab = (p) => {
  const panel = state.panels[p];
  return panel && panel.tabs[panel.activeTab];
};

// ---------- estado -> UI ----------
let pushQueued = false;
function push() {
  if (pushQueued) return;
  pushQueued = true;
  setImmediate(() => {
    pushQueued = false;
    if (!ui || ui.webContents.isDestroyed()) return;
    ui.webContents.send('state', {
      mode: state.mode,
      focused: state.focused,
      active: state.active,
      maxTabs: MAX_TABS,
      panels: state.panels.map((panel) => ({
        activeTab: panel.activeTab,
        tabs: panel.tabs.map((t) => {
          const wc = t.view.webContents;
          const h = history(wc);
          return {
            id: t.id,
            title: t.title,
            url: wc.getURL() || t.url,
            favicon: t.favicon,
            loading: t.loading,
            canBack: h.canBack,
            canFwd: h.canFwd,
          };
        }),
      })),
    });
  });
}

// mostra só a aba ativa de cada janela visível, nas coordenadas que a UI informou
function relayout() {
  if (!win) return;
  state.panels.forEach((panel, p) => {
    const panelVisible = !settingsOpen && panel.rect && (state.mode === 'grid' || state.focused === p);
    panel.tabs.forEach((t, i) => {
      const show = panelVisible && i === panel.activeTab;
      t.view.setVisible(!!show);
      if (show) t.view.setBounds(panel.rect);
    });
  });
}

// ---------- abas ----------
function newTab(p, url = homeOf(p)) {
  const panel = state.panels[p];
  if (panel.tabs.length >= MAX_TABS) {
    // limite atingido: abre na aba ativa em vez de criar outra
    activeTab(p).view.webContents.loadURL(normalize(url));
    return;
  }
  const view = new WebContentsView({
    webPreferences: {
      partition: panel.partition, // cache isolado por janela
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false, // jogos continuam rodando mesmo com a aba escondida
    },
  });
  view.setBackgroundColor('#ffffff');
  if (view.setBorderRadius) view.setBorderRadius(10); // cantos arredondados (Electron 34+)
  const tab = { id: nextId++, view, title: 'Nova aba', url: normalize(url), favicon: null, loading: true };
  panel.tabs.push(tab);
  panel.activeTab = panel.tabs.length - 1;
  state.active = p;
  win.contentView.addChildView(view);
  wireTab(p, tab);
  plugins?.attach(p, tab);
  view.webContents.loadURL(tab.url);
  relayout();
  push();
}

function wireTab(p, tab) {
  const wc = tab.view.webContents;
  wc.on('page-title-updated', (_e, title) => { tab.title = title; push(); });
  wc.on('page-favicon-updated', (_e, icons) => { tab.favicon = icons[0] || null; push(); });
  wc.on('did-start-loading', () => { tab.loading = true; push(); });
  wc.on('did-stop-loading', () => { tab.loading = false; push(); });
  wc.on('did-navigate', () => { tab.favicon = null; push(); });
  wc.on('did-navigate-in-page', push);
  // janela ativa segue o clique real do usuário (o evento 'focus' dispara sozinho no carregamento)
  wc.on('input-event', (_e, ev) => {
    if (ev.type === 'mouseDown' && state.active !== p) { state.active = p; push(); }
  });
  wc.on('render-process-gone', () => { tab.title = 'A página travou (recarregue)'; tab.loading = false; push(); });
  // popups e target=_blank viram aba nova na mesma janela (mesma sessão)
  wc.setWindowOpenHandler(({ url }) => { newTab(p, url); return { action: 'deny' }; });
  attachShortcuts(wc);
}

function closeTab(p, i) {
  const panel = state.panels[p];
  const tab = panel.tabs[i];
  if (!tab) return;
  if (panel.tabs.length === 1) {
    // cada janela mantém pelo menos uma aba
    tab.view.webContents.loadURL(homeOf(p));
    return;
  }
  win.contentView.removeChildView(tab.view);
  tab.view.webContents.close();
  panel.tabs.splice(i, 1);
  if (panel.activeTab >= panel.tabs.length || panel.activeTab > i) panel.activeTab = Math.max(0, panel.activeTab - 1);
  else if (panel.activeTab === i) panel.activeTab = Math.min(i, panel.tabs.length - 1);
  relayout();
  push();
}

function selectTab(p, i) {
  const panel = state.panels[p];
  if (!panel.tabs[i]) return;
  panel.activeTab = i;
  state.active = p;
  relayout();
  push();
  panel.tabs[i].view.webContents.focus();
}

function activate(p, { focusPage = true } = {}) {
  state.active = p;
  if (state.mode === 'focus') state.focused = p;
  relayout();
  plugins?.viewChanged();
  push();
  const t = activeTab(p);
  if (focusPage && t) t.view.webContents.focus();
}

function setMode(mode, p = state.active) {
  state.mode = mode === 'focus' ? 'focus' : 'grid';
  if (state.mode === 'focus') state.focused = p;
  state.active = p;
  relayout();
  plugins?.viewChanged();
  push();
}

async function clearData(p) {
  const ses = session.fromPartition(state.panels[p].partition);
  await ses.clearCache();
  await ses.clearStorageData();
  state.panels[p].tabs.forEach((t) => t.view.webContents.reload());
}

// ---------- comandos vindos da UI ----------
const commands = {
  newTab: (p, url) => newTab(p, url),
  closeTab: (p, i) => closeTab(p, i),
  selectTab: (p, i) => selectTab(p, i),
  navigate: (p, url) => { const t = activeTab(p); if (t) { t.view.webContents.loadURL(normalize(url)); t.view.webContents.focus(); } },
  back: (p) => { const t = activeTab(p); if (t) history(t.view.webContents).back(); },
  fwd: (p) => { const t = activeTab(p); if (t) history(t.view.webContents).fwd(); },
  reload: (p) => { const t = activeTab(p); if (t) t.view.webContents.reload(); },
  stop: (p) => { const t = activeTab(p); if (t) t.view.webContents.stop(); },
  home: (p) => { const t = activeTab(p); if (t) t.view.webContents.loadURL(homeOf(p)); },
  activate: (p) => activate(p, { focusPage: false }),
  setMode: (mode, p) => setMode(mode, p),
  clearData: (p) => clearData(p),
};

ipcMain.on('cmd', (_e, action, ...args) => {
  const fn = commands[action];
  if (fn) fn(...args);
});

// ---------- configurações ----------
ipcMain.handle('settings:get', () => ({
  sameHome: config.sameHome,
  homes: [...config.homes],
  current: state.panels.map((_, p) => { const t = activeTab(p); return t ? t.view.webContents.getURL() : ''; }),
}));

ipcMain.handle('settings:save', (_e, next, applyNow) => {
  config.sameHome = !!next.sameHome;
  config.homes = config.homes.map((h, i) => normalize(next.homes[i], DEFAULT_HOME));
  if (config.sameHome) config.homes = config.homes.map(() => config.homes[0]);
  saveConfig();
  if (applyNow) state.panels.forEach((_, p) => { const t = activeTab(p); if (t) t.view.webContents.loadURL(homeOf(p)); });
  return { sameHome: config.sameHome, homes: config.homes };
});

ipcMain.on('settings:open', (_e, open) => {
  settingsOpen = !!open;
  relayout();
  if (!settingsOpen) { const t = activeTab(state.active); if (t) t.view.webContents.focus(); }
});

ipcMain.on('layout', (_e, rects) => {
  rects.forEach((r, p) => { if (state.panels[p]) state.panels[p].rect = r; });
  relayout();
  plugins?.viewChanged();
});

// ---------- atalhos (capturados em toda webContents, inclusive das páginas) ----------
function attachShortcuts(wc) {
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    const key = input.key;
    const p = state.active;
    let handled = true;

    if (ctrl && !input.shift && /^[1-4]$/.test(key)) activate(Number(key) - 1);
    else if (ctrl && key === '0') setMode('grid');
    else if (ctrl && key.toLowerCase() === 'g') setMode(state.mode === 'grid' ? 'focus' : 'grid');
    else if (key === 'F11') setMode(state.mode === 'grid' ? 'focus' : 'grid');
    else if (ctrl && key.toLowerCase() === 't') newTab(p);
    else if (ctrl && key.toLowerCase() === 'w') closeTab(p, state.panels[p].activeTab);
    else if (ctrl && key === 'Tab') {
      const panel = state.panels[p];
      const n = panel.tabs.length;
      selectTab(p, (panel.activeTab + (input.shift ? n - 1 : 1)) % n);
    }
    else if ((ctrl && key.toLowerCase() === 'l') || key === 'F6') {
      ui.webContents.focus();
      ui.webContents.send('focus-url', p);
    }
    else if (key === 'F5' || (ctrl && key.toLowerCase() === 'r')) commands.reload(p);
    else if (input.alt && key === 'ArrowLeft') commands.back(p);
    else if (input.alt && key === 'ArrowRight') commands.fwd(p);
    else if (ctrl && key === ',') { ui.webContents.focus(); ui.webContents.send('open-settings'); }
    else if (ctrl && key.toLowerCase() === 'h') { ui.webContents.focus(); ui.webContents.send('open-history'); }
    else if (key === 'F12') { const t = activeTab(p); if (t) t.view.webContents.toggleDevTools(); }
    else handled = false;

    if (handled) event.preventDefault();
  });
}

// ---------- janela ----------
function startArg() {
  // "Quad Browser.exe --janela=2" abre direto no modo foco da janela 2
  const a = process.argv.find((x) => /^--janela=\d$/.test(x));
  if (!a) return;
  const n = Number(a.split('=')[1]) - 1;
  if (n >= 0 && n < PANELS) setMode('focus', n);
}

function createWindow() {
  loadConfig();
  plugins = createPluginHost({
    app, state, panels: PANELS,
    getUi: () => ui,
    onFocusPanel: (p, tab) => {
      if (!win) return;
      if (win.isMinimized()) win.restore();
      win.show(); win.focus();
      const i = state.panels[p].tabs.indexOf(tab);
      if (state.mode === 'focus') state.focused = p;
      if (i >= 0) selectTab(p, i); else activate(p);
    },
  });
  // janela sem moldura nativa: a barra superior da UI vira a barra de título
  // (botões minimizar/maximizar/fechar do Windows desenhados por cima via titleBarOverlay)
  win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 960,
    minHeight: 600,
    title: 'Quad Browser',
    backgroundColor: '#070b12',
    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#070b12', symbolColor: '#8f9bb3', height: 48 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  ui = win; // a própria janela hospeda a interface; as páginas são views por cima
  win.once('ready-to-show', () => win.show());
  attachShortcuts(ui.webContents);

  for (let i = 0; i < PANELS; i++) {
    state.panels.push({ partition: `persist:janela-${i + 1}`, tabs: [], activeTab: 0, rect: null });
  }

  ui.webContents.once('did-finish-load', () => {
    for (let i = 0; i < PANELS; i++) newTab(i);
    state.active = 0;
    startArg();
    push();
    // a última view criada costuma roubar o foco; devolve para a janela ativa
    setTimeout(() => activate(state.active), 400);
  });
  ui.webContents.loadFile(path.join(__dirname, 'ui', 'index.html'));

  win.on('closed', () => { win = null; ui = null; });
}

Menu.setApplicationMenu(null);
// nome que aparece nas notificações do Windows (igual ao appId do instalador)
app.setAppUserModelId('quadbrowser');
app.on('before-quit', () => plugins?.flush());
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// autoteste opcional (não vai para o build): QB_SELFTEST=1 npm start
if (process.env.QB_SELFTEST) {
  app.whenReady().then(() => setTimeout(() => {
    try { require('./selftest')({ state, commands, setMode, newTab, closeTab, activate }); }
    catch (e) { console.error(e); }
  }, 1500));
}
