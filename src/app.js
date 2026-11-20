// ---------- developer log (shown in the hidden Developer settings) ----------
const devBuf = [];
const scrub = (t) => t.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]').replace(/([?&](?:ip|key|sig|signature|token|access_token|authorization)=)[^&\s"]+/gi, '$1…').slice(0, 400) + (t.length > 400 ? ' …' : '');
function dlog(level, ...a) {
  const msg = a.map((x) => (x instanceof Error ? x.stack || x.message : typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })())).join(' ');
  // (the log can be copied and shared: no addresses, and long dumps are cut short)
  devBuf.push({ t: Date.now(), level, src: 'page', msg: scrub(msg) }); if (devBuf.length > 1000) devBuf.shift();
}
for (const k of ['log', 'info', 'warn', 'error']) { const o = console[k].bind(console); console[k] = (...a) => { dlog(k === 'log' ? 'info' : k, ...a); o(...a); }; }
window.addEventListener('error', (e) => dlog('error', 'error:', e.message, (e.filename || '').split('/').pop() + ':' + e.lineno));
window.addEventListener('unhandledrejection', (e) => dlog('error', 'unhandled rejection:', e.reason));
const $ = (s) => document.querySelector(s);
const grid = $('#grid'), status = $('#status'), video = $('#video');
const perf = { data: false, power: false, battery: null, ready: false };
let settings = {}, current = null, segments = [], lastSkip = 0, queue = [], view = 'home', speed = 1;
let editingTools = false, commentSort = 'TOP_COMMENTS';
let auth = { active: null, accounts: [], encrypted: false }, remoteSubs = null; // remoteSubs: channel ids when signed in
const signedIn = () => !!auth.active;
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const lsSet = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Watch progress: what this app recorded, YouTube's own resume positions (synced when signed in), or the feed's value.
let ytProg = lsGet('ytprogress', {});
const progOf = (v) => Math.max(lsGet('progress', {})[v.id]?.pct || 0, ytProg[v.id] || 0, v.watchedPct || 0) || (settings.dimWatched === false && isWatched(v.id) ? 100 : 0); // watched but not faded: show a full bar instead
const fmtNum = (n) => (n == null ? '' : Intl.NumberFormat('en', { notation: 'compact' }).format(n));
const isWatched = (id) => !!lsGet('watched', {})[id];
function setWatched(ids, on) {
  const w = lsGet('watched', {});
  for (const id of [].concat(ids)) { if (on) w[id] = 1; else delete w[id]; }
  lsSet('watched', w);
  renderSideSubs();
}

// ---------- settings ----------
const D = SCHEMA.defaults;
const LIVE_LAYOUT = new Set(['fontSize', 'iconSize', 'toolbarSize', 'sidebarWidth', 'relatedWidth', 'gridSize']);
const THEMES = {
  dark: { bg: '#0f0f0f', bg2: '#272727', bg3: '#1a1a1a', fg: '#f1f1f1', fg2: '#aaaaaa', line: '#303030', link: '#3ea6ff' },
  light: { bg: '#ffffff', bg2: '#f2f2f2', bg3: '#fafafa', fg: '#0f0f0f', fg2: '#606060', line: '#e5e5e5', link: '#065fd4' },
  amoled: { bg: '#000000', bg2: '#1a1a1a', bg3: '#000000', fg: '#f1f1f1', fg2: '#aaaaaa', line: '#222222', link: '#3ea6ff' },
  nord: { bg: '#2e3440', bg2: '#3b4252', bg3: '#2b303b', fg: '#eceff4', fg2: '#aab2c0', line: '#434c5e', link: '#88c0d0' },
  dracula: { bg: '#282a36', bg2: '#343746', bg3: '#21222c', fg: '#f8f8f2', fg2: '#a0a4b8', line: '#44475a', link: '#8be9fd' },
  solarized: { bg: '#002b36', bg2: '#073642', bg3: '#00212b', fg: '#eee8d5', fg2: '#93a1a1', line: '#0d4452', link: '#2aa198' },
};
const hex2rgb = (h) => { const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(h || ''); return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : [0, 0, 0]; };
const rgb2hex = (c) => '#' + c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A.map((x, i) => x * t + B[i] * (1 - t))); };
const IS_WAYLAND = api.session === 'wayland'; // used by settings-schema.js
const luminance = (h) => { const [r, g, b] = hex2rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const rgba = (h, a) => `rgba(${hex2rgb(h).join(',')},${a})`;

async function loadSettings() {
  const stored = await api.getSettings();
  if (stored.quality === 'best') stored.quality = 'auto'; // 'Highest available' is now the automatic choice
  if (stored.autoplayMode === undefined && stored.autoplayNext === false) stored.autoplayMode = 'off'; // older versions had an on/off switch only
  settings = { ...D, ...stored };
  applySettings();
}
function applyTheme() {
  let name = settings.theme;
  if (name === 'auto') name = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  const t = name === 'custom'
    ? { bg: settings.cBg, bg2: settings.cSurface, bg3: settings.cBg, fg: settings.cText, fg2: mix(settings.cText, settings.cBg, 0.65), line: mix(settings.cText, settings.cBg, 0.15), link: settings.cLink }
    : THEMES[name] || THEMES.dark;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t)) root.style.setProperty('--' + k, v);
  root.style.setProperty('--accent', settings.accent || '#ff0000');
  root.style.colorScheme = luminance(t.bg) < 0.5 ? 'dark' : 'light'; // keeps scrollbars and form controls readable
  document.body.classList.toggle('classic', settings.skin === 'classic');
  // Classic has its own palette; it can be dark too (always, or whenever the chosen theme is dark)
  document.body.classList.toggle('classic-dark', settings.skin === 'classic' && (settings.classicMode === 'dark' || (settings.classicMode !== 'light' && luminance(t.bg) < 0.5)));
}
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => settings.theme === 'auto' && applyTheme());
let lastZoom = 0;
function applyLayout() {
  const root = document.documentElement.style;
  applyCommentStyle(); placeComments(); renderPQuick(); syncLogoTitle();
  applyPlayerTheme(); document.body.classList.toggle('no-dim', settings.dimWatched === false);
  paintRc(); renderTabs(); paintBell();
  applyTouch(); applyPerf(); updateAway(); paintBellBadge();
  applyStableAudio();
  if (settings.notifyInterval !== notifIntervalApplied) { notifIntervalApplied = settings.notifyInterval; scheduleNotifPoll(); }
  document.body.classList.toggle('no-toolbar', settings.showToolbar !== true); // the button row under the video is optional
  root.setProperty('--card-min', (settings.gridSize || 300) + 'px');
  const [gy, gx, pad] = { compact: ['14px', '10px', '10px 16px'], comfortable: ['24px', '16px', '16px 24px'], spacious: ['34px', '22px', '20px 32px'] }[settings.density] || ['24px', '16px', '16px 24px'];
  root.setProperty('--gy', gy); root.setProperty('--gx', gx); root.setProperty('--pad', pad);
  document.body.classList.toggle('collapsed', settings.sidebarDefault === false);
  for (const a of document.querySelectorAll('#side a')) a.hidden = settings['nav_' + a.dataset.nav] === false;
  const w = $('#watch');
  w.classList.toggle('theater', !!settings.theater);
  w.classList.toggle('rel-below', settings.watchRelated === 'below');
  w.classList.toggle('rel-hidden', settings.watchRelated === 'hidden');
  $('#comments-box').classList.toggle('collapsed', !!settings.commentsHidden);
  $('#c-toggle').textContent = settings.commentsHidden ? 'Show' : 'Hide';
  $('#r-dislikes').style.display = settings.showDislikes === false ? 'none' : '';
  root.setProperty('--fs', (settings.fontSize || 14) + 'px'); root.setProperty('--icon', (settings.iconSize || 20) + 'px');
  root.setProperty('--tool-h', (settings.toolbarSize || 40) + 'px'); root.setProperty('--side-w', (settings.sidebarWidth || 200) + 'px');
  root.setProperty('--related-w', (settings.relatedWidth || 400) + 'px');
  syncSideAuto();
  const z = (settings.uiScalePct || 100) / 100;
  if (z !== lastZoom) { lastZoom = z; api.setZoom(z); }
}
const CUE_FONTS = { sans: 'Roboto,Arial,sans-serif', serif: 'Georgia,serif', mono: '"DejaVu Sans Mono",monospace', casual: '"Comic Sans MS",cursive' };
const CUE_EDGES = { none: 'none', shadow: '0 0 4px #000,0 0 4px #000', outline: '-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000' };
function cueStyle() {
  return `font-size:${settings.subSize}%;font-family:${CUE_FONTS[settings.subFont] || CUE_FONTS.sans};color:${settings.subColor};background-color:${rgba(settings.subBg, settings.subBgOpacity / 100)};text-shadow:${CUE_EDGES[settings.subEdge] || 'none'}`;
}
function applyCueStyle() { $('#cue-css').textContent = `video::cue{${cueStyle()}}`; }
let lastVerbose = false;
function applySettings() { if (!!settings.devVerbose !== lastVerbose) { lastVerbose = !!settings.devVerbose; api.devVerbose(lastVerbose).catch(() => {}); }
  applyTheme(); applyLayout(); applyCueStyle();
  $('#custom-css').textContent = settings.css || '';
  renderToolbar(); renderSideSubs();
  if (current && [settings.composerStyle || 'expand', settings.composerSubmit, settings.composerCounter, signedIn(), auth.active].join() !== composerSig) renderComposer();
  if (!$('#settings').hidden) renderSettings(true);
}
// The main process stores only what you changed, so always layer the defaults underneath.
async function save(p) { settings = { ...D, ...(await api.setSettings(p)) }; applySettings(); }
$('#menu-btn').onclick = () => (document.body.classList.contains('side-auto') ? document.body.classList.toggle('side-peek') : save({ sidebarDefault: settings.sidebarDefault === false }));

// Google Takeout subscriptions.csv: "Channel Id,Channel Url,Channel Title"
function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const ACTIONS = {
  async resetAll() {
    if (!confirm('Reset every setting to its default? Your accounts, history and subscriptions are kept.')) return;
    await save({ ...D, toolbar: null, toolbarHidden: false, speed: 1, downloadDir: '' });
  },
  resetToolbar: () => save({ toolbar: null, toolbarHidden: false, menuActions: null }),
  copyDevLog() { const t = $('#dev-log')?.innerText; api.copy(t || ''); toast('Log copied'); },
  async clearDevLog() { devBuf.length = 0; mainLogT = 0; await api.devLogClear(); paintLogView(true); },
  async devOff() { await save({ devMode: false, devVerbose: false }); sTab = 'about'; renderSettings(); toast('Developer options off'); },
  copyMediaLog() { api.copy(mlogBuf.length ? mlogBuf.join('\n') : 'Nothing has gone wrong with the sound or the stream since the app started.'); toast('Playback log copied'); },
  async testNotify() { const ok = await api.notify('test', 'YouTube Desktop', 'This is how a notification looks.'); if (!ok) toast('Notifications are switched off.'); },
  async checkUpdate() { toast('Checking for updates…'); const u = await api.updateCheck(); if (u.status === 'none') toast(`You have the latest version (${u.current}).`); else if (u.status === 'error') toast('Could not check: ' + u.error); },
  openDownloads: () => api.openDownloads(),
  relaunch: () => api.relaunch(),
  clearHistory() { if (confirm('Clear your local watch history, watched marks and resume positions?')) for (const k of ['history', 'watched', 'progress']) localStorage.removeItem(k); },
  clearSubs() { if (confirm('Remove all locally stored subscriptions?')) for (const k of ['subs', 'subcache']) localStorage.removeItem(k); },
  async importSubs(file) {
    const rows = parseCsv(await file.text());
    const head = (rows.shift() || []).map((h) => h.trim().toLowerCase());
    const iId = head.findIndex((h) => h.includes('channel id')), iName = head.findIndex((h) => h.includes('title'));
    const subs = lsGet('subs', {}); let n = 0;
    for (const r of rows) {
      const id = (r[iId] || '').trim();
      if (/^UC[\w-]{20,}$/.test(id) && !subs[id]) { subs[id] = { id, name: (r[iName] || '').trim(), avatar: '' }; n++; }
    }
    lsSet('subs', subs); lsSet('subcache', { ts: 0, videos: [] });
    renderSideSubs();
    alert(n ? `Imported ${n} subscriptions.` : 'No new subscriptions found in that file.');
  },
};

// Settings panel, generated from SCHEMA.
let sTab = 'general';
function openSettings() { $('#settings').hidden = false; renderSettings(); }
function settingRow(it) {
  const val = settings[it.key] ?? D[it.key];
  const row = document.createElement(it.type === 'toggle' ? 'label' : 'div');
  row.className = 'srow' + (it.type === 'textarea' ? ' col' : '');
  const lab = `<span class="lab">${esc(it.label || '')}${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</span>`;
  const bind = (el, ev, get) => el.addEventListener(ev, () => save({ [it.key]: get(el) }));
  switch (it.type) {
    case 'toggle': row.innerHTML = `${lab}<span class="sw"><input type="checkbox" ${val ? 'checked' : ''}><i></i></span>`; bind(row.querySelector('input'), 'change', (e) => e.checked); break;
    case 'select': row.innerHTML = `${lab}<select>${it.options.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select>`; { const el = row.querySelector('select'); el.value = String(val ?? ''); bind(el, 'change', (e) => e.value); } break;
    case 'range': {
      row.innerHTML = `${lab}<input type="range" min="${it.min}" max="${it.max}" step="${it.step}" value="${val}"><span class="rv">${val}${esc(it.unit || '')}</span>`;
      const el = row.querySelector('input'), rv = row.querySelector('.rv');
      el.addEventListener('input', () => {
        rv.textContent = el.value + (it.unit || '');
        if (it.key.startsWith('sub')) { settings[it.key] = +el.value; applyCueStyle(); updateCuePreview(); }
        else if (LIVE_LAYOUT.has(it.key)) { settings[it.key] = +el.value; applyLayout(); } // preview sizes while dragging
      });
      bind(el, 'change', (e) => +e.value); break;
    }
    case 'color': row.innerHTML = `${lab}<input type="color" value="${esc(val)}">`; bind(row.querySelector('input'), 'change', (e) => e.value); break;
    case 'text': row.innerHTML = `${lab}<input type="text" value="${esc(val ?? '')}" spellcheck="false">`; bind(row.querySelector('input'), 'change', (e) => e.value.trim()); break;
    case 'textarea': row.innerHTML = `${lab}<textarea spellcheck="false">${esc(val ?? '')}</textarea>`; bind(row.querySelector('textarea'), 'change', (e) => e.value); break;
    case 'dir': row.innerHTML = `${lab}<span class="hint">${esc(settings.downloadDir || '(system Downloads folder)')}</span><button>Choose…</button>`; row.querySelector('button').onclick = async () => { const d = await api.pickDir(); if (d) save({ downloadDir: d }); }; break;
    case 'button': row.innerHTML = `<span class="lab"></span><button class="${it.danger ? 'danger' : ''}">${esc(it.label)}</button>`; row.querySelector('button').onclick = () => ACTIONS[it.action](); break;
    case 'file': row.innerHTML = `${lab}<input type="file" accept="${esc(it.accept || '')}">`; row.querySelector('input').onchange = async (e) => { const f = e.target.files[0]; if (f) await ACTIONS[it.action](f); e.target.value = ''; }; break;
    case 'info': row.className = 'sinfo'; row.textContent = it.text; break;
    case 'about': {
      row.className = 'about-row';
      row.innerHTML = `<div class="ab-name">YouTube Desktop</div><div class="ab-ver">Version …</div><div class="ab-note">A desktop client for YouTube.</div>`;
      api.updateState().then((u) => { row.querySelector('.ab-ver').textContent = 'Version ' + (u.current || ''); }).catch(() => {});
      // Like Android's build number: press and hold the name for five seconds to unlock the developer options.
      let tm = 0; const nm = row.querySelector('.ab-name'), stop = () => { clearTimeout(tm); nm.classList.remove('holding'); };
      nm.addEventListener('pointerdown', () => {
        if (settings.devMode) { toast('Developer options are already on'); return; }
        nm.classList.add('holding'); clearTimeout(tm);
        tm = setTimeout(() => { nm.classList.remove('holding'); save({ devMode: true }).then(() => { toast('Developer options unlocked'); sTab = 'dev'; renderSettings(); }); }, 5000);
      });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) nm.addEventListener(ev, stop);
      break;
    }
    case 'logview': row.className = 'logview'; row.innerHTML = `<div class="lv-bar"><select id="lv-level"><option value="all">Everything</option><option value="warn">Warnings and errors</option><option value="error">Errors only</option></select><span id="lv-count"></span></div><div id="dev-log" tabindex="0"></div>`; queueMicrotask(startLogView); break;
    case 'updatepanel': row.className = 'upd-panel'; row.id = 'upd-panel'; queueMicrotask(() => paintUpdatePanel(lastUpd)); break;
    case 'subpreview': row.className = 'cue-preview'; row.innerHTML = '<span>This is how subtitles will look.</span>'; break;
  }
  return row;
}
function updateCuePreview() { const p = $('.cue-preview span'); if (p) p.style.cssText = cueStyle(); }
let mainLog = [], mainLogT = 0, lvTimer = 0;
const lvLevels = { debug: 0, info: 0, warn: 1, error: 2 };
function paintLogView(force) {
  const el = $('#dev-log'); if (!el) { clearInterval(lvTimer); lvTimer = 0; return; }
  const min = { all: 0, warn: 1, error: 2 }[$('#lv-level')?.value || 'all'];
  const all = [...mainLog, ...devBuf].filter((l) => (lvLevels[l.level] ?? 0) >= min).sort((a, b) => a.t - b.t).slice(-600);
  const key = all.length + ':' + (all[all.length - 1]?.t || 0) + ':' + min;
  if (!force && el.dataset.key === key) return;
  el.dataset.key = key;
  const stick = el.scrollTop + el.clientHeight >= el.scrollHeight - 30;
  el.innerHTML = all.length ? all.map((l) => `<div class="lg ${esc(l.level)}"><span class="lt">${new Date(l.t).toTimeString().slice(0, 8)}</span><span class="ls">${l.src}</span>${esc(l.msg)}</div>`).join('') : '<div class="lg info">Nothing logged yet.</div>';
  if (stick) el.scrollTop = el.scrollHeight;
  const c = $('#lv-count'); if (c) c.textContent = all.length + ' lines';
}
function startLogView() {
  clearInterval(lvTimer);
  const poll = async () => { if (!$('#dev-log')) { clearInterval(lvTimer); lvTimer = 0; return; } try { const l = await api.devLog(mainLogT); if (l.length) { mainLog.push(...l); mainLogT = l[l.length - 1].t; if (mainLog.length > 1000) mainLog.splice(0, mainLog.length - 1000); } } catch {} paintLogView(); };
  $('#lv-level').onchange = () => paintLogView(true);
  poll(); lvTimer = setInterval(poll, 1000);
  const el = $('#dev-log'); el.scrollTop = el.scrollHeight;
}
function renderSettings(keepScroll) {
  const nav = $('#s-tabs'), pane = $('#s-pane'), top = pane.scrollTop;
  nav.innerHTML = '';
  for (const t of SCHEMA.tabs) { if (t.hidden && t.hidden(settings)) continue; const a = document.createElement('a'); a.textContent = t.label; a.className = t.id === sTab ? 'on' : ''; a.onclick = () => { sTab = t.id; renderSettings(); pane.scrollTop = 0; }; nav.appendChild(a); }
  pane.innerHTML = '';
  const tab = SCHEMA.tabs.find((t) => t.id === sTab && !(t.hidden && t.hidden(settings))) || SCHEMA.tabs[0];
  for (const g of tab.groups) {
    const box = document.createElement('div'); box.className = 'sg';
    box.innerHTML = `<h3>${esc(g.title)}</h3>${g.hint ? `<p class="ghint">${esc(g.hint)}</p>` : ''}`;
    for (const it of g.items) if (!it.when || it.when(settings)) box.appendChild(settingRow(it));
    pane.appendChild(box);
  }
  updateCuePreview();
  if (keepScroll) pane.scrollTop = top;
}
$('#settings-btn').onclick = openSettings;
$('#s-close').onclick = () => ($('#settings').hidden = true);
$('#settings').addEventListener('mousedown', (e) => { if (e.target.id === 'settings') $('#settings').hidden = true; });

// ---------- rich text (links + clickable timestamps) ----------
const tsToSec = (t) => t.split(':').reduce((a, p) => a * 60 + parseInt(p, 10), 0);
function rich(text) {
  let s = esc(text);
  s = s.replace(/https?:\/\/[^\s<]+/g, (u) => `<a data-url="${u}">${u}</a>`);
  s = s.replace(/(^|[\s(])((?:\d{1,2}:)?\d{1,2}:\d{2})(?=$|[\s).,!?])/g, (m, pre, t) => `${pre}<a data-ts="${tsToSec(t)}">${t}</a>`);
  return s;
}
document.addEventListener('click', (e) => {
  const u = e.target.closest?.('a[data-url]');
  if (u) { e.preventDefault(); api.openExternal(u.dataset.url); return; }
  const t = e.target.closest?.('a[data-ts]');
  if (t) { e.preventDefault(); video.currentTime = +t.dataset.ts; video.play().catch(() => {}); }
});

// ---------- back / forward ----------
const navStack = []; let navIdx = -1, navBusy = false;
const scroller = () => ($('#watch').hidden ? $('#main') : $('#watch'));
function updateNavButtons() { $('#nav-back').disabled = navIdx <= 0; $('#nav-fwd').disabled = navIdx >= navStack.length - 1; }
function navPush(type, args, opt = {}) {
  if (navBusy) return;
  const cur = navStack[navIdx]; if (cur) cur.scroll = scroller().scrollTop;
  if (opt.replace && cur) navStack[navIdx] = { type, args };
  else {
    if (cur && cur.type === type && JSON.stringify(cur.args) === JSON.stringify(args)) return updateNavButtons();
    navStack.splice(navIdx + 1); navStack.push({ type, args }); navIdx = navStack.length - 1;
    if (navStack.length > 100) { navStack.shift(); navIdx--; }
  }
  updateNavButtons();
}
const NAV_ITEM = { home: 'home', subs: 'subs', history: 'history', watchlater: 'watchlater', playlists: 'playlists', downloads: 'downloads' };
function runNav(e) {
  const x = e.args || {};
  document.querySelectorAll('#side a').forEach((el) => el.classList.toggle('active', el.dataset.nav === NAV_ITEM[e.type]));
  switch (e.type) {
    case 'home': return goHome();
    case 'search': searchFilters = { ...(x.filters || {}) }; return doSearch(x.q, true);
    case 'channel': return openChannel(x.id, x.tab, x.sort);
    case 'playlist': return openPlaylist(x.id);
    case 'subs': return showSubs();
    case 'history': return showHistory();
    case 'watchlater': return showList('watchlater', 'Watch later');
    case 'playlists': return showPlaylists();
    case 'downloads': return showDownloads();
    case 'manage': return showManageSubs();
    case 'video': return openVideo(x.v, { nav: true });
  }
}
// Two-finger trackpad swipe: horizontal wheel movement adds up; a long enough swipe goes back or forward once.
let swipeSum = 0, swipeLast = 0, swipeLock = 0;
document.addEventListener('wheel', (e) => {
  if (!settings.swipeNav || e.ctrlKey || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
  if (!$('#settings').hidden || !$('#login').hidden) return;
  for (let el = e.target; el && el !== document.body; el = el.parentElement) { // let real sideways scrollers (carousels, code) keep the gesture
    if (el.scrollWidth > el.clientWidth + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowX)) return;
  }
  const now = Date.now();
  if (now < swipeLock) return;
  if (now - swipeLast > 250) swipeSum = 0;
  swipeLast = now; swipeSum += e.deltaX;
  if (Math.abs(swipeSum) < (settings.swipeDistance || 150)) return;
  const back = (swipeSum < 0) !== !!settings.swipeInvert;
  swipeSum = 0; swipeLock = now + 700; // ignore the momentum tail of the same swipe
  navGo(back ? -1 : 1);
}, { passive: true });
function pageAnim(delta) {
  const all = ['pa-back', 'pa-fwd', 'pa-fade'], m = settings.pageAnim || 'slide';
  for (const el of [$('#main'), $('#watch')]) {
    if (el.classList.contains('away')) continue; // a transform here would drag the floating player along
    el.classList.remove(...all); clearTimeout(el._paT);
    if (m === 'none') continue;
    void el.offsetWidth;
    el.classList.add(m === 'fade' ? 'pa-fade' : delta < 0 ? 'pa-back' : 'pa-fwd');
    el._paT = setTimeout(() => el.classList.remove(...all), 400); // a hidden page never fires animationend, so use a timer
  }
}
async function navGo(delta) {
  const i = navIdx + delta; if (i < 0 || i >= navStack.length || navBusy) return;
  const cur = navStack[navIdx]; if (cur) cur.scroll = scroller().scrollTop;
  navIdx = i; navBusy = true; updateNavButtons();
  const e = navStack[i];
  try { if (e.type !== 'video' && !$('#watch').hidden && !floatOn()) video.pause(); const run = runNav(e); pageAnim(delta); await run; } catch {}
  navBusy = false;
  setTimeout(() => { scroller().scrollTop = e.scroll || 0; }, 80);
}
$('#nav-back').onclick = () => navGo(-1); $('#nav-fwd').onclick = () => navGo(1);
// Mouse back/forward buttons.
window.addEventListener('mouseup', (e) => { if (e.button === 3) { e.preventDefault(); navGo(-1); } else if (e.button === 4) { e.preventDefault(); navGo(1); } });

