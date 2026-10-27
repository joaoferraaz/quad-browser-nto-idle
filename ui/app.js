const grid = document.getElementById('grid');
const tpl = document.getElementById('panel-tpl');
const modes = document.getElementById('modes');
const PANELS = 4;
let state = null;

const X_ICON = '<svg viewBox="0 0 16 16"><path d="m4 4 8 8M12 4l-8 8"/></svg>';

// ---------- monta as 4 janelas ----------
const panels = [];
for (let p = 0; p < PANELS; p++) {
  const el = tpl.content.firstElementChild.cloneNode(true);
  el.dataset.p = p;
  el.querySelector('.badge b').textContent = 'J' + (p + 1);
  const url = el.querySelector('.url');
  const ref = {
    el,
    tabs: el.querySelector('.tabs'),
    add: el.querySelector('.add'),
    back: el.querySelector('.back'),
    fwd: el.querySelector('.fwd'),
    reload: el.querySelector('.reload'),
    clear: el.querySelector('.clear'),
    expand: el.querySelector('.expand'),
    url,
    content: el.querySelector('.content'),
    count: el.querySelector('.count'),
    seen: new Set(),
    editing: false,
  };

  el.addEventListener('mousedown', () => window.qb.cmd('activate', p));
  ref.add.onclick = () => window.qb.cmd('newTab', p);
  ref.back.onclick = () => window.qb.cmd('back', p);
  ref.fwd.onclick = () => window.qb.cmd('fwd', p);
  ref.reload.onclick = () => {
    const t = currentTab(p);
    window.qb.cmd(t && t.loading ? 'stop' : 'reload', p);
  };
  el.querySelector('.home').onclick = () => window.qb.cmd('home', p);
  ref.expand.onclick = () => {
    const focusedHere = state && state.mode === 'focus' && state.focused === p;
    window.qb.cmd('setMode', focusedHere ? 'grid' : 'focus', p);
  };

  // limpar dados: confirmação em dois cliques, sem diálogo nativo
  let armTimer = null;
  ref.clear.onclick = () => {
    if (ref.clear.classList.contains('armed')) {
      clearTimeout(armTimer);
      disarm();
      window.qb.cmd('clearData', p);
      return;
    }
    ref.clear.classList.add('armed');
    ref.clear.textContent = 'Confirmar limpeza';
    armTimer = setTimeout(disarm, 3000);
  };
  const clearIcon = ref.clear.innerHTML;
  function disarm() { ref.clear.classList.remove('armed'); ref.clear.innerHTML = clearIcon; }

  url.addEventListener('focus', () => { ref.editing = true; url.select(); });
  url.addEventListener('blur', () => { ref.editing = false; render(); });
  url.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { ref.editing = false; url.blur(); }
  });
  el.querySelector('.url-form').addEventListener('submit', (e) => {
    e.preventDefault();
    ref.editing = false;
    window.qb.cmd('navigate', p, url.value);
    url.blur();
  });

  grid.appendChild(el);
  panels.push(ref);
}

modes.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.mode === 'grid') window.qb.cmd('setMode', 'grid');
  else if (b.dataset.focus) window.qb.cmd('setMode', 'focus', Number(b.dataset.focus));
});

function currentTab(p) {
  if (!state) return null;
  const s = state.panels[p];
  return s && s.tabs[s.activeTab];
}

