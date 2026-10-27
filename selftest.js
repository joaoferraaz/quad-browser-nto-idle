// autoteste de desenvolvimento: abre o jogo simulado (dev/mock-nto) e tira prints
const { execSync } = require('child_process');
const { BrowserWindow } = require('electron');
const shot = (n) => execSync(`import -window root ${process.env.QB_SHOTS}/${n}.png`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
module.exports = async ({ state, setMode }) => {
  const ui = BrowserWindow.getAllWindows()[0].webContents;
  await wait(8000);
  shot('ess-grade');
  setMode('focus', 0); await wait(2500);
  shot('ess-foco');
  setMode('grid');
  await wait(9000);
  ui.send('open-history'); await wait(1500);
  shot('ess-hist');
  require('electron').app.quit();
};