// ---------- video menu (the three dots, and right-click), queue, details ----------
let userQueue = [];
function queueAdd(v, next) {
  userQueue = userQueue.filter((x) => x.id !== v.id);
  if (next) userQueue.unshift(v); else userQueue.push(v);
  toast(next ? 'Will play next' : `Added to queue (${userQueue.length})`); renderUpNext(); renderTabs();
}
function renderUpNext() {
  const rel = $('#related'); $('#up-head')?.remove();
  const box = document.createElement('div'); box.id = 'up-head';
  box.innerHTML = `<div class="up-top"><h3>Up next</h3><label class="up-auto" title="What happens when a video ends"><span>Autoplay</span><select class="up-mode">${AUTO_MODES.map(([k, l]) => `<option value="${k}" ${autoMode() === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>`;
  box.querySelector('select').onchange = (e) => save({ autoplayMode: e.target.value }).then(() => { paintAuto(); renderUpNext(); });
  if (userQueue.length) {
    const q = document.createElement('div'); q.className = 'up-queue';
    q.innerHTML = `<div class="up-qh">Queue <span class="cnt">${userQueue.length}</span><button class="link">Clear</button></div>`;
    userQueue.forEach((v, i) => {
      const r = document.createElement('div'); r.className = 'up-row';
      r.innerHTML = `<img src="${esc(v.thumb)}"><span class="t">${esc(v.title)}<small>${esc(v.channel)}</small></span><button class="link" title="Remove from queue">${ic('x')}</button>`;
      r.onclick = (e) => { if (e.target.closest('button')) { userQueue.splice(i, 1); renderUpNext(); renderTabs(); } else switchTab(i); };
      q.appendChild(r);
    });
    q.querySelector('.up-qh button').onclick = () => { userQueue = []; renderUpNext(); renderTabs(); };
    box.appendChild(q);
  }
  rel.prepend(box);
}
const fmtDur = (s) => { s = Math.round(+s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
function videoMenu(v, el) {
  const items = [], run = {}, add = (id, label, fn, extra) => { items.push({ id, label, ...extra }); run[id] = fn; }, sep = () => items.length && items[items.length - 1].type !== 'separator' && items.push({ type: 'separator' });
  const w = isWatched(v.id), later = inList('watchlater', v.id);
  add('play', 'Play', () => openVideo(v));
  add('next', 'Play next', () => queueAdd(v, true));
  add('queue', 'Add to queue', () => queueAdd(v, false));
  sep();
  add('later', later ? 'Remove from Watch later' : 'Save to Watch later', () => { toggleList('watchlater', v); toast(later ? 'Removed from Watch later' : 'Saved to Watch later'); });
  add('save', 'Save to playlist…', async () => {
    if (!signedIn()) return promptLogin('Sign in to save videos to your playlists.');
    try {
      const pls = (await api.mePlaylists()).filter((p) => !['WL', 'LL'].includes(p.id)).slice(0, 38);
      if (!pls.length) return toast('You have no playlists to save to.');
      const pick = await api.contextMenu(pls.map((p) => ({ id: p.id, label: p.title })));
      if (pick) { await api.addToPlaylist(pick, v.id); toast('Saved to ' + (pls.find((p) => p.id === pick)?.title || 'playlist')); }
    } catch (e) { toast('Could not save: ' + e.message); }
  });
  add('watched', w ? 'Mark as unwatched' : 'Mark as watched', () => { setWatched(v.id, !w); if (view === 'subs') renderSubs(); else el?.classList.toggle('watched', !w); });
  sep();
  add('details', 'Video details', () => showVideoDetails(v));
  sep();
  add('dlv', 'Download video', () => startDownload('video', undefined, v));
  add('dla', 'Download audio', () => startDownload('audio', undefined, v));
  sep();
  add('copy', 'Copy link', () => { api.copy(ytUrl(v.id)); toast('Link copied'); });
  add('web', 'Open on youtube.com', () => api.openExternal(ytUrl(v.id)));
  if (v.channelId) {
    sep();
    add('chan', v.channel ? `Go to ${v.channel}` : 'Go to channel', () => openChannel(v.channelId));
    const subbed = isSub(v.channelId);
    add('sub', subbed ? 'Unsubscribe' : 'Subscribe', () => setSub({ id: v.channelId, name: v.channel, avatar: '' }, !subbed));
  }
  return { items, run };
}
async function popMenu(m) { const picked = await api.contextMenu(m.items); if (picked) await m.run[picked]?.(); }
// Adds the three-dot button to a card or row.
function addDots(el, v) {
  const b = document.createElement('button'); b.className = 'dots'; b.title = 'More actions'; b.innerHTML = ic('dots');
  b.onclick = (e) => { e.stopPropagation(); popMenu(videoMenu(v, el)); };
  (el.querySelector('.ci') || el).appendChild(b);
}
async function showVideoDetails(v) {
  $('#dmodal')?.remove();
  const ov = document.createElement('div'); ov.id = 'dmodal'; ov.className = 'overlay';
  ov.innerHTML = `<div class="panel wide dpanel"><header class="s-head"><h2>Video details</h2><button class="dclose" title="Close">${ic('x')}</button></header><div class="dbody">
    <div class="dtop"><div class="dthumb"><img src="${esc(v.thumb)}">${v.duration ? `<span class="dur">${esc(v.duration)}</span>` : ''}</div><div class="dmain"><h3>${esc(v.title)}</h3>
      <div class="dchan">${v.channelId ? `<a class="linkish" data-ch="${esc(v.channelId)}">${esc(v.channel)}</a>` : esc(v.channel)}</div>
      <div class="dstats" id="d-stats">${esc([v.views, v.published].filter(Boolean).join(' • '))}</div>
      <div class="dact"><button data-a="play">${ic('play')}Play</button><button data-a="later">${ic('clock')}Watch later</button><button data-a="queue">${ic('listplus')}Add to queue</button><button data-a="copy">${ic('link')}Copy link</button></div></div></div>
    <div class="dtags" id="d-tags"></div><h4>Description</h4><div class="ddesc" id="d-desc">${v.snippet ? esc(v.snippet) : '<span class="hint">Loading…</span>'}</div></div></div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  ov.querySelector('.dclose').onclick = close;
  ov.querySelector('[data-ch]')?.addEventListener('click', (e) => { close(); openChannel(e.target.dataset.ch); });
  ov.querySelector('[data-a=play]').onclick = () => { close(); openVideo(v); };
  ov.querySelector('[data-a=later]').onclick = () => { toggleList('watchlater', v); toast(inList('watchlater', v.id) ? 'Saved to Watch later' : 'Removed from Watch later'); };
  ov.querySelector('[data-a=queue]').onclick = () => queueAdd(v, false);
  ov.querySelector('[data-a=copy]').onclick = () => { api.copy(ytUrl(v.id)); toast('Link copied'); };
  try {
    const info = await api.video(v.id); if (!ov.isConnected) return;
    const parts = [info.views != null ? fmtNum(info.views) + ' views' : v.views, info.relative || info.published || v.published, info.duration ? fmtDur(info.duration) : '', info.likes ? fmtNum(info.likes) + ' likes' : ''].filter(Boolean);
    $('#d-stats').textContent = parts.join(' • ');
    $('#d-desc').innerHTML = rich(info.description || 'No description.');
    $('#d-tags').innerHTML = (info.keywords || []).slice(0, 12).map((k) => `<span>${esc(k)}</span>`).join('');
    if (settings.ryd !== false && !perf.data) fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${v.id}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d && ov.isConnected) $('#d-stats').textContent += ` • ${fmtNum(d.dislikes)} dislikes`; }).catch(() => {});
  } catch { if (ov.isConnected) $('#d-desc').textContent = v.snippet || 'Could not load the full details.'; }
}

// ---------- cards / grids ----------
function card(v, opts = {}) {
  // Watched progress: what this app remembers, or YouTube's own resume position when signed in.
  const prog = progOf(v);
  const el = document.createElement('div');
  el.className = 'card' + (isWatched(v.id) && opts.dim ? ' watched' : '');
  el.innerHTML = `<div class="th${prog > 1 ? ' hasbar' : ''}"><img loading="lazy" decoding="async" src="${esc(v.thumb)}">${v.duration ? `<span class="dur">${esc(v.duration)}</span>` : ''}${prog > 1 ? `<div class="bar" style="width:${Math.min(100, prog)}%"></div>` : ''}${isWatched(v.id) && opts.dim ? '<span class="wbadge">Watched</span>' : ''}</div>
    <div class="ci"><h3>${esc(v.title)}</h3><div class="meta">${v.channelId ? `<a data-ch="${esc(v.channelId)}">${esc(v.channel)}</a>` : esc(v.channel)}<br>${esc([v.views, v.published].filter(Boolean).join(' • '))}</div></div>`;
  if (opts.actions) {
    const w = isWatched(v.id), qa = document.createElement('div'); qa.className = 'qa';
    qa.innerHTML = `<button data-q="later" title="Watch later">${ic('clock')}</button><button data-q="watched" title="${w ? 'Mark unwatched' : 'Mark watched'}">${ic(w ? 'undo' : 'check')}</button>`;
    qa.onclick = (e) => {
      e.stopPropagation(); const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.q === 'later') { pushList('watchlater', v); b.innerHTML = ic('check'); }
      else { setWatched(v.id, !isWatched(v.id)); if (view === 'subs') renderSubs(); }
    };
    el.querySelector('.th').appendChild(qa);
  }
  el.onclick = (e) => {
    const a = e.target.closest('[data-ch]');
    if (a) { e.stopPropagation(); return openChannel(a.dataset.ch); }
    if (opts.queue) queue = opts.queue;
    openVideo(v, { list: opts.playlist ? opts.queue : null });
  };
  addDots(el, v);
  applyDeArrow(el, v);
  el._v = v;
  return el;
}
function renderVideos(list, target = grid, opts = {}) {
  if (target === grid && list.length && !performance.getEntriesByName('first-cards').length) performance.mark('first-cards'); // (start-up timing)
  if (settings.hideShorts) list = list.filter((v) => !v.isShort);
  const seen = new Set();
  for (const v of list) { if (seen.has(v.id)) continue; seen.add(v.id); target.appendChild(card(v, { queue: list, ...opts })); }
}
const setStatus = (t) => (status.textContent = t || '');
function applyBars() {
  for (const el of document.querySelectorAll('.card, .plrow, .subrow, .lrow, .vrow')) {
    const v = el._v, th = el.querySelector('.th'); if (!v || !th) continue;
    const p = progOf(v); let bar = th.querySelector('.bar');
    if (p > 1) { if (!bar) { bar = document.createElement('div'); bar.className = 'bar'; th.appendChild(bar); } bar.style.width = Math.min(100, p) + '%'; th.classList.add('hasbar'); }
    else if (bar) { bar.remove(); th.classList.remove('hasbar'); }
  }
}
async function syncProgress() {
  if (!signedIn()) { ytProg = {}; lsSet('ytprogress', {}); return; }
  try { const m = {}; for (const x of await api.meProgress()) m[x.id] = x.pct; ytProg = m; lsSet('ytprogress', m); applyBars(); } catch {}
}
function showMain() { hideEndScreen(); grid.classList.remove('listmode'); applyBars(); $('#chan').hidden = true; $('#watch').hidden = true; $('#main').hidden = false; $('#subbox').hidden = true; $('#filters').hidden = true; grid.hidden = false; syncSideAuto(); updateAway(); }
async function guarded(label, fn) { setStatus(`Loading ${label}…`); try { await fn(); setStatus(''); } catch (e) { setStatus('Error: ' + e.message); } }