// ---------- renderização ----------
function render() {
  if (!state) return;
  grid.classList.toggle('focus', state.mode === 'focus');

  modes.querySelectorAll('button').forEach((b) => {
    const on = b.dataset.mode === 'grid'
      ? state.mode === 'grid'
      : state.mode === 'focus' && Number(b.dataset.focus) === state.focused;
    b.classList.toggle('on', on);
  });

  state.panels.forEach((s, p) => {
    const ref = panels[p];
    const t = s.tabs[s.activeTab];
    ref.el.classList.toggle('active', state.active === p);
    ref.el.classList.toggle('focused', state.mode === 'focus' && state.focused === p);
    ref.el.classList.toggle('loading', !!(t && t.loading));
    ref.el.classList.toggle('secure', !!(t && /^https:/i.test(t.url)));
    ref.count.textContent = `${s.tabs.length}/${state.maxTabs}`;

    renderTabs(p, s);

    ref.add.disabled = s.tabs.length >= state.maxTabs;
    ref.add.title = ref.add.disabled ? `Limite de ${state.maxTabs} abas por janela` : 'Nova aba (Ctrl+T)';
    ref.back.disabled = !(t && t.canBack);
    ref.fwd.disabled = !(t && t.canFwd);
    ref.reload.innerHTML = t && t.loading
      ? X_ICON
      : '<svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3"/></svg>';
    ref.reload.title = t && t.loading ? 'Parar' : 'Recarregar (F5)';

    const focusedHere = state.mode === 'focus' && state.focused === p;
    ref.expand.title = focusedHere ? 'Voltar para a grade (Ctrl+0)' : 'Abrir só esta janela';
    ref.expand.innerHTML = focusedHere
      ? '<svg viewBox="0 0 16 16"><path d="M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5"/></svg>'
      : '<svg viewBox="0 0 16 16"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg>';

    if (!ref.editing && t) ref.url.value = t.url === 'about:blank' ? '' : t.url;
  });

  movePill();
  requestAnimationFrame(sendLayout);
}

// indicador deslizante do seletor Grade / 1-4
const pill = document.getElementById('pill');
function movePill() {
  const on = modes.querySelector('button.on');
  if (!on) return;
  pill.style.width = on.offsetWidth + 'px';
  pill.style.transform = `translateX(${on.offsetLeft}px)`;
}
document.fonts && document.fonts.ready.then(movePill);

function renderTabs(p, s) {
  const box = panels[p].tabs;
  const key = s.tabs.map((t) => [t.id, t.title, t.favicon, t.loading].join('|')).join('§') + '#' + s.activeTab;
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  box.textContent = '';

  s.tabs.forEach((t, i) => {
    const tab = document.createElement('div');
    const isNew = !panels[p].seen.has(t.id);
    panels[p].seen.add(t.id);
    tab.className = 'tab' + (i === s.activeTab ? ' on' : '') + (t.loading ? ' loading' : '') + (isNew ? ' new' : '');
    tab.title = t.title || t.url;

    let icon;
    if (t.favicon) {
      icon = document.createElement('img');
      icon.src = t.favicon;
      icon.onerror = () => icon.replaceWith(Object.assign(document.createElement('span'), { className: 'dot' }));
    } else {
      icon = document.createElement('span');
      icon.className = 'dot';
    }

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = t.title || 'Nova aba';

    const x = document.createElement('button');
    x.className = 'x';
    x.title = 'Fechar aba (Ctrl+W)';
    x.innerHTML = X_ICON;
    x.onclick = (e) => { e.stopPropagation(); window.qb.cmd('closeTab', p, i); };

    tab.onclick = () => window.qb.cmd('selectTab', p, i);
    tab.onauxclick = (e) => { if (e.button === 1) window.qb.cmd('closeTab', p, i); };
    tab.append(icon, title, x);
    box.appendChild(tab);
  });
}

// ---------- informa ao processo principal onde desenhar cada página ----------
let lastLayout = '';
function sendLayout() {
  const rects = panels.map((ref) => {
    const r = ref.content.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
  });
  const key = JSON.stringify(rects);
  if (key === lastLayout) return;
  lastLayout = key;
  window.qb.layout(rects);
}

const ro = new ResizeObserver(() => sendLayout());
panels.forEach((ref) => ro.observe(ref.content));
window.addEventListener('resize', sendLayout);

window.qb.onState((s) => { state = s; render(); });
window.qb.onFocusUrl((p) => {
  const ref = panels[p];
  ref.url.focus();
  ref.url.select();
});

