const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('qb', {
  cmd: (action, ...args) => ipcRenderer.send('cmd', action, ...args),
  layout: (rects) => ipcRenderer.send('layout', rects),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onFocusUrl: (cb) => ipcRenderer.on('focus-url', (_e, p) => cb(p)),
  onOpenSettings: (cb) => ipcRenderer.on('open-settings', () => cb()),
  onOpenHistory: (cb) => ipcRenderer.on('open-history', () => cb()),
  onPlugins: (cb) => ipcRenderer.on('plugins', (_e, s) => cb(s)),
  onPluginAlert: (cb) => ipcRenderer.on('plugin-alert', (_e, a) => cb(a)),
  plugins: {
    get: () => ipcRenderer.invoke('plugins:get'),
    set: (id, patch) => ipcRenderer.invoke('plugins:set', id, patch),
    clearAlerts: (p) => ipcRenderer.invoke('plugins:clearAlerts', p),
  },
  hunts: {
    get: () => ipcRenderer.invoke('hunts:get'),
    remove: (key) => ipcRenderer.invoke('hunts:delete', key),
    exportCsv: (rows) => ipcRenderer.invoke('hunts:export', rows),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (cfg, applyNow) => ipcRenderer.invoke('settings:save', cfg, applyNow),
    setOpen: (open) => ipcRenderer.send('settings:open', open),
  },
});