// ---------- views ----------
async function goHome() { navPush('home', {}); view = 'home'; document.querySelectorAll('#side a').forEach((x) => x.classList.toggle('active', x.dataset.nav === 'home')); showMain(); grid.innerHTML = ''; await guarded('home', async () => {
  // Seed the feed from recently watched channels when we have history.
  const seeds = [...new Set(lsGet('history', []).slice(0, 6).map((v) => v.channel).filter(Boolean))];
  // Show what was there last time at once, then swap in the fresh list when it arrives (only if it is different, so the page does not jump).
  const old = lsGet('homeCache', null), oldIds = (old?.videos || []).map((v) => v.id).join();
  if (old?.videos?.length) { renderVideos(old.videos); setStatus('Refreshing…'); }
  const fresh = await api.home(seeds);
  if (view !== 'home') return;
  if (fresh.map((v) => v.id).join() !== oldIds) { grid.innerHTML = ''; renderVideos(fresh); }
  lsSet('homeCache', { videos: fresh.slice(0, 40) });
}); }
// Results of searches, playlists and channel headers are remembered for a few minutes, so going back to one is instant.
const memoStore = new Map();
async function memoCall(key, fn, ttl = 5 * 60 * 1000) {
  const hit = memoStore.get(key);
  if (hit && Date.now() - hit.at < ttl) return structuredClone(hit.v);
  const v = await fn(); memoStore.set(key, { v: structuredClone(v), at: Date.now() });
  if (memoStore.size > 60) memoStore.delete(memoStore.keys().next().value);
  return v;
}
let searchFilters = {}, lastQuery = '';
const FILTERS = [
  ['type', 'Type', [['', 'Any'], ['video', 'Video'], ['playlist', 'Playlist'], ['channel', 'Channel']]],
  ['upload_date', 'Uploaded', [['', 'Any time'], ['hour', 'Last hour'], ['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['year', 'This year']]],
  ['duration', 'Duration', [['', 'Any'], ['short', 'Under 4 min'], ['medium', '4–20 min'], ['long', 'Over 20 min']]],
  ['sort_by', 'Sort by', [['', 'Relevance'], ['upload_date', 'Upload date'], ['view_count', 'View count'], ['rating', 'Rating']]],
];
function renderFilters() {
  const f = $('#filters'); f.hidden = false;
  f.innerHTML = FILTERS.map(([k, l, opts]) => `<label>${l} <select data-f="${k}">${opts.map(([v, t]) => `<option value="${v}" ${searchFilters[k] === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`).join('');
  const vt = document.createElement('div'); vt.className = 'vtoggle';
  vt.innerHTML = `<button data-v="list" title="List view" class="${(settings.searchView || 'list') === 'list' ? 'on' : ''}">${ic('rows')}</button><button data-v="grid" title="Grid view" class="${settings.searchView === 'grid' ? 'on' : ''}">${ic('grid')}</button>`;
  vt.onclick = async (e) => { const b = e.target.closest('[data-v]'); if (!b) return; await save({ searchView: b.dataset.v }); renderFilters(); renderSearchResults(); };
  f.insertAdjacentHTML('beforeend', '<span class="sp"></span>'); f.appendChild(vt);
  f.querySelectorAll('select').forEach((el) => (el.onchange = () => { searchFilters[el.dataset.f] = el.value; if (!el.value) delete searchFilters[el.dataset.f]; doSearch(lastQuery, true); }));
}
// Pasting a YouTube link into the search box opens it directly.
function parseYtLink(q) {
  const v = /(?:youtube\.com\/watch\?(?:[^ ]*&)?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{11})/.exec(q);
  const pl = /[?&]list=([\w-]{13,})/.exec(q) || (/^(PL|OL|UU|FL|RD)[\w-]{10,}$/.test(q) ? [0, q] : null);
  const ch = /youtube\.com\/channel\/(UC[\w-]{22})/.exec(q);
  if (v) return () => openVideo({ id: v[1], title: 'Loading…', channel: '', thumb: '' });
  if (pl) return () => openPlaylist(pl[1]);
  if (ch) return () => openChannel(ch[1]);
  return null;
}
async function doSearch(q, keepFilters) {
  if (!q.trim()) return;
  const link = parseYtLink(q.trim()); if (link) { $('#suggest').hidden = true; return link(); }
  if (!keepFilters) searchFilters = {};
  lastQuery = q; navPush('search', { q, filters: { ...searchFilters } }); pushSearchHistory(q); view = 'search'; showMain(); grid.innerHTML = ''; $('#suggest').hidden = true; renderFilters();
  await guarded('results', async () => { lastResults = await memoCall('s:' + q + JSON.stringify(searchFilters), () => api.search(q, searchFilters)); renderSearchResults(); });
}
// A video as a row with its details (search results, history): channel, views, date, description snippet, badges.
function videoRow(v, queueList) {
  const el = document.createElement('div'); el.className = 'vrow' + (isWatched(v.id) && view === 'subs' ? ' watched' : ''); el._v = v;
  const pr = progOf(v);
  el.innerHTML = `<div class="th${pr > 1 ? ' hasbar' : ''}"><img loading="lazy" decoding="async" src="${esc(v.thumb)}">${v.duration ? `<span class="dur">${esc(v.duration)}</span>` : ''}${pr > 1 ? `<div class="bar" style="width:${Math.min(100, pr)}%"></div>` : ''}</div>
    <div class="info"><h3>${esc(v.title)}</h3><div class="meta">${esc([v.views, v.published].filter(Boolean).join(' • '))}</div>
    <div class="chan">${v.channelThumb ? `<img loading="lazy" decoding="async" src="${esc(v.channelThumb)}">` : ''}${v.channelId ? `<a class="linkish" data-ch="${esc(v.channelId)}">${esc(v.channel)}</a>` : `<span>${esc(v.channel)}</span>`}${v.verified ? `<span class="vf" title="Verified">${ic('check')}</span>` : ''}</div>
    ${v.snippet ? `<div class="snip">${esc(v.snippet)}</div>` : ''}${(v.badges || []).length ? `<div class="badges">${v.badges.map((b) => `<span>${esc(b)}</span>`).join('')}</div>` : ''}</div>`;
  el.onclick = (e) => { const c = e.target.closest('[data-ch]'); if (c) { e.stopPropagation(); return openChannel(c.dataset.ch); } queue = queueList; openVideo(v); };
  addDots(el, v);
  applyDeArrow(el, v);
  return el;
}
function playlistListRow(p) {
  const el = document.createElement('div'); el.className = 'vrow'; el._pl = p;
  el.innerHTML = `<div class="th"><img loading="lazy" decoding="async" src="${esc(p.thumb)}">${p.count ? `<span class="dur">${esc(p.count)}</span>` : ''}</div><div class="info"><h3>${esc(p.title)}</h3><div class="meta">${esc(p.meta || 'Playlist')}</div></div>`;
  el.onclick = () => openPlaylist(p.id);
  return el;
}
function renderRows(list, target, queueList) {
  target.classList.add('listmode');
  const seen = new Set(), vids = list.filter((v) => !seen.has(v.id) && seen.add(v.id));
  for (const v of vids) target.appendChild(videoRow(v, queueList || vids));
}
let lastResults = null;
function renderSearchResults() {
  const r = lastResults; if (!r) return;
  grid.innerHTML = '';
  const list = (settings.searchView || 'list') === 'list';
  grid.classList.toggle('listmode', list);
  for (const c of r.channels) {
    const d = document.createElement('div');
    d.className = 'channel-head'; d.style.cursor = 'pointer';
    d.innerHTML = `<img src="${esc(c.thumb)}"><div><h2>${esc(c.name)}</h2><div class="meta">${esc(c.subs)}</div></div>`;
    d.onclick = () => openChannel(c.id); grid.appendChild(d);
  }
  for (const p of r.playlists || []) grid.appendChild(list ? playlistListRow(p) : playlistCard(p));
  if (list) renderRows(settings.hideShorts ? r.videos.filter((v) => !v.isShort) : r.videos, grid); else renderVideos(r.videos);
}
function playlistCard(p) {
  const el = document.createElement('div'); el.className = 'card';
  el.innerHTML = `<div class="th"><img loading="lazy" decoding="async" src="${esc(p.thumb)}">${p.count ? `<span class="dur">${esc(p.count)}</span>` : ''}</div><div class="ci"><h3>${esc(p.title)}</h3><div class="meta">${esc(p.meta || 'Playlist')}</div></div>`;
  el.onclick = () => openPlaylist(p.id);
  el._pl = p;
  return el;
}
// ---------- watch history (like the desktop site: filter chips, day groups, a side panel) ----------
function dayLabel(ts) {
  const d = new Date(ts), now = new Date();
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (days <= 0) return 'Today'; if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
let histFilter = 'all';
async function showHistory() {
  navPush('history', {}); view = 'history'; showMain(); grid.hidden = true;
  const box = $('#chan'); box.hidden = false; box.innerHTML = '<div class="hint" style="padding:24px">Loading history…</div>'; setStatus('');
  let remote = [], err = '';
  if (signedIn()) { try { remote = await api.meHistory(); } catch (e) { err = e.message; } }
  renderHistory(box, remote, err);
}
function renderHistory(box, remote, err) {
  const local = lsGet('history', []), localIds = new Set(local.map((v) => v.id)), groups = [], byLabel = new Map();
  for (const v of local) {
    const label = v.at ? dayLabel(v.at) : 'Earlier';
    if (!byLabel.has(label)) { const g = { label, items: [] }; byLabel.set(label, g); groups.push(g); }
    byLabel.get(label).items.push(v);
  }
  // YouTube's history carries no dates for this sign-in type, so it gets its own section instead of guessed days.
  const rem = remote.filter((v) => !localIds.has(v.id));
  if (rem.length) groups.push({ label: local.length ? 'Earlier on your YouTube account' : 'Recently watched on YouTube', items: rem });
  const paused = !!settings.pauseHistory;
  box.innerHTML = `<div class="hist-wrap"><div class="hist-main"><h1>Watch history</h1>
      <div class="hist-chips">${[['all', 'All'], ['videos', 'Videos'], ['shorts', 'Shorts']].map(([k, l]) => `<button data-f="${k}" class="${histFilter === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div id="hist-groups"></div></div>
    <aside class="hist-side"><div class="hs-search">${ic('search')}<input id="hs-q" placeholder="Search watch history" spellcheck="false"></div>
      <button class="hs-act" id="hs-clear">${ic('trash')}<span>Clear all watch history</span></button>
      <button class="hs-act" id="hs-pause">${ic('pause')}<span>${paused ? 'Turn on watch history' : 'Pause watch history'}</span></button>
      <a class="hs-link" data-url="https://myactivity.google.com/product/youtube">${ic('gear')}<span>Manage all history</span></a>
      <div class="hs-sub"><a data-url="https://www.youtube.com/feed/history/comment_history">Comments</a><a data-url="https://www.youtube.com/feed/history/community_history">Posts</a><a data-url="https://www.youtube.com/feed/history/live_chat_history">Live chat</a></div>
      <div class="hs-note">${paused ? 'Watch history is paused: videos you watch in this app are not being recorded.' : signedIn() ? 'Clearing removes what this app recorded. Your YouTube account history is managed on youtube.com.' : 'History is kept on this computer.'}</div></aside></div>`;
  const wrap = $('#hist-groups');
  if (!groups.length) wrap.innerHTML = `<div class="hint" style="padding:24px 0">${err ? 'Could not load your YouTube history: ' + esc(err) : 'Nothing here yet. Videos you watch will show up here.'}</div>`;
  const all = groups.flatMap((g) => g.items);
  for (const g of groups) {
    const sec = document.createElement('section'); sec.className = 'hist-group'; sec.innerHTML = `<h2>${esc(g.label)}</h2>`;
    for (const v of g.items) { const row = listRow(v, { big: true, queue: all }); row.dataset.s = (v.title + ' ' + v.channel).toLowerCase(); sec.appendChild(row); }
    wrap.appendChild(sec);
  }
  const apply = () => {
    const q = ($('#hs-q').value || '').trim().toLowerCase();
    for (const sec of wrap.querySelectorAll('.hist-group')) {
      let shown = 0;
      for (const row of sec.querySelectorAll('.lrow')) {
        const okType = histFilter === 'all' || (histFilter === 'shorts' ? !!row._v.isShort : !row._v.isShort);
        row.hidden = !(okType && (!q || row.dataset.s.includes(q))); if (!row.hidden) shown++;
      }
      sec.hidden = !shown;
    }
  };
  box.querySelectorAll('.hist-chips button').forEach((b) => (b.onclick = () => { histFilter = b.dataset.f; box.querySelectorAll('.hist-chips button').forEach((x) => x.classList.toggle('on', x === b)); apply(); }));
  $('#hs-q').oninput = apply; apply();
  $('#hs-clear').onclick = () => { if (confirm('Clear what this app recorded in your watch history, including watched marks and resume positions?')) { for (const k of ['history', 'watched', 'progress']) localStorage.removeItem(k); applyBars(); showHistory(); } };
  $('#hs-pause').onclick = async () => { await save({ pauseHistory: !settings.pauseHistory }); renderHistory(box, remote, err); };
}
const plIdFrom = (t) => /[?&]list=([\w-]+)/.exec(t)?.[1] || (/^[\w-]{13,}$/.test(t.trim()) ? t.trim() : null);
async function showPlaylists() {
  navPush('playlists', {}); view = 'playlists'; showMain(); grid.innerHTML = '';
  const bar = document.createElement('div'); bar.className = 'channel-head';
  bar.innerHTML = '<input id="pl-url" placeholder="Paste a playlist link or ID to open it" style="flex:1;padding:8px 14px;background:var(--bg2);border:0;border-radius:18px"><button id="pl-open">Open</button>';
  grid.appendChild(bar);
  const go = () => { const id = plIdFrom($('#pl-url').value); if (id) openPlaylist(id); else setStatus('That does not look like a playlist link.'); };
  $('#pl-open').onclick = go; $('#pl-url').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  const saved = lsGet('savedPlaylists', []);
  if (saved.length) {
    const h = document.createElement('div'); h.className = 'channel-head'; h.innerHTML = '<h2 style="margin:0">Saved in this app</h2>'; grid.appendChild(h);
    for (const p of saved) grid.appendChild(playlistCard(p));
  }
  if (!signedIn()) return setStatus('Sign in to see your own playlists. You can still open any public playlist above.');
  await guarded('playlists', async () => { const l = await api.mePlaylists(); if (!l.length) setStatus('No playlists found.'); for (const p of l) grid.appendChild(playlistCard(p)); });
}
async function startPlaylistDownload(id, title, kind) {
  const list = lsGet('downloads', []).filter((x) => x.key !== 'PL:' + id);
  list.unshift({ key: 'PL:' + id, id: 'PL:' + id, title, kind: 'playlist', state: 'starting', pct: 0 }); lsSet('downloads', list.slice(0, 100));
  await api.downloadPlaylist(id, kind);
}
// A row in a playlist or the watch history: thumbnail with hover buttons, title, channel, views.
function listRow(v, opts = {}) {
  const el = document.createElement('div'); el.className = 'lrow' + (opts.big ? ' big' : ''); el._v = v;
  const pr = progOf(v), views = String(v.views || '').replace(/\s*views?$/i, '');
  const chan = `${v.channelId ? `<a data-ch="${esc(v.channelId)}">${esc(v.channel)}</a>` : `<span>${esc(v.channel)}</span>`}${v.verified ? `<span class="vf" title="Verified">${ic('check')}</span>` : ''}`;
  const vw = views ? `<span class="vw">${ic('tri')}${esc(views)}</span>` : '';
  el.innerHTML = `<div class="th${pr > 1 ? ' hasbar' : ''}"><img loading="lazy" decoding="async" src="${esc(v.thumb)}">${v.duration ? `<span class="dur">${esc(v.duration)}</span>` : ''}${pr > 1 ? `<div class="bar" style="width:${Math.min(100, pr)}%"></div>` : ''}
      <div class="qa"><button data-q="later" title="Watch later">${ic('clock')}</button><button data-q="queue" title="Add to queue">${ic('listplus')}</button></div></div>
    <div class="info"><h3>${esc(v.title)}</h3>${opts.big ? `<div class="l2">${chan}${vw}</div>` : `<div class="l2">${chan}</div><div class="l3">${views ? `<span class="vw" style="margin-left:0">${ic('tri')}${esc(views)}</span>` : ''}${v.published ? `<span>${esc(v.published)}</span>` : ''}</div>`}</div>`;
  el.querySelector('.qa').onclick = (e) => {
    e.stopPropagation(); const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.q === 'later') { toggleList('watchlater', v); toast(inList('watchlater', v.id) ? 'Saved to Watch later' : 'Removed from Watch later'); } else queueAdd(v, false);
  };
  el.onclick = (e) => { const c = e.target.closest('[data-ch]'); if (c) { e.stopPropagation(); return openChannel(c.dataset.ch); } queue = opts.queue || [v]; openVideo(v, { list: opts.playlist ? queue : null }); };
  addDots(el, v);
  applyDeArrow(el, v);
  return el;
}
// Playlist page (also used for Watch later): a gradient card with the cover and actions, and the videos beside it.
function renderPlaylistPage(pl, opt = {}) {
  const box = $('#chan'); grid.hidden = true; box.hidden = false;
  const vids = pl.videos, cover = pl.cover || vids[0]?.thumb || '';
  const total = /videos?/i.test(String(pl.total)) ? String(pl.total) : `${pl.total} videos`;
  const savedList = () => lsGet('savedPlaylists', []), isSaved = () => savedList().some((x) => x.id === pl.id);
  const link = opt.local ? '' : `https://www.youtube.com/playlist?list=${pl.id}`;
  box.innerHTML = `<div class="pl-wrap2"><aside class="pl-card" style="--cover:url('${esc(cover)}')">
      <div class="pl-cover">${cover ? `<img src="${esc(cover)}">` : ''}</div>
      <h1>${esc(pl.title)}</h1>
      <div class="pl-owner">${pl.authorThumb ? `<img src="${esc(pl.authorThumb)}">` : ''}${pl.authorId ? `<a data-ch="${esc(pl.authorId)}">by ${esc(pl.author)}</a>` : `<span>${pl.author ? 'by ' + esc(pl.author) : ''}</span>`}</div>
      <div class="pl-meta">${['Playlist', total, pl.views, pl.updated].filter(Boolean).map(esc).join(' • ')}</div>
      ${pl.description ? `<div class="pl-desc">${esc(pl.description)}</div>` : ''}
      <div class="pl-btns"><button class="pill" id="pl-play">${ic('play')}Play all</button>
        ${opt.local ? '' : `<button class="round" id="pl-save" title="Save this playlist in the app">${ic('bookmark')}</button><button class="round" id="pl-share" title="Copy link">${ic('share')}</button>`}
        <button class="round" id="pl-more" title="More actions">${ic('dots')}</button></div>
      <div id="pl-progress" class="hint"></div><button id="pl-cancel" hidden>Cancel download</button></aside>
    <section class="pl-list2" id="pl-list"></section></div>`;
  const list = $('#pl-list');
  if (!vids.length) list.innerHTML = '<div class="hint" style="padding:24px 0">This playlist has no videos.</div>';
  for (const v of vids) list.appendChild(listRow(v, { queue: vids, playlist: true }));
  box.querySelector('[data-ch]')?.addEventListener('click', (e) => openChannel(e.target.dataset.ch));
  $('#pl-play').onclick = () => { if (vids[0]) { queue = vids; openVideo(vids[0], { list: vids }); } };
  const dl = async (kind) => {
    $('#pl-progress').textContent = 'Starting…'; $('#pl-cancel').hidden = false;
    try { await startPlaylistDownload(pl.id, pl.title, kind); } catch (e) { $('#pl-progress').textContent = 'Could not start: ' + e.message; $('#pl-cancel').hidden = true; }
  };
  $('#pl-cancel').onclick = () => api.cancelDownload('PL:' + pl.id);
  if (!opt.local) {
    const sv = $('#pl-save'); sv.classList.toggle('on', isSaved());
    sv.onclick = () => {
      const l = savedList().filter((x) => x.id !== pl.id);
      if (!isSaved()) l.unshift({ id: pl.id, title: pl.title, thumb: cover, meta: [total, pl.author].filter(Boolean).join(' • ') });
      lsSet('savedPlaylists', l); sv.classList.toggle('on', isSaved()); toast(isSaved() ? 'Playlist saved in this app (see Playlists)' : 'Removed from saved playlists');
    };
    $('#pl-share').onclick = () => { api.copy(link); toast('Link copied'); };
  }
  $('#pl-more').onclick = () => {
    const items = [{ id: 'shuffle', label: 'Shuffle play' }], run = { shuffle: () => { if (vids.length) { queue = [...vids].sort(() => Math.random() - 0.5); openVideo(queue[0], { list: queue }); } } };
    if (!opt.local) {
      items.push({ type: 'separator' }, { id: 'dlv', label: 'Download all (video)' }, { id: 'dla', label: 'Download all (MP3)' }, { type: 'separator' }, { id: 'copy', label: 'Copy link' }, { id: 'web', label: 'Open on youtube.com' });
      run.dlv = () => dl('video'); run.dla = () => dl('audio'); run.copy = () => { api.copy(link); toast('Link copied'); }; run.web = () => api.openExternal(link);
    }
    api.contextMenu(items).then((id) => id && run[id]?.());
  };
}
async function openPlaylist(id) {
  navPush('playlist', { id }); view = 'playlist'; showMain(); grid.hidden = true;
  const box = $('#chan'); box.hidden = false; box.innerHTML = '<div class="hint" style="padding:24px">Loading playlist…</div>'; setStatus('');
  try { renderPlaylistPage(await memoCall('p:' + id, () => api.playlist(id), 60 * 1000)); }
  catch (e) { box.hidden = true; grid.hidden = false; setStatus('Could not open this playlist: ' + e.message); }
}

// ---------- channel pages (header, banner, tabs, shelves, sorting, endless paging) ----------
let chanState = null;
function channelCard(c) {
  const el = document.createElement('div'); el.className = 'card chcard';
  el.innerHTML = `<div class="av">${c.avatar ? `<img loading="lazy" decoding="async" src="${esc(c.avatar)}">` : ''}</div><h3>${esc(c.name)}</h3><div class="meta">${esc([c.handle, c.subs].filter(Boolean).join(' • '))}</div>`;
  el.onclick = () => openChannel(c.id);
  return el;
}
async function openChannel(id, tab = 'Home', sort) {
  view = 'channel'; showMain(); grid.hidden = true;
  const box = $('#chan'); box.hidden = false; box.innerHTML = '<div class="hint" style="padding:24px">Loading channel…</div>'; setStatus('');
  let info;
  try { info = await memoCall('c:' + id, () => api.channelInfo(id)); }
  catch (e) { box.hidden = true; grid.hidden = false; return setStatus('Could not open this channel: ' + e.message); }
  chanState = { id, info, tab: null, sort: 'Latest', req: 0, io: null };
  const subbed = isSub(id);
  box.innerHTML = `${info.banner ? `<div class="ch-banner" style="background-image:url('${esc(info.banner)}')"></div>` : ''}
    <div class="ch-head"><img class="ch-av" ${info.avatar ? `src="${esc(info.avatar)}"` : ''}>
      <div class="ch-meta"><h1>${esc(info.name)}</h1><div class="ch-line">${[info.handle, info.subs, info.videosCount].filter(Boolean).map(esc).join(' • ')}</div>
      ${info.description ? `<div class="ch-desc">${esc(info.description.split('\n')[0].slice(0, 160))} <a class="linkish" data-tab="About">more</a></div>` : ''}
      <button id="ch-sub" class="${subbed ? 'on' : ''}">${subbed ? '✓ Subscribed' : 'Subscribe'}</button></div></div>
    <div class="ch-tabs">${info.tabs.map((t) => `<a data-tab="${t}">${t}</a>`).join('')}</div><div id="ch-body"></div>`;
  box.querySelectorAll('[data-tab]').forEach((el) => (el.onclick = () => showChanTab(el.dataset.tab)));
  $('#ch-sub').onclick = async (e) => { await setSub({ id, name: info.name, avatar: info.avatar }); const s = isSub(id); e.target.textContent = s ? '✓ Subscribed' : 'Subscribe'; e.target.classList.toggle('on', s); };
  await showChanTab(info.tabs.includes(tab) ? tab : info.tabs[0], sort);
}
async function showChanTab(tab, sort) {
  const st = chanState; if (!st) return;
  st.tab = tab; st.sort = sort || 'Latest'; st.io?.disconnect(); navPush('channel', { id: st.id, tab, sort: st.sort });
  $('#chan').querySelectorAll('.ch-tabs a').forEach((el) => el.classList.toggle('on', el.dataset.tab === tab));
  const body = $('#ch-body'), req = ++st.req;
  body.innerHTML = '<div class="hint" style="padding:24px 0">Loading…</div>';
  try {
    const r = await api.channelTab(st.id, tab, ['Videos', 'Shorts', 'Live'].includes(tab) ? st.sort : undefined);
    if (st.req === req) renderChanTab(body, tab, r, req);
  } catch (e) { if (st.req === req) body.innerHTML = `<div class="hint" style="padding:24px 0">Could not load this tab: ${esc(e.message)}</div>`; }
}
function renderChanTab(body, tab, r, req) {
  const st = chanState; body.innerHTML = '';
  if (tab === 'About') {
    const x = r.about, facts = [x.joined, x.subs, x.videos, x.views, x.country && 'Country: ' + x.country].filter(Boolean);
    body.innerHTML = `<div class="ch-about"><div class="box"><h3>Description</h3><div class="ab-desc">${rich(x.description || 'This channel has no description.')}</div></div>
      <div class="box"><h3>Details</h3>${facts.map((f) => `<div class="ab-fact">${esc(f)}</div>`).join('') || '<div class="hint">No details.</div>'}</div>
      ${x.links.length ? `<div class="box"><h3>Links</h3>${x.links.map((l) => `<a class="ab-link" data-url="${esc(l.url)}">${l.icon ? `<img src="${esc(l.icon)}">` : ''}<span>${esc(l.title || l.text)}<small>${esc(l.text)}</small></span></a>`).join('')}</div>` : ''}</div>`;
    return;
  }
  if (tab === 'Home') {
    if (!r.shelves.length) { body.innerHTML = '<div class="hint" style="padding:24px 0">Nothing to show on this channel’s home page. Try the Videos tab.</div>'; return; }
    const all = r.shelves.flatMap((s) => s.videos);
    for (const sh of r.shelves) {
      const sec = document.createElement('section'); sec.className = 'ch-shelf';
      sec.innerHTML = `<h2>${esc(sh.title)}</h2><div class="ch-rowwrap"><button class="ch-arrow l" title="Scroll left">${ic('chevleft')}</button><div class="ch-row"></div><button class="ch-arrow r" title="Scroll right">${ic('chevright')}</button></div>`;
      const row = sec.querySelector('.ch-row');
      for (const v of sh.videos) row.appendChild(card(v, { queue: all, dim: true }));
      for (const p of sh.playlists) row.appendChild(playlistCard(p));
      for (const c of sh.channels) row.appendChild(channelCard(c));
      sec.querySelector('.l').onclick = () => row.scrollBy({ left: -row.clientWidth * 0.8, behavior: 'smooth' });
      sec.querySelector('.r').onclick = () => row.scrollBy({ left: row.clientWidth * 0.8, behavior: 'smooth' });
      body.appendChild(sec);
    }
    return;
  }
  if (r.sorts && tab !== 'Playlists') {
    const bar = document.createElement('div'); bar.className = 'ch-sorts';
    bar.innerHTML = r.sorts.map((s) => `<button data-sort="${esc(s)}" class="${s === st.sort ? 'on' : ''}">${esc(s)}</button>`).join('');
    bar.onclick = (e) => { const b = e.target.closest('[data-sort]'); if (b) showChanTab(tab, b.dataset.sort); };
    body.appendChild(bar);
  }
  const g = document.createElement('div'); g.className = tab === 'Shorts' ? 'ch-grid shorts' : 'ch-grid'; body.appendChild(g);
  const all = [];
  const add = (res) => {
    if (tab === 'Playlists') for (const p of res.playlists) g.appendChild(playlistCard(p));
    else for (const v of res.videos) { all.push(v); g.appendChild(card(v, { queue: all, dim: true })); }
  };
  add(r);
  if (!g.children.length) { g.outerHTML = `<div class="hint" style="padding:24px 0">${tab === 'Live' ? 'No live streams or past broadcasts.' : 'Nothing here yet.'}</div>`; return; }
  let more = r.more, busy = false;
  const sentinel = document.createElement('div'); sentinel.className = 'ch-more'; body.appendChild(sentinel);
  if (!more) return;
  const loadMore = async () => {
    if (!more || busy) return; busy = true; sentinel.textContent = 'Loading more…';
    try { const nx = await api.channelTab(st.id, tab, st.sort, more); if (st.req !== req) return; more = nx.more; add(nx); sentinel.textContent = ''; }
    catch (e) { sentinel.textContent = 'Could not load more: ' + e.message; busy = false; return; }
    busy = false;
    if (more) { st.io.unobserve(sentinel); st.io.observe(sentinel); } else st.io.disconnect();
  };
  st.io = new IntersectionObserver((es) => { if (es[0].isIntersecting) loadMore(); }, { root: $('#main'), rootMargin: '700px' });
  st.io.observe(sentinel);
}
function showList(key, title) {
  navPush(key, {}); view = key; showMain(); setStatus('');
  const list = lsGet(key, []);
  if (key === 'watchlater') return renderPlaylistPage({ id: 'WL', title, author: 'You', total: String(list.length), videos: list }, { local: true });
  grid.innerHTML = '';
  if (!list.length) return setStatus(`${title} is empty.`);
  renderRows(list, grid);
}
const DL_ICON = { video: 'download', audio: 'music', subs: 'cc', playlist: 'list' };
function paintDl(el, x) {
  const running = x.state === 'downloading' || x.state === 'starting', pct = Math.max(0, Math.min(100, x.pct || 0));
  const prog = x.kind === 'playlist' && x.total ? `item ${x.item} of ${x.total} — ${pct}%` : `${pct}%`;
  const st = running ? (x.state === 'starting' ? 'Starting…' : 'Downloading ' + prog) : x.state === 'done' ? 'Finished' : x.state === 'cancelled' ? 'Cancelled' : 'Failed' + (x.error ? ': ' + x.error.replace(/^ERROR:\s*/, '').slice(0, 160) : '');
  el.innerHTML = `<div class="top"><span class="t" title="${esc(x.title)}">${ic(DL_ICON[x.kind] || 'download')} ${esc(x.title)}</span>${running ? '<button data-a="cancel">Cancel</button>' : ''}${x.file && x.state === 'done' ? '<button data-a="show">Show in folder</button>' : ''}${!running ? '<button data-a="rm">Remove</button>' : ''}</div>
    <div class="pbar"><i style="width:${running || x.state === 'done' ? pct : 0}%"></i></div><div class="st">${esc(st)}${x.file ? ' • ' + esc(x.file.split('/').pop()) : ''}</div>`;
  el.querySelector('[data-a=cancel]')?.addEventListener('click', () => api.cancelDownload(x.key));
  el.querySelector('[data-a=show]')?.addEventListener('click', () => api.showFile(x.file));
  el.querySelector('[data-a=rm]')?.addEventListener('click', () => { lsSet('downloads', lsGet('downloads', []).filter((i) => i.key !== x.key)); el.remove(); });
}
function showDownloads() {
  navPush('downloads', {}); view = 'downloads'; showMain(); grid.innerHTML = ''; setStatus('');
  const bar = document.createElement('div'); bar.className = 'dlbar';
  bar.innerHTML = '<button id="dl-open">Open downloads folder</button><button id="dl-clear">Clear finished</button>';
  grid.appendChild(bar);
  $('#dl-open').onclick = () => api.openDownloads();
  $('#dl-clear').onclick = () => { lsSet('downloads', lsGet('downloads', []).filter((x) => x.state === 'downloading' || x.state === 'starting')); showDownloads(); };
  const d = lsGet('downloads', []);
  if (!d.length) setStatus('No downloads yet. Use the ⬇ buttons under a video.');
  for (const x of d) { const e = document.createElement('div'); e.className = 'dlrow'; e.dataset.key = x.key; paintDl(e, x); grid.appendChild(e); }
}
document.querySelectorAll('#side a').forEach((a) => (a.onclick = () => {
  document.querySelectorAll('#side a').forEach((x) => x.classList.toggle('active', x === a));
  ({ home: goHome, subs: () => showSubs(), history: showHistory, playlists: showPlaylists, watchlater: () => showList('watchlater', 'Watch later'), downloads: showDownloads })[a.dataset.nav]();
}));
// The YouTube logo goes to the page chosen in Settings, General (Home by default).
$('#logo').onclick = () => {
  const dest = settings.logoGoes || 'home';
  if (dest === 'home') return goHome();
  const link = document.querySelector(`#side [data-nav=${dest}]`);
  if (link) link.click(); else goHome();
};
const syncLogoTitle = () => { $('#logo').title = { home: 'Home', subs: 'Subscriptions', playlists: 'Playlists', history: 'History' }[settings.logoGoes || 'home'] || 'Home'; };

// ---------- subscription box (classic layout: channel list on the left, grouped uploads on the right) ----------
const ageDays = (t) => {
  const m = /(\d+)\s*(second|minute|hour|day|week|month|year)/i.exec(t || '');
  if (!m) return 9999;
  return +m[1] * { second: 1 / 86400, minute: 1 / 1440, hour: 1 / 24, day: 1, week: 7, month: 30, year: 365 }[m[2].toLowerCase()];
};
let subSel = 'all';
async function fetchSubs() {
  if (signedIn()) {
    const r = await api.meSubs();
    const chans = {};
    for (const c of r.channels) chans[c.id] = c;
    const videos = r.videos.map((v) => { if (v.channelId && !chans[v.channelId]) chans[v.channelId] = { id: v.channelId, name: v.channel, avatar: v.channelThumb || '' }; return { ...v, age: ageDays(v.published) }; });
    remoteSubs = new Set(Object.keys(chans));
    lsSet('subcache', { ts: Date.now(), videos, channels: chans });
    return;
  }
  const subs = lsGet('subs', {}), list = Object.values(subs), out = []; let i = 0;
  const worker = async () => {
    while (i < list.length) {
      const s = list[i++];
      try {
        const c = await api.channel(s.id);
        if (c.avatar && !s.avatar) subs[s.id].avatar = c.avatar;
        if (!s.name && c.name) subs[s.id].name = c.name;
        for (const v of c.videos.slice(0, 15)) out.push({ ...v, channel: subs[s.id].name || c.name, channelId: s.id, age: ageDays(v.published) });
      } catch {}
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, list.length) }, worker));
  lsSet('subs', { ...lsGet('subs', {}), ...subs });
  lsSet('subcache', { ts: Date.now(), videos: out });
}
async function showSubs(force) {
  navPush('subs', {}); view = 'subs'; showMain(); grid.hidden = true; $('#subbox').hidden = false; setStatus('');
  if (!signedIn() && !Object.keys(lsGet('subs', {})).length) {
    $('#subbox').innerHTML = '<div class="hint" style="padding:24px">No subscriptions yet. Subscribe from a video or channel page, or import a Google Takeout subscriptions.csv in Settings.</div>';
    return;
  }
  const cache = lsGet('subcache', { ts: 0, videos: [] });
  renderSubs(); renderSideSubs();
  if (force || Date.now() - cache.ts > 30 * 60 * 1000) {
    setStatus('Refreshing subscriptions…');
    try { await fetchSubs(); setStatus(''); } catch (e) { setStatus('Could not load subscriptions: ' + e.message); }
    renderSideSubs();
    if (view === 'subs') renderSubs();
  }
}
function subGroup(age) { return age < 1 ? 'Today' : age < 2 ? 'Yesterday' : age < 7 ? 'This week' : age < 30 ? 'This month' : 'Older'; }
function renderSubBox() {
  const cache = lsGet('subcache', { ts: 0, videos: [] }), subs = signedIn() ? cache.channels || {} : lsGet('subs', {});
  const hideWatched = settings.subsHideWatched !== false, layout = settings.subsLayout || 'list', sort = settings.subsSort || 'new';
  let vids = cache.videos.filter((v) => !(settings.hideShorts && v.isShort));
  const unwatched = {};
  for (const v of vids) if (!isWatched(v.id)) unwatched[v.channelId] = (unwatched[v.channelId] || 0) + 1;
  const total = Object.values(unwatched).reduce((a, b) => a + b, 0);
  if (subSel !== 'all' && !subs[subSel]) subSel = 'all';
  if (subSel !== 'all') vids = vids.filter((v) => v.channelId === subSel);
  if (hideWatched) vids = vids.filter((v) => !isWatched(v.id));
  vids.sort((a, b) => (sort === 'old' ? b.age - a.age : a.age - b.age));

  const chans = Object.values(subs).sort((a, b) => (unwatched[b.id] || 0) - (unwatched[a.id] || 0) || (a.name || '').localeCompare(b.name || ''));
  const box = $('#subbox'); box.className = '';
  box.innerHTML = `<div id="sb-channels"><h4>Subscriptions</h4>
      <div class="sbc ${subSel === 'all' ? 'sel' : ''}" data-c="all"><span class="n">All subscriptions</span>${total ? `<span class="cnt">${total}</span>` : ''}</div>
      ${chans.map((c) => `<div class="sbc ${subSel === c.id ? 'sel' : ''}" data-c="${esc(c.id)}">${c.avatar ? `<img src="${esc(c.avatar)}">` : '<img>'}<span class="n">${esc(c.name || c.id)}</span>${unwatched[c.id] ? `<span class="cnt">${unwatched[c.id]}</span>` : ''}</div>`).join('')}
    </div>
    <div id="sb-main"><div id="sb-bar">
      <label><input type="checkbox" id="sb-hide" ${hideWatched ? 'checked' : ''}> Hide watched</label>
      <label>View <select id="sb-layout"><option value="list">List</option><option value="grid">Grid</option></select></label>
      <label>Sort <select id="sb-sort"><option value="new">Newest first</option><option value="old">Oldest first</option></select></label>
      <span class="sp"></span>
      <button id="sb-markall">Mark all as watched</button><button id="sb-refresh">Refresh</button>
      <span class="hint">${cache.ts ? 'Updated ' + new Date(cache.ts).toLocaleTimeString() : ''}</span></div>
      <div id="sb-list"></div></div>`;
  $('#sb-layout').value = layout; $('#sb-sort').value = sort;
  box.querySelectorAll('.sbc').forEach((el) => (el.onclick = () => { subSel = el.dataset.c; renderSubBox(); }));
  $('#sb-hide').onchange = (e) => save({ subsHideWatched: e.target.checked }).then(renderSubBox);
  $('#sb-layout').onchange = (e) => save({ subsLayout: e.target.value }).then(renderSubBox);
  $('#sb-sort').onchange = (e) => save({ subsSort: e.target.value }).then(renderSubBox);
  $('#sb-markall').onclick = () => { setWatched(vids.map((v) => v.id), true); renderSubBox(); };
  $('#sb-refresh').onclick = () => showSubs(true);

  const listEl = $('#sb-list');
  if (!vids.length) { listEl.innerHTML = `<div class="hint" style="padding:24px 0">${cache.ts ? 'Nothing new. Uncheck “Hide watched” to see everything.' : 'Loading uploads…'}</div>`; return; }
  const groups = new Map();
  for (const v of vids) { const g = subGroup(v.age); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(v); }
  for (const [g, items] of groups) {
    const h = document.createElement('div'); h.className = 'sb-group'; h.textContent = `${g} (${items.length})`; listEl.appendChild(h);
    if (layout === 'grid') {
      const gr = document.createElement('div'); gr.className = 'sb-grid';
      for (const v of items) gr.appendChild(card(v, { queue: vids, dim: true }));
      listEl.appendChild(gr);
    } else {
      for (const v of items) listEl.appendChild(subRow(v, vids));
    }
  }
}
function subRow(v, queueList) {
  const el = document.createElement('div');
  const w = isWatched(v.id);
  el.className = 'subrow' + (w ? ' watched' : '');
  const pr = progOf(v);
  el.innerHTML = `<div class="th${pr > 1 ? ' hasbar' : ''}"><img loading="lazy" decoding="async" src="${esc(v.thumb)}">${v.duration ? `<span class="dur">${esc(v.duration)}</span>` : ''}${pr > 1 ? `<div class="bar" style="width:${Math.min(100, pr)}%"></div>` : ''}</div>
    <div class="info"><h3>${esc(v.title)}</h3><div class="meta"><a class="linkish" data-ch="${esc(v.channelId)}">${esc(v.channel)}</a> • ${esc([v.views, v.published].filter(Boolean).join(' • '))}</div>
    <div class="acts"><button data-a="watch">${w ? 'Mark unwatched' : 'Mark watched'}</button><button data-a="later">Watch later</button></div></div>`;
  const play = () => { queue = queueList; openVideo(v); };
  el.querySelector('.th').onclick = play; el.querySelector('h3').onclick = play;
  el.querySelector('[data-ch]').onclick = (e) => { e.stopPropagation(); openChannel(v.channelId); };
  el.querySelector('[data-a=watch]').onclick = () => { setWatched(v.id, !w); renderSubBox(); };
  el.querySelector('[data-a=later]').onclick = (e) => { pushList('watchlater', v); e.target.textContent = 'Added ✓'; };
  addDots(el, v);
  applyDeArrow(el, v);
  el._v = v;
  return el;
}

// ---------- grouped subscriptions (2016-2018 style): full-width sections under day/week or channel headings ----------
const sgClosed = new Set(), sgExpanded = new Set();
function subData() {
  const cache = lsGet('subcache', { ts: 0, videos: [] });
  return { cache, subs: signedIn() ? cache.channels || {} : lsGet('subs', {}), vids: cache.videos.filter((v) => !(settings.hideShorts && v.isShort)) };
}
function renderSubs() { if (settings.subsView === 'box') renderSubBox(); else renderSubGrouped(); }
// In the Grouped layout the channel list lives in the left sidebar, like the 2016-2018 guide.
function renderSideSubs() {
  const box = $('#side-subs');
  const { subs, vids } = subData(), list = Object.values(subs);
  if (settings.subsView === 'box' || !list.length) { box.hidden = true; return; }
  const unwatched = {};
  for (const v of vids) if (v.channelId && !isWatched(v.id)) unwatched[v.channelId] = (unwatched[v.channelId] || 0) + 1;
  list.sort((x, y) => (unwatched[y.id] || 0) - (unwatched[x.id] || 0) || (x.name || '').localeCompare(y.name || ''));
  box.hidden = false;
  box.innerHTML = '<h4>Subscriptions <a data-manage>Manage</a></h4>' + list.map((c) =>
    `<a class="ss" data-c="${esc(c.id)}" title="${esc(c.name || c.id)}"><img ${c.avatar ? `src="${esc(c.avatar)}"` : ''}><span class="n">${esc(c.name || c.id)}</span>${unwatched[c.id] ? `<span class="cnt">${unwatched[c.id]}</span>` : ''}</a>`).join('');
  box.onclick = (e) => {
    const link = e.target.closest('a'); if (!link) return;
    if (link.dataset.manage !== undefined) showManageSubs(); else if (link.dataset.c) openChannel(link.dataset.c);
  };
}
function renderSubGrouped() {
  const { cache, subs, vids: all } = subData();
  const hide = settings.subsHideWatched !== false, by = settings.subsGroupBy === 'channel' ? 'channel' : 'date', sort = settings.subsSort || 'new';
  const vids = (hide ? all.filter((v) => !isWatched(v.id)) : all.slice()).sort((a, b) => (sort === 'old' ? b.age - a.age : a.age - b.age));
  const box = $('#subbox'); box.className = 'grouped';
  box.innerHTML = `<div id="sg-bar"><h2>Subscriptions</h2>
    <label>Group by <select id="sg-by"><option value="date">Day and week</option><option value="channel">Channel</option></select></label>
    <label><input type="checkbox" id="sg-hide" ${hide ? 'checked' : ''}> Hide watched</label>
    <button id="sg-markall">Mark all as watched</button><button id="sg-refresh">Refresh</button><button id="sg-manage">Manage</button>
    <span class="hint">${cache.ts ? 'Updated ' + new Date(cache.ts).toLocaleTimeString() : ''}</span></div><div id="sg-list"></div>`;
  $('#sg-by').value = by;
  $('#sg-by').onchange = (e) => save({ subsGroupBy: e.target.value }).then(renderSubGrouped);
  $('#sg-hide').onchange = (e) => save({ subsHideWatched: e.target.checked }).then(renderSubGrouped);
  $('#sg-markall').onclick = () => { setWatched(vids.map((v) => v.id), true); renderSubGrouped(); };
  $('#sg-refresh').onclick = () => showSubs(true);
  $('#sg-manage').onclick = showManageSubs;
  const listEl = $('#sg-list');
  if (!vids.length) { listEl.innerHTML = `<div class="hint" style="padding:24px 0">${cache.ts ? 'Nothing new. Turn off “Hide watched” to see everything.' : 'Loading uploads…'}</div>`; return; }
  const groups = new Map();
  for (const v of vids) { const k = by === 'date' ? subGroup(v.age) : v.channelId; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(v); }
  for (const [k, items] of groups) {
    const skey = by + ':' + k, sec = document.createElement('div');
    sec.className = 'sg-sec' + (sgClosed.has(skey) ? ' closed' : '');
    const ch = by === 'channel' ? subs[k] || { id: k, name: items[0].channel, avatar: '' } : null;
    const unw = items.filter((v) => !isWatched(v.id)).length;
    sec.innerHTML = `<div class="sg-head">${ch ? `<img data-open="${esc(k)}" ${ch.avatar ? `src="${esc(ch.avatar)}"` : ''}>` : ''}<h3><span class="caret">▾</span>${esc(ch ? ch.name || k : k)}<small>${items.length} video${items.length === 1 ? '' : 's'}${unw !== items.length ? ` • ${unw} unwatched` : ''}</small></h3><span class="sp"></span>${ch ? '<button class="link" data-a="open">View channel</button>' : ''}<button class="link" data-a="mark">Mark all as watched</button></div><div class="sg-body"><div class="sb-grid"></div></div>`;
    const limit = by === 'channel' && !sgExpanded.has(skey) ? 6 : items.length;
    const gridEl = sec.querySelector('.sb-grid');
    for (const v of items.slice(0, limit)) gridEl.appendChild(card(v, { queue: vids, dim: true, actions: true }));
    if (items.length > limit) {
      const more = document.createElement('button'); more.className = 'link'; more.style.marginTop = '10px'; more.textContent = `Show all ${items.length}`;
      more.onclick = () => { sgExpanded.add(skey); renderSubGrouped(); }; sec.querySelector('.sg-body').appendChild(more);
    }
    sec.querySelector('h3').onclick = () => { sec.classList.toggle('closed'); sec.classList.contains('closed') ? sgClosed.add(skey) : sgClosed.delete(skey); };
    sec.querySelector('[data-a=mark]').onclick = () => { setWatched(items.map((v) => v.id), true); renderSubGrouped(); };
    sec.querySelectorAll('[data-open],[data-a=open]').forEach((el) => (el.onclick = () => openChannel(k)));
    listEl.appendChild(sec);
  }
}
function showManageSubs() {
  navPush('manage', {}); view = 'manage'; showMain(); grid.innerHTML = ''; setStatus('');
  const { subs } = subData(), list = Object.values(subs).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const head = document.createElement('div'); head.className = 'channel-head';
  head.innerHTML = `<h2 style="flex:1">Manage subscriptions <span class="hint">(${list.length})</span></h2><button>← Back</button>`;
  head.querySelector('button').onclick = () => showSubs();
  grid.appendChild(head);
  if (!list.length) setStatus('You are not subscribed to any channels.');
  for (const c of list) {
    const row = document.createElement('div'); row.className = 'mrow'; row.style.gridColumn = '1/-1';
    row.innerHTML = `<img ${c.avatar ? `src="${esc(c.avatar)}"` : ''}><span class="n linkish">${esc(c.name || c.id)}</span><button>Unsubscribe</button>`;
    row.querySelector('.n').onclick = () => openChannel(c.id);
    row.querySelector('button').onclick = async (e) => { e.target.disabled = true; await setSub(c, false); if (!isSub(c.id)) row.remove(); else e.target.disabled = false; };
    grid.appendChild(row);
  }
}

// ---------- search box ----------
let sugT;
const getSearchHistory = () => lsGet('searchHistory', []);
function pushSearchHistory(q) { const h = getSearchHistory().filter((x) => x.toLowerCase() !== q.toLowerCase()); h.unshift(q); lsSet('searchHistory', h.slice(0, 30)); }
function showSuggest(q, remote = []) {
  const ul = $('#suggest'); ul.innerHTML = '';
  const hist = getSearchHistory().filter((h) => !q || h.toLowerCase().includes(q.toLowerCase())).slice(0, q ? 4 : 8), seen = new Set();
  const add = (t, isHist) => {
    if (seen.has(t.toLowerCase())) return; seen.add(t.toLowerCase());
    const li = document.createElement('li');
    li.innerHTML = `${ic(isHist ? 'history' : 'search')}<span>${esc(t)}</span>${isHist ? `<button class="rm" title="Remove from history">${ic('x')}</button>` : ''}`;
    li.onclick = (e) => {
      if (e.target.closest('.rm')) { e.stopPropagation(); lsSet('searchHistory', getSearchHistory().filter((x) => x !== t)); return showSuggest($('#search').value.trim(), remote); }
      $('#search').value = t; doSearch(t);
    };
    ul.appendChild(li);
  };
  hist.forEach((t) => add(t, true)); remote.slice(0, 8).forEach((t) => add(t, false));
  ul.hidden = !ul.children.length;
}
$('#search').addEventListener('focus', () => { if (!$('#search').value.trim()) showSuggest(''); });
$('#search').addEventListener('input', (e) => {
  clearTimeout(sugT);
  const q = e.target.value.trim();
  showSuggest(q);
  if (!q) return;
  sugT = setTimeout(async () => { try { showSuggest(q, await api.suggest(q)); } catch {} }, 180);
});
$('#search').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(e.target.value); });
$('#search-btn').onclick = () => doSearch($('#search').value);
document.addEventListener('click', (e) => {
  if (!e.target.closest('#search-wrap')) $('#suggest').hidden = true;
  if (!e.target.closest('#tool-menu') && !e.target.closest('#add-tool') && !e.target.closest('[data-id=saveplaylist]')) $('#tool-menu').hidden = true;
  if (!e.target.closest('.popover') && !e.target.closest('#acct-btn')) $('#acct-menu').hidden = true;
  if (!e.target.closest('#p-menu') && !e.target.closest('#p-gear')) { $('#p-menu').hidden = true; $('#p-gear').classList.remove('open'); }
  if (!e.target.closest('#side') && !e.target.closest('#menu-btn')) document.body.classList.remove('side-peek');
});

// ---------- subscriptions / lists ----------
const isSub = (id) => (signedIn() && remoteSubs ? remoteSubs.has(id) : !signedIn() && !!lsGet('subs', {})[id]);
async function setSub(ch, forceOn) {
  const on = forceOn ?? !isSub(ch.id);
  if (signedIn()) {
    try { await api.subscribe(ch.id, on); } catch (e) { toast('Subscribe failed: ' + e.message); return; }
    remoteSubs = remoteSubs || new Set(); on ? remoteSubs.add(ch.id) : remoteSubs.delete(ch.id);
  } else {
    const s = lsGet('subs', {}); if (on) s[ch.id] = ch; else delete s[ch.id]; lsSet('subs', s);
  }
  lsSet('subcache', { ts: 0, videos: [] });
  renderSideSubs();
}
function toast(msg) {
  const t = $('#watch').hidden ? $('#gtoast') : $('#sb-toast'); // over the video while watching, otherwise at the bottom of the window
  t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3500);
}
function pushList(key, v, max = 300) {
  const l = lsGet(key, []).filter((x) => x.id !== v.id);
  l.unshift({ id: v.id, title: v.title, channel: v.channel, channelId: v.channelId, views: v.views, published: v.published, duration: v.duration, thumb: v.thumb, isShort: v.isShort, verified: v.verified, ...(key === 'history' ? { at: Date.now() } : {}) });
  lsSet(key, l.slice(0, max));
}
function toggleList(key, v) {
  const l = lsGet(key, []);
  if (l.some((x) => x.id === v.id)) lsSet(key, l.filter((x) => x.id !== v.id)); else pushList(key, v);
}
const inList = (key, id) => lsGet(key, []).some((x) => x.id === id);

// ---------- customizable player toolbar ----------
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
// Quality, speed and captions live in the player's own settings menu (the slider button on the video).
const DEFAULT_TOOLBAR = ['loop', 'theater', 'pip', 'mini', 'watchlater', 'dlvideo', 'dlaudio', 'dlmenu', 'sleep', 'close'];
const watchUrl = (t) => `https://www.youtube.com/watch?v=${current.id}${t ? '&t=' + Math.floor(video.currentTime) : ''}`;
const TOOLS = {
  quality: { icon: 'sliders', label: 'Quality', select: RES, value: () => settings.quality || 'auto', change: (v) => { save({ quality: v }); if (current) loadStream(current.id, v, video.currentTime); } },
  speed: { icon: 'sliders', label: 'Speed', select: SPEEDS.map((s) => [String(s), s + 'x']), value: () => String(speed), change: (v) => setSpeed(parseFloat(v)) },
  loop: { icon: 'repeat', label: 'Loop', on: () => video.loop, run: () => { video.loop = !video.loop; } },
  theater: { icon: 'theater', label: 'Theater mode (T)', on: () => !!settings.theater, run: () => save({ theater: !settings.theater }) },
  pip: { icon: 'pip', label: 'Picture in picture', run: () => { if (document.pictureInPictureElement) return document.exitPictureInPicture(); video.disablePictureInPicture = false; return video.requestPictureInPicture().catch(() => {}).finally(() => { video.disablePictureInPicture = true; }); } },
  mini: { icon: 'mini', label: 'Mini player', run: () => api.mini(true) },
  watchlater: { icon: 'clock', label: 'Watch later', on: () => current && inList('watchlater', current.id), run: () => toggleList('watchlater', current) },
  subscribe: { icon: 'plus', label: 'Subscribe', on: () => current && isSub(current.channelId), run: () => current.channelId && setSub({ id: current.channelId, name: current.channel, avatar: current.channelThumb || '' }) },
  captions: { icon: 'cc', label: 'Captions', select: () => [['', capTracks.length ? 'CC off' : 'CC: none'], ...capTracks.map((t) => [t.lang + (t.auto ? '|a' : '|m'), t.name])], value: () => capLang, change: (v) => chooseCaption(v) },
  saveplaylist: { icon: 'listplus', label: 'Save to playlist', run: async () => {
    if (!signedIn()) return promptLogin('Sign in to save videos to your playlists.');
    try { const pls = await api.mePlaylists(); showMenu(pls.length ? pls.map((p) => ({ label: p.title, fn: () => api.addToPlaylist(p.id, current.id).then(() => toast('Added to ' + p.title), (e) => toast('Failed: ' + e.message)) })) : [{ label: 'No playlists found' }]); }
    catch (e) { toast('Could not load playlists: ' + e.message); }
  } },
  dlvideo: { icon: 'download', label: 'Download video (your settings)', run: () => startDownload('video') },
  dlmenu: { icon: 'downloadmore', label: 'Download with a preset…', run: () => showMenu([{ label: 'Video (your settings)', fn: () => startDownload('video') }, { label: 'Audio (your settings)', fn: () => startDownload('audio') }, ...DL_PRESETS.map(([label, kind, o]) => ({ label, fn: () => startDownload(kind, o) }))]) },
  dlaudio: { icon: 'music', label: 'Download audio (your settings)', run: () => startDownload('audio') },
  copylink: { icon: 'link', label: 'Copy link', run: () => api.copy(watchUrl()) },
  copytime: { icon: 'clock', label: 'Copy link at current time', run: () => api.copy(watchUrl(true)) },
  openweb: { icon: 'external', label: 'Open on youtube.com', run: () => api.openExternal(watchUrl()) },
  back10: { icon: 'rewind', label: 'Back 10s', run: () => (video.currentTime -= 10) },
  fwd10: { icon: 'forward', label: 'Forward 10s', run: () => (video.currentTime += 10) },
  next: { icon: 'next', label: 'Next video', run: () => playNext(true) },
  mute: { icon: 'mute', label: 'Mute', on: () => video.muted, run: () => { video.muted = !video.muted; } },
  audioonly: { icon: 'headphones', label: 'Audio only', on: () => settings.quality === 'audio', run: () => TOOLS.quality.change(settings.quality === 'audio' ? 'auto' : 'audio') },
  sleep: { icon: 'moon', label: 'Sleep timer', on: () => !!sleepEnd || sleepEnding, badge: () => (sleepEnd ? Math.ceil((sleepEnd - Date.now()) / 60000) + 'm' : sleepEnding ? 'end' : ''), run: () => showMenu(SLEEP_OPTS.map(([v, l]) => ({ label: l, icon: 'moon', fn: () => setSleep(v) }))) },
  close: { icon: 'x', label: 'Close player (Esc)', run: () => { if (!floatOn()) video.pause(); showMain(); } }, // with the floating player on, this minimizes it
};
const toolIds = () => (settings.toolbar || DEFAULT_TOOLBAR).filter((id) => TOOLS[id]);
function makeTool(id) {
  const t = TOOLS[id]; let el;
  if (t.select) {
    el = document.createElement('select'); el.title = t.label;
    el.innerHTML = (typeof t.select === 'function' ? t.select() : t.select).map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    el.value = t.value(); el.onchange = () => t.change(el.value);
  } else {
    el = document.createElement('button'); el.title = t.label;
    const badge = t.badge?.() || '';
    el.innerHTML = ic(t.icon) + (settings.toolLabels ? `<span class="lbl">${esc(t.label.replace(/\s*\(.*\)/, ''))}</span>` : '') + (badge ? `<span class="badge">${esc(badge)}</span>` : '');
    if (t.on?.()) el.classList.add('on');
    el.onclick = () => { if (!editingTools) Promise.resolve(t.run()).finally(renderToolbar); };
  }
  el.classList.add('tool'); el.dataset.id = id;
  if (editingTools) {
    // In edit mode a tool wrapper carries the remove badge; selects can't hold children, so wrap them.
    const w = document.createElement('span'); w.className = 'tool'; w.dataset.id = id; w.draggable = true;
    el.classList.remove('tool'); el.style.pointerEvents = 'none';
    const x = document.createElement('span'); x.className = 'x'; x.textContent = '×'; x.title = 'Remove from toolbar';
    x.onclick = () => save({ toolbar: toolIds().filter((i) => i !== id) });
    w.append(el, x);
    w.ondragstart = (e) => { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; };
    w.ondragover = (e) => { e.preventDefault(); w.classList.add('over'); };
    w.ondragleave = () => w.classList.remove('over');
    w.ondrop = (e) => {
      e.preventDefault(); w.classList.remove('over');
      const from = e.dataTransfer.getData('text/plain'); if (!from || from === id) return;
      const ids = toolIds().filter((i) => i !== from); ids.splice(ids.indexOf(id), 0, from);
      save({ toolbar: ids });
    };
    return w;
  }
  return el;
}
// Fixed buttons in the video's bottom bar, left of the ⋮: theater, captions, sleep timer, quality (each can be turned off in Settings).
const PQ = [['pbCaptions', 'captions', 'cc', 'Captions'], ['pbQuality', 'quality', 'gear', 'Quality'], ['pbSpeed', 'speed', 'forward', 'Speed'], ['pbSleep', 'sleep', 'moon', 'Sleep timer'], ['pbTheater', 'theater', 'theater', 'Theater mode (T)']];
function renderPQuick() {
  const box = $('#p-quick'); if (!box) return;
  const items = PQ.filter(([k]) => settings[k]);
  box.innerHTML = '';
  for (const [, page, icon, title] of items) {
    const b = document.createElement('button'); b.className = 'pq'; b.title = title;
    const on = page === 'theater' ? !!settings.theater : page === 'captions' ? !!capLang : page === 'sleep' ? (!!sleepEnd || sleepEnding) : false;
    if (on) b.classList.add('on');
    b.innerHTML = ic(icon) + (page === 'sleep' && sleepEnd ? `<span class="pqb">${Math.ceil((sleepEnd - Date.now()) / 60000)}m</span>` : '') + (page === 'quality' && hdTag() ? `<span class="pqhd">${hdTag()}</span>` : '');
    b.onclick = (e) => {
      e.stopPropagation();
      if (page === 'theater') return save({ theater: !settings.theater });
      const m = $('#p-menu');
      if (!m.hidden && pmPage === page) return closeP();
      pmPage = page; m.hidden = false; $('#p-gear').classList.add('open'); renderPMenu();
    };
    box.appendChild(b);
  }
  document.documentElement.style.setProperty('--pq-n', items.length);
}
function renderToolbar() {
  renderPQuick();
  $('#p-gear')?.classList.toggle('sleeping', !!sleepEnd || sleepEnding); // small moon-colored dot while a sleep timer runs
  const wrap = $('#toolbar-wrap'), tools = $('#player-tools'), ctl = $('#toolbar-ctl');
  if (!tools) return;
  wrap.classList.toggle('hidden', !!settings.toolbarHidden);
  wrap.classList.toggle('editing', editingTools);
  tools.innerHTML = ''; ctl.innerHTML = '';
  for (const id of toolIds()) tools.appendChild(makeTool(id));
  const btn = (html, title, fn, id) => { const b = document.createElement('button'); b.innerHTML = html; b.title = title; if (id) b.id = id; b.onclick = fn; ctl.appendChild(b); };
  if (editingTools) {
    btn(ic('plus') + 'Add', 'Add a button', (e) => { e.stopPropagation(); openToolMenu(); }, 'add-tool');
    btn('Reset', 'Restore default buttons', () => save({ toolbar: null }));
    btn('Done', 'Finish editing', () => { editingTools = false; renderToolbar(); });
  } else {
    if (!settings.toolbarHidden) btn(ic('edit') + 'Customize', 'Customize buttons', () => { editingTools = true; renderToolbar(); });
    btn(settings.toolbarHidden ? ic('chevdown') + 'Buttons' : ic('chevup'), settings.toolbarHidden ? 'Show toolbar' : 'Hide toolbar', () => save({ toolbarHidden: !settings.toolbarHidden }));
  }
}
function showMenu(items) {
  const menu = $('#tool-menu'); menu.innerHTML = '';
  for (const it of items) {
    const li = document.createElement('li'); li.innerHTML = (it.icon ? ic(it.icon) : '') + esc(it.label);
    if (it.fn) li.onclick = () => { menu.hidden = true; it.fn(); }; else li.className = 'empty';
    menu.appendChild(li);
  }
  menu.hidden = false;
}
function openToolMenu() {
  const have = new Set(toolIds()), avail = Object.keys(TOOLS).filter((id) => !have.has(id));
  showMenu(avail.length ? avail.map((id) => ({ label: TOOLS[id].label, icon: TOOLS[id].icon, fn: () => save({ toolbar: [...toolIds(), id] }) })) : [{ label: 'All buttons are on the toolbar' }]);
}

// ---------- player ----------
function setSpeed(s) {
  speed = Math.min(3, Math.max(0.25, s));
  video.playbackRate = speed;
  if (settings.rememberSpeed) save({ speed });
  else renderToolbar();
}
// Video and audio arrive as separate streams, so a hidden <audio> element follows the video. The video is the clock: the sound starts
// once the picture is really moving, small drifts are corrected by nudging the speed a little, and only a big gap is a jump.
function newAudio() {
  const a = new Audio(); a.preload = 'auto'; a.crossOrigin = 'anonymous';
  a.addEventListener('error', () => { if (a === audio && audioActive && audioUrl) { mlog('audio element error', a.error ? a.error.code : '?'); audioFailed('error'); } });
  return a;
}
let audio = newAudio(), audioUrl = '';
let audioActive = false, audioGo = false, audioArm = null, loadSeq = 0, lastHardSeek = 0;
// A short record of anything that went wrong with the sound or the stream (Settings, Video & audio, "Copy the playback log").
const mlogBuf = [];
function mlog(...a) { dlog('warn', 'playback:', ...a); mlogBuf.push(new Date().toTimeString().slice(0, 8) + ' ' + a.join(' ')); if (mlogBuf.length > 80) mlogBuf.shift(); }
// The stream itself dropped (an address that expired, the cache entry gone, a network error): look the video up again and carry on from the
// same spot. A few tries, then give up rather than loop.
const reconnects = { n: 0, t: 0 };
function reconnect(why) {
  if (!current) return false;
  const now = Date.now(); if (now - reconnects.t > 120000) reconnects.n = 0;
  if (reconnects.n >= 4) { mlog('reconnect refused (too many in a row):', why); return false; }
  reconnects.n++; reconnects.t = now; mlog('reconnect:', why); toast('Reconnecting…');
  // from the second try on, skip the highest-bitrate pick in case that is what the player cannot handle
  loadStream(current.id, settings.quality || 'auto', video.currentTime || 0, reconnects.n >= 2).catch(() => {});
  return true;
}
// A new <audio> element for the same address (the old one may be stuck after an error) that joins the video where it is.
function swapAudio(src, t) {
  const old = audio, a = newAudio();
  if (/^http:\/\/127\.0\.0\.1/.test(src)) a.crossOrigin = 'anonymous'; else a.removeAttribute('crossorigin');
  a.src = src; audioUrl = src;
  if (t > 0.5) { try { a.currentTime = t; } catch {} }
  audio = a; audioActive = true;
  if (sa.ctx) { try { sa.audioSrc?.disconnect(); sa.audioSrc = sa.ctx.createMediaElementSource(a); sa.audioSrc.connect(sa.norm); } catch (e) { mlog('could not rejoin the audio graph:', e.message); } }
  try { old.pause(); old.removeAttribute('src'); old.load(); } catch {}
  audioGo = false; audioArm = null; if (!video.paused) armAudio();
}
const audioFix = { n: 0, t: 0 };
function audioFailed(why) {
  if (!audioActive || !current) return;
  const now = Date.now(); if (now - audioFix.t > 60000) audioFix.n = 0;
  audioFix.t = now; audioFix.n++; mlog('sound failed:', why, '(try', audioFix.n + ')');
  if (audioFix.n <= 2) swapAudio(audioUrl, video.currentTime); // first a fresh element for the same address
  else reconnect('sound: ' + why); // then look the address up again
}
function syncAudio(hard) {
  if (!audioActive) return;
  audio.volume = video.volume; audio.muted = video.muted;
  const base = video.playbackRate || 1;
  if (!audioGo) { audio.playbackRate = base; return; }
  if (audio.paused || audio.seeking || audio.readyState < 3) return; // paused (the watchdog restarts it) or still loading: seeking it again would only restart its download
  const d = audio.currentTime - video.currentTime;
  if (hard || Math.abs(d) > 0.6) { if (hard || Date.now() - lastHardSeek > 2000) { lastHardSeek = Date.now(); audio.currentTime = video.currentTime; } audio.playbackRate = base; return; }
  audio.playbackRate = Math.abs(d) > 0.04 ? base * (1 - Math.max(-0.05, Math.min(0.05, d * 0.5))) : base;
}
const stopAudioClock = () => { audioGo = false; audioArm = null; if (audioActive) audio.pause(); };
const armAudio = () => { if (audioActive && !video.paused) { audioGo = false; audioArm = { t: video.currentTime, at: Date.now() }; } };
video.addEventListener('playing', armAudio);
video.addEventListener('timeupdate', () => {
  if (audioArm && !video.paused && !video.seeking && video.currentTime > audioArm.t + 0.01) {
    audioArm = null; audioGo = true; audio.currentTime = video.currentTime; syncAudio(false); audio.play().catch(() => {});
  }
});
for (const ev of ['pause', 'waiting', 'seeking', 'ended', 'emptied']) video.addEventListener(ev, stopAudioClock);
video.addEventListener('seeked', () => { if (!video.paused) armAudio(); else if (audioActive) audio.currentTime = video.currentTime; });
video.addEventListener('ratechange', () => syncAudio(false));
video.addEventListener('volumechange', () => syncAudio(false));
setInterval(() => { if (audioActive && audioGo && !video.paused && !video.seeking) syncAudio(false); }, 500);

// Watches over the sound once a second while the video plays: restarts it if it was paused, gets it going if the clock was lost, wakes the
// audio graph if it fell asleep, and replaces the audio element when it has stopped for good or been stuck for six seconds.
const wd = { v: 0, a: 0, stall: 0 };
setInterval(() => {
  if (!current) return;
  const playing = !video.paused && !video.ended && !video.seeking && video.readyState >= 3;
  if (sa.ctx && sa.ctx.state !== 'running' && !video.paused) sa.ctx.resume().catch(() => {});
  if (!audioActive || !playing) { wd.stall = 0; wd.v = video.currentTime; wd.a = audio.currentTime; return; }
  if (audio.error) { audioFailed('error state'); return; }
  if (audio.ended || (isFinite(audio.duration) && video.currentTime >= audio.duration - 0.3)) { wd.stall = 0; wd.v = video.currentTime; wd.a = audio.currentTime; return; } // the sound simply ends a little before the picture
  if (audioArm && Date.now() - audioArm.at > 3000) { audioArm = null; audioGo = true; audio.currentTime = video.currentTime; syncAudio(false); audio.play().catch(() => {}); } // never started: start it now
  else if (!audioGo && !audioArm) armAudio(); // the sound clock was lost: start it again
  else if (audioGo && audio.paused && !audio.ended) { mlog('sound was paused while the video played: restarting it'); audio.play().catch(() => {}); }
  const vAdv = video.currentTime - wd.v, aAdv = audio.currentTime - wd.a;
  if (audioGo && vAdv > 0.6 && aAdv < 0.2) { if (++wd.stall >= 6) { wd.stall = 0; mlog('sound stalled for 6 s, readyState', audio.readyState); audioFailed('stalled'); } } else wd.stall = 0;
  wd.v = video.currentTime; wd.a = audio.currentTime;
}, 1000);
for (const ev of ['play', 'seeked']) video.addEventListener(ev, () => { if (sa.ctx && sa.ctx.state !== 'running') sa.ctx.resume().catch(() => {}); });
document.addEventListener('visibilitychange', () => { if (sa.ctx && sa.ctx.state !== 'running' && !video.paused) sa.ctx.resume().catch(() => {}); });

// Empties the player (picture and sound) so the next video starts from a clean state and the old buffers are freed.
function resetMedia() {
  stopAudioClock();
  video.pause(); video.removeAttribute('src'); video.load();
  audio.removeAttribute('src'); audio.load(); audioActive = false;
}
const mediaReady = (el) => (el.readyState >= 3 ? Promise.resolve() : new Promise((r) => el.addEventListener('canplay', r, { once: true })));
// Opens the stream for the current video. Playback starts once picture and sound are both ready (or after a few seconds regardless),
// at the right position from the start, so there is no black flash and no replay of the first seconds.
async function loadStream(id, quality, startAt, safe) {
  const my = ++loadSeq;
  const s = await api.stream(id, quality, !!sa.ctx || (settings.stableAudio || 'off') !== 'off', !!safe, { data: perf.data, power: perf.power });
  if (my !== loadSeq || !current || current.id !== id) return; // another video was opened while this one was being looked up
  resetMedia();
  // Streams through the local cache are readable by Web Audio; direct ones are not (and the attribute would stop them loading).
  const local = /^http:\/\/127\.0\.0\.1/.test(s.video || s.audio || '');
  if (local) { video.crossOrigin = 'anonymous'; audio.crossOrigin = 'anonymous'; } else { video.removeAttribute('crossorigin'); audio.removeAttribute('crossorigin'); }
  video.src = s.video || s.audio;
  if (s.video && s.audio) { audio.src = s.audio; audioUrl = s.audio; audioActive = true; }
  const t = startAt || 0;
  if (t > 0.5) { try { video.currentTime = t; if (audioActive) audio.currentTime = t; } catch {} }
  video.playbackRate = speed;
  applyStableAudio();
  await Promise.race([Promise.all([mediaReady(video), audioActive ? mediaReady(audio) : null]), new Promise((r) => setTimeout(r, 6000))]);
  if (my !== loadSeq) return;
  video.play().catch(() => {});
}
// ---------- stable audio: even out the loudness ----------
// 'levels' trims loud videos (and, if allowed, lifts quiet ones) to a common loudness using the level YouTube reports for the video.
// 'compress' also squeezes the loud and quiet parts of one video closer together (good for late-night listening).
// Everything runs through a limiter so a lifted video can't clip. The graph is built the first time it is needed.
const sa = { ctx: null };
const COMP = { light: { th: -26, knee: 24, ratio: 3.5, atk: 0.004, rel: 0.25, make: 3 }, strong: { th: -34, knee: 20, ratio: 8, atk: 0.003, rel: 0.2, make: 7 } };
function ensureAudioGraph() {
  if (sa.ctx) return true;
  try {
    const ctx = new AudioContext();
    sa.norm = ctx.createGain(); sa.comp = ctx.createDynamicsCompressor(); sa.make = ctx.createGain(); sa.lim = ctx.createDynamicsCompressor();
    sa.lim.threshold.value = -2; sa.lim.knee.value = 0; sa.lim.ratio.value = 20; sa.lim.attack.value = 0.002; sa.lim.release.value = 0.1;
    sa.videoSrc = ctx.createMediaElementSource(video); sa.videoSrc.connect(sa.norm);
    sa.audioSrc = ctx.createMediaElementSource(audio); sa.audioSrc.connect(sa.norm);
    ctx.onstatechange = () => { mlog('audio context', ctx.state); if (ctx.state !== 'running' && !video.paused) ctx.resume().catch(() => {}); };
    sa.norm.connect(sa.comp); sa.comp.connect(sa.make); sa.make.connect(sa.lim); sa.lim.connect(ctx.destination);
    sa.ctx = ctx; return true;
  } catch { sa.ctx = null; return false; }
}
function applyStableAudio() {
  const mode = perf.power ? 'off' : settings.stableAudio || 'off'; // the audio graph costs CPU, so power saving skips it
  if (mode === 'off' && !sa.ctx) return;
  if (!ensureAudioGraph()) return;
  const ctx = sa.ctx; if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  let g = 1;
  if (mode !== 'off' && typeof current?.loudnessDb === 'number') {
    const boost = settings.stableBoost === false ? 0 : 6, db = Math.max(-24, Math.min(boost, -14 - current.loudnessDb)); // YouTube's reference level is -14
    g = Math.pow(10, db / 20);
  }
  sa.norm.gain.setTargetAtTime(g, ctx.currentTime, 0.05);
  const c = mode === 'compress' ? COMP[settings.stableCompress === 'light' ? 'light' : 'strong'] : null;
  sa.comp.threshold.setTargetAtTime(c ? c.th : 0, ctx.currentTime, 0.05); sa.comp.knee.value = c ? c.knee : 0; sa.comp.ratio.value = c ? c.ratio : 1;
  sa.comp.attack.value = c ? c.atk : 0.003; sa.comp.release.value = c ? c.rel : 0.25;
  sa.make.gain.setTargetAtTime(c ? Math.pow(10, c.make / 20) : 1, ctx.currentTime, 0.05);
}
for (const ev of ['play', 'playing']) video.addEventListener(ev, () => { if (sa.ctx?.state === 'suspended') sa.ctx.resume().catch(() => {}); });


function updateChannelRow() {
  if (!current) return;
  const subbed = isSub(current.channelId);
  $('#w-sub').textContent = subbed ? '✓ Subscribed' : 'Subscribe';
  $('#w-sub').classList.toggle('on', subbed);
  paintBell();
}
$('#w-sub').onclick = async () => { await TOOLS.subscribe.run(); updateChannelRow(); renderToolbar(); };

// Shows the watch page again for the video that is already in the player (no reload).
function showWatchPage() {
  $('#main').hidden = true; $('#watch').hidden = false; $('#watch').classList.remove('away'); syncSideAuto(); renderTabs();
}
async function openVideo(v, opts = {}) {
  // The video is already in the player (coming back from the floating player, or back in the history): just show it again.
  if (current && current.id === v.id && video.currentSrc && !video.error && !video.ended) {
    if (!opts.stay) { navPush('video', { v }, { replace: !!opts.replace }); showWatchPage(); }
    return;
  }
  if (!opts.stay) navPush('video', { v }, { replace: !!opts.replace });
  saveProgress(); histTime(); histSent = null; // keep where you left the previous video, and report it
  ++loadSeq; resetMedia(); video.poster = v.thumb || ''; pbox.classList.add('loading'); // stop the old one at once; the picture shows while the new one is found
  if (opts.list !== undefined) playlistCtx = opts.list; else if (!opts.keep) playlistCtx = null;
  hideEndScreen(); relatedVids = []; relAll = []; $('#rc-chips').innerHTML = ''; setChapters([]);
  current = v; segments = []; streamRetries = 0;
  if (opts.stay) updateAway();
  if (!opts.stay) { $('#main').hidden = true; $('#watch').hidden = false; $('#watch').scrollTop = 0; $('#watch').classList.remove('away'); syncSideAuto(); }
  renderTabs(); if (!document.hasFocus() || document.hidden) api.notify('playing', 'Now playing', v.title || '', v.id).catch(() => {});
  $('#w-title').textContent = v.title;
  $('#w-ch').textContent = v.channel || ''; $('#w-subs').textContent = ''; $('#r-likes').textContent = ''; $('#r-dislikes').textContent = ''; updateRateButtons(); $('#w-avatar').removeAttribute('src');
  $('#w-stats').textContent = [v.views, v.published].filter(Boolean).join(' • ');
  $('#w-desc-text').textContent = ''; $('#c-list').innerHTML = ''; $('#c-more').innerHTML = ''; $('#c-note').innerHTML = ''; $('#c-find').value = ''; $('#c-title').textContent = 'Comments';
  commentSort = settings.commentsSortDefault || 'TOP_COMMENTS'; $('#c-sort').value = commentSort; cState = { id: v.id, more: null, hidden: 0, total: '', shown: 0, showHidden: false, force: false }; renderComposer(); $('#related').innerHTML = ''; renderUpNext(); chapters = []; $('#w-chapters').hidden = true;
  $('#w-desc').classList.toggle('collapsed', !settings.descExpanded); $('#desc-toggle').textContent = settings.descExpanded ? 'Show less' : 'Show more'; $('#desc-toggle').hidden = true;
  speed = settings.rememberSpeed && settings.speed ? settings.speed : parseFloat(settings.defaultSpeed) || 1;
  if (!settings.pauseHistory) pushList('history', v); // marked watched later, once you have really watched most of it (see saveProgress)
  capTracks = []; allCapTracks = []; capLang = ''; setCaptionTrack(null); paintRc();
  updateChannelRow(); renderToolbar();
  // The stream (yt-dlp) and the details (youtubei) are looked up at the same time, and the details are shown as soon as they arrive.
  const prog = lsGet('progress', {})[v.id];
  let startAt = settings.resume && prog && prog.pct < 95 && prog.t > 2 ? prog.t : 0;
  // Nothing saved here: continue from where YouTube says you stopped (it only gives a percentage, so work out the time from the length).
  const ytPct = ytProg[v.id] || v.watchedPct || 0;
  if (settings.resume && !startAt && ytPct >= 2 && ytPct < 95) {
    const len = v.duration && /^\d+(:\d{2}){1,2}$/.test(v.duration) ? tsToSec(v.duration) : 0;
    if (len) startAt = Math.max(0, Math.floor(len * ytPct / 100) - 2);
    else video.addEventListener('loadedmetadata', () => { if (current?.id === v.id && video.currentTime < 1 && isFinite(video.duration)) { const t = Math.floor(video.duration * ytPct / 100) - 2; try { video.currentTime = t; if (audioActive) audio.currentTime = t; } catch {} } }, { once: true });
  }
  const infoP = api.video(v.id).catch(() => null);
  loadStream(v.id, settings.quality || 'auto', startAt).catch((e) => { if (current?.id === v.id) { pbox.classList.remove('loading'); $('#w-stats').textContent = 'Could not load stream: ' + e.message; } });
  navigator.mediaSession && (navigator.mediaSession.metadata = new MediaMetadata({ title: v.title, artist: v.channel, artwork: v.thumb ? [{ src: v.thumb }] : [] }));
  loadSegments(v.id); loadVotes(v.id);
  try {
    const info = await infoP;
    if (!info || !current || current.id !== v.id) return;
    current = { ...v, ...info, channelId: info.channelId || v.channelId, channelThumb: info.channelThumb };
    $('#w-title').textContent = info.title || v.title;
    $('#w-ch').textContent = info.channel || v.channel; $('#w-ch').onclick = () => info.channelId && openChannel(info.channelId);
    $('#w-subs').textContent = info.subs || '';
    if (info.channelThumb) $('#w-avatar').src = info.channelThumb;
    if (info.likes && !$('#r-likes').textContent) $('#r-likes').textContent = fmtNum(info.likes);
    daBranding(v.id).then((b) => { const r = daPick(b, v.id); if (settings.dearrow && !perf.data && r?.title && current?.id === v.id) { $('#w-title').title = info.title || v.title; $('#w-title').textContent = r.title; } });

    $('#w-stats').textContent = [info.views != null ? fmtNum(info.views) + ' views' : '', info.relative || info.published].filter(Boolean).join(' • ');
    $('#w-desc-text').innerHTML = rich(info.description || '');
    $('#desc-toggle').hidden = $('#w-desc-text').scrollHeight < 72; // short descriptions need no toggle
    updateChannelRow(); renderToolbar(); applyStableAudio();
    relAll = info.related; relChip = 'all'; paintRelated();
    setChapters(info.chapters?.length ? info.chapters : parseChapters(info.description));
    relatedVids = info.related.filter((x) => !x.isShort);
    loadComments(v.id);
    if (info.captionTracks) setCaptionTracks(info.captionTracks); else loadCaptionList(v.id);
  } catch {}
}
$('#desc-toggle').onclick = () => {
  const d = $('#w-desc'), open = d.classList.toggle('collapsed') === false;
  $('#desc-toggle').textContent = open ? 'Show less' : 'Show more';
};
// ---------- comments: where they live ----------
// 'below' = under the description (the original place). 'side' = in the right column above the related videos, where live chat
// sits on YouTube. 'side-normal' = the same, but they drop back below the video while theater mode is on.
const commentsAtSide = () => settings.commentsPlace === 'side' || (settings.commentsPlace === 'side-normal' && !settings.theater);
function placeComments() {
  const side = commentsAtSide(), box = $('#comments-box'), target = side ? $('#side-comments') : $('#details');
  if (box.parentElement !== target) target.appendChild(box);
  $('#watch').classList.toggle('cm-side', side);
  $('#c-place').innerHTML = ic(side ? 'panelbottom' : 'panelright');
  $('#c-place').title = side ? 'Move the comments below the video' : 'Move the comments to the side';
  document.documentElement.style.setProperty('--c-side-h', settings.commentsSideHeight || 75);
}
$('#c-place').onclick = () => save({ commentsPlace: commentsAtSide() ? 'below' : 'side' });

// ---------- comments: viewing ----------
let cState = { id: '', more: null, hidden: 0, total: '', shown: 0, showHidden: false, force: false };
const blockWords = () => String(settings.commentsBlock || '').split(/[\n,]/).map((w) => w.trim().toLowerCase()).filter(Boolean);
function commentFiltered(c) {
  const hay = (c.text + ' ' + c.author).toLowerCase();
  if (blockWords().some((w) => hay.includes(w))) return true;
  return !!settings.commentsHideLinks && /https?:\/\/|www\./i.test(c.text);
}
// Text size, spacing, how many lines before "Read more", and which parts are shown.
function applyCommentStyle() {
  const box = $('#comments-box'), lines = +(settings.commentsLines ?? 5);
  box.style.fontSize = ((settings.commentsSize || 100) / 100) + 'em';
  box.style.setProperty('--c-lines', lines || 1000);
  box.classList.toggle('nolimit', !lines);
  box.classList.toggle('compact', settings.commentsDensity === 'compact');
  box.classList.toggle('noav', settings.commentsAvatars === false);
  box.classList.toggle('nolikes', settings.commentsLikes === false);
  box.classList.toggle('nobadges', settings.commentsBadges === false);
  box.classList.toggle('noactions', settings.commentsActions === false);
}
function fitComment(el) {
  const b = el.querySelector(':scope > .cmain > .body'); if (!b || b.classList.contains('open') || b.nextElementSibling?.classList.contains('cmore')) return;
  if (b.scrollHeight > b.clientHeight + 2) {
    const m = document.createElement('button'); m.className = 'link cmore'; m.textContent = 'Read more';
    m.onclick = () => { const o = b.classList.toggle('open'); m.textContent = o ? 'Show less' : 'Read more'; };
    b.after(m);
  }
}
function renderComment(c, isReply) {
  const el = document.createElement('div');
  el.className = 'cm' + (isReply ? ' reply' : '') + (c.pinned ? ' pinned' : '') + (c.isOwner ? ' owner' : '') + (commentFiltered(c) ? ' filtered' : '');
  el.dataset.id = c.id; el._c = c;
  const badges = (c.pinned ? `<span class="cb">${ic('pin')}Pinned</span>` : '') + (c.isOwner ? '<span class="cb own">Creator</span>' : '') + (c.member ? '<span class="cb">Member</span>' : '') + (c.hearted ? `<span class="cb heart" title="Liked by the creator">${ic('heart')}</span>` : '');
  el.innerHTML = `<img class="cav" ${c.avatar ? `src="${esc(c.avatar)}"` : ''}>
    <div class="cmain"><div class="head"><b data-ca="${esc(c.authorId)}">${esc(c.author)}</b>${badges}<small>${esc(c.published)}</small></div>
    <div class="body">${rich(c.text)}</div>
    <div class="foot"><button class="cl${c.liked ? ' on' : ''}" data-a="like" title="Like">${ic('up')}<span>${esc(c.likes)}</span></button><button data-a="reply">Reply</button></div>
    ${c.hasReplies ? `<button class="link cv" data-a="replies">${ic('chevdown')}<span>${esc(c.replies)} ${c.replies === '1' ? 'reply' : 'replies'}</span></button><div class="cm-replies" hidden></div>` : ''}
    <div class="cm-replybox" hidden></div></div>`;
  el.querySelector('.cav').onclick = el.querySelector('[data-ca]').onclick = () => c.authorId && openChannel(c.authorId);
  el.querySelector('[data-a=like]').onclick = (e) => likeComment(c, e.currentTarget);
  el.querySelector('[data-a=reply]').onclick = () => openReplyBox(el, c);
  el.querySelector('[data-a=replies]')?.addEventListener('click', () => toggleReplies(el, c));
  return el;
}
async function likeComment(c, btn) {
  if (!signedIn()) return promptLogin('Sign in to like comments.');
  const on = !c.liked;
  try { await api.commentLike(c.id, on); } catch (e) { return toast('Could not like the comment: ' + e.message); }
  c.liked = on; btn.classList.toggle('on', on);
  const n = btn.querySelector('span'); if (/^\d+$/.test(c.likes || '0')) { c.likes = String(Math.max(0, +(c.likes || 0) + (on ? 1 : -1))); n.textContent = c.likes === '0' ? '' : c.likes; }
}
async function toggleReplies(el, c) {
  const box = el.querySelector('.cm-replies'), btn = el.querySelector('[data-a=replies]');
  if (!box.hidden) { box.hidden = true; btn.querySelector('.ico').outerHTML = ic('chevdown'); return; }
  box.hidden = false; btn.querySelector('.ico').outerHTML = ic('chevup');
  if (box.dataset.loaded) return;
  box.dataset.loaded = '1';
  const more = async (again) => {
    box.querySelector('.rmore')?.remove(); const ld = document.createElement('div'); ld.className = 'hint'; ld.textContent = 'Loading replies…'; box.appendChild(ld);
    try {
      const r = await api.replies(c.id, again); ld.remove();
      for (const x of r.replies) { const re = renderComment(x, true); box.appendChild(re); fitComment(re); }
      if (r.more) { const b = document.createElement('button'); b.className = 'link rmore'; b.textContent = 'Show more replies'; b.onclick = () => more(true); box.appendChild(b); }
    } catch (e) { ld.textContent = 'Could not load replies: ' + e.message; delete box.dataset.loaded; }
  };
  more(false);
}
function openReplyBox(el, c) {
  if (!signedIn()) return promptLogin('Sign in to reply to comments.');
  const box = el.querySelector('.cm-replybox');
  if (!box.hidden) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<textarea rows="1" placeholder="Reply to ${esc(c.author)}…"></textarea><div class="cacts"><button class="link" data-a="cancel">Cancel</button><button id="cr-post" disabled>Reply</button></div>`;
  const ta = box.querySelector('textarea'), post = box.querySelector('#cr-post'); ta.focus();
  const fit = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; post.disabled = !ta.value.trim(); };
  ta.oninput = fit;
  const send = async () => {
    const text = ta.value.trim(); if (!text) return;
    if (settings.composerConfirm !== false && !confirm(`Post this reply publicly?\n\n${text.slice(0, 300)}`)) return;
    post.disabled = true;
    try {
      await api.commentReply(c.id, text); box.hidden = true; toast('Reply posted');
      const mine = auth.accounts.find((x) => x.id === auth.active);
      const rep = renderComment({ id: 'new-' + Date.now(), author: mine?.name || 'You', authorId: '', avatar: mine?.avatar || '', text, likes: '', liked: false, published: 'just now', isOwner: false, pinned: false, hearted: false, member: false, level: 1 }, true);
      const rbox = el.querySelector('.cm-replies');
      if (rbox) { rbox.hidden = false; rbox.prepend(rep); } else el.querySelector('.cmain').insertBefore(rep, box);
    } catch (e) { toast('Could not post the reply: ' + e.message); post.disabled = false; }
  };
  post.onclick = send;
  ta.onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } };
  box.querySelector('[data-a=cancel]').onclick = () => (box.hidden = true);
}
function updateCommentNote() {
  const n = $('#c-note');
  if (!cState.hidden) { n.innerHTML = ''; return; }
  n.innerHTML = `${cState.hidden} comment${cState.hidden === 1 ? '' : 's'} hidden by your filters. <a>${cState.showHidden ? 'Hide them again' : 'Show them'}</a>`;
  n.querySelector('a').onclick = () => { cState.showHidden = !cState.showHidden; loadComments(cState.id); };
}
async function loadComments(id, more) {
  const list = $('#c-list'), moreBox = $('#c-more');
  if (!more) { cState = { ...cState, id, more: null, hidden: 0, total: cState.id === id ? cState.total : '', shown: 0 }; list.innerHTML = ''; moreBox.innerHTML = ''; }
  if (!more && (settings.commentsAuto === false || perf.data) && !cState.force) {
    moreBox.innerHTML = '<button id="c-load">Show comments</button>'; $('#c-load').onclick = () => { cState.force = true; loadComments(id); }; return;
  }
  moreBox.innerHTML = '<div class="hint">Loading comments…</div>';
  try {
    const r = await api.comments(id, commentSort, more ? cState.more : undefined);
    if (!current || current.id !== id) return;
    cState.more = r.more || null; if (r.total) cState.total = r.total;
    if (!more) cState.hidden = 0;
    for (const c of r.comments) {
      if (commentFiltered(c)) { cState.hidden++; if (!cState.showHidden) continue; }
      const el = renderComment(c, false); list.appendChild(el); fitComment(el); cState.shown++;
    }
    $('#c-title').textContent = 'Comments' + (cState.total ? ' · ' + cState.total : '');
    moreBox.innerHTML = cState.more ? '<button id="c-morebtn">Show more comments</button>' : (cState.shown ? '' : '<div class="hint">No comments to show.</div>');
    if (cState.more) $('#c-morebtn').onclick = () => loadComments(id, true);
    updateCommentNote(); filterComments();
  } catch { moreBox.innerHTML = '<div class="hint">Comments unavailable.</div>'; }
}
function filterComments() {
  const q = ($('#c-find').value || '').trim().toLowerCase();
  for (const el of $('#c-list').querySelectorAll(':scope > .cm')) el.hidden = !!q && !el.textContent.toLowerCase().includes(q);
}
$('#c-find').addEventListener('input', filterComments);
$('#c-sort').onchange = (e) => { commentSort = e.target.value; if (current) loadComments(current.id); };
$('#c-toggle').onclick = () => save({ commentsHidden: !settings.commentsHidden });

// ---------- comments: writing ----------
const COMMENT_MAX = 10000;
const drafts = () => lsGet('commentDrafts', {});
function saveDraft(id, text) {
  if (settings.composerDrafts === false) return;
  const d = drafts(); if (text.trim()) { delete d[id]; d[id] = text; } else delete d[id];
  const keys = Object.keys(d); while (keys.length > 40) delete d[keys.shift()];
  lsSet('commentDrafts', d);
}
let composerSig = '';
function renderComposer() {
  const box = $('#c-compose'), style = settings.composerStyle || 'expand', keep = $('#c-input')?.value || ''; // typed text survives a re-draw
  composerSig = [style, settings.composerSubmit, settings.composerCounter, signedIn(), auth.active].join();
  box.hidden = style === 'hidden'; if (box.hidden) { box.innerHTML = ''; return; }
  const me = auth.accounts.find((x) => x.id === auth.active);
  box.className = 'c-compose ' + (style === 'expand' ? 'collapsed' : 'open');
  box.innerHTML = `${me?.avatar ? `<img class="cav" src="${esc(me.avatar)}">` : `<span class="cav">${ic('user')}</span>`}<div class="cbox"><textarea id="c-input" rows="1" placeholder="${signedIn() ? 'Add a comment…' : 'Sign in to add a comment…'}" spellcheck="true"></textarea>
    <div class="cacts"><span id="c-count" class="hint"></span><span class="sp"></span><button id="c-cancel" class="link">Cancel</button><button id="c-post" disabled>Comment</button></div></div>`;
  const ta = $('#c-input'), post = $('#c-post');
  const fit = () => {
    ta.style.height = 'auto'; ta.style.height = Math.min(220, ta.scrollHeight) + 'px'; ta.style.overflow = ta.scrollHeight > 220 ? 'auto' : 'hidden';
    const n = ta.value.length; post.disabled = !ta.value.trim() || n > COMMENT_MAX;
    const cnt = $('#c-count'); cnt.textContent = settings.composerCounter !== false && n ? `${n.toLocaleString()} / ${COMMENT_MAX.toLocaleString()}` : ''; cnt.classList.toggle('over', n > COMMENT_MAX);
    if (current) saveDraft(current.id, ta.value);
  };
  const draft = current && settings.composerDrafts !== false ? drafts()[current.id] : '';
  const text = keep || draft;
  if (text) { ta.value = text; box.classList.remove('collapsed'); fit(); }
  ta.onfocus = () => box.classList.remove('collapsed');
  ta.oninput = fit;
  ta.onkeydown = (e) => {
    const mode = settings.composerSubmit || 'ctrl';
    if (e.key === 'Enter' && ((mode === 'ctrl' && (e.ctrlKey || e.metaKey)) || (mode === 'enter' && !e.shiftKey))) { e.preventDefault(); postComment(); }
  };
  $('#c-cancel').onclick = () => { ta.value = ''; fit(); if (style === 'expand') box.classList.add('collapsed'); ta.blur(); };
  post.onclick = postComment;
}
async function postComment() {
  const ta = $('#c-input'); const text = (ta?.value || '').trim(); if (!text || !current) return;
  if (!signedIn()) return promptLogin('Sign in to comment.');
  const me = auth.accounts.find((x) => x.id === auth.active);
  if (settings.composerConfirm !== false && !confirm(`Post this comment publicly${me ? ' as ' + me.name : ''}?\n\n${text.slice(0, 400)}${text.length > 400 ? '…' : ''}`)) return;
  const post = $('#c-post'); post.disabled = true;
  try {
    await api.postComment(current.id, text);
    ta.value = ''; saveDraft(current.id, ''); ta.dispatchEvent(new Event('input')); toast('Comment posted');
    if (settings.composerStyle !== 'full') $('#c-compose').classList.add('collapsed');
    if (settings.afterPost !== 'keep') { commentSort = 'NEWEST_FIRST'; $('#c-sort').value = commentSort; cState.force = true; setTimeout(() => current && loadComments(current.id), 2000); }
  } catch (e) { toast('Could not post comment: ' + e.message); post.disabled = false; }
}


// ---------- downloads ----------
// Quick presets in the ⬇ menu; anything not listed here comes from Settings → Downloads.
const DL_PRESETS = [
  ['Video, 2160p (4K)', 'video', { height: 2160 }], ['Video, 1440p', 'video', { height: 1440 }], ['Video, 1080p', 'video', { height: 1080 }], ['Video, 720p', 'video', { height: 720 }], ['Video, 480p', 'video', { height: 480 }],
  ['Audio, MP3 320 kbps', 'audio', { audioFormat: 'mp3', audioQuality: '320' }], ['Audio, MP3 192 kbps', 'audio', { audioFormat: 'mp3', audioQuality: '192' }],
  ['Audio, M4A (AAC)', 'audio', { audioFormat: 'm4a', audioQuality: '0' }], ['Audio, FLAC (lossless)', 'audio', { audioFormat: 'flac' }],
  ['Subtitles only (.srt)', 'subs', {}],
];
async function startDownload(kind, opts, video) {
  const v = video || current;
  if (!v) return;
  const key = v.id, list = lsGet('downloads', []).filter((x) => x.key !== key);
  list.unshift({ key, id: key, title: v.title, kind, state: 'starting', pct: 0 }); lsSet('downloads', list.slice(0, 100));
  try { await api.download(key, kind, opts); toast('Download started. Progress is on the Downloads page.'); }
  catch (e) { const l = lsGet('downloads', []), x = l.find((i) => i.key === key); if (x) { x.state = 'failed'; x.error = e.message; lsSet('downloads', l); } toast('Could not start: ' + e.message); }
}
api.onDownload((p) => {
  const list = lsGet('downloads', []), x = list.find((i) => i.key === p.id);
  if (x) {
    Object.assign(x, { pct: p.pct < 0 ? x.pct : p.pct, item: p.item, total: p.total });
    if (p.file) x.file = p.file;
    x.state = p.done ? (p.cancelled ? 'cancelled' : p.pct === 100 ? 'done' : 'failed') : 'downloading';
    if (p.error) x.error = p.error;
    lsSet('downloads', list);
    const row = [...document.querySelectorAll('.dlrow')].find((e) => e.dataset.key === p.id); if (row) paintDl(row, x);
  }
  if (p.done && !p.cancelled && p.pct === 100) addNotif({ kind: 'download', title: 'Download complete', body: p.id.startsWith('PL:') ? `Playlist: ${p.item} of ${p.total} items` : (x?.title || x?.item || p.id) });
  if (p.id.startsWith('PL:')) {
    const el = $('#pl-progress'), cancel = $('#pl-cancel');
    if (el) el.textContent = p.done ? (p.cancelled ? 'Download cancelled.' : p.pct === 100 ? `Done: ${p.item} of ${p.total} items saved.` : `Finished with errors (${p.item} of ${p.total}).`) : `Item ${p.item || '?'} of ${p.total || '?'} — ${p.pct}%`;
    if (cancel) cancel.hidden = !!p.done;
  }
});

// ---------- DeArrow (community titles + thumbnails; only a 4-character hash prefix of the video ID is sent) ----------
const daCache = new Map();
async function sha256hex(t) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); }
async function daBranding(id) {
  try {
    const p = (await sha256hex(id)).slice(0, 4);
    if (!daCache.has(p)) daCache.set(p, fetch(`https://sponsor.ajay.app/api/branding/${p}`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
    return (await daCache.get(p))[id] || null;
  } catch { return null; }
}
function daPick(b, id) {
  if (!b) return null;
  const ok = (x) => !x.original && (x.votes >= 0 || x.locked);
  const t = (b.titles || []).find(ok), th = (b.thumbnails || []).find((x) => ok(x) && x.timestamp != null);
  return { title: t ? t.title.replace(/(^|\s)>(?=\S)/g, '$1') : null, thumb: th ? `https://dearrow-thumb.ajay.app/api/v1/getThumbnail?videoID=${id}&time=${th.timestamp}` : null };
}
async function applyDeArrow(root, v) {
  if (!settings.dearrow || perf.data || !v.id) return;
  const r = daPick(await daBranding(v.id), v.id); if (!r) return;
  const h = root.querySelector('h3'), img = root.querySelector('img');
  if (r.title && h) { h.title = h.textContent; h.textContent = r.title; }
  if (r.thumb && img) { img.dataset.orig = img.src; img.src = r.thumb; } // falls back to the original if DeArrow's image fails
}