// ---------- configurações: página inicial ----------
const sheet = document.getElementById('sheet');
const form = document.getElementById('settingsForm');
const sameHome = document.getElementById('sameHome');
const applyNow = document.getElementById('applyNow');
const homesBox = document.getElementById('homes');
const savedTag = document.getElementById('saved');
const homeTpl = document.getElementById('home-tpl');
let draft = null; // { sameHome, homes[4], current[4] }

function renderHomes() {
  // guarda o que já foi digitado antes de redesenhar
  homesBox.querySelectorAll('.home-row').forEach((row) => {
    const i = Number(row.dataset.p);
    draft.homes[i] = row.querySelector('.home-url').value;
  });
  homesBox.textContent = '';
  const rows = draft.sameHome ? [0] : [0, 1, 2, 3];
  rows.forEach((i) => {
    const row = homeTpl.content.firstElementChild.cloneNode(true);
    row.dataset.p = i;
    row.classList.toggle('all', draft.sameHome);
    row.querySelector('.badge b').textContent = draft.sameHome ? 'Todas' : 'J' + (i + 1);
    const input = row.querySelector('.home-url');
    input.value = draft.homes[i] || '';
    // "usar página atual": na opção única, pega a página da janela ativa
    const src = draft.sameHome ? (state ? state.active : 0) : i;
    const btn = row.querySelector('.use-current');
    const cur = draft.current[src] || '';
    btn.disabled = !/^https?:/i.test(cur);
    btn.title = cur ? `Usar ${cur}` : 'Sem página aberta';
    btn.onclick = () => { input.value = cur; input.focus(); };
    homesBox.appendChild(row);
  });
}

async function openSettings() {
  if (!sheet.hidden) return;
  if (typeof closeHistory === 'function') closeHistory();
  showSetTab('home'); // sempre abre na primeira aba
  window.qb.settings.setOpen(true);
  draft = await window.qb.settings.get();
  sameHome.checked = draft.sameHome;
  applyNow.checked = false;
  savedTag.classList.remove('show');
  homesBox.textContent = '';
  renderHomes();
  sheet.hidden = false;
  const first = homesBox.querySelector('.home-url');
  if (first) { first.focus(); first.select(); }
}

function closeSettings() {
  if (sheet.hidden) return;
  sheet.hidden = true;
  window.qb.settings.setOpen(false);
}

sameHome.addEventListener('change', () => {
  renderHomes();
  draft.sameHome = sameHome.checked;
  if (draft.sameHome) draft.homes = draft.homes.map(() => draft.homes[0]);
  homesBox.textContent = '';
  renderHomes();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  renderHomes(); // sincroniza o rascunho com os campos
  draft.sameHome = sameHome.checked;
  const saved = await window.qb.settings.save({ sameHome: draft.sameHome, homes: draft.homes }, applyNow.checked);
  draft.homes = saved.homes;
  homesBox.textContent = '';
  renderHomes();
  savedTag.classList.add('show');
  setTimeout(closeSettings, 650);
});

sheet.addEventListener('click', (e) => {
  if (e.target === sheet || e.target.closest('[data-close]')) closeSettings();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !sheet.hidden) { e.preventDefault(); closeSettings(); }
});
document.getElementById('openSettings').onclick = openSettings;
window.qb.onOpenSettings(openSettings);

