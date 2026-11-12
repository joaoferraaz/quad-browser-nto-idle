// Quad Browser · preload das abas (roda antes de qualquer script da página)
// Para jogos que conversam por WebSocket (ex.: Evolution Idle World), instala uma
// "escuta" passiva no mundo da página: só LÊ as mensagens que o servidor envia.
// Nada é enviado ao servidor e nenhuma mensagem é alterada.
const { contextBridge, ipcRenderer, webFrame } = require('electron');

function tap() {
  if (window.__qbTap) return;
  const T = (window.__qbTap = { events: [], subs: new Set(), open: 0, closed: 0, lastRaw: 0, since: Date.now() });
  const Native = window.WebSocket;
  if (!Native) return;

  function onMessage(ev) {
    T.lastRaw = Date.now();
    const d = ev.data;
    // Socket.IO: "42" = evento; opcionalmente "/namespace," e id de ack antes do JSON
    if (typeof d !== 'string' || d.charCodeAt(0) !== 52 || d.charCodeAt(1) !== 50) return;
    let i = 2;
    if (d[i] === '/') { const c = d.indexOf(',', i); if (c < 0) return; i = c + 1; }
    while (i < d.length && d[i] >= '0' && d[i] <= '9') i++;
    let arr;
    try { arr = JSON.parse(d.slice(i)); } catch { return; }
    if (!Array.isArray(arr) || typeof arr[0] !== 'string') return;
    const e = { t: T.lastRaw, n: arr[0], d: arr[1] };
    T.events.push(e);
    if (T.events.length > 600) T.events.splice(0, T.events.length - 600);
    T.subs.forEach((f) => { try { f(e); } catch {} });
  }

  class QbWebSocket extends Native {
    constructor(...args) {
      super(...args);
      try {
        this.addEventListener('message', onMessage);
        this.addEventListener('open', () => { T.open = Date.now(); T.lastRaw = T.open; });
        this.addEventListener('close', () => { T.closed = Date.now(); });
      } catch {}
    }
  }
  for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) Object.defineProperty(QbWebSocket, k, { value: Native[k] });
  window.WebSocket = QbWebSocket;
}

try {
  const hosts = ipcRenderer.sendSync('qb:tap-hosts') || [];
  const h = location.host, hn = location.hostname;
  if (hosts.some((x) => x === h || x === hn || hn.endsWith('.' + x))) {
    if (contextBridge.executeInMainWorld) contextBridge.executeInMainWorld({ func: tap });
    else webFrame.executeJavaScript(`(${tap.toString()})()`);
  }
} catch {}