// A thumbnail that fails to load falls back: DeArrow image -> original -> smaller YouTube sizes -> hidden.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.src) return;
  if (img.dataset.orig && img.src !== img.dataset.orig) { img.src = img.dataset.orig; return; }
  const m = /^(.*\/vi\/[\w-]{11}\/)(maxresdefault|sddefault|hqdefault|mqdefault)\.jpg/.exec(img.src);
  if (m && m[2] !== 'mqdefault') { img.src = m[1] + (m[2] === 'hqdefault' ? 'mqdefault' : 'hqdefault') + '.jpg'; return; }
  if (m) { img.src = m[1] + 'default.jpg'; return; }
  img.style.visibility = 'hidden';
}, true);

// ---------- like / dislike (counts from Return YouTube Dislike) ----------
async function loadVotes(id) {
  if (settings.ryd === false || perf.data) return;
  try {
    const r = await fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${id}`); if (!r.ok) return;
    const d = await r.json(); if (current?.id !== id) return;
    $('#r-likes').textContent = fmtNum(d.likes); $('#r-dislikes').textContent = fmtNum(d.dislikes);
  } catch {}
}
function updateRateButtons() {
  const r = current ? lsGet('ratings', {})[current.id] : null;
  $('#r-like').classList.toggle('on', r === 'like'); $('#r-dislike').classList.toggle('on', r === 'dislike');
}
async function rate(kind) {
  if (!current) return;
  if (!signedIn()) return promptLogin('Sign in to like or dislike videos.');
  const all = lsGet('ratings', {}), now = all[current.id] === kind ? 'none' : kind;
  try { await api.rate(current.id, now); } catch (e) { return toast('Rating failed: ' + e.message); }
  if (now === 'none') delete all[current.id]; else all[current.id] = now;
  lsSet('ratings', all); updateRateButtons();
}
$('#r-like').onclick = () => rate('like'); $('#r-dislike').onclick = () => rate('dislike');

// ---------- subtitles (fetched through yt-dlp) ----------
let capTracks = [], capLang = '';
// YouTube's auto captions carry positioning (left-aligned, pinned to the edge) and per-word timing tags that render
// as grey "not yet spoken" text. Strip both so captions are centered and uniform.
function cleanVtt(v) {
  return v.replace(/(-->\s*[\d:.]+)[^\n]*/g, '$1')
    .replace(/<\d{1,2}:\d{2}(?::\d{2})?\.\d{3}>/g, '')
    .replace(/<\/?c(\.[\w-]+)?>/g, '');
}
function setCaptionTrack(vtt) {
  video.querySelectorAll('track').forEach((t) => t.remove());
  if (!vtt) return;
  const t = document.createElement('track');
  t.kind = 'subtitles'; t.label = 'Captions'; t.default = true;
  t.src = URL.createObjectURL(new Blob([cleanVtt(vtt)], { type: 'text/vtt' }));
  t.addEventListener('load', () => { for (const c of t.track.cues || []) { c.snapToLines = true; c.line = 'auto'; c.position = 'auto'; c.size = 100; c.align = 'center'; } });
  video.appendChild(t); t.track.mode = 'showing';
}
// Applies the caption list (it arrives with the video details) and turns the preferred one on.
function setCaptionTracks(list) {
  let l = list || [];
  if (settings.subAllowAuto === false) l = l.filter((t) => !t.auto);
  capTracks = l; allCapTracks = list || []; renderToolbar(); paintRc();
  const want = (settings.subLang || '').toLowerCase();
  const pref = want && (l.find((x) => x.lang.toLowerCase() === want && !x.auto) || l.find((x) => x.lang.toLowerCase() === want) || l.find((x) => x.lang.toLowerCase().startsWith(want)));
  if (settings.subDefaultOn && pref) chooseCaption(pref.lang + (pref.auto ? '|a' : '|m'));
}
async function loadCaptionList(id) {
  try { const l = await api.subsList(id); if (current?.id === id) setCaptionTracks(l); } catch {}
}
async function chooseCaption(val) {
  if (!val) { capLang = ''; setCaptionTrack(null); renderToolbar(); return; }
  const [lang, kind] = val.split('|'); capLang = val; renderToolbar();
  try { setCaptionTrack(await api.subsGet(current.id, lang, kind === 'a')); }
  catch (e) { capLang = ''; renderToolbar(); toast('Captions unavailable: ' + e.message); }
}

// ---------- accounts ----------
async function refreshAuth() { try { auth = await api.authStatus(); } catch {} updateAuthUI(); }
function updateAuthUI() {
  const a = auth.accounts.find((x) => x.id === auth.active), b = $('#acct-btn');
  b.innerHTML = a?.avatar ? `<img src="${esc(a.avatar)}">` : ic('user');
  b.title = a ? a.name : 'Sign in';
}
async function onAccountChanged() {
  lsSet('subcache', { ts: 0, videos: [] }); remoteSubs = null;
  await refreshAuth(); ytProg = {}; syncProgress(); if (current) renderComposer();
  if (signedIn()) fetchSubs().then(renderSideSubs).catch(() => {});
  renderSideSubs();
  if (view === 'subs') showSubs(true); else if (view === 'playlists') showPlaylists(); else goHome();
}
function startLogin(note) {
  $('#login').hidden = false;
  $('#login-body').innerHTML = `${note ? `<p>${esc(note)}</p>` : ''}<p>Requesting a sign-in code…</p>`;
  api.authBegin().catch((e) => ($('#login-body').textContent = 'Could not start sign-in: ' + e.message));
}
function promptLogin(msg) { toast(msg); startLogin(msg); }
$('#login-cancel').onclick = () => { api.authCancel(); $('#login').hidden = true; };
api.onAuth((m) => {
  if (m.state === 'pending') {
    $('#login-body').innerHTML = `<p>1. Open <a data-url="${esc(m.url)}">${esc(m.url)}</a> on any device.</p><p>2. Enter this code:</p><div class="code">${esc(m.code)}</div>
      <p><button id="login-open">Open the page</button></p><p class="hint">Google's own page handles your password and two-factor prompt. This app only receives a sign-in token, which stays on this computer.</p><p class="hint">Waiting for you to approve…</p>`;
    $('#login-open').onclick = () => api.openExternal(m.url);
  } else if (m.state === 'error') {
    $('#login-body').innerHTML = `<p>Sign-in failed: ${esc(m.error)}</p><p><button id="login-retry">Try again</button></p>`;
    $('#login-retry').onclick = () => startLogin();
  } else if (m.state === 'update') {
    auth = m; updateAuthUI();
  } else if (m.state === 'done') {
    $('#login').hidden = true; auth = m; onAccountChanged();
  }
});
async function buildAcctMenu() {
  const m = $('#acct-menu'); m.innerHTML = '';
  const row = (html, fn, cls = '') => { const d = document.createElement('div'); d.className = 'prow ' + cls; d.innerHTML = html; d.onclick = fn; m.appendChild(d); return d; };
  if (auth.accounts.length) m.insertAdjacentHTML('beforeend', '<h4>Accounts</h4>');
  for (const a of auth.accounts) {
    row(`${a.avatar ? `<img src="${esc(a.avatar)}">` : '<img>'}<span class="t">${esc(a.name)}<small>${a.id === auth.active ? 'Signed in' : 'Switch to this account'}${a.channel ? ' • ' + esc(a.channel) : ''}</small></span>${a.id === auth.active ? '✓' : ''}`,
      async () => { if (a.id !== auth.active) { await api.authSwitch(a.id); m.hidden = true; onAccountChanged(); } }, a.id === auth.active ? 'sel' : '');
  }
  row('<span class="t">Add another account</span>', () => { m.hidden = true; startLogin(); });
  if (signedIn()) {
    const chHead = document.createElement('h4'); chHead.textContent = 'Channels on this account'; m.appendChild(chHead);
    const holder = document.createElement('div'); holder.innerHTML = '<div class="hint">Loading…</div>'; m.appendChild(holder);
    api.authChannels().then((chs) => {
      holder.innerHTML = '';
      if (!chs.length) holder.innerHTML = '<div class="hint">No other channels found.</div>';
      for (const c of chs) {
        const d = document.createElement('div'); d.className = 'prow' + (c.selected ? ' sel' : '');
        d.innerHTML = `${c.avatar ? `<img src="${esc(c.avatar)}">` : '<img>'}<span class="t">${esc(c.name)}<small>${esc(c.handle)}</small></span>${c.selected ? '✓' : ''}`;
        d.onclick = async () => { if (c.selected) return; await api.authSetChannel(c.token || null, c.name); m.hidden = true; onAccountChanged(); };
        holder.appendChild(d);
      }
    }).catch((e) => (holder.innerHTML = `<div class="hint">Could not load channels: ${esc(e.message)}</div>`));
    row('<span class="t">Sign out of this account</span>', async () => { await api.authRemove(auth.active); m.hidden = true; onAccountChanged(); });
  }
  if (auth.accounts.length && !auth.encrypted) m.insertAdjacentHTML('beforeend', '<div class="hint">No system keyring was found, so sign-in tokens are stored unencrypted in this app\'s data folder (readable only by you).</div>');
}
$('#acct-btn').onclick = () => { const m = $('#acct-menu'); if (!m.hidden) { m.hidden = true; return; } if (!signedIn() && !auth.accounts.length) return startLogin(); m.hidden = false; buildAcctMenu(); };