// ======================================================================
// Plugins
// ======================================================================
let plug = null;          // último estado vindo do processo principal
let plugMeta = null;      // { manifest, cfg }
const statusEls = panels.map((ref) => ref.el.querySelector('.status'));
const ICON_BELL = '<svg viewBox="0 0 16 16"><path d="M4 11V7a4 4 0 0 1 8 0v4l1.5 1.5h-11L4 11ZM6.5 14h3"/></svg>';
const nf = (n) => {
  n = Math.round(n || 0);
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString('pt-BR');
};
const rt = (n) => { n = n || 0; return n < 10 ? (Math.round(n * 10) / 10).toLocaleString('pt-BR') : nf(n); }; // taxa por hora: decimal quando é pouco
const hm = (ms) => { const m = Math.max(0, Math.floor(ms / 60000)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const dur = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const MODE_TXT = { hunt: 'caçando', travel: 'viajando', loading: 'viajando', depot: 'depot', idle: 'parado', dead: 'morto' };

window.qb.onPlugins((s) => {
  plug = s;
  document.getElementById('openHistory').hidden = !s.on.historico;
  panels.forEach((_, p) => renderStatus(p));
});

window.qb.onPluginAlert((a) => {
  const el = panels[a.p]?.el; if (!el) return;
  el.classList.remove('alerting', 'danger'); void el.offsetWidth;
  el.classList.add('alerting'); if (a.level === 'danger') el.classList.add('danger');
  setTimeout(() => el.classList.remove('alerting', 'danger'), 3800);
});

function renderStatus(p) {
  const box = statusEls[p];
  const info = plug?.panels[p];
  const show = !!(plug?.on.painel && plug.wins.painel[p] && info?.snap?.inGame);
  box.hidden = !show;
  if (!show) { box.textContent = ''; requestAnimationFrame(sendLayout); return; }
  const b = info.snap, th = plug.thresholds || {};
  const pct = (v) => Math.round((v || 0) * 100);
  const lowSt = b.stamina < (th.staminaH ?? 40) * 3600e3;
  const lowPot = Math.min(b.pots.hp, b.pots.ki) < (th.potMin ?? 100);
  const bagFull = b.bag.cap && b.bag.cap - b.bag.used <= (th.bagFree ?? 3);
  const taskDone = b.task && b.task.need && b.task.have >= b.task.need;
  const last = info.alerts?.[0];
  const recent = last && Date.now() - last.at < 10 * 60e3;
  const html = [
    `<span class="chip who"><i class="dot ${b.mode}"></i><b>${esc(b.name)}</b><small>Lv ${b.level}</small></span>`,
    `<span class="chip mode ${b.mode === 'dead' ? 'danger' : ''}" title="${esc(b.zone || '')}">${MODE_TXT[b.mode] || esc(b.mode)}${b.zone ? ` <small class="z">${esc(b.zone)}</small>` : ''}</span>`,
    `<span class="chip ${b.hpPct * 100 < (th.hpPct ?? 25) ? 'danger' : ''}" title="Vida ${pct(b.hpPct)}% · Ki ${pct(b.kiPct)}%"><span class="minibar hp"><i style="width:${pct(b.hpPct)}%"></i></span><span class="minibar ki"><i style="width:${pct(b.kiPct)}%"></i></span></span>`,
    `<span class="chip xp" title="Exp do level: ${pct(b.expPct)}%"><span class="minibar xp"><i style="width:${pct(b.expPct)}%"></i></span><b>${pct(b.expPct)}%</b></span>`,
    b.session ? `<span class="chip eph" title="Exp/h da sessão"><small>exp/h</small><b>${nf(b.session.eph)}</b></span>` : '',
    b.session ? `<span class="chip ess" title="Essência de Chakra Pura: ${nf(b.session.pura)} na sessão (${nf(b.essInv?.pura)} na mochila)"><small>pura/h</small><b>${rt(b.session.puraPh)}</b></span>` : '',
    b.session ? `<span class="chip ess" title="Essência de Chakra: ${nf(b.session.ess)} na sessão (${nf(b.essInv?.ess)} na mochila)"><small>ess/h</small><b>${rt(b.session.essPh)}</b></span>` : '',
    `<span class="chip ${lowSt ? 'warn' : ''}" title="Stamina"><small>stamina</small><b>${hm(b.stamina)}</b></span>`,
    b.task ? `<span class="chip ${taskDone ? 'warn' : ''}" title="Task ${esc(b.task.name)}"><small>task</small><b>${nf(b.task.have)}/${nf(b.task.need)}</b></span>` : '',
    `<span class="chip pot ${lowPot ? 'warn' : ''}" title="Heal Potion / Chakra Potion"><small>pot</small><b>${nf(b.pots.hp)}/${nf(b.pots.ki)}</b></span>`,
    `<span class="chip bag ${bagFull ? 'warn' : ''}" title="Mochila"><small>bag</small><b>${b.bag.used}/${b.bag.cap}</b></span>`,
    recent ? `<button class="alert ${last.level}" title="${esc(last.text)} (clique para limpar)">${ICON_BELL}<span>${esc(last.text)}</span></button>` : '',
  ].join('');
  if (box.dataset.h !== html) {
    box.dataset.h = html; box.innerHTML = html;
    const a = box.querySelector('.alert');
    if (a) a.onclick = () => window.qb.plugins.clearAlerts(p);
  }
  if (box.dataset.shown !== '1') { box.dataset.shown = '1'; requestAnimationFrame(sendLayout); }
}
// a faixa muda a altura da área da página: reavisa o layout quando some
new MutationObserver(() => requestAnimationFrame(sendLayout)).observe(grid, { subtree: true, attributes: true, attributeFilter: ['hidden'] });

// ---------- aba Plugins nas configurações ----------
const PLUG_ICONS = {
  painel: '<svg viewBox="0 0 16 16"><rect x="2" y="2.5" width="12" height="11" rx="2"/><path d="M2 6h12M5 9h3M5 11h5"/></svg>',
  compacto: '<svg viewBox="0 0 16 16"><path d="M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5"/></svg>',
  historico: '<svg viewBox="0 0 16 16"><path d="M2.5 13.5h11M4.5 11V8M7.5 11V5M10.5 11V7"/></svg>',
  layout: '<svg viewBox="0 0 16 16"><rect x="2" y="2.5" width="5" height="5" rx="1"/><rect x="9" y="2.5" width="5" height="8" rx="1"/><rect x="2" y="9.5" width="5" height="4" rx="1"/><path d="M9 13.5h5"/></svg>',
};
const pluginList = document.getElementById('pluginList');
const setTabs = document.getElementById('setTabs');
const sheetEl = document.querySelector('#sheet .sheet');

function showSetTab(t) {
  setTabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
  document.querySelector('.pane-home').hidden = t !== 'home';
  document.querySelector('.pane-plugins').hidden = t !== 'plugins';
  document.getElementById('homeFoot').hidden = t !== 'home';
  sheetEl.classList.toggle('plug', t === 'plugins');
  if (t === 'plugins') renderPluginList();
}
setTabs.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) showSetTab(b.dataset.t); });

