const grid = document.getElementById('grid');
const tpl = document.getElementById('panel-tpl');
const modes = document.getElementById('modes');
const PANELS = 4;
let state = null;

const X_ICON = '<svg viewBox="0 0 16 16"><path d="m4 4 8 8M12 4l-8 8"/></svg>';

// ---------- monta as 4 janelas ----------
const panels = [];
for (let p = 0; p < PANELS; p++) {
  const el = tpl.content.firstElementChild.cloneNode(true), q = (c) => el.querySelector('.' + c);
  el.dataset.p = p;
  q('badge b').textContent = 'J' + (p + 1);
  const ref = { el, seen: new Set() };
  for (const k of ['tabs', 'add', 'back', 'fwd', 'reload', 'clear', 'expand', 'url', 'content', 'count']) ref[k] = q(k);
  const url = ref.url;

  el.addEventListener('mousedown', () => window.qb.cmd('activate', p));
  ref.add.onclick = () => window.qb.cmd('newTab', p);
  ref.back.onclick = () => window.qb.cmd('back', p);
  ref.fwd.onclick = () => window.qb.cmd('fwd', p);
  ref.reload.onclick = () => {
    const t = currentTab(p);
    window.qb.cmd(t && t.loading ? 'stop' : 'reload', p);
  };
  q('home').onclick = () => window.qb.cmd('home', p);
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

  // enquanto a barra de endereço tem foco, o render não sobrescreve o que está sendo digitado
  url.addEventListener('focus', () => url.select());
  url.addEventListener('blur', render);
  url.addEventListener('keydown', (e) => { if (e.key === 'Escape') url.blur(); });
  q('url-form').addEventListener('submit', (e) => { e.preventDefault(); window.qb.cmd('navigate', p, url.value); url.blur(); });

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

    if (document.activeElement !== ref.url && t) ref.url.value = t.url === 'about:blank' ? '' : t.url;
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
    // arrastar para reordenar (só dentro da mesma janela)
    tab.draggable = true;
    tab.ondragstart = (e) => { e.dataTransfer.setData('text/qb-tab', `${p}:${i}`); e.dataTransfer.effectAllowed = 'move'; tab.classList.add('dragging'); };
    tab.ondragend = () => tab.classList.remove('dragging');
    tab.ondragover = (e) => { if (e.dataTransfer.types.includes('text/qb-tab')) { e.preventDefault(); tab.classList.add('drop'); } };
    tab.ondragleave = () => tab.classList.remove('drop');
    tab.ondrop = (e) => {
      e.preventDefault(); tab.classList.remove('drop');
      const [fp, fi] = e.dataTransfer.getData('text/qb-tab').split(':').map(Number);
      if (fp === p) window.qb.cmd('moveTab', p, fi, i);
    };
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
  overlays.forEach((o) => o.close());
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
  document.getElementById('openTimers').hidden = !s.timers;
  panels.forEach((_, p) => renderStatus(p));
});

window.qb.onPluginAlert((a) => {
  const el = panels[a.p]?.el; if (!el) return;
  el.classList.remove('alerting', 'danger'); void el.offsetWidth;
  el.classList.add('alerting'); if (a.level === 'danger') el.classList.add('danger');
  setTimeout(() => el.classList.remove('alerting', 'danger'), 3800);
});

const pct = (v) => Math.round((v || 0) * 100);
const chip = (cls, title, inner) => `<span class="chip ${cls}" title="${esc(title)}">${inner}</span>`;
const bar = (cls, v) => `<span class="minibar ${cls}"><i style="width:${pct(v)}%"></i></span>`;