// ---------- SponsorBlock ----------
async function loadSegments(id) {
  segments = [];
  if (!settings.sponsorblock) return;
  try {
    const on = SB_CATS.map(([k]) => k).filter((k) => settings['sbc_' + k]);
    if (!on.length) return;
    const cats = encodeURIComponent(JSON.stringify(on));
    const r = await fetch(`https://sponsor.ajay.app/api/skipSegments?videoID=${id}&categories=${cats}`);
    if (r.ok) segments = (await r.json()).map((s) => ({ a: s.segment[0], b: s.segment[1], cat: s.category }));
  } catch {}
}
let lastSave = 0;
function saveProgress(done) {
  if (!current || !video.duration || !isFinite(video.duration)) return;
  const p = lsGet('progress', {}); p[current.id] = { t: done ? video.duration : video.currentTime, pct: done ? 100 : (video.currentTime / video.duration) * 100 }; lsSet('progress', p);
  // A video you only started keeps its red progress bar; it counts as watched (hidden from Subscriptions) once you pass the chosen share (Settings, Playback).
  if (!settings.pauseHistory && p[current.id].pct >= (+settings.watchedAt || 50) && !isWatched(current.id)) setWatched(current.id, true);
}
video.addEventListener('pause', () => { if (video.currentSrc) saveProgress(); }); // keep the bar accurate when you stop, not just every few seconds
video.addEventListener('timeupdate', () => {
  if (settings.sponsorblock) {
    for (const s of segments) {
      if (video.currentTime >= s.a && video.currentTime < s.b - 0.3 && Date.now() - lastSkip > 800) {
        lastSkip = Date.now(); video.currentTime = s.b;
        const t = $('#sb-toast'); t.textContent = `Skipped ${s.cat}`; t.hidden = false; setTimeout(() => (t.hidden = true), 2500);
        break;
      }
    }
  }
  if (current && video.duration) {
    const now = Date.now();
    if (now - lastSave > 4000) {
      lastSave = now;
      saveProgress();
    }
  }
  api.sendState({ src: video.currentSrc, audio: audioActive ? audio.currentSrc : null, time: video.currentTime, playing: !video.paused });
});
// If the stream drops (an expired link, a network change), fetch a fresh one once and carry on from the same spot.
let streamRetries = 0;
video.addEventListener('error', () => {
  if (!current || !video.currentSrc) return;
  mlog('video element error', video.error ? video.error.code : '?');
  reconnect('video error');
});
video.addEventListener('ended', () => {
  saveProgress(true); if (sleepEnding) return fireSleep();
  if (video.loop) return;
  if (!awayNow() && showEndScreen()) return;
  playNext();
});
// The main process needs to know whether something is playing (for the mini player's open-on-minimize option).
for (const ev of ['play', 'pause']) video.addEventListener(ev, () => api.sendState({ src: video.currentSrc, audio: audioActive ? audio.currentSrc : null, time: video.currentTime, playing: !video.paused }));
// Autoplay: 'endless' keeps going into the suggested videos, 'queue' only moves on through your queue or the playlist you are in, 'off' never does.
let playlistCtx = null;
const autoMode = () => settings.autoplayMode || 'endless';
const AUTO_MODES = [['endless', 'Endless', 'Keep playing suggested videos'], ['queue', 'Queue or playlist only', 'Only play on when there is a queue or a playlist'], ['off', 'Off', 'Stop after each video']];
const autoAllows = (kind) => autoMode() === 'endless' || (autoMode() === 'queue' && kind !== 'related');
function nextVideo() {
  if (userQueue.length) return { v: userQueue[0], kind: 'queue' };
  if (playlistCtx) { const i = playlistCtx.findIndex((x) => x.id === current?.id); if (i >= 0 && playlistCtx[i + 1]) return { v: playlistCtx[i + 1], kind: 'playlist' }; }
  const r = relatedVids.find((x) => x.id !== current?.id && !x.isShort);
  return r ? { v: r, kind: 'related' } : null;
}
function playNext(manual) {
  const n = nextVideo();
  if (!n || (!manual && !autoAllows(n.kind))) { if (!manual) notify('queue', 'Finished', n ? 'The queue or playlist is done.' : 'Nothing left to play.'); return; }
  if (n.kind === 'queue') userQueue.shift();
  openVideo(n.v, { replace: true, stay: awayNow(), ...(n.kind === 'related' ? {} : { keep: true }) }); // from the floating player the next one stays there
}