async function renderPluginList() {
  plugMeta = await window.qb.plugins.get();
  const open = new Set([...pluginList.querySelectorAll('.plug-card.open')].map((c) => c.dataset.id));
  pluginList.textContent = '';
  for (const m of plugMeta.manifest) {
    const c = plugMeta.cfg[m.id];
    const card = document.createElement('div');
    card.className = 'plug-card' + (c.on ? ' on' : '') + (open.has(m.id) ? ' open' : '');
    card.dataset.id = m.id;
    card.innerHTML = `
      <div class="plug-top">
        <span class="plug-ic">${PLUG_ICONS[m.id] || ''}</span>
        <div class="plug-txt"><b>${esc(m.name)}</b><p>${esc(m.desc)}</p></div>
        <label class="switch"><input type="checkbox" class="pon" ${c.on ? 'checked' : ''}><span class="track"><span class="thumb"></span></span></label>
      </div>
      <div class="plug-row">
        <small>Janelas</small>
        ${c.wins.map((w, i) => `<button type="button" class="wchip ${w ? 'on' : ''}" data-i="${i}"><i></i>J${i + 1}</button>`).join('')}
        ${m.settings.length ? '<button type="button" class="plug-more">Ajustes <svg viewBox="0 0 16 16"><path d="m4 6 4 4 4-4"/></svg></button>' : ''}
      </div>
      <div class="plug-set">${m.settings.map((f) => field(f, c.set[f.key])).join('')}</div>`;
    card.querySelector('.pon').onchange = async (e) => { await window.qb.plugins.set(m.id, { on: e.target.checked }); card.classList.toggle('on', e.target.checked); };
    card.querySelectorAll('.wchip').forEach((b) => b.onclick = async () => {
      const wins = [...c.wins]; wins[+b.dataset.i] = !wins[+b.dataset.i];
      const r = await window.qb.plugins.set(m.id, { wins }); c.wins = r.wins;
      b.classList.toggle('on', r.wins[+b.dataset.i]);
    });
    const more = card.querySelector('.plug-more');
    if (more) more.onclick = () => card.classList.toggle('open');
    card.querySelectorAll('[data-k]').forEach((inp) => inp.onchange = () => {
      const f = m.settings.find((x) => x.key === inp.dataset.k);
      let v = f.type === 'bool' ? inp.checked : f.type === 'number' ? Number(inp.value) : inp.value;
      if (f.type === 'number') { if (!Number.isFinite(v)) v = f.def; v = Math.min(f.max ?? v, Math.max(f.min ?? v, v)); inp.value = v; }
      window.qb.plugins.set(m.id, { set: { [f.key]: v } });
    });
    pluginList.appendChild(card);
  }
}