function chipsNto(b, th) {
  const taskDone = b.task && b.task.need && b.task.have >= b.task.need;
  return [
    chip('who', '', `<i class="dot ${b.mode}"></i><b>${esc(b.name)}</b><small>Lv ${b.level}</small>`),
    chip(`mode ${b.mode === 'dead' ? 'danger' : ''}`, b.zone || '', `${MODE_TXT[b.mode] || esc(b.mode)}${b.zone ? ` <small class="z">${esc(b.zone)}</small>` : ''}`),
    chip(b.hpPct * 100 < (th.hpPct ?? 25) ? 'danger' : '', `Vida ${pct(b.hpPct)}% · Ki ${pct(b.kiPct)}%`, bar('hp', b.hpPct) + bar('ki', b.kiPct)),
    chip('xp', `Exp do level: ${pct(b.expPct)}%`, `${bar('xp', b.expPct)}<b>${pct(b.expPct)}%</b>`),
    b.session && chip('eph', 'Exp/h da sessão', `<small>exp/h</small><b>${nf(b.session.eph)}</b>`),
    b.session && chip('ess', `Essência de Chakra Pura: ${nf(b.session.pura)} na sessão (${nf(b.essInv?.pura)} na mochila)`, `<small>pura/h</small><b>${rt(b.session.puraPh)}</b>`),
    b.session && chip('ess', `Essência de Chakra: ${nf(b.session.ess)} na sessão (${nf(b.essInv?.ess)} na mochila)`, `<small>ess/h</small><b>${rt(b.session.essPh)}</b>`),
    chip(b.stamina < (th.staminaH ?? 40) * 3600e3 ? 'warn' : '', 'Stamina', `<small>stamina</small><b>${hm(b.stamina)}</b>`),
    b.task && chip(taskDone ? 'warn' : '', `Task ${b.task.name}`, `<small>task</small><b>${nf(b.task.have)}/${nf(b.task.need)}</b>`),
    chip(`pot ${Math.min(b.pots.hp, b.pots.ki) < (th.potMin ?? 100) ? 'warn' : ''}`, 'Heal Potion / Chakra Potion', `<small>pot</small><b>${nf(b.pots.hp)}/${nf(b.pots.ki)}</b>`),
    chip(`bag ${b.bag.cap && b.bag.cap - b.bag.used <= (th.bagFree ?? 3) ? 'warn' : ''}`, 'Mochila', `<small>bag</small><b>${b.bag.used}/${b.bag.cap}</b>`),
  ];
}

function chipsEiw(b, th) {
  const t = b.tamer || {}, pa = b.partner, l = b['eiw-lucro'];
  const st = !b.connected ? ['dead', 'desconectado'] : b.farming ? ['hunt', 'caçando'] : ['idle', 'parado'];
  return [
    chip('who', `${nf(b.bits)} Bits${b.cash != null ? ` · ${nf(b.cash)} EIW-COIN` : ''}`, `<i class="dot ${st[0]}"></i><b>${esc(b.name)}</b><small>Tamer ${t.level ?? '?'}</small>`),
    chip(`mode ${st[0] === 'dead' ? 'danger' : ''}`, '', st[1]),
    pa && chip(pa.hpPct * 100 < (th.hpPct ?? 25) ? 'danger' : '', `${pa.name || 'Digimon ativo'} · vida ${pa.hp}/${pa.max} · XP ${nf(pa.xp)}/${nf(pa.next)}`, `<small>${esc(pa.name || 'Digimon')} ${pa.level}</small>${bar('hp', pa.hpPct)}`),
    chip('xp', `Tamer: ${pct(t.pct)}% do nível`, `${bar('xp', t.pct)}<b>${pct(t.pct)}%</b>`),
    t.xph != null && chip('eph', 'XP do Tamer por hora', `<small>xp/h</small><b>${nf(t.xph)}</b>`),
    b.kph != null && chip('mode', 'Kills por hora', `<small>kills/h</small><b>${nf(b.kph)}</b>`),
    l && l.netPh != null && chip(l.netPh < 0 ? 'warn' : '', `Ganho ${nf(l.earnedPh)}/h · gasto ${nf(l.spentPh)}/h (cura, compras)`, `<small>bits/h</small><b>${l.netPh > 0 ? '+' : ''}${nf(l.netPh)}</b>`),
    t.free > 0 && chip('warn', 'Pontos de Tamer para distribuir', `<small>pontos</small><b>${t.free}</b>`),
  ];
}

function renderStatus(p) {
  const box = statusEls[p], info = plug?.panels[p], b = info?.snap;
  const pid = b?.game === 'eiw' ? 'eiw-painel' : 'painel';
  box.hidden = !(b?.inGame && plug.on[pid] && plug.wins[pid][p]);
  if (box.hidden) { box.textContent = ''; return; }
  const last = info.alerts?.[0];
  const html = [
    ...(b.game === 'eiw' ? chipsEiw(b, plug.thresholds.eiw || {}) : chipsNto(b, plug.thresholds.nto || {})),
    last && Date.now() - last.at < 10 * 60e3 && `<button class="alert ${last.level}" title="${esc(last.text)} (clique para limpar)">${ICON_BELL}<span>${esc(last.text)}</span></button>`,
  ].filter(Boolean).join('');
  if (box.dataset.h === html) return;
  box.dataset.h = html; box.innerHTML = html;
  const a = box.querySelector('.alert');
  if (a) a.onclick = () => window.qb.plugins.clearAlerts(p);
}
// a faixa muda a altura da área da página: reavisa o layout quando some
new MutationObserver(() => requestAnimationFrame(sendLayout)).observe(grid, { subtree: true, attributes: true, attributeFilter: ['hidden'] });