// ---------- media keys / tray / mini ----------
api.onMedia((c) => {
  if (c === 'toggle') video.paused ? video.play() : video.pause();
  else if (c === 'next') playNext(true);
  else if (c === 'prev') video.currentTime = 0;
  else if (c === 'mini-closed') { video.play().catch(() => {}); }
  else if (c === 'mini-ready') api.sendState({ src: video.currentSrc, audio: audioActive ? audio.currentSrc : null, time: video.currentTime, play: true }), video.pause();
  else if (c.startsWith('mini-time:')) video.currentTime = parseFloat(c.slice(10)) || video.currentTime;
});
if (navigator.mediaSession) {
  navigator.mediaSession.setActionHandler('nexttrack', playNext);
  navigator.mediaSession.setActionHandler('previoustrack', () => (video.currentTime = 0));
}

// ---------- in-player settings menu (quality, speed, subtitles, sleep timer, buffer) ----------
const SLEEP_OPTS = [['0', 'Off'], ['15', '15 minutes'], ['30', '30 minutes'], ['45', '45 minutes'], ['60', '1 hour'], ['90', '1.5 hours'], ['120', '2 hours'], ['end', 'End of this video']];
const BUFFER_OPTS = [['15', '15 seconds'], ['30', '30 seconds'], ['60', '1 minute'], ['120', '2 minutes'], ['180', '3 minutes'], ['300', '5 minutes'], ['600', '10 minutes'], ['1200', '20 minutes'], ['1800', '30 minutes']];
let sleepEnd = 0, sleepEnding = false, sleepTimer = null, sleepVol = null, sleepShown = -1;
function sleepLabel() { return sleepEnding ? 'End of video' : sleepEnd ? Math.ceil((sleepEnd - Date.now()) / 60000) + ' min left' : 'Off'; }
function restoreSleepVolume() { if (sleepVol != null) { video.volume = sleepVol; sleepVol = null; } }
function clearSleep() { clearInterval(sleepTimer); sleepTimer = null; sleepEnd = 0; sleepEnding = false; sleepShown = -1; }
function setSleep(v) {
  clearSleep(); restoreSleepVolume();
  if (v === 'end') { sleepEnding = true; toast('Sleep timer: stops when this video ends'); }
  else if (+v > 0) { sleepEnd = Date.now() + +v * 60000; sleepTimer = setInterval(sleepTick, 1000); toast(`Sleep timer set for ${v} minutes`); }
  else toast('Sleep timer off');
  renderToolbar(); if (!$('#p-menu').hidden) renderPMenu();
}
function fireSleep() {
  clearSleep(); video.pause(); restoreSleepVolume(); renderToolbar();
  toast('Sleep timer: paused');
  notify('sleep', 'Sleep timer', 'Playback paused.');
  if (settings.sleepAction === 'quit') api.quit();
}
function sleepTick() {
  const left = sleepEnd - Date.now(), fade = (+settings.sleepFade || 0) * 1000;
  if (fade && left > 0 && left < fade) { if (sleepVol == null) sleepVol = video.volume; video.volume = Math.max(0, sleepVol * (left / fade)); }
  if (left <= 0) return fireSleep();
  const m = Math.ceil(left / 60000);
  if (m !== sleepShown) { sleepShown = m; renderToolbar(); }
}
let pmPage = 'main';
const optLabel = (opts, v) => (opts.find(([k]) => String(k) === String(v)) || [0, v])[1];
function pmRows() {
  return {
    autoplay: { title: 'Autoplay', value: () => AUTO_MODES.find(([k]) => k === autoMode())[1], opts: () => AUTO_MODES.map(([k, l]) => [k, l]), cur: () => autoMode(), pick: (v) => save({ autoplayMode: v }).then(() => { paintAuto(); renderUpNext(); }) },
    stable: { title: 'Stable audio', value: () => ({ off: 'Off', levels: 'Even loudness', compress: 'Even + squeeze' })[settings.stableAudio || 'off'], opts: () => [['off', 'Off'], ['levels', 'Even out loudness between videos'], ['compress', 'Also even out loud and quiet parts']], cur: () => settings.stableAudio || 'off', pick: (v) => save({ stableAudio: v }) },
    ...(chapters.length ? { chapters: { title: 'Chapters', value: () => chapters[chapAt(video.currentTime || 0)]?.title || '', opts: () => chapters.map((c, i) => [String(i), c.title + '   ' + fmtDur(c.t)]), cur: () => String(chapAt(video.currentTime || 0)), pick: (v) => { video.currentTime = chapters[+v].t; video.play().catch(() => {}); } } } : {}),
    quality: { title: 'Quality', value: () => optLabel(RES, settings.quality || 'auto'), opts: () => RES, cur: () => settings.quality || 'auto', pick: (v) => TOOLS.quality.change(v) },
    speed: { title: 'Speed', value: () => speed + 'x', opts: () => TOOLS.speed.select, cur: () => String(speed), pick: (v) => setSpeed(parseFloat(v)) },
    captions: { title: 'Subtitles', value: () => (capLang ? optLabel(TOOLS.captions.select(), capLang) : capTracks.length ? 'Off' : 'None'), opts: () => TOOLS.captions.select(), cur: () => capLang, pick: (v) => chooseCaption(v), footer: ['Subtitle settings…', () => { sTab = 'subtitles'; openSettings(); }] },
    sleep: { title: 'Sleep timer', value: sleepLabel, opts: () => SLEEP_OPTS, cur: () => (sleepEnding ? 'end' : sleepEnd ? '' : '0'), pick: (v) => setSleep(v) },
    buffer: { title: 'Buffer', value: () => (settings.bufferProxy === false ? 'Browser default' : optLabel(BUFFER_OPTS, settings.bufferSeconds || 180)), opts: () => BUFFER_OPTS, cur: () => String(settings.bufferSeconds || 180), pick: (v) => save({ bufferSeconds: +v, bufferProxy: true }) },
  };
}
// Everything you can do to the video lives in this menu (the three dots on the player).
const MENU_DEFAULT = ['loop', 'theater', 'pip', 'mini', 'watchlater', 'saveplaylist', 'dlmenu', 'audioonly', 'copylink', 'copytime', 'openweb', 'next'];
const MENU_CHOICES = ['loop', 'theater', 'pip', 'mini', 'watchlater', 'saveplaylist', 'subscribe', 'dlvideo', 'dlaudio', 'dlmenu', 'copylink', 'copytime', 'openweb', 'back10', 'fwd10', 'next', 'mute', 'audioonly'];
const menuIds = () => (Array.isArray(settings.menuActions) ? settings.menuActions : MENU_DEFAULT).filter((id) => TOOLS[id]);
const PM_ICON = { stable: 'vol', autoplay: 'next', chapters: 'list', quality: 'sliders', speed: 'forward', captions: 'cc', sleep: 'moon', buffer: 'list' };
const PAGE_ACTIONS = new Set(['dlmenu', 'saveplaylist']);
const TOGGLE_ACTIONS = new Set(['loop', 'theater', 'watchlater', 'audioonly', 'mute', 'subscribe']);
const closeP = () => { $('#p-menu').hidden = true; $('#p-gear').classList.remove('open'); pmPage = 'main'; };
function actionLabel(id) {
  const t = TOOLS[id];
  if (id === 'watchlater') return t.on?.() ? 'Remove from Watch later' : 'Save to Watch later';
  if (id === 'subscribe') return t.on?.() ? 'Unsubscribe' : 'Subscribe';
  if (id === 'dlmenu') return 'Download';
  if (id === 'dlvideo') return 'Download video';
  if (id === 'dlaudio') return 'Download audio';
  return t.label.replace(/\s*\(.*\)/, '');
}
function renderPMenu() {
  const m = $('#p-menu'), rows = pmRows(); m.innerHTML = '';
  const row = (html, fn, cls = '') => { const d = document.createElement('div'); d.className = 'pr ' + cls; d.innerHTML = html; d.onclick = (e) => { e.stopPropagation(); fn(); }; m.appendChild(d); return d; };
  const sep = () => m.insertAdjacentHTML('beforeend', '<div class="psep"></div>');
  const head = (title) => row(`${ic('chevleft')}${esc(title)}`, () => { pmPage = 'main'; renderPMenu(); }, 'head');
  if (pmPage === 'main') {
    for (const id of menuIds()) {
      const t = TOOLS[id]; if (t.select) continue;
      const on = TOGGLE_ACTIONS.has(id) && !['watchlater', 'subscribe'].includes(id) && t.on?.();
      row(`${ic(t.icon)}<span class="lb">${esc(actionLabel(id))}</span>${PAGE_ACTIONS.has(id) ? `<span class="v">${ic('chevright')}</span>` : on ? `<span class="v">${ic('check')}</span>` : ''}`, async () => {
        if (PAGE_ACTIONS.has(id)) { pmPage = id === 'dlmenu' ? 'download' : 'saveplaylist'; return renderPMenu(); }
        const wasOn = id === 'watchlater' ? t.on?.() : null;
        await Promise.resolve(t.run());
        if (id === 'watchlater') toast(wasOn ? 'Removed from Watch later' : 'Saved to Watch later');
        if (id === 'copylink' || id === 'copytime') toast('Link copied');
        if (TOGGLE_ACTIONS.has(id)) renderPMenu(); else closeP();
      });
    }
    if (menuIds().length) sep();
    for (const [k, r] of Object.entries(rows)) row(`${ic(PM_ICON[k] || 'sliders')}<span class="lb">${esc(r.title)}</span><span class="v">${esc(r.value())}${ic('chevright')}</span>`, () => { pmPage = k; renderPMenu(); });
    sep();
    row(`${ic('edit')}<span class="lb">Customize this menu</span>`, () => { pmPage = 'customize'; renderPMenu(); });
    return;
  }
  if (pmPage === 'download') {
    head('Download');
    for (const [label, kind, opts] of [['Video (your settings)', 'video'], ['Audio (your settings)', 'audio'], ...DL_PRESETS]) row(`<span class="lb">${esc(label)}</span>`, () => { startDownload(kind, opts); closeP(); });
    return;
  }
  if (pmPage === 'saveplaylist') {
    head('Save to playlist');
    if (!signedIn()) { row('<span class="lb">Sign in to save to your playlists</span>', () => { closeP(); promptLogin('Sign in to save videos to your playlists.'); }); return; }
    const slot = row('<span class="lb">Loading…</span>', () => {});
    api.mePlaylists().then((pls) => {
      if (pmPage !== 'saveplaylist') return; slot.remove();
      const own = pls.filter((p) => !['WL', 'LL'].includes(p.id)).slice(0, 80);
      if (!own.length) return row('<span class="lb">You have no playlists to save to.</span>', () => {});
      for (const p of own) row(`<span class="lb">${esc(p.title)}</span>`, async () => { closeP(); try { await api.addToPlaylist(p.id, current.id); toast('Saved to ' + p.title); } catch (e) { toast('Could not save: ' + e.message); } });
    }).catch((e) => { slot.innerHTML = `<span class="lb">Could not load playlists: ${esc(e.message)}</span>`; });
    return;
  }
  if (pmPage === 'customize') {
    head('Customize menu');
    const cur = new Set(menuIds());
    for (const id of MENU_CHOICES) row(`<span class="ck">${cur.has(id) ? ic('check') : ''}</span>${ic(TOOLS[id].icon)}<span class="lb">${esc(TOOLS[id].label.replace(/\s*\(.*\)/, ''))}</span>`, async () => {
      await save({ menuActions: MENU_CHOICES.filter((x) => (x === id ? !cur.has(id) : cur.has(x))) }); renderPMenu();
    });
    sep();
    row('<span class="lb">Reset to default</span>', async () => { await save({ menuActions: null }); renderPMenu(); });
    return;
  }
  const r = rows[pmPage];
  head(r.title);
  const cur = String(r.cur());
  for (const [v, l] of r.opts()) row(`<span class="ck">${String(v) === cur ? ic('check') : ''}</span>${esc(l)}`, () => { Promise.resolve(r.pick(v)); closeP(); });
  if (r.footer) row(esc(r.footer[0]), () => { closeP(); r.footer[1](); });
}
$('#p-gear').onclick = (e) => {
  e.stopPropagation(); const m = $('#p-menu'); m.hidden = !m.hidden;
  $('#p-gear').classList.toggle('open', !m.hidden);
  if (!m.hidden) { pmPage = 'main'; renderPMenu(); }
};

// ---------- sidebar: drag to resize, auto-hide while watching ----------
function syncSideAuto() {
  const on = settings.sidebarAutoHide === 'watch' && !$('#watch').hidden;
  document.body.classList.toggle('side-auto', on);
  if (!on) document.body.classList.remove('side-peek');
}
$('#side-resizer').addEventListener('mousedown', (e) => {
  e.preventDefault(); const rz = $('#side-resizer'); rz.classList.add('drag'); let w = 0;
  const move = (ev) => { w = Math.round(Math.min(420, Math.max(150, ev.clientX))); document.documentElement.style.setProperty('--side-w', w + 'px'); };
  const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); rz.classList.remove('drag'); if (w) save({ sidebarWidth: w }); };
  document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
});

// ---------- right-click menus ----------
const ytUrl = (id) => `https://www.youtube.com/watch?v=${id}`;
document.addEventListener('contextmenu', async (e) => {
  const t = e.target;
  const card = t.closest?.('.card, .subrow, .plrow, .lrow, .vrow'), vidEl = t.closest?.('video'), link = t.closest?.('a[data-url]');
  const items = [], run = {}, add = (id, label, fn, extra) => { items.push({ id, label, ...extra }); run[id] = fn; }, sep = () => items.length && items[items.length - 1].type !== 'separator' && items.push({ type: 'separator' });
  if (card?._v) {
    const m = videoMenu(card._v, card); items.push(...m.items); Object.assign(run, m.run);
  } else if (card?._pl) {
    const p = card._pl;
    add('open', 'Open playlist', () => openPlaylist(p.id));
    sep();
    add('dlv', 'Download all (video)', () => startPlaylistDownload(p.id, p.title, 'video').then(() => toast('Playlist download started')));
    add('dla', 'Download all (MP3)', () => startPlaylistDownload(p.id, p.title, 'audio').then(() => toast('Playlist download started')));
    sep();
    add('copy', 'Copy link', () => api.copy(`https://www.youtube.com/playlist?list=${p.id}`));
    add('web', 'Open on youtube.com', () => api.openExternal(`https://www.youtube.com/playlist?list=${p.id}`));
  } else if (vidEl && current) {
    add('pp', video.paused ? 'Play' : 'Pause', () => (video.paused ? video.play() : video.pause()));
    add('loop', 'Loop', () => { video.loop = !video.loop; renderToolbar(); }, { checked: video.loop });
    add('theater', 'Theater mode', () => save({ theater: !settings.theater }), { checked: !!settings.theater });
    add('pip', 'Picture in picture', () => TOOLS.pip.run());
    add('mini', 'Mini player', () => api.mini(true));
    sep();
    add('copy', 'Copy video link', () => api.copy(ytUrl(current.id)));
    add('copyt', 'Copy link at current time', () => api.copy(`${ytUrl(current.id)}&t=${Math.floor(video.currentTime)}`));
    add('web', 'Open on youtube.com', () => api.openExternal(ytUrl(current.id)));
    sep();
    add('dlv', 'Download video', () => startDownload('video'));
    add('dla', 'Download audio', () => startDownload('audio'));
  } else if (link) {
    add('open', 'Open link', () => api.openExternal(link.dataset.url));
    add('copy', 'Copy link address', () => api.copy(link.dataset.url));
  } else return; // text fields and selections get the standard edit menu from the main process
  e.preventDefault();
  while (items.length && items[items.length - 1].type === 'separator') items.pop();
  const picked = await api.contextMenu(items);
  if (picked) await run[picked]?.();
});

// ---------- end screen: suggested videos when a video finishes ----------
let esTimer = null, relatedVids = [];
function hideEndScreen() { clearInterval(esTimer); esTimer = null; const es = $('#end-screen'); es.hidden = true; es.innerHTML = ''; }
// What would play next: your queue, then the rest of the playlist/list you came from, then related videos.
function endCandidates() {
  const out = [], seen = new Set([current?.id]);
  const add = (v) => { if (v && v.id && !seen.has(v.id) && !v.isShort) { seen.add(v.id); out.push(v); } };
  userQueue.forEach(add);
  if (playlistCtx) { const i = playlistCtx.findIndex((x) => x.id === current?.id); (i >= 0 ? playlistCtx.slice(i + 1) : []).forEach(add); }
  relatedVids.forEach(add);
  return out;
}
const END_GRIDS = [['3x1', '3 × 1'], ['2x2', '2 × 2'], ['3x3', '3 × 3'], ['4x4', '4 × 4']];
let esList = [];
const endGridSize = () => { const [c, r] = String(settings.endGrid || '3x1').split('x').map(Number); return [c || 3, r || 1]; };
// Lays out the suggestions as columns x rows; the cards scale to whatever size the player is (see the .es-grid styles).
function paintEndGrid() {
  const g = $('#end-screen .es-grid'); if (!g) return;
  const [cols, rowsMax] = endGridSize(), shown = esList.slice(0, cols * rowsMax), rows = Math.max(1, Math.min(rowsMax, Math.ceil(shown.length / cols)));
  g.style.setProperty('--n', cols); g.style.setProperty('--r', rows); g.innerHTML = '';
  for (const v of shown) {
    const el = card(v, { queue: esList });
    el.addEventListener('click', () => { userQueue = userQueue.filter((x) => x.id !== v.id); }, true); // a queued video leaves the queue when you pick it
    g.appendChild(el);
  }
  $('#end-screen').querySelectorAll('.es-size button').forEach((b) => b.classList.toggle('on', b.dataset.g === (settings.endGrid || '3x1')));
}
function showEndScreen() {
  if (settings.endScreen === false) return false;
  const list = endCandidates(); if (!list.length) return false;
  esList = list;
  const es = $('#end-screen'), nx = nextVideo(), auto = !!nx && autoAllows(nx.kind), delay = Math.max(2, +settings.autoplayDelay || 8);
  es.innerHTML = `<div class="es-top"><div class="es-title">Up next</div>
      <div class="es-size" title="How many suggestions to show">${END_GRIDS.map(([k, l]) => `<button data-g="${k}">${l}</button>`).join('')}</div>
      <button id="es-replay">${ic('repeat')}Replay</button><button id="es-close" title="Close">${ic('x')}</button></div>
    ${auto ? `<div class="es-count"><span class="t">Playing <b>${esc(nx.v.title)}</b> in <b id="es-n">${delay}</b>s</span><button id="es-cancel">Cancel</button></div>` : ''}
    <div class="es-grid"></div>`;
  es.hidden = false; paintEndGrid();
  es.querySelectorAll('.es-size button').forEach((b) => (b.onclick = async () => { await save({ endGrid: b.dataset.g }); paintEndGrid(); }));
  $('#es-replay').onclick = () => { hideEndScreen(); video.currentTime = 0; video.play().catch(() => {}); };
  $('#es-close').onclick = hideEndScreen;
  if (auto) {
    let n = delay;
    const stop = () => { clearInterval(esTimer); esTimer = null; es.querySelector('.es-count')?.remove(); };
    $('#es-cancel').onclick = stop;
    esTimer = setInterval(() => { n--; const el = $('#es-n'); if (el) el.textContent = n; if (n <= 0) { hideEndScreen(); playNext(); } }, 1000);
  }
  return true;
}
video.addEventListener('play', hideEndScreen); // replaying (or pressing play) clears it
// Seeking back (dragging the seek bar, an arrow key) also clears it, so the picture is visible and the countdown to the next video stops.
video.addEventListener('seeking', () => { if (!$('#end-screen').hidden && video.currentTime < (video.duration || 0) - 1) hideEndScreen(); });

// ---------- chapters (from timestamps in the description) ----------
let chapters = [], chapOpen = false;
function parseChapters(desc) {
  const out = [];
  for (const line of String(desc || '').split('\n')) {
    const m = /^\s*(?:[-•▪▸►]\s*)?((?:\d{1,2}:)?\d{1,2}:\d{2})\s*[-–—:|]?\s*(.+?)\s*$/.exec(line);
    if (m) out.push({ t: tsToSec(m[1]), title: m[2] });
  }
  // YouTube's own rules: at least three chapters, the first at 0:00, each at least ten seconds long.
  if (out.length < 3 || out[0].t !== 0) return [];
  for (let i = 1; i < out.length; i++) if (out[i].t - out[i - 1].t < 10) return [];
  return out;
}
const chapAt = (t) => { let k = 0; chapters.forEach((c, i) => { if (t >= c.t) k = i; }); return k; };
function paintChapters() {
  const box = $('#w-chapters'), k = chapAt(video.currentTime || 0);
  box.innerHTML = `<div class="ch-top"><b>Chapters</b><span class="cur">${esc(chapters[k].title)}</span><span>${chapters.length}</span>${ic(chapOpen ? 'chevup' : 'chevdown')}</div>${chapOpen ? `<div class="ch-list">${chapters.map((c, i) => `<div class="ch-item${i === k ? ' on' : ''}" data-t="${c.t}"><span class="tm">${fmtDur(c.t)}</span><span>${esc(c.title)}</span></div>`).join('')}</div>` : ''}`;
  box.querySelector('.ch-top').onclick = () => { chapOpen = !chapOpen; paintChapters(); };
  box.querySelectorAll('.ch-item').forEach((el) => (el.onclick = () => { video.currentTime = +el.dataset.t; video.play().catch(() => {}); }));
}
let lastChap = -1;
video.addEventListener('timeupdate', () => { if (!chapters.length || $('#w-chapters').hidden) return; const k = chapAt(video.currentTime); if (k !== lastChap) { lastChap = k; paintChapters(); } });