function field(f, v) {
  if (f.type === 'bool') return `<label class="check fld chk"><input type="checkbox" data-k="${f.key}" ${v ? 'checked' : ''}><span class="box"><svg viewBox="0 0 16 16"><path d="m3.5 8.5 3 3 6-7"/></svg></span><span>${esc(f.label)}</span></label>`;
  if (f.type === 'select') return `<label class="fld wide"><span>${esc(f.label)}</span><select class="sel" data-k="${f.key}">${f.options.map(([k, t]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  if (f.type === 'number') return `<label class="fld"><span>${esc(f.label)}</span><span class="in"><input type="number" data-k="${f.key}" value="${v}" min="${f.min ?? ''}" max="${f.max ?? ''}" step="${f.step ?? 1}"><em>${esc(f.suffix || '')}</em></span></label>`;
  return `<label class="fld wide"><span>${esc(f.label)}</span><span class="in"><input type="text" data-k="${f.key}" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}" spellcheck="false"></span></label>`;
}


// ======================================================================
// Histórico de caçadas
// ======================================================================
const histSheet = document.getElementById('histSheet');
const histBody = document.getElementById('histBody');
const histChar = document.getElementById('histChar');
let histData = null, histTimer = null;
const targets = {}; // char -> level alvo (só nesta sessão do app)
const expFor = (L) => Math.floor((50 * L * L * L - 150 * L * L + 400 * L) / 3); // mesma fórmula do jogo

async function openHistory() {
  if (!sheet.hidden) closeSettings();
  if (!histSheet.hidden) return;
  window.qb.settings.setOpen(true);
  histSheet.hidden = false;
  await loadHistory();
  histTimer = setInterval(loadHistory, 5000);
}
function closeHistory() {
  if (histSheet.hidden) return;
  histSheet.hidden = true; clearInterval(histTimer);
  window.qb.settings.setOpen(false);
}
async function loadHistory() {
  histData = await window.qb.hunts.get();
  const names = [...new Set([...histData.chars.map((c) => c.char), ...histData.hunts.map((h) => h.char)])].sort();
  const cur = histChar.value;
  histChar.innerHTML = `<option value="">Todas as contas</option>` + names.map((n) => `<option ${n === cur ? 'selected' : ''}>${esc(n)}</option>`).join('');
  renderHistory();
}
histChar.onchange = renderHistory;

