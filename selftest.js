// autoteste de desenvolvimento: jogos simulados (dev/mock-nto e dev/mock-eiw), prints e checagens
const { execSync } = require('child_process');
const { BrowserWindow } = require('electron');
const shot = (n) => execSync(`import -window root ${process.env.QB_SHOTS}/${n}.png`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
module.exports = async ({ state, commands }) => {
  const log = (m) => console.log('[selftest]', m);
  const ui = BrowserWindow.getAllWindows()[0].webContents;
  await wait(4000);
  const j1 = state.panels[0].tabs[0].view.webContents;
  log('tap na J1: ' + await j1.executeJavaScript('!!window.__qbTap && window.__qbTap.events.length > 0'));
  await wait(18000);
  shot('eiw-grade');
  const snap = await j1.executeJavaScript('JSON.stringify(__qb.drain().snap)');
  log('snap J1: ' + snap.slice(0, 700));
  ui.send('open-timers'); await wait(1500);
  shot('eiw-timers');
  log('timers: ' + await ui.executeJavaScript('document.getElementById("timersBody").innerText.replace(/\\s+/g," ").slice(0,600)'));
  ui.send('open-settings'); await wait(500);
  await ui.executeJavaScript(`document.querySelector('#setTabs [data-t=plugins]').click()`); await wait(800);
  shot('eiw-plugins');
  await ui.executeJavaScript(`document.querySelector('#sheet [data-close]').click()`);
  // reordenar abas
  commands.newTab(0, 'about:blank'); commands.newTab(0, 'about:blank'); await wait(500);
  const ids = () => state.panels[0].tabs.map((t) => t.id).join(',');
  const before = ids(); commands.moveTab(0, 2, 0); log(`abas J1: ${before} -> ${ids()} (ativa ${state.panels[0].activeTab})`);
  require('electron').app.quit();
};