// ---------- custom player controls (themeable) ----------
const pbox = $('#player-box'), pbarEl = $('#pbar'), pseek = $('#pseek');
const vdur = () => (isFinite(video.duration) ? video.duration : 0);
const PTHEMES = ['modern', 'youtube', 'classic', 'glass', 'minimal', 'amoled', 'light'];
function applyPlayerTheme() {
  for (const t of PTHEMES) pbox.classList.toggle('pt-' + t, (settings.playerTheme || 'modern') === t && t !== 'youtube');
  if (settings.playerAccentOn && /^#[0-9a-f]{6}$/i.test(settings.playerAccent || '')) pbox.style.setProperty('--pb-accent', settings.playerAccent);
  else pbox.style.removeProperty('--pb-accent');
  pbarEl.classList.toggle('q-right', settings.pbSide === 'right');
}
let marksSig = '';
function paintMarks() {
  const d = vdur(), sig = d + '|' + segments.length + '|' + chapters.length + '|' + (settings.sponsorblock ? 1 : 0);
  if (sig === marksSig) return; marksSig = sig;
  const box = pseek.querySelector('.pmarks'); box.innerHTML = '';
  if (!d) return;
  if (settings.sponsorblock) for (const g of segments) box.insertAdjacentHTML('beforeend', `<i title="${esc(g.cat)}" style="left:${(g.a / d) * 100}%;width:${Math.max(0.3, ((g.b - g.a) / d) * 100)}%"></i>`);
  // chapter breaks: cut small gaps into the track itself, like YouTube
  const cuts = chapters.filter((c) => c.t > 0 && c.t < d).map((c) => (c.t / d) * 100), t = pseek.querySelector('.pt');
  if (cuts.length) { const m = `linear-gradient(to right, #000 0, ${cuts.map((p) => `#000 calc(${p}% - 1.5px), transparent calc(${p}% - 1.5px), transparent calc(${p}% + 1.5px), #000 calc(${p}% + 1.5px)`).join(', ')}, #000 100%)`; t.style.webkitMaskImage = m; t.style.maskImage = m; } else { t.style.webkitMaskImage = ''; t.style.maskImage = ''; }
}
const hdTag = () => { const h = video.videoHeight || 0; return h >= 2160 ? '4K' : h >= 1440 ? '2K' : h >= 720 ? 'HD' : ''; };
let autoKey = '';
function paintAuto() {
  const b = $('#pc-auto'), m = autoMode(), key = m + '|' + settings.pbAutoplay; if (key === autoKey) return; autoKey = key; b.hidden = settings.pbAutoplay === false;
  b.classList.toggle('on', m !== 'off'); b.title = `Autoplay: ${AUTO_MODES.find(([k]) => k === m)[1]} (click to turn ${m === 'off' ? 'on' : 'off'}, right-click for more)`;
  b.querySelector('.kn').innerHTML = ic(m === 'off' ? 'pause' : m === 'queue' ? 'list' : 'play');
}
$('#pc-auto').onclick = () => { const m = autoMode(); if (m !== 'off') localStorage.setItem('autoLast', m); save({ autoplayMode: m === 'off' ? (localStorage.getItem('autoLast') || 'endless') : 'off' }).then(() => { paintAuto(); renderUpNext(); }); };
$('#pc-auto').addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); popMenu(menuOf(AUTO_MODES.map(([k, l, d]) => [(autoMode() === k ? '✓ ' : '') + l + ' — ' + d, () => save({ autoplayMode: k }).then(() => { paintAuto(); renderUpNext(); })]))); });
// The bar repaints a few times a second while playing, so it only touches the page when a value actually changed.
const pbEls = { play: $('#pc-play'), mute: $('#pc-mute'), vol: $('#pc-vol'), fs: $('#pc-fs'), time: $('#pc-time'), fill: pseek.querySelector('.pplay'), knob: pseek.querySelector('.pknob'), buf: pseek.querySelector('.pbuf') };
const pbLast = {};
const setIf = (k, val, fn) => { if (pbLast[k] !== val) { pbLast[k] = val; fn(val); } };
function paintBar() {
  const d = vdur(), t = video.currentTime || 0, pct = d ? Math.round((t / d) * 10000) / 100 : 0;
  if (!scrubbing) setIf('fill', pct, (v) => (pbEls.fill.style.width = v + '%'));
  setIf('knob', pct, (v) => (pbEls.knob.style.left = v + '%'));
  let be = 0; for (let i = 0; i < video.buffered.length; i++) if (video.buffered.start(i) <= t + 0.5) be = Math.max(be, video.buffered.end(i));
  setIf('buf', d ? Math.min(100, Math.round((be / d) * 1000) / 10) : 0, (v) => (pbEls.buf.style.width = v + '%'));
  setIf('time', `${fmtDur(t)} / ${fmtDur(d)}`, (v) => (pbEls.time.textContent = v));
  setIf('play', video.paused, (p) => (pbEls.play.innerHTML = ic(p ? 'play' : 'pause')));
  const vol = video.muted ? 0 : video.volume;
  setIf('mute', vol === 0 ? 'mute' : vol < 0.5 ? 'vollow' : 'vol', (n) => (pbEls.mute.innerHTML = ic(n)));
  setIf('vol', vol, (v) => (pbEls.vol.value = v));
  setIf('fs', !!document.fullscreenElement, (f) => (pbEls.fs.innerHTML = ic(f ? 'fsx' : 'fs')));
  paintMarks(); paintAuto(); paintChapLabel();
}
let scrubbing = false;
for (const ev of ['loadedmetadata', 'resize']) video.addEventListener(ev, () => renderPQuick());
for (const ev of ['playing', 'canplay', 'error']) video.addEventListener(ev, () => pbox.classList.remove('loading'));
video.addEventListener('waiting', () => { if (video.currentSrc) pbox.classList.add('loading'); });
let lastBarPaint = 0;
for (const ev of ['timeupdate', 'progress', 'durationchange', 'loadedmetadata', 'resize', 'play', 'pause', 'volumechange', 'seeked', 'emptied']) video.addEventListener(ev, (e) => {
  if (perf.power && (e.type === 'timeupdate' || e.type === 'progress') && Date.now() - lastBarPaint < 900) return; // power saving: about once a second
  lastBarPaint = Date.now(); paintBar();
});
document.addEventListener('fullscreenchange', paintBar);
$('#pc-play').onclick = () => (video.paused ? video.play().catch(() => {}) : video.pause());
$('#pc-mute').onclick = () => { video.muted = !video.muted; if (!video.muted && video.volume === 0) video.volume = 0.5; };
$('#pc-vol').oninput = (e) => { video.muted = false; video.volume = +e.target.value; };
const toggleFs = () => (document.fullscreenElement ? document.exitFullscreen() : pbox.requestFullscreen());
$('#pc-fs').onclick = toggleFs;
for (const b of pbarEl.querySelectorAll('button')) b.addEventListener('mousedown', (e) => e.preventDefault()); // keep keyboard shortcuts working after a click
// click the picture to pause, double-click for full screen
let clickT = 0;
video.addEventListener('click', () => { clearTimeout(clickT); clickT = setTimeout(() => (video.paused ? video.play().catch(() => {}) : video.pause()), 230); });
video.addEventListener('dblclick', () => { clearTimeout(clickT); toggleFs(); });
// seek bar: click or drag, with a time (and chapter) tooltip on hover
const seekFrac = (e) => { const r = pseek.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
// Hover preview: YouTube's storyboard sheets (a grid of small frames) cut to the frame under the cursor.
const PREVIEW_W = 200, sbSeen = new Set();
function previewHtml(time, d) {
  const sb = current?.storyboard; if (!sb?.url || !sb.count || settings.seekPreview === false || perf.data || perf.power) return '';
  const per = sb.cols * sb.rows, idx = Math.min(sb.count - 1, Math.max(0, sb.interval ? Math.floor((time * 1000) / sb.interval) : Math.floor((time / d) * sb.count)));
  const sheet = Math.floor(idx / per), within = idx % per, col = within % sb.cols, row = Math.floor(within / sb.cols), k = PREVIEW_W / sb.w;
  const url = sb.url.replace('$M', sheet);
  if (!sbSeen.has(url)) { sbSeen.add(url); if (sbSeen.size > 400) sbSeen.clear(); const im = new Image(); im.src = url; } // fetch the sheet right away
  return `<div class="pprev" style="width:${PREVIEW_W}px;height:${Math.round(sb.h * k)}px;background-image:url('${esc(url)}');background-size:${sb.cols * sb.w * k}px ${sb.rows * sb.h * k}px;background-position:-${col * sb.w * k}px -${row * sb.h * k}px"></div>`;
}
const showTip = (e) => {
  const d = vdur(); if (!d) return; const f = seekFrac(e), tip = $('#ptip'), r = pseek.getBoundingClientRect(), time = f * d;
  tip.innerHTML = previewHtml(time, d) + `<div class="pt-time">${fmtDur(time)}</div>` + (chapters.length ? `<div class="pt-chap">${esc(chapters[chapAt(time)].title)}</div>` : '');
  tip.hidden = false;
  const half = tip.offsetWidth / 2 + 4;
  tip.style.left = Math.min(r.width - half, Math.max(half, f * r.width)) + 'px';
};
pseek.addEventListener('pointerdown', (e) => {
  if (!vdur()) return; scrubbing = true; pseek.classList.add('drag'); try { pseek.setPointerCapture(e.pointerId); } catch {}
  // While dragging, the bar follows the pointer at once but the video is only moved about seven times a second (and at the end): every
  // seek makes the player start loading from that spot, and dozens of them a second just keep it from ever getting there.
  let seekTimer = 0, seekTo = null;
  const apply = () => { seekTimer = 0; if (seekTo != null) { video.currentTime = seekTo; seekTo = null; } };
  const go = (ev) => {
    const f = seekFrac(ev); pseek.querySelector('.pplay').style.width = f * 100 + '%'; pseek.querySelector('.pknob').style.left = f * 100 + '%';
    seekTo = f * vdur(); if (!seekTimer) seekTimer = setTimeout(apply, 140); showTip(ev);
  };
  go(e); clearTimeout(seekTimer); apply(); // the first click moves the video straight away
  const mv = (ev) => go(ev), up = () => {
    clearTimeout(seekTimer); apply(); scrubbing = false; pseek.classList.remove('drag');
    pseek.removeEventListener('pointermove', mv); pseek.removeEventListener('pointerup', up); pseek.removeEventListener('pointercancel', up); paintBar();
  };
  pseek.addEventListener('pointermove', mv); pseek.addEventListener('pointerup', up); pseek.addEventListener('pointercancel', up);
});
pseek.addEventListener('pointermove', (e) => { if (!scrubbing) showTip(e); });
pseek.addEventListener('pointerleave', () => { if (!scrubbing) $('#ptip').hidden = true; });
// the bar fades away while the video plays and the mouse is still
let hideT = 0;
function showBar() {
  pbox.classList.remove('ctl-hide'); clearTimeout(hideT);
  if (video.paused || !$('#p-menu').hidden || scrubbing) return;
  hideT = setTimeout(() => { if (!pbarEl.matches(':hover') && $('#p-menu').hidden && !video.paused) pbox.classList.add('ctl-hide'); }, 2600);
}
pbox.addEventListener('mousemove', showBar);
pbox.addEventListener('mouseleave', () => { if (!video.paused && $('#p-menu').hidden) { clearTimeout(hideT); hideT = setTimeout(() => pbox.classList.add('ctl-hide'), 600); } });
for (const ev of ['play', 'pause', 'ended', 'emptied']) video.addEventListener(ev, showBar);
paintBar();


// ---------- report playback to your YouTube history (signed in) ----------
let histSent = null, histLastT = 0, histWarned = false;
const histOn = () => signedIn() && !settings.pauseHistory && settings.syncHistory !== false;
const histWarn = (e) => { if (!histWarned) { histWarned = true; toast('Could not add to your YouTube history: ' + (e?.message || e)); } };
video.addEventListener('playing', () => {
  if (!current || histSent === current.id || !histOn()) return;
  histSent = current.id; histLastT = Date.now();
  api.historyStart(current.id).catch(histWarn);
});
const histTime = (mode) => { if (current && histSent === current.id && histOn() && video.currentTime > 0) api.historyTime(current.id, video.currentTime, typeof mode === 'string' ? mode : 'final').catch(() => {}); };
video.addEventListener('pause', () => { if (!video.ended) histTime('paused'); });
video.addEventListener('ended', () => histTime('final'));
video.addEventListener('timeupdate', () => { if (histSent === current?.id && Date.now() - histLastT > 30000) { histLastT = Date.now(); histTime('playing'); } });
window.addEventListener('beforeunload', histTime);

// ---------- app updates ----------
let updDismissed = '', lastUpd = null;
function paintUpdatePanel(u) {
  const el = $('#upd-panel'); if (!el) return;
  u = u || { status: 'idle', current: '' };
  const ver = esc(u.current || ''), v = esc(u.version || '');
  const how = u.auto ? 'It downloads and installs here.' : 'This copy cannot replace itself, so the button opens the download page.';
  const line = { idle: `You have version ${ver}.`, none: `You have version ${ver}, the latest.`, available: `Version <b>${v}</b> is available (you have ${ver}). ${how}`, downloading: `Downloading version ${v}… ${u.pct || 0}%`, installing: `Installing version ${v}… approve the password prompt if one appears.`, ready: `Version ${v} is installed. Restart to use it.`, error: `Problem: ${esc(u.error || 'unknown')}` }[u.status] || '';
  const busy = ['downloading', 'installing'].includes(u.status);
  el.innerHTML = `<div class="upd-line">${line}</div>${u.status === 'downloading' ? `<div class="upd-prog"><i style="width:${u.pct || 0}%"></i></div>` : ''}${u.status === 'available' && u.notes ? `<details class="upd-notes"><summary>What is new</summary><pre>${esc(u.notes.split('SHA-256')[0].trim())}</pre></details>` : ''}<div class="upd-btns"><button data-a="check" ${busy ? 'disabled' : ''}>Check for updates</button>${u.status === 'available' ? `<button data-a="go" class="primary">${u.auto ? 'Update now' : 'Open download page'}</button>` : ''}${u.status === 'ready' ? '<button data-a="restart" class="primary">Restart now</button>' : ''}</div>`;
  el.querySelector('[data-a=check]')?.addEventListener('click', async () => { el.querySelector('.upd-line').textContent = 'Checking…'; try { await api.updateCheck(); } catch (e) { paintUpdatePanel({ status: 'error', error: e.message, current: u.current }); } });
  el.querySelector('[data-a=go]')?.addEventListener('click', () => { updDismissed = ''; api.updateInstall().catch((e) => toast('Update failed: ' + e.message)); });
  el.querySelector('[data-a=restart]')?.addEventListener('click', () => api.updateRestart());
}
function paintUpdate(u) {
  const bar = $('#update-bar'); if (!u) return;
  lastUpd = u; paintUpdatePanel(u);
  if (u.status === 'available' && u.version && localStorage.getItem('updNotified') !== u.version) { localStorage.setItem('updNotified', u.version); notify('update', 'Update available', `YouTube Desktop ${u.version} is ready to install.`); }
  const v = esc(u.version || '');
  let html = '';
  if (u.status === 'available' && updDismissed !== u.version) html = `<span>Version <b>${v}</b> is available (you have ${esc(u.current)}).</span><button data-a="go">${u.auto ? 'Update' : 'Get it'}</button><button data-a="later" class="ghost">Later</button>`;
  else if (u.status === 'installing') html = `<span>Installing version ${v}…</span>`;
  else if (u.status === 'downloading') html = `<span>Downloading version ${v}… ${u.pct || 0}%</span>`;
  else if (u.status === 'ready') html = `<span>Version ${v} is ready.</span><button data-a="restart">Restart to update</button><button data-a="later" class="ghost">Later</button>`;
  else if (u.status === 'error' && u.manual) html = `<span>Update problem: ${esc(u.error || '')}</span><button data-a="later" class="ghost">Dismiss</button>`;
  bar.hidden = !html; bar.innerHTML = html;
  bar.querySelector('[data-a=go]')?.addEventListener('click', () => api.updateInstall().catch((e) => toast('Update failed: ' + e.message)));
  bar.querySelector('[data-a=restart]')?.addEventListener('click', () => api.updateRestart());
  bar.querySelector('[data-a=later]')?.addEventListener('click', () => { updDismissed = u.version || 'x'; bar.hidden = true; });
}
api.onUpdate(paintUpdate);
api.updateState().then(paintUpdate).catch(() => {});

// ---------- side panel: chapters and transcript ("In this video"), like YouTube ----------
const chaptersSide = () => settings.chaptersPlace !== 'below' && settings.watchRelated !== 'hidden';
let rcTab = 'chapters', rcOpen = false, rcDismissed = false, allCapTracks = [], chapLoop = null, transcript = null, trIdx = -1;
const vUrl = (t) => `https://www.youtube.com/watch?v=${current?.id}${t != null ? '&t=' + Math.floor(t) : ''}`;
function setChapters(list) {
  chapters = list; chapLoop = null; marksSig = ''; transcript = null; trIdx = -1; lastChap = -1; // (the panel stays closed with the X until the app is restarted)
  const box = $('#w-chapters'); box.hidden = true;
  if (list.length && !chaptersSide()) { box.hidden = false; chapOpen = false; paintChapters(); }
  rcTab = list.length ? 'chapters' : 'transcript'; rcOpen = false; // collapsed: the header and the tabs; click a tab to open it
  paintRc(); paintBar();
}
function parseVttCues(vtt) {
  const cues = []; let prev = [];
  for (const block of String(vtt).replace(/\r/g, '').split(/\n\n+/)) {
    const lines = block.split('\n'), i = lines.findIndex((l) => l.includes('-->')); if (i < 0) continue;
    const m = /(\d+:)?(\d+):(\d+)[.,](\d+)/.exec(lines[i]); if (!m) continue;
    const t = (+(m[1] || '0').replace(':', '') || 0) * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
    let text = lines.slice(i + 1).map((l) => l.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
    const fresh = text.filter((l) => !prev.includes(l)); prev = text; // rolling auto-captions repeat the previous line
    const joined = fresh.join(' ').trim(); if (joined) cues.push({ t, text: joined });
  }
  return cues;
}
async function loadTranscript() {
  if (!current || !capTracks.length) return;
  if (transcript?.id === current.id) return;
  const id = current.id; transcript = { id, cues: null }; paintRc();
  const want = (settings.subLang || '').toLowerCase();
  const pick = capLang || (() => { const t = capTracks.find((x) => x.lang.toLowerCase() === want) || capTracks.find((x) => x.lang.toLowerCase().startsWith(want)) || capTracks[0]; return t.lang + (t.auto ? '|a' : '|m'); })();
  const [lang, kind] = pick.split('|');
  try { const vtt = await api.subsGet(id, lang, kind === 'a'); if (current?.id !== id) return; transcript = { id, cues: parseVttCues(cleanVtt(vtt)) }; }
  catch (e) { if (current?.id === id) transcript = { id, cues: [], error: e.message }; }
  paintRc();
}
function paintRc() {
  const el = $('#rc-panel'); if (!el) return;
  const hasCh = chapters.length > 0, hasTr = allCapTracks.length > 0;
  const want = chaptersSide() && settings.sidePanel !== false && (hasCh || hasTr) && !rcDismissed && current;
  el.hidden = !want; if (!want) return;
  if (rcTab === 'chapters' && !hasCh) rcTab = 'transcript';
  if (rcTab === 'transcript' && !hasTr) rcTab = 'chapters';
  el.classList.toggle('closed', !rcOpen);
  for (const b of el.querySelectorAll('.rc-tabs button')) { const t = b.dataset.tab; b.hidden = (t === 'chapters' && !hasCh) || (t === 'transcript' && !hasTr); b.classList.toggle('on', rcOpen && t === rcTab); }
  const body = $('#rc-body'); body.hidden = !rcOpen; if (!rcOpen) return;
  const prevScroll = body.scrollTop;
  if (rcTab === 'chapters') {
    const k = chapAt(video.currentTime || 0);
    body.innerHTML = chapters.map((c, i) => `<div class="rc-row${i === k ? ' cur' : ''}" data-i="${i}">${c.thumb ? `<img loading="lazy" decoding="async" src="${esc(c.thumb)}">` : '<span class="noimg"></span>'}<div class="tt"><span class="ti">${esc(c.title)}</span><span class="tm">${fmtDur(c.t)}</span></div><div class="acts"><button data-a="share" title="Copy link to this chapter">${ic('share')}</button><button data-a="loop" title="Loop this chapter" class="${chapLoop?.i === i ? 'on' : ''}">${ic('repeat')}</button></div></div>`).join('');
    body.querySelectorAll('.rc-row').forEach((row) => {
      const i = +row.dataset.i, c = chapters[i];
      row.onclick = (e) => {
        const a = e.target.closest('button')?.dataset.a;
        if (a === 'share') { api.copy(vUrl(c.t)); return toast('Link to this chapter copied'); }
        if (a === 'loop') { chapLoop = chapLoop?.i === i ? null : { i, a: c.t, b: chapters[i + 1]?.t ?? vdur() }; if (chapLoop) { video.currentTime = c.t; video.play().catch(() => {}); toast('Looping this chapter'); } return paintRc(); }
        video.currentTime = c.t; video.play().catch(() => {});
      };
    });
    const cur = body.querySelector('.rc-row.cur'); if (cur && lastRcChap !== k) { lastRcChap = k; body.scrollTop = Math.max(0, cur.offsetTop - body.offsetTop - 8); } else body.scrollTop = prevScroll;
  } else {
    if (!transcript || transcript.id !== current.id) { body.innerHTML = '<div class="rc-note">Loading the transcript…</div>'; loadTranscript(); return; }
    if (!transcript.cues) { body.innerHTML = '<div class="rc-note">Loading the transcript…</div>'; return; }
    if (!transcript.cues.length) { body.innerHTML = `<div class="rc-note">${esc(transcript.error ? 'No transcript: ' + transcript.error : 'No transcript for this video.')}</div>`; return; }
    body.innerHTML = transcript.cues.map((c, i) => `<div class="tr-row" data-i="${i}"><span class="tm">${fmtDur(c.t)}</span><span class="tx">${esc(c.text)}</span></div>`).join('');
    body.querySelectorAll('.tr-row').forEach((row) => (row.onclick = () => { video.currentTime = transcript.cues[+row.dataset.i].t; video.play().catch(() => {}); }));
    trIdx = -1; paintTranscriptNow(true);
  }
}
let lastRcChap = -1;
function paintTranscriptNow(scroll) {
  if (!transcript?.cues?.length || rcTab !== 'transcript' || !rcOpen) return;
  const t = video.currentTime || 0; let lo = 0, hi = transcript.cues.length - 1, k = 0;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (transcript.cues[mid].t <= t) { k = mid; lo = mid + 1; } else hi = mid - 1; }
  if (k === trIdx) return; trIdx = k;
  const body = $('#rc-body'); body.querySelector('.tr-row.cur')?.classList.remove('cur');
  const row = body.querySelector(`.tr-row[data-i="${k}"]`); if (!row) return; row.classList.add('cur');
  if (scroll || !body.matches(':hover')) body.scrollTop = Math.max(0, row.offsetTop - body.offsetTop - body.clientHeight / 3);
}
$('#rc-x').onclick = () => { rcDismissed = true; paintRc(); };
for (const b of document.querySelectorAll('#rc-panel .rc-tabs button')) b.onclick = () => { if (rcOpen && rcTab === b.dataset.tab) rcOpen = false; else { rcTab = b.dataset.tab; rcOpen = true; } paintRc(); };
video.addEventListener('timeupdate', () => {
  if (chapLoop && video.currentTime >= chapLoop.b - 0.15) video.currentTime = chapLoop.a;
  if (chapters.length && rcTab === 'chapters' && rcOpen) { const k = chapAt(video.currentTime); if (k !== lastRcChap) paintRc(); }
  paintTranscriptNow(false);
});
// the chapter name in the player's control bar (click for the list)
function paintChapLabel() {
  const b = $('#pc-chap'); if (!b) return;
  const t = video.currentTime || 0, name = chapters.length ? chapters[chapAt(t)].title : '';
  if (b.hidden !== !name) b.hidden = !name;
  if (name && b.dataset.n !== name) { b.dataset.n = name; b.innerHTML = `<span class="cn">${esc(name)}</span>${ic('chevright')}`; }
}
$('#pc-chap').onclick = (e) => { e.stopPropagation(); const m = $('#p-menu'); if (!m.hidden && pmPage === 'chapters') return closeP(); pmPage = 'chapters'; m.hidden = false; $('#p-gear').classList.add('open'); renderPMenu(); };

// ---------- suggested videos with filter chips ----------
let relAll = [], relChip = 'all';
const durSec = (d) => { const p = String(d || '').split(':').map(Number); return p.some(Number.isNaN) ? 0 : p.reduce((a, x) => a * 60 + x, 0); };
function relFilters() {
  const ch = current?.channelId, name = current?.channel || '';
  const defs = [['all', 'All', () => true]];
  if (ch || name) defs.push(['chan', 'From ' + (name.length > 22 ? name.slice(0, 21) + '…' : name), (v) => (ch && v.channelId === ch) || (name && v.channel === name)]);
  defs.push(['new', 'Not watched', (v) => !isWatched(v.id)], ['short', 'Under 10 min', (v) => { const s = durSec(v.duration); return s > 0 && s < 600; }], ['long', 'Over 30 min', (v) => durSec(v.duration) > 1800]);
  return defs;
}
function paintRelated() {
  const rel = $('#related'), chips = $('#rc-chips'); rel.innerHTML = '';
  const defs = relFilters();
  const counts = defs.map(([k, , f]) => [k, relAll.filter(f).length]);
  if (!counts.find(([k]) => k === relChip) || (relChip !== 'all' && !counts.find(([k, n]) => k === relChip && n))) relChip = 'all';
  chips.innerHTML = '';
  if (settings.relatedChips !== false && relAll.length) for (const [k, label] of defs) {
    const n = counts.find((x) => x[0] === k)[1]; if (k !== 'all' && !n) continue;
    const b = document.createElement('button'); b.className = 'rchip' + (k === relChip ? ' on' : ''); b.textContent = label; b.onclick = () => { relChip = k; paintRelated(); };
    chips.appendChild(b);
  }
  const f = defs.find(([k]) => k === relChip)[2];
  renderVideos(perf.data ? relAll.filter(f).slice(0, 12) : relAll.filter(f), rel);
  renderUpNext();
}

// ---------- tabs: open several videos at once (middle click, Ctrl+click or a 3-finger tap on a video) ----------
function renderTabs() {
  const bar = $('#tabbar'); if (!bar) return;
  const on = settings.tabsBar !== false && userQueue.length > 0;
  document.documentElement.style.setProperty('--tabs-h', on ? '40px' : '0px');
  bar.hidden = !on; if (!on) { bar.innerHTML = ''; return; }
  bar.innerHTML = '';
  const mk = (v, cls, onclick, onclose) => {
    const t = document.createElement('div'); t.className = 'tab ' + cls; t.title = v.title || '';
    t.innerHTML = `${v.thumb ? `<img src="${esc(v.thumb)}">` : ''}<span class="tl">${esc(v.title || v.id)}</span><button class="tx" title="Close tab">${ic('x')}</button>`;
    t.onclick = (e) => { if (e.target.closest('.tx')) onclose(); else onclick(); };
    t.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); onclose(); } });
    bar.appendChild(t);
  };
  if (current) mk(current, 'cur' + ($('#watch').hidden ? ' away' : ''), () => { if ($('#watch').hidden) openVideo(current); }, () => closeCurrentTab());
  userQueue.forEach((v, i) => mk(v, '', () => switchTab(i), () => { userQueue.splice(i, 1); renderTabs(); renderUpNext(); }));
  const add = document.createElement('div'); add.className = 'tabs-note'; add.textContent = `${userQueue.length + (current ? 1 : 0)} open`; bar.appendChild(add);
}
function switchTab(i) {
  const next = userQueue[i], prev = current; if (!next) return;
  const keepPrev = prev && prev.id !== next.id && progOf(prev) < 95;
  userQueue.splice(i, 1, ...(keepPrev ? [prev] : []));
  openVideo(next, { keep: true });
}
function closeCurrentTab() {
  if (userQueue.length) { openVideo(userQueue.shift(), { replace: true }); return; }
  closePlayer();
}
const videoCardOf = (t) => t.closest?.('.card, .vrow, .lrow, .plrow, .subrow');
document.addEventListener('mousedown', (e) => { if (e.button === 1 && videoCardOf(e.target)?._v) e.preventDefault(); }); // no autoscroll circle
document.addEventListener('auxclick', (e) => {
  if (e.button !== 1) return; const c = videoCardOf(e.target); if (!c?._v) return;
  e.preventDefault(); queueAdd(c._v, false);
});
document.addEventListener('click', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return; const c = videoCardOf(e.target); if (!c?._v || e.target.closest('.dots, button')) return;
  e.preventDefault(); e.stopPropagation(); queueAdd(c._v, false);
}, true);