function renderHistory() {
  if (!histData) return;
  const who = histChar.value;
  const hunts = histData.hunts.filter((h) => !who || h.char === who);
  const focusEl = document.activeElement?.dataset?.char; // não atrapalha quem está digitando o alvo
  const parts = [];

  // em andamento
  const live = histData.live.filter((l) => !who || l.char === who);
  if (live.length) parts.push(`<div class="hist-sec"><h3><i class="live-dot"></i> Em andamento</h3><div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Conta</th><th class="l">Mapa</th><th>Tempo</th><th>Exp/h</th><th>Gold/h</th><th>Pura/h</th><th>Ess/h</th><th>Kills</th><th>Mortes</th></tr></thead><tbody>
    ${live.map((l) => { const ms = l.hist?.activeMs > 60e3 ? l.hist.activeMs : l.ms, h = ms / 3.6e6, pu = Math.max(l.pura || 0, l.hist?.gotPura || 0), es = Math.max(l.ess || 0, l.hist?.gotEss || 0); const early = ms < 60e3, R = (v, f) => (early ? '…' : f(v / h)); // primeiro minuto: taxa ainda não diz nada
      return `<tr><td>J${l.panel + 1} · ${esc(l.char)}</td><td class="l">${esc(l.zone || '?')}</td><td>${dur(ms)}</td><td>${R(l.exp, nf)}</td><td>${R(l.gold, nf)}</td><td>${R(pu, rt)}</td><td>${R(es, rt)}</td><td>${nf(l.kills)}</td><td>${l.deaths}</td></tr>`; }).join('')}
    </tbody></table></div></div>`);

  // comparativo por mapa
  const by = {};
  for (const h of hunts) {
    const z = (by[h.zone] ||= { zone: h.zone, n: 0, ms: 0, exp: 0, gold: 0, cost: 0, deaths: 0, pura: 0, ess: 0 });
    z.n++; z.ms += h.ms; z.exp += h.exp; z.gold += h.gold; z.cost += h.potCost || 0; z.deaths += h.deaths; z.pura += h.pura || 0; z.ess += h.ess || 0;
  }
  const zones = Object.values(by).map((z) => ({ ...z, eph: z.exp / (z.ms / 3.6e6), gph: z.gold / (z.ms / 3.6e6), cph: z.cost / (z.ms / 3.6e6), pph: z.pura / (z.ms / 3.6e6), sph: z.ess / (z.ms / 3.6e6) })).map((z) => ({ ...z, lph: z.gph - z.cph })).sort((a, b) => b.eph - a.eph);
  const best = (k) => Math.max(...zones.map((z) => z[k]));
  parts.push(`<div class="hist-sec"><h3>Comparativo por mapa <small>${zones.length ? 'ordenado por exp/h, melhor de cada coluna em verde' : ''}</small></h3>` + (zones.length ? `<div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Mapa</th><th>Caçadas</th><th>Tempo</th><th>Exp/h</th><th>Gold/h</th><th>Pura/h</th><th>Ess/h</th><th>Poção/h</th><th>Lucro/h</th><th>Mortes/h</th></tr></thead><tbody>
    ${zones.map((z) => `<tr><td>${esc(z.zone)}</td><td>${z.n}</td><td>${dur(z.ms)}</td><td class="${z.eph === best('eph') ? 'best' : ''}">${nf(z.eph)}</td><td class="${z.gph === best('gph') ? 'best' : ''}">${nf(z.gph)}</td><td class="${z.pph > 0 && z.pph === best('pph') ? 'best' : ''}">${rt(z.pph)}</td><td class="${z.sph > 0 && z.sph === best('sph') ? 'best' : ''}">${rt(z.sph)}</td><td>${nf(z.cph)}</td><td class="${z.lph < 0 ? 'neg' : z.lph === best('lph') ? 'best' : ''}">${nf(z.lph)}</td><td>${(z.deaths / (z.ms / 3.6e6)).toFixed(2)}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="empty">Nenhuma caçada gravada ainda. Elas aparecem aqui quando terminam (zerar o analyzer, trocar de mapa ou sair do jogo).</div>`) + `</div>`);

  // projeção de level
  const chars = histData.chars.filter((c) => !who || c.char === who);
  if (chars.length) parts.push(`<div class="hist-sec"><h3>Projeção de level <small>média das últimas caçadas de cada conta</small></h3><div class="cards">
    ${chars.map((c) => {
      const mine = histData.hunts.filter((h) => h.char === c.char).slice(0, 10);
      const lv = histData.live.find((l) => l.char === c.char);
      let ms = mine.reduce((s, h) => s + h.ms, 0), exp = mine.reduce((s, h) => s + h.exp, 0);
      if (lv) { const lms = lv.hist?.activeMs > 60e3 ? lv.hist.activeMs : lv.ms; ms += lms; exp += lv.exp; }
      const eph = ms > 0 ? exp / (ms / 3.6e6) : 0;
      const tgt = targets[c.char] || c.level + 1;
      const need = Math.max(0, expFor(tgt) - c.exp);
      const eta = eph > 0 ? need / eph * 3.6e6 : 0;
      return `<div class="pcard"><div class="h"><b>${esc(c.char)}</b><small>J${c.panel + 1} · Lv ${c.level}</small></div>
        <div class="kv"><span>Exp/h média</span><b>${eph ? nf(eph) : 'sem dados'}</b></div>
        <div class="kv"><span>Falta p/ o próximo</span><b>${nf(c.expNext)}</b></div>
        <div class="kv"><span>Level alvo</span><input type="number" data-char="${esc(c.char)}" value="${tgt}" min="${c.level + 1}"></div>
        <div class="eta"><span class="kv" style="margin:0">Tempo caçando</span><b>${eph ? (eta / 3.6e6 >= 48 ? `${(eta / 8.64e7).toFixed(1)} dias` : dur(eta)) : '...'}</b></div></div>`;
    }).join('')}</div></div>`);

  // lista de caçadas
  if (hunts.length) parts.push(`<div class="hist-sec"><h3>Caçadas <small>${hunts.length} gravadas</small></h3><div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Quando</th><th class="l">Conta</th><th class="l">Mapa</th><th>Tempo</th><th>Exp/h</th><th>Gold</th><th>Pura</th><th>Ess</th><th>Poções</th><th>Lucro</th><th>Mortes</th><th></th></tr></thead><tbody>
    ${hunts.slice(0, 200).map((h) => { const hr = h.ms / 3.6e6, lucro = h.gold - (h.potCost || 0); return `<tr><td>${new Date(h.start).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td><td class="l">${esc(h.char)}</td><td class="l">${esc(h.zone)}</td><td>${dur(h.ms)}</td><td>${nf(h.exp / hr)}</td><td>${nf(h.gold)}</td><td title="${rt((h.pura || 0) / hr)}/h">${nf(h.pura || 0)}</td><td title="${rt((h.ess || 0) / hr)}/h">${nf(h.ess || 0)}</td><td>${nf(h.potHp + h.potKi)}</td><td class="${lucro < 0 ? 'neg' : ''}">${nf(lucro)}</td><td>${h.deaths}</td><td><button class="x" data-key="${esc(h.key)}" title="Apagar">×</button></td></tr>`; }).join('')}
    </tbody></table></div></div>`);

  if (focusEl) return; // usuário editando o alvo: redesenha depois
  histBody.innerHTML = parts.join('');
  histBody.querySelectorAll('.x').forEach((b) => b.onclick = async () => { await window.qb.hunts.remove(b.dataset.key); loadHistory(); });
  histBody.querySelectorAll('input[data-char]').forEach((inp) => {
    inp.onchange = () => { targets[inp.dataset.char] = Math.max(Number(inp.min), Number(inp.value) || 0); inp.blur(); renderHistory(); };
    inp.onkeydown = (e) => { if (e.key === 'Enter') inp.onchange(); };
  });
}

document.getElementById('histCsv').onclick = async () => {
  const who = histChar.value;
  await window.qb.hunts.exportCsv(histData?.hunts.filter((h) => !who || h.char === who));
};
histSheet.addEventListener('click', (e) => { if (e.target === histSheet || e.target.closest('[data-close]')) closeHistory(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !histSheet.hidden) { e.preventDefault(); closeHistory(); } });
document.getElementById('openHistory').onclick = openHistory;
window.qb.onOpenHistory?.(openHistory);