// ---------- aba Plugins nas configurações ----------
const PLUG_ICONS = {
  painel: '<svg viewBox="0 0 16 16"><rect x="2" y="2.5" width="12" height="11" rx="2"/><path d="M2 6h12M5 9h3M5 11h5"/></svg>',
  compacto: '<svg viewBox="0 0 16 16"><path d="M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5"/></svg>',
  historico: '<svg viewBox="0 0 16 16"><path d="M2.5 13.5h11M4.5 11V8M7.5 11V5M10.5 11V7"/></svg>',
  'eiw-painel': '<svg viewBox="0 0 16 16"><rect x="2" y="2.5" width="12" height="11" rx="2"/><path d="M2 6h12M5 9h3M5 11h5"/></svg>',
  'eiw-lucro': '<svg viewBox="0 0 16 16"><path d="M2.5 12.5 6 9l2.5 2.5 5-5M10 6.5h3.5V10"/></svg>',
  'eiw-timers': '<svg viewBox="0 0 16 16"><circle cx="8" cy="8.5" r="5.5"/><path d="M8 5.5v3l2 1.5M6.5 1.5h3"/></svg>',
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
  let game = null;
  for (const m of plugMeta.manifest) {
    if (m.game !== game) { game = m.game; pluginList.insertAdjacentHTML('beforeend', `<h4 class="plug-game">${esc(plugMeta.games[game] || game)}</h4>`); }
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
let histData = null;
const targets = {}; // char -> level alvo (só nesta sessão do app)
const expFor = (L) => Math.floor((50 * L * L * L - 150 * L * L + 400 * L) / 3); // mesma fórmula do jogo

// telas sobrepostas (histórico, timers): abrir uma fecha as outras e esconde as páginas enquanto aberta
const overlays = [];
function overlay(el, load, everyMs) {
  let timer = null;
  const o = {
    async open() {
      if (!el.hidden) return;
      closeSettings(); overlays.forEach((x) => x !== o && x.close());
      window.qb.settings.setOpen(true); el.hidden = false;
      await load(); timer = setInterval(load, everyMs);
    },
    close() { if (el.hidden) return; el.hidden = true; clearInterval(timer); window.qb.settings.setOpen(false); },
  };
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close]')) o.close(); });
  overlays.push(o);
  return o;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') overlays.forEach((o) => o.close()); });
const History = overlay(histSheet, () => loadHistory(), 5000);
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
document.getElementById('openHistory').onclick = History.open;
window.qb.onOpenHistory(History.open);

// ======================================================================
// Central de timers
// ======================================================================
const timersBody = document.getElementById('timersBody');
const KIND_ICON = { reset: '↻', boss: '♛', egg: '◐', buff: '✦', level: '▲', mission: '⚑' };
const clock = (at) => new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const left = (ms) => { const s = Math.round(Math.abs(ms) / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h >= 48 ? `${Math.floor(h / 24)}d ${h % 24}h` : h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s % 60).padStart(2, '0')}s`; };

async function loadTimers() {
  const now = Date.now(), list = await window.qb.timers();
  const next = list.filter((t) => t.at > now).sort((a, b) => a.at - b.at);
  const past = list.filter((t) => t.at <= now && now - t.at < 3 * 3600e3).sort((a, b) => b.at - a.at);
  const row = (t) => `<div class="tm-row ${t.at <= now ? 'past' : t.at - now < 10 * 60e3 ? 'soon' : ''}">
    <span class="tm-ic">${KIND_ICON[t.kind] || '•'}</span>
    <span class="badge tm-who" data-p="${t.panel ?? ''}"><i></i><b>${t.panel == null ? 'Servidor' : `J${t.panel + 1}`}</b></span>
    <span class="tm-txt"><b>${esc(t.label)}</b><small>${esc([t.who, t.detail].filter(Boolean).join(' · '))}</small></span>
    <span class="tm-left">${t.at > now ? left(t.at - now) : `há ${left(now - t.at)}`}</span>
    <span class="tm-at">${clock(t.at)}</span></div>`;
  timersBody.innerHTML = !list.length ? '<div class="empty">Nenhum timer ainda. Eles aparecem quando as contas estão no jogo com o plugin ligado.</div>'
    : `${next.length ? `<div class="hist-sec"><h3>Próximos</h3>${next.map(row).join('')}</div>` : ''}${past.length ? `<div class="hist-sec"><h3>Recentes</h3>${past.map(row).join('')}</div>` : ''}`;
}
const Timers = overlay(document.getElementById('timersSheet'), loadTimers, 1000);
document.getElementById('openTimers').onclick = Timers.open;
window.qb.onOpenTimers(Timers.open);