// ---------- buttons under the title ----------
const wMenu = (btn, build) => { btn.onclick = (e) => { e.stopPropagation(); if (current) popMenu(build()); }; };
function menuOf(entries) { const items = [], run = {}; entries.forEach((e, i) => { if (e === '-') return items.push({ type: 'separator' }); const id = 'm' + i; items.push({ id, label: e[0], ...(e[2] || {}) }); run[id] = e[1]; }); return { items, run }; }
wMenu($('#w-share'), () => menuOf([['Copy link', () => { api.copy(vUrl()); toast('Link copied'); }], ['Copy link at current time', () => { api.copy(vUrl(video.currentTime)); toast('Link copied'); }], ['Open on youtube.com', () => api.openExternal(vUrl())]]));
wMenu($('#w-save'), () => { const later = inList('watchlater', current.id); return menuOf([[later ? 'Remove from Watch later' : 'Save to Watch later', () => { toggleList('watchlater', current); toast(later ? 'Removed from Watch later' : 'Saved to Watch later'); }], ['Save to playlist…', () => TOOLS.saveplaylist.run()], '-', ['Add to queue', () => queueAdd(current, false)], ['Play next', () => queueAdd(current, true)]]); });
wMenu($('#w-dl'), () => menuOf([['Video (your settings)', () => startDownload('video')], ['Audio (your settings)', () => startDownload('audio')], '-', ...DL_PRESETS.map(([label, kind, o]) => [label, () => startDownload(kind, o)])]));
wMenu($('#w-more'), () => menuOf([['Mini player', () => api.mini(true)], ['Picture in picture', () => TOOLS.pip.run()], [video.loop ? 'Turn loop off' : 'Loop this video', () => { video.loop = !video.loop; toast(video.loop ? 'Looping' : 'Loop off'); }], [settings.theater ? 'Leave theater mode' : 'Theater mode', () => save({ theater: !settings.theater })], '-', ['Video details', () => showVideoDetails(current)], ['Copy link', () => { api.copy(vUrl()); toast('Link copied'); }], ['Open on youtube.com', () => api.openExternal(vUrl())]]));
const bells = () => lsGet('bells', {});
function paintBell() {
  const b = $('#w-bell'); if (!b || !current) return;
  const all = settings.notifyUploadMode === 'all', on = all || !!bells()[current.channelId];
  b.innerHTML = ic(on ? 'bellon' : 'bell'); b.classList.toggle('on', on);
  b.title = all ? 'Notifications are on for every subscription (Settings, Notifications)' : on ? 'Notifications on for this channel' : 'Get notified about new videos from this channel';
  b.hidden = settings.notifyUploadsOn === false;
}
wMenu($('#w-bell'), () => {
  const id = current.channelId, on = !!bells()[id], name = current.channel || 'this channel';
  if (!id) return menuOf([['This channel cannot be followed', () => {}]]);
  const set = (v) => () => { const b = bells(); if (v) b[id] = 1; else delete b[id]; lsSet('bells', b); if (v && !isSub(id)) setSub({ id, name: current.channel, avatar: current.channelThumb || '' }, true).then(updateChannelRow); paintBell(); toast(v ? `You will be notified about new videos from ${name}` : 'Notifications off for ' + name); if (v && settings.notifyOn === false) toast('Notifications are switched off in Settings, Notifications'); };
  return menuOf([[(on ? '✓ ' : '') + 'Notify me about new videos', set(true)], [(!on ? '✓ ' : '') + 'None', set(false)], '-', ['Notification settings…', () => { openSettings(); setTimeout(() => [...document.querySelectorAll('#s-tabs a')].find((a) => a.textContent === 'Notifications')?.click(), 60); }]]);
});

// ---------- desktop notifications ----------
let notifTimer = 0, notifIntervalApplied;
async function pollUploads() {
  if (settings.notifyUploadsOn === false || settings.notifyUploadMode === 'off' || perf.data) return;
  const mode = settings.notifyUploadMode || 'bell', b = bells();
  if (mode === 'bell' && !Object.keys(b).length) return;
  try { await fetchSubs(); } catch { return; }
  const cache = lsGet('subcache', { videos: [] }), seen = lsGet('notifSeen', null), vids = cache.videos || [];
  if (seen === null) { lsSet('notifSeen', vids.map((v) => v.id)); return; } // first run: remember what is already there
  const have = new Set(seen), fresh = [];
  for (const v of vids) { if (have.has(v.id)) continue; have.add(v.id); if ((mode === 'all' || b[v.channelId]) && v.age <= 3 && !isWatched(v.id)) fresh.push(v); }
  lsSet('notifSeen', [...have].slice(-3000));
  if (!fresh.length) return;
  for (const v of fresh) addNotif({ kind: 'upload', title: v.channel || 'New video', body: v.title, vid: v.id, thumb: v.thumb });
  if (fresh.length <= 3) for (const v of fresh) api.notify('upload', v.channel || 'New video', v.title, v.id).catch(() => {});
  else api.notify('upload', `${fresh.length} new videos`, [...new Set(fresh.map((v) => v.channel))].slice(0, 4).join(', '), fresh[0].id).catch(() => {});
}
function scheduleNotifPoll() {
  clearInterval(notifTimer);
  const mins = Math.max(5, +settings.notifyInterval || 30) * (perf.power ? 3 : 1);
  notifTimer = setInterval(pollUploads, mins * 60000);
}
setTimeout(() => { pollUploads(); scheduleNotifPoll(); }, 45000);
api.onOpenVideo((id) => { const v = (lsGet('subcache', { videos: [] }).videos || []).find((x) => x.id === id) || { id, title: '' }; openVideo(v); });

// ---------- data saver, power saving, battery ----------
// Data saver: smaller pictures, no extras that fetch more (DeArrow, dislike counts, previews, comments until asked), a short buffer.
// Power saving: no animations or blur, H.264 at a lower size (most devices decode it in hardware), no audio processing, slower timers.
function applyPerf() {
  const b = perf.battery, onBat = !!b && !b.charging, auto = settings.powerAuto || 'off';
  const power = !!settings.powerSaver || (auto === 'battery' && onBat) || (auto === 'low' && onBat && b.level <= 0.2);
  const data = !!settings.dataSaver, changed = perf.ready && (power !== perf.power || data !== perf.data);
  perf.power = power; perf.data = data;
  document.body.classList.toggle('low-power', power); document.body.classList.toggle('data-saver', data);
  const chip = $('#perf-chip'), label = [data && 'Data saver', power && 'Power saving'].filter(Boolean).join(' + ');
  chip.hidden = !label; chip.textContent = label; chip.title = 'Click to change (Settings, Performance)';
  if (changed) { toast(label ? `${label} is on. It applies fully from the next video.` : 'Normal mode'); applyStableAudio(); if (!perf.data) paintRelated(); scheduleNotifPoll(); }
  perf.ready = true;
}
$('#perf-chip').onclick = () => { openSettings(); setTimeout(() => [...document.querySelectorAll('#s-tabs a')].find((a) => a.textContent === 'Performance')?.click(), 60); };
(async () => { try { perf.battery = await navigator.getBattery(); for (const ev of ['chargingchange', 'levelchange']) perf.battery.addEventListener(ev, applyPerf); applyPerf(); } catch {} })();

// ---------- full titles on hover ----------
const TITLE_SEL = '.card h3, .vrow h3, .lrow h3, .plrow h3, .subrow h3, .info h3, .ci h3, #related h3, .up-row .t, .es-card .t, .rc-row .ti, #tabbar .tl, #w-title';
const fullTip = document.createElement('div'); fullTip.id = 'fulltip'; fullTip.hidden = true; document.body.appendChild(fullTip);
let tipT = 0, tipEl = null;
const hideFullTip = () => { clearTimeout(tipT); tipEl = null; fullTip.hidden = true; };
function fullTitleOf(el) {
  const lead = el.childNodes[0]?.nodeType === 3 ? el.childNodes[0].textContent.trim() : '', shown = (lead || el.textContent).trim();
  const v = el.closest('.card, .vrow, .lrow, .plrow, .subrow')?._v, orig = v?.title || (el.id === 'w-title' ? current?.title : '');
  return shown ? shown + (orig && orig !== shown ? `\n\nOriginal title: ${orig}` : '') : '';
}
document.addEventListener('mouseover', (e) => {
  if (touchOn()) return;
  const el = e.target.closest?.(TITLE_SEL); if (el === tipEl) return;
  hideFullTip(); if (!el) return;
  tipEl = el; tipT = setTimeout(() => {
    const text = fullTitleOf(el); if (!text) return;
    fullTip.textContent = text; fullTip.hidden = false;
    const r = el.getBoundingClientRect(), w = fullTip.offsetWidth, h = fullTip.offsetHeight;
    fullTip.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + 'px';
    fullTip.style.top = (r.bottom + h + 12 < innerHeight ? r.bottom + 6 : Math.max(8, r.top - h - 6)) + 'px';
  }, 400);
}, { passive: true });
document.addEventListener('mouseout', (e) => { if (!e.relatedTarget || !e.relatedTarget.closest?.(TITLE_SEL) || e.relatedTarget.closest(TITLE_SEL) !== tipEl) hideFullTip(); }, { passive: true });
document.addEventListener('scroll', hideFullTip, true); document.addEventListener('mousedown', hideFullTip, true);

// ---------- touch / tablet mode ----------
// 'auto' turns on for touch screens without a mouse. Everything gets bigger and nothing needs hovering: tap the picture to show or
// hide the controls, double-tap the left or right side to jump 10 seconds, and swipe in from the edge to go back or forward.
const touchOn = () => document.body.classList.contains('touch');
function applyTouch() {
  const m = settings.touchMode || 'auto';
  const on = m === 'on' || (m === 'auto' && matchMedia('(pointer: coarse) and (hover: none)').matches);
  document.body.classList.toggle('touch', on);
  $('#p-bigplay').innerHTML = ic(video.paused ? 'play' : 'pause');
  if (on) hideFullTip();
}
matchMedia('(pointer: coarse)').addEventListener?.('change', applyTouch);
let lastTap = { t: 0, x: 0 }, tapTimer = 0, touchSeen = false;
const flashSkip = (side, secs) => { const el = $('#p-skip'); el.className = side; el.innerHTML = `${ic(side === 'l' ? 'rewind' : 'forward')}<span>${secs} s</span>`; el.hidden = false; clearTimeout(el._t); el._t = setTimeout(() => (el.hidden = true), 600); };
function touchSeek(dx) { const side = dx < 0.4 ? 'l' : dx > 0.6 ? 'r' : null; if (!side) return false; const secs = 10; video.currentTime = Math.max(0, Math.min(vdur() || 1e9, video.currentTime + (side === 'l' ? -secs : secs))); flashSkip(side, secs); return true; }
video.addEventListener('pointerup', (e) => {
  if (e.pointerType !== 'touch' || !touchOn()) return; touchSeen = true;
  const r = video.getBoundingClientRect(), dx = (e.clientX - r.left) / r.width, now = Date.now();
  if (now - lastTap.t < 320 && Math.abs(e.clientX - lastTap.x) < 80) { clearTimeout(tapTimer); lastTap = { t: 0, x: 0 }; if (!touchSeek(dx)) toggleFs(); return; }
  lastTap = { t: now, x: e.clientX };
  tapTimer = setTimeout(() => { pbox.classList.toggle('ctl-hide'); if (!pbox.classList.contains('ctl-hide')) showBar(); }, 330); // a single tap shows or hides the controls
});
// the browser's click after a touch must not also toggle play (the tap above already did what it should)
video.addEventListener('click', (e) => { if (touchOn() && touchSeen) { e.stopImmediatePropagation(); touchSeen = false; } }, true);
$('#p-bigplay').onclick = () => (video.paused ? video.play().catch(() => {}) : video.pause());
for (const ev of ['play', 'pause', 'emptied']) video.addEventListener(ev, () => { $('#p-bigplay').innerHTML = ic(video.paused ? 'play' : 'pause'); });
// swipe in from the left or right edge: back or forward
let edge = null;
document.addEventListener('touchstart', (e) => { const t = e.touches[0]; edge = touchOn() && e.touches.length === 1 && (t.clientX < 24 || t.clientX > innerWidth - 24) ? { x: t.clientX, y: t.clientY, left: t.clientX < 24 } : null; }, { passive: true });
document.addEventListener('touchend', (e) => { if (!edge) return; const t = e.changedTouches[0], dx = t.clientX - edge.x, dy = Math.abs(t.clientY - edge.y); if (dy < 60 && ((edge.left && dx > 90) || (!edge.left && dx < -90))) navGo(edge.left ? -1 : 1); edge = null; }, { passive: true });

// ---------- get the next video ready ----------
// Looking a video up (yt-dlp) takes a few seconds, so it is done ahead of time: when you rest the pointer on a video for a moment,
// and a few seconds into the current one for whatever plays next. Off in data saver and power saving.
const warmed = new Map();
function warmVideo(id, urgent) {
  if (!id || perf.data || perf.power || settings.prefetchNext === false) return;
  const t = warmed.get(id); if (t && Date.now() - t < 10 * 60 * 1000) return;
  warmed.set(id, Date.now()); if (warmed.size > 80) warmed.delete(warmed.keys().next().value);
  api.prefetch(id, { data: perf.data, power: perf.power }, !!urgent).catch(() => {});
}
let hoverWarmT = 0, hoverWarmEl = null, nextWarmT = 0;
document.addEventListener('mouseover', (e) => {
  const c = videoCardOf(e.target); if (!c?._v || c === hoverWarmEl) return;
  hoverWarmEl = c; clearTimeout(hoverWarmT); hoverWarmT = setTimeout(() => warmVideo(c._v.id, true), 350);
}, { passive: true });
document.addEventListener('mouseout', (e) => { if (hoverWarmEl && !hoverWarmEl.contains(e.relatedTarget)) { clearTimeout(hoverWarmT); hoverWarmEl = null; } }, { passive: true });
video.addEventListener('playing', () => {
  clearTimeout(nextWarmT);
  nextWarmT = setTimeout(() => { const n = nextVideo(); if (n) warmVideo(n.v.id); for (const q of userQueue.slice(0, 2)) warmVideo(q.id); }, 6000);
});

// ---------- floating player: the video keeps playing in a corner while you browse ----------
// The player stays where it is in the page; when the watch page is hidden it is simply pinned to a corner of the window (see the
// #watch.away rules in the style sheet), so nothing is moved or reloaded and playback never stops.
const floatOn = () => settings.floatPlayer !== false;
const awayNow = () => $('#watch').classList.contains('away');
function updateAway() {
  const w = $('#watch'), away = floatOn() && w.hidden && !!current;
  w.classList.toggle('away', away);
  document.body.classList.toggle('has-mini', away);
  document.documentElement.style.setProperty('--mini-w', ({ small: 300, medium: 380, large: 500 })[settings.floatSize || 'medium'] + 'px');
  for (const c of ['br', 'bl', 'tr', 'tl']) document.body.classList.toggle('mini-' + c, (settings.floatCorner || 'br') === c);
  if (away) paintMini();
}
function paintMini() {
  const t = $('#mini-title'); if (t.textContent !== (current?.title || '')) t.textContent = current?.title || '';
  const pl = $('#mini-play'), k = video.paused ? 'play' : 'pause'; if (pl.dataset.k !== k) { pl.dataset.k = k; pl.innerHTML = ic(k); }
}
// Stops the video and clears the player altogether (the x on the floating player, closing a tab).
function closePlayer() {
  saveProgress(); histTime(); histSent = null; ++loadSeq; resetMedia(); video.poster = ''; pbox.classList.remove('loading');
  current = null; if (!$('#watch').hidden) showMain();
  updateAway(); renderTabs();
}
$('#mini-ui').addEventListener('click', (e) => {
  if (e.target.closest('button')) return;
  if (current) openVideo(current); // back to the video page, no reload
});
$('#mini-expand').onclick = () => { if (current) openVideo(current); };
$('#mini-close').onclick = closePlayer;
$('#mini-play').onclick = () => (video.paused ? video.play().catch(() => {}) : video.pause());
for (const b of $('#mini-ui').querySelectorAll('button')) { b.tabIndex = -1; b.addEventListener('mousedown', (e) => e.preventDefault()); } // keep the keyboard shortcuts working after a click
$('#mini-next').onclick = () => playNext(true);
for (const ev of ['play', 'pause', 'emptied']) video.addEventListener(ev, () => { if (awayNow()) paintMini(); });
video.addEventListener('timeupdate', () => { if (awayNow()) $('#mini-fill').style.width = (vdur() ? (video.currentTime / vdur()) * 100 : 0) + '%'; });

// ---------- notification center: the bell in the header ----------
// Everything the app wants to tell you (new videos from channels you follow, finished downloads, updates, the sleep timer) is kept here
// as well as being shown as a desktop notification, so you can look at it later.
const NOTIF_MAX = 60;
const notifList = () => lsGet('notifs', []);
function addNotif(n) {
  if (settings.bellOn === false) return;
  const l = notifList();
  if (n.vid && l.some((x) => x.kind === n.kind && x.vid === n.vid)) return; // each video is announced once
  if (!n.vid && l.some((x) => x.kind === n.kind && x.title === n.title && x.body === n.body && Date.now() - x.t < 10 * 60 * 1000)) return; // and the same message is not repeated within ten minutes
  l.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: Date.now(), read: false, ...n });
  lsSet('notifs', l.slice(0, NOTIF_MAX));
  paintBellBadge(); if (!$('#notif-panel').hidden) paintNotifPanel();
}
// The in-app list plus the desktop popup (which the settings may suppress).
function notify(kind, title, body, vid, extra) { addNotif({ kind, title, body, vid, ...extra }); return api.notify(kind, title, body, vid).catch(() => false); }
function paintBellBadge() {
  const btn = $('#bell-btn'), badge = $('#bell-badge'), n = notifList().filter((x) => !x.read).length;
  btn.hidden = settings.bellOn === false;
  badge.hidden = !n; badge.textContent = n > 9 ? '9+' : String(n);
  btn.classList.toggle('has', n > 0);
}
const agoText = (t) => { const m = Math.max(0, Math.round((Date.now() - t) / 60000)); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; const h = Math.round(m / 60); if (h < 24) return h + ' h ago'; const d = Math.round(h / 24); return d + (d === 1 ? ' day ago' : ' days ago'); };
function paintNotifPanel() {
  const el = $('#notif-panel'), l = notifList();
  el.innerHTML = `<div class="np-head"><b>Notifications</b><span class="grow"></span><button data-a="read" ${l.some((x) => !x.read) ? '' : 'disabled'}>Mark all as read</button><button data-a="clear" ${l.length ? '' : 'disabled'}>Clear</button><button data-a="settings" title="Notification settings">${ic('gear')}</button></div>
    <div class="np-list">${l.length ? l.map((n) => `<div class="np-row${n.read ? '' : ' unread'}" data-id="${esc(n.id)}">${n.thumb ? `<img loading="lazy" decoding="async" src="${esc(n.thumb)}">` : `<span class="np-ico">${ic(n.kind === 'download' ? 'download' : n.kind === 'update' ? 'up' : n.kind === 'upload' ? 'play' : 'bell')}</span>`}<div class="np-tx"><div class="np-t">${esc(n.title || '')}</div><div class="np-b">${esc(n.body || '')}</div><div class="np-a">${agoText(n.t)}</div></div>${n.read ? '' : '<i class="np-dot"></i>'}</div>`).join('') : '<div class="np-empty">Nothing yet. Turn on the bell under a video to hear about a channel\'s new uploads.</div>'}</div>`;
  el.querySelector('[data-a=read]').onclick = () => { const x = notifList(); x.forEach((n) => (n.read = true)); lsSet('notifs', x); paintBellBadge(); paintNotifPanel(); };
  el.querySelector('[data-a=clear]').onclick = () => { lsSet('notifs', []); paintBellBadge(); paintNotifPanel(); };
  el.querySelector('[data-a=settings]').onclick = () => { closeNotifPanel(); openSettings(); setTimeout(() => [...document.querySelectorAll('#s-tabs a')].find((a) => a.textContent === 'Notifications')?.click(), 60); };
  el.querySelectorAll('.np-row').forEach((row) => (row.onclick = () => {
    const x = notifList(), n = x.find((i) => i.id === row.dataset.id); if (!n) return;
    n.read = true; lsSet('notifs', x); paintBellBadge(); closeNotifPanel();
    if (n.vid) { const v = (lsGet('subcache', { videos: [] }).videos || []).find((i) => i.id === n.vid) || { id: n.vid, title: n.body || '', channel: n.title, thumb: n.thumb || '' }; openVideo(v); }
    else if (n.kind === 'download') document.querySelector('#side [data-nav=downloads]')?.click();
    else if (n.kind === 'update') { openSettings(); setTimeout(() => [...document.querySelectorAll('#s-tabs a')].find((a) => a.textContent === 'General')?.click(), 60); }
  }));
}
function openNotifPanel() { paintNotifPanel(); $('#notif-panel').hidden = false; }
function closeNotifPanel() {
  const el = $('#notif-panel'); if (el.hidden) return; el.hidden = true;
  const x = notifList(); if (x.some((n) => !n.read)) { x.forEach((n) => (n.read = true)); lsSet('notifs', x); } // looking at them counts as reading
  paintBellBadge();
}
$('#bell-btn').onclick = (e) => { e.stopPropagation(); $('#notif-panel').hidden ? openNotifPanel() : closeNotifPanel(); };
document.addEventListener('click', (e) => { if (!$('#notif-panel').hidden && !e.target.closest('#notif-panel, #bell-btn')) closeNotifPanel(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#notif-panel').hidden) { e.stopPropagation(); closeNotifPanel(); } }, true);
paintBellBadge();

let volT;
video.addEventListener('volumechange', () => {
  clearTimeout(volT);
  volT = setTimeout(() => { if (settings.rememberVolume !== false && sleepVol == null) api.setSettings({ lastVolume: video.volume, lastMuted: video.muted }).then((s) => (settings = { ...D, ...s })); }, 600);
});

// ---------- keyboard shortcuts ----------
const SHORTCUTS = [['Space / K', 'Play or pause'], ['J / L', 'Back / forward 10 seconds'], ['← / →', 'Back / forward 5 seconds'], ['↑ / ↓', 'Volume up / down'], ['M', 'Mute'], ['F', 'Full screen'], ['T', 'Theater mode'], ['C', 'Subtitles on or off'], ['I', 'Mini player'], ['0 – 9', 'Jump to 0%–90% of the video'], ['Home / End', 'Start / end of the video'], [', / .', 'Previous / next frame (paused)'], ['Shift + , / .', 'Slower / faster'], ['Shift + N', 'Next video'], ['Shift + P', 'Restart, or previous video'], ['Alt + ← / →', 'Back / forward in the app'], ['/', 'Search'], ['?', 'This list'], ['Esc', 'Close the player or a window']];
function showShortcuts() {
  if ($('#hmodal')) return $('#hmodal').remove();
  const ov = document.createElement('div'); ov.id = 'hmodal'; ov.className = 'overlay';
  ov.innerHTML = `<div class="panel wide dpanel"><header class="s-head"><h2>Keyboard shortcuts</h2><button class="dclose" title="Close">${ic('x')}</button></header><div class="helpgrid">${SHORTCUTS.map(([k, d]) => `<div><kbd>${esc(k)}</kbd><span>${esc(d)}</span></div>`).join('')}</div></div>`;
  document.body.appendChild(ov);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) ov.remove(); }); ov.querySelector('.dclose').onclick = () => ov.remove();
}
document.addEventListener('keydown', (e) => {
  const modal = $('#dmodal') || $('#hmodal');
  if (modal) { if (e.key === 'Escape' || e.key === '?') modal.remove(); return; }
  if (!$('#settings').hidden) { if (e.key === 'Escape') $('#settings').hidden = true; return; }
  if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); navGo(e.key === 'ArrowLeft' ? -1 : 1); return; }
  if (e.target.matches?.('input,textarea,select')) return;
  if (e.key === '/') { e.preventDefault(); $('#search').focus(); return; }
  if (e.key === '?') { e.preventDefault(); showShortcuts(); return; }
  if ($('#watch').hidden && awayNow()) { // a few shortcuts work for the floating player too
    const k = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === ' ' || k === 'k') { e.preventDefault(); video.paused ? video.play() : video.pause(); }
    else if (k === 'm') video.muted = !video.muted;
    else if (k === 'j') video.currentTime -= 10;
    else if (k === 'l') video.currentTime += 10;
    else if (e.shiftKey && k === 'n') playNext(true);
    return;
  }
  if ($('#watch').hidden) return;
  const k = e.key.toLowerCase();
  if (e.shiftKey && k === 'n') { playNext(true); return; }
  if (e.shiftKey && k === 'p') { if (video.currentTime > 3) video.currentTime = 0; else if (navIdx > 0) navGo(-1); return; }
  if (/^[0-9]$/.test(e.key) && video.duration) { video.currentTime = video.duration * (+e.key / 10); return; }
  if (k === 'home') { video.currentTime = 0; return; }
  if (k === 'end' && video.duration) { video.currentTime = video.duration - 0.1; return; }
  if (!e.shiftKey && k === ',' && video.paused) { video.currentTime -= 1 / 30; return; }
  if (!e.shiftKey && k === '.' && video.paused) { video.currentTime += 1 / 30; return; }
  if (k === 'c') { if (capLang) chooseCaption(''); else { const t = capTracks.find((x) => !x.auto) || capTracks[0]; if (t) chooseCaption(t.lang + (t.auto ? '|a' : '|m')); else toast('No subtitles for this video'); } return; }
  if (k === 'i') { api.mini(true); return; }
  if (k === ' ' || k === 'k') { e.preventDefault(); video.paused ? video.play() : video.pause(); }
  else if (k === 't') save({ theater: !settings.theater });
  else if (k === 'j') video.currentTime -= 10;
  else if (k === 'l') video.currentTime += 10;
  else if (k === 'arrowleft') video.currentTime -= 5;
  else if (k === 'arrowright') video.currentTime += 5;
  else if (k === 'arrowup') { e.preventDefault(); video.volume = Math.min(1, video.volume + 0.05); }
  else if (k === 'arrowdown') { e.preventDefault(); video.volume = Math.max(0, video.volume - 0.05); }
  else if (k === 'm') video.muted = !video.muted;
  else if (k === 'f') document.fullscreenElement ? document.exitFullscreen() : $('#player-box').requestFullscreen();
  else if (k === '>' || (k === '.' && e.shiftKey)) setSpeed(video.playbackRate + 0.25);
  else if (k === '<' || (k === ',' && e.shiftKey)) setSpeed(video.playbackRate - 0.25);
  else if (k === 'escape') { if (editingTools) { editingTools = false; renderToolbar(); } else TOOLS.close.run(); }
});

(async () => {
  paintIcons(); await loadSettings(); await refreshAuth();
  video.volume = settings.rememberVolume !== false && settings.lastVolume != null ? settings.lastVolume : Math.min(1, Math.max(0, (settings.defaultVolume ?? 100) / 100));
  video.muted = settings.rememberVolume !== false && !!settings.lastMuted;
  if (signedIn()) fetchSubs().then(renderSideSubs).catch(() => {});
  setTimeout(syncProgress, 6000); setInterval(syncProgress, 30 * 60 * 1000); // (a few seconds after start-up, so the first page is not kept waiting)
  const start = { subs: () => document.querySelector('#side [data-nav=subs]').click(), playlists: () => document.querySelector('#side [data-nav=playlists]').click(), history: () => document.querySelector('#side [data-nav=history]').click() }[settings.startPage];
  (start || goHome)();
})();

// Verbose logging: the player's own events, to find out why something stalled, skipped or went quiet.
for (const ev of ['waiting', 'stalled', 'seeking', 'seeked', 'error', 'playing', 'pause', 'ended', 'ratechange', 'emptied', 'loadedmetadata']) video.addEventListener(ev, () => {
  if (settings.devVerbose || ev === 'error') dlog(ev === 'error' ? 'warn' : 'debug', 'video', ev, 't=' + (video.currentTime || 0).toFixed(1), 'ready=' + video.readyState, video.error ? 'code=' + video.error.code : '');
});
