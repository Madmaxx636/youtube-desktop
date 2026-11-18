const $ = (s) => document.querySelector(s);
const grid = $('#grid'), status = $('#status'), video = $('#video');
let settings = {}, current = null, segments = [], lastSkip = 0, queue = [], view = 'home', speed = 1;
let editingTools = false, commentSort = 'TOP_COMMENTS';
let auth = { active: null, accounts: [], encrypted: false }, remoteSubs = null; // remoteSubs: channel ids when signed in
const signedIn = () => !!auth.active;
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const lsSet = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtNum = (n) => (n == null ? '' : Intl.NumberFormat('en', { notation: 'compact' }).format(n));
const isWatched = (id) => !!lsGet('watched', {})[id];
function setWatched(ids, on) {
  const w = lsGet('watched', {});
  for (const id of [].concat(ids)) { if (on) w[id] = 1; else delete w[id]; }
  lsSet('watched', w);
}

// ---------- settings ----------
const D = SCHEMA.defaults;
const IS_WAYLAND = api.session === 'wayland';
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
const luminance = (h) => { const [r, g, b] = hex2rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const rgba = (h, a) => `rgba(${hex2rgb(h).join(',')},${a})`;

async function loadSettings() {
  settings = { ...D, ...(await api.getSettings()) };
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
}
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => settings.theme === 'auto' && applyTheme());
let lastZoom = 0;
function applyLayout() {
  const root = document.documentElement.style;
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
  const z = parseFloat(settings.uiScale) || 1;
  if (z !== lastZoom) { lastZoom = z; api.setZoom(z); }
}
const CUE_FONTS = { sans: 'Roboto,Arial,sans-serif', serif: 'Georgia,serif', mono: '"DejaVu Sans Mono",monospace', casual: '"Comic Sans MS",cursive' };
const CUE_EDGES = { none: 'none', shadow: '0 0 4px #000,0 0 4px #000', outline: '-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000' };
function cueStyle() {
  return `font-size:${settings.subSize}%;font-family:${CUE_FONTS[settings.subFont] || CUE_FONTS.sans};color:${settings.subColor};background-color:${rgba(settings.subBg, settings.subBgOpacity / 100)};text-shadow:${CUE_EDGES[settings.subEdge] || 'none'}`;
}
function applyCueStyle() { $('#cue-css').textContent = `video::cue{${cueStyle()}}`; }
function applySettings() {
  applyTheme(); applyLayout(); applyCueStyle();
  $('#custom-css').textContent = settings.css || '';
  renderToolbar();
  if (!$('#settings').hidden) renderSettings(true);
}
async function save(p) { settings = await api.setSettings(p); applySettings(); }
$('#menu-btn').onclick = () => save({ sidebarDefault: settings.sidebarDefault === false });

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
  resetToolbar: () => save({ toolbar: null, toolbarHidden: false }),
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
      el.addEventListener('input', () => { rv.textContent = el.value + (it.unit || ''); if (it.key.startsWith('sub')) { settings[it.key] = +el.value; applyCueStyle(); updateCuePreview(); } });
      bind(el, 'change', (e) => +e.value); break;
    }
    case 'color': row.innerHTML = `${lab}<input type="color" value="${esc(val)}">`; bind(row.querySelector('input'), 'change', (e) => e.value); break;
    case 'text': row.innerHTML = `${lab}<input type="text" value="${esc(val ?? '')}" spellcheck="false">`; bind(row.querySelector('input'), 'change', (e) => e.value.trim()); break;
    case 'textarea': row.innerHTML = `${lab}<textarea spellcheck="false">${esc(val ?? '')}</textarea>`; bind(row.querySelector('textarea'), 'change', (e) => e.value); break;
    case 'dir': row.innerHTML = `${lab}<span class="hint">${esc(settings.downloadDir || '(system Downloads folder)')}</span><button>Choose…</button>`; row.querySelector('button').onclick = async () => { const d = await api.pickDir(); if (d) save({ downloadDir: d }); }; break;
    case 'button': row.innerHTML = `<span class="lab"></span><button class="${it.danger ? 'danger' : ''}">${esc(it.label)}</button>`; row.querySelector('button').onclick = () => ACTIONS[it.action](); break;
    case 'file': row.innerHTML = `${lab}<input type="file" accept="${esc(it.accept || '')}">`; row.querySelector('input').onchange = async (e) => { const f = e.target.files[0]; if (f) await ACTIONS[it.action](f); e.target.value = ''; }; break;
    case 'info': row.className = 'sinfo'; row.textContent = it.text; break;
    case 'subpreview': row.className = 'cue-preview'; row.innerHTML = '<span>This is how subtitles will look.</span>'; break;
  }
  return row;
}
function updateCuePreview() { const p = $('.cue-preview span'); if (p) p.style.cssText = cueStyle(); }
function renderSettings(keepScroll) {
  const nav = $('#s-tabs'), pane = $('#s-pane'), top = pane.scrollTop;
  nav.innerHTML = '';
  for (const t of SCHEMA.tabs) { const a = document.createElement('a'); a.textContent = t.label; a.className = t.id === sTab ? 'on' : ''; a.onclick = () => { sTab = t.id; renderSettings(); pane.scrollTop = 0; }; nav.appendChild(a); }
  pane.innerHTML = '';
  const tab = SCHEMA.tabs.find((t) => t.id === sTab) || SCHEMA.tabs[0];
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

// ---------- cards / grids ----------
function card(v, opts = {}) {
  const prog = lsGet('progress', {})[v.id];
  const el = document.createElement('div');
  el.className = 'card' + (isWatched(v.id) && opts.dim ? ' watched' : '');
  el.innerHTML = `<div class="th"><img loading="lazy" src="${esc(v.thumb)}">${v.duration ? `<span class="dur">${esc(v.duration)}</span>` : ''}${prog ? `<div class="bar" style="width:${Math.min(100, prog.pct)}%"></div>` : ''}${isWatched(v.id) && opts.dim ? '<span class="wbadge">Watched</span>' : ''}</div>
    <div class="ci"><h3>${esc(v.title)}</h3><div class="meta">${v.channelId ? `<a data-ch="${esc(v.channelId)}">${esc(v.channel)}</a>` : esc(v.channel)}<br>${esc([v.views, v.published].filter(Boolean).join(' • '))}</div></div>`;
  if (opts.actions) {
    const w = isWatched(v.id), qa = document.createElement('div'); qa.className = 'qa';
    qa.innerHTML = `<button data-q="later" title="Watch later">⏱</button><button data-q="watched" title="${w ? 'Mark unwatched' : 'Mark watched'}">${w ? '↺' : '✓'}</button>`;
    qa.onclick = (e) => {
      e.stopPropagation(); const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.q === 'later') { pushList('watchlater', v); b.textContent = '✓'; }
      else { setWatched(v.id, !isWatched(v.id)); if (view === 'subs') renderSubs(); }
    };
    el.querySelector('.th').appendChild(qa);
  }
  el.onclick = (e) => {
    const a = e.target.closest('[data-ch]');
    if (a) { e.stopPropagation(); return openChannel(a.dataset.ch); }
    if (opts.queue) queue = opts.queue;
    openVideo(v);
  };
  applyDeArrow(el, v);
  el._v = v;
  return el;
}
function renderVideos(list, target = grid, opts = {}) {
  if (settings.hideShorts) list = list.filter((v) => !v.isShort);
  const seen = new Set();
  for (const v of list) { if (seen.has(v.id)) continue; seen.add(v.id); target.appendChild(card(v, { queue: list, ...opts })); }
}
const setStatus = (t) => (status.textContent = t || '');
function showMain() { $('#watch').hidden = true; $('#main').hidden = false; $('#subbox').hidden = true; $('#filters').hidden = true; grid.hidden = false; }
async function guarded(label, fn) { setStatus(`Loading ${label}…`); try { await fn(); setStatus(''); } catch (e) { setStatus('Error: ' + e.message); } }

// ---------- views ----------
async function goHome() { view = 'home'; showMain(); grid.innerHTML = ''; await guarded('home', async () => {
  // Seed the feed from recently watched channels when we have history.
  const seeds = [...new Set(lsGet('history', []).slice(0, 6).map((v) => v.channel).filter(Boolean))];
  renderVideos(await api.home(seeds));
}); }
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
  lastQuery = q; view = 'search'; showMain(); grid.innerHTML = ''; $('#suggest').hidden = true; renderFilters();
  await guarded('results', async () => {
    const r = await api.search(q, searchFilters);
    for (const c of r.channels) {
      const d = document.createElement('div');
      d.className = 'channel-head'; d.style.cursor = 'pointer';
      d.innerHTML = `<img src="${esc(c.thumb)}"><div><h2>${esc(c.name)}</h2><div class="meta">${esc(c.subs)}</div></div>`;
      d.onclick = () => openChannel(c.id); grid.appendChild(d);
    }
    for (const p of r.playlists || []) grid.appendChild(playlistCard(p));
    renderVideos(r.videos);
  });
}
function playlistCard(p) {
  const el = document.createElement('div'); el.className = 'card';
  el.innerHTML = `<div class="th"><img loading="lazy" src="${esc(p.thumb)}">${p.count ? `<span class="dur">${esc(p.count)}</span>` : ''}</div><div class="ci"><h3>${esc(p.title)}</h3><div class="meta">${esc(p.meta || 'Playlist')}</div></div>`;
  el.onclick = () => openPlaylist(p.id);
  el._pl = p;
  return el;
}
async function showHistory() {
  if (!signedIn()) return showList('history', 'History');
  view = 'history'; showMain(); grid.innerHTML = '';
  await guarded('history', async () => renderVideos(await api.meHistory()));
}
const plIdFrom = (t) => /[?&]list=([\w-]+)/.exec(t)?.[1] || (/^[\w-]{13,}$/.test(t.trim()) ? t.trim() : null);
async function showPlaylists() {
  view = 'playlists'; showMain(); grid.innerHTML = '';
  const bar = document.createElement('div'); bar.className = 'channel-head';
  bar.innerHTML = '<input id="pl-url" placeholder="Paste a playlist link or ID to open it" style="flex:1;padding:8px 14px;background:var(--bg2);border:0;border-radius:18px"><button id="pl-open">Open</button>';
  grid.appendChild(bar);
  const go = () => { const id = plIdFrom($('#pl-url').value); if (id) openPlaylist(id); else setStatus('That does not look like a playlist link.'); };
  $('#pl-open').onclick = go; $('#pl-url').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  if (!signedIn()) return setStatus('Sign in (👤) to see your own playlists. You can still open any public playlist above.');
  await guarded('playlists', async () => { const l = await api.mePlaylists(); if (!l.length) setStatus('No playlists found.'); for (const p of l) grid.appendChild(playlistCard(p)); });
}
async function startPlaylistDownload(id, title, kind) {
  const list = lsGet('downloads', []).filter((x) => x.key !== 'PL:' + id);
  list.unshift({ key: 'PL:' + id, id: 'PL:' + id, title, kind: 'playlist', state: 'starting', pct: 0 }); lsSet('downloads', list.slice(0, 100));
  await api.downloadPlaylist(id, kind);
}
async function openPlaylist(id) {
  view = 'playlist'; showMain(); grid.innerHTML = '';
  await guarded('playlist', async () => {
    const pl = await api.playlist(id);
    const h = document.createElement('div'); h.className = 'channel-head'; h.style.flexWrap = 'wrap';
    h.innerHTML = `<div style="flex:1;min-width:240px"><h2>${esc(pl.title)}</h2><div class="meta" style="color:var(--fg2)">${esc(pl.author)} • ${esc(pl.total)} videos</div><div id="pl-progress" class="hint"></div></div>
      <button id="pl-play">▶ Play all</button><button id="pl-dlv">⬇ Download all (video)</button><button id="pl-dla">♫ Download all (MP3)</button><button id="pl-cancel" hidden>Cancel download</button>`;
    grid.appendChild(h);
    $('#pl-play').onclick = () => { if (pl.videos[0]) { queue = pl.videos; openVideo(pl.videos[0]); } };
    const dl = async (kind) => {
      $('#pl-progress').textContent = 'Starting…'; $('#pl-cancel').hidden = false;
      try { await startPlaylistDownload(id, pl.title, kind); } catch (e) { $('#pl-progress').textContent = 'Could not start: ' + e.message; $('#pl-cancel').hidden = true; }
    };
    $('#pl-dlv').onclick = () => dl('video'); $('#pl-dla').onclick = () => dl('audio');
    $('#pl-cancel').onclick = () => api.cancelDownload('PL:' + id);
    renderVideos(pl.videos);
  });
}
async function openChannel(id) {
  showMain(); grid.innerHTML = '';
  await guarded('channel', async () => {
    const c = await api.channel(id);
    const h = document.createElement('div');
    h.className = 'channel-head';
    h.innerHTML = `<img src="${esc(c.avatar)}"><div><h2>${esc(c.name)}</h2><button>${isSub(id) ? '✓ Subscribed' : '＋ Subscribe'}</button></div>`;
    h.querySelector('button').onclick = async (e) => { await setSub({ id, name: c.name, avatar: c.avatar }); e.target.textContent = isSub(id) ? '✓ Subscribed' : '＋ Subscribe'; };
    grid.appendChild(h); renderVideos(c.videos);
  });
}
function showList(key, title) {
  view = key; showMain(); grid.innerHTML = ''; setStatus('');
  const list = lsGet(key, []);
  if (!list.length) return setStatus(`${title} is empty.`);
  renderVideos(list);
}
const DL_ICON = { video: '⬇', audio: '♫', subs: 'CC', playlist: '☰' };
function paintDl(el, x) {
  const running = x.state === 'downloading' || x.state === 'starting', pct = Math.max(0, Math.min(100, x.pct || 0));
  const prog = x.kind === 'playlist' && x.total ? `item ${x.item} of ${x.total} — ${pct}%` : `${pct}%`;
  const st = running ? (x.state === 'starting' ? 'Starting…' : 'Downloading ' + prog) : x.state === 'done' ? 'Finished' : x.state === 'cancelled' ? 'Cancelled' : 'Failed' + (x.error ? ': ' + x.error.replace(/^ERROR:\s*/, '').slice(0, 160) : '');
  el.innerHTML = `<div class="top"><span class="t" title="${esc(x.title)}">${DL_ICON[x.kind] || '⬇'}  ${esc(x.title)}</span>${running ? '<button data-a="cancel">Cancel</button>' : ''}${x.file && x.state === 'done' ? '<button data-a="show">Show in folder</button>' : ''}${!running ? '<button data-a="rm">Remove</button>' : ''}</div>
    <div class="pbar"><i style="width:${running || x.state === 'done' ? pct : 0}%"></i></div><div class="st">${esc(st)}${x.file ? ' • ' + esc(x.file.split('/').pop()) : ''}</div>`;
  el.querySelector('[data-a=cancel]')?.addEventListener('click', () => api.cancelDownload(x.key));
  el.querySelector('[data-a=show]')?.addEventListener('click', () => api.showFile(x.file));
  el.querySelector('[data-a=rm]')?.addEventListener('click', () => { lsSet('downloads', lsGet('downloads', []).filter((i) => i.key !== x.key)); el.remove(); });
}
function showDownloads() {
  view = 'downloads'; showMain(); grid.innerHTML = ''; setStatus('');
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
$('#logo').onclick = goHome;

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
  view = 'subs'; showMain(); grid.hidden = true; $('#subbox').hidden = false; setStatus('');
  if (!signedIn() && !Object.keys(lsGet('subs', {})).length) {
    $('#subbox').innerHTML = '<div class="hint" style="padding:24px">No subscriptions yet. Subscribe from a video or channel page, or import a Google Takeout subscriptions.csv in Settings.</div>';
    return;
  }
  const cache = lsGet('subcache', { ts: 0, videos: [] });
  renderSubs();
  if (force || Date.now() - cache.ts > 30 * 60 * 1000) {
    setStatus('Refreshing subscriptions…');
    try { await fetchSubs(); setStatus(''); } catch (e) { setStatus('Could not load subscriptions: ' + e.message); }
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
  el.innerHTML = `<div class="th"><img loading="lazy" src="${esc(v.thumb)}">${v.duration ? `<span class="dur">${esc(v.duration)}</span>` : ''}</div>
    <div class="info"><h3>${esc(v.title)}</h3><div class="meta"><a class="linkish" data-ch="${esc(v.channelId)}">${esc(v.channel)}</a> • ${esc([v.views, v.published].filter(Boolean).join(' • '))}</div>
    <div class="acts"><button data-a="watch">${w ? 'Mark unwatched' : 'Mark watched'}</button><button data-a="later">Watch later</button></div></div>`;
  const play = () => { queue = queueList; openVideo(v); };
  el.querySelector('.th').onclick = play; el.querySelector('h3').onclick = play;
  el.querySelector('[data-ch]').onclick = (e) => { e.stopPropagation(); openChannel(v.channelId); };
  el.querySelector('[data-a=watch]').onclick = () => { setWatched(v.id, !w); renderSubBox(); };
  el.querySelector('[data-a=later]').onclick = (e) => { pushList('watchlater', v); e.target.textContent = 'Added ✓'; };
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
  view = 'manage'; showMain(); grid.innerHTML = ''; setStatus('');
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
$('#search').addEventListener('input', (e) => {
  clearTimeout(sugT);
  const q = e.target.value.trim();
  if (!q) return ($('#suggest').hidden = true);
  sugT = setTimeout(async () => {
    try {
      const s = await api.suggest(q); const ul = $('#suggest'); ul.innerHTML = '';
      for (const t of s.slice(0, 8)) { const li = document.createElement('li'); li.textContent = t; li.onclick = () => { $('#search').value = t; doSearch(t); }; ul.appendChild(li); }
      ul.hidden = !s.length;
    } catch {}
  }, 180);
});
$('#search').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(e.target.value); });
$('#search-btn').onclick = () => doSearch($('#search').value);
document.addEventListener('click', (e) => {
  if (!e.target.closest('#search-wrap')) $('#suggest').hidden = true;
  if (!e.target.closest('#tool-menu') && !e.target.closest('#add-tool') && !e.target.closest('[data-id=saveplaylist]')) $('#tool-menu').hidden = true;
  if (!e.target.closest('.popover') && !e.target.closest('#acct-btn')) $('#acct-menu').hidden = true;
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
}
function toast(msg) { const t = $('#sb-toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3500); }
function pushList(key, v, max = 300) {
  const l = lsGet(key, []).filter((x) => x.id !== v.id);
  l.unshift({ id: v.id, title: v.title, channel: v.channel, channelId: v.channelId, views: v.views, published: v.published, duration: v.duration, thumb: v.thumb });
  lsSet(key, l.slice(0, max));
}
function toggleList(key, v) {
  const l = lsGet(key, []);
  if (l.some((x) => x.id === v.id)) lsSet(key, l.filter((x) => x.id !== v.id)); else pushList(key, v);
}
const inList = (key, id) => lsGet(key, []).some((x) => x.id === id);

// ---------- customizable player toolbar ----------
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const DEFAULT_TOOLBAR = ['quality', 'speed', 'captions', 'loop', 'theater', 'pip', 'mini', 'watchlater', 'dlvideo', 'dlaudio', 'dlmenu', 'close'];
const watchUrl = (t) => `https://www.youtube.com/watch?v=${current.id}${t ? '&t=' + Math.floor(video.currentTime) : ''}`;
const TOOLS = {
  quality: { label: 'Quality', select: RES, value: () => settings.quality || 'auto', change: (v) => { save({ quality: v }); if (current) loadStream(current.id, v, video.currentTime); } },
  speed: { label: 'Speed', select: SPEEDS.map((s) => [String(s), s + 'x']), value: () => String(speed), change: (v) => setSpeed(parseFloat(v)) },
  loop: { icon: '🔁', label: 'Loop', on: () => video.loop, run: () => { video.loop = !video.loop; } },
  theater: { icon: '▭', label: 'Theater mode (T)', on: () => !!settings.theater, run: () => save({ theater: !settings.theater }) },
  pip: { icon: '⧉', label: 'Picture in picture', run: () => (document.pictureInPictureElement ? document.exitPictureInPicture() : video.requestPictureInPicture().catch(() => {})) },
  mini: { icon: '▫', label: 'Mini player', run: () => api.mini(true) },
  watchlater: { icon: '⏱', label: 'Watch later', on: () => current && inList('watchlater', current.id), run: () => toggleList('watchlater', current) },
  subscribe: { icon: '＋', label: 'Subscribe', on: () => current && isSub(current.channelId), run: () => current.channelId && setSub({ id: current.channelId, name: current.channel, avatar: current.channelThumb || '' }) },
  captions: { label: 'Captions', select: () => [['', capTracks.length ? 'CC off' : 'CC: none'], ...capTracks.map((t) => [t.lang + (t.auto ? '|a' : '|m'), t.name])], value: () => capLang, change: (v) => chooseCaption(v) },
  saveplaylist: { icon: '➕', label: 'Save to playlist', run: async () => {
    if (!signedIn()) return promptLogin('Sign in to save videos to your playlists.');
    try { const pls = await api.mePlaylists(); showMenu(pls.length ? pls.map((p) => ({ label: p.title, fn: () => api.addToPlaylist(p.id, current.id).then(() => toast('Added to ' + p.title), (e) => toast('Failed: ' + e.message)) })) : [{ label: 'No playlists found' }]); }
    catch (e) { toast('Could not load playlists: ' + e.message); }
  } },
  dlvideo: { icon: '⬇', label: 'Download video (your settings)', run: () => startDownload('video') },
  dlmenu: { icon: '⬇▾', label: 'Download with a preset…', run: () => showMenu([{ label: 'Video (your settings)', fn: () => startDownload('video') }, { label: 'Audio (your settings)', fn: () => startDownload('audio') }, ...DL_PRESETS.map(([label, kind, o]) => ({ label, fn: () => startDownload(kind, o) }))]) },
  dlaudio: { icon: '♫', label: 'Download audio (your settings)', run: () => startDownload('audio') },
  copylink: { icon: '🔗', label: 'Copy link', run: () => api.copy(watchUrl()) },
  copytime: { icon: '🕒', label: 'Copy link at current time', run: () => api.copy(watchUrl(true)) },
  openweb: { icon: '↗', label: 'Open on youtube.com', run: () => api.openExternal(watchUrl()) },
  back10: { icon: '⏪', label: 'Back 10s', run: () => (video.currentTime -= 10) },
  fwd10: { icon: '⏩', label: 'Forward 10s', run: () => (video.currentTime += 10) },
  next: { icon: '⏭', label: 'Next video', run: () => playNext() },
  mute: { icon: '🔇', label: 'Mute', on: () => video.muted, run: () => { video.muted = !video.muted; } },
  audioonly: { icon: '🎧', label: 'Audio only', on: () => settings.quality === 'audio', run: () => TOOLS.quality.change(settings.quality === 'audio' ? 'auto' : 'audio') },
  close: { icon: '✕', label: 'Close player (Esc)', run: () => { video.pause(); showMain(); } },
};
const toolIds = () => (settings.toolbar || DEFAULT_TOOLBAR).filter((id) => TOOLS[id]);
function makeTool(id) {
  const t = TOOLS[id]; let el;
  if (t.select) {
    el = document.createElement('select'); el.title = t.label;
    el.innerHTML = (typeof t.select === 'function' ? t.select() : t.select).map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    el.value = t.value(); el.onchange = () => t.change(el.value);
  } else {
    el = document.createElement('button'); el.title = t.label; el.textContent = t.icon;
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
function renderToolbar() {
  const wrap = $('#toolbar-wrap'), tools = $('#player-tools'), ctl = $('#toolbar-ctl');
  if (!tools) return;
  wrap.classList.toggle('hidden', !!settings.toolbarHidden);
  wrap.classList.toggle('editing', editingTools);
  tools.innerHTML = ''; ctl.innerHTML = '';
  for (const id of toolIds()) tools.appendChild(makeTool(id));
  const btn = (txt, title, fn, id) => { const b = document.createElement('button'); b.textContent = txt; b.title = title; if (id) b.id = id; b.onclick = fn; ctl.appendChild(b); };
  if (editingTools) {
    btn('＋ Add', 'Add a button', (e) => { e.stopPropagation(); openToolMenu(); }, 'add-tool');
    btn('Reset', 'Restore default buttons', () => save({ toolbar: null }));
    btn('Done', 'Finish editing', () => { editingTools = false; renderToolbar(); });
  } else {
    if (!settings.toolbarHidden) btn('✎', 'Edit buttons', () => { editingTools = true; renderToolbar(); });
    btn(settings.toolbarHidden ? '⌄ Buttons' : '⌃', settings.toolbarHidden ? 'Show toolbar' : 'Hide toolbar', () => save({ toolbarHidden: !settings.toolbarHidden }));
  }
}
function showMenu(items) {
  const menu = $('#tool-menu'); menu.innerHTML = '';
  for (const it of items) {
    const li = document.createElement('li'); li.textContent = it.label;
    if (it.fn) li.onclick = () => { menu.hidden = true; it.fn(); }; else li.className = 'empty';
    menu.appendChild(li);
  }
  menu.hidden = false;
}
function openToolMenu() {
  const have = new Set(toolIds()), avail = Object.keys(TOOLS).filter((id) => !have.has(id));
  showMenu(avail.length ? avail.map((id) => ({ label: `${TOOLS[id].icon || '▾'}  ${TOOLS[id].label}`, fn: () => save({ toolbar: [...toolIds(), id] }) })) : [{ label: 'All buttons are on the toolbar' }]);
}

// ---------- player ----------
function setSpeed(s) {
  speed = Math.min(3, Math.max(0.25, s));
  video.playbackRate = speed;
  if (settings.rememberSpeed) save({ speed });
  else renderToolbar();
}
async function loadStream(id, quality, keepTime) {
  const t = keepTime ?? 0;
  const s = await api.stream(id, quality);
  audio.pause(); audio.removeAttribute('src'); audioActive = false;
  video.src = s.video || s.audio;
  if (s.video && s.audio) { audio.src = s.audio; audioActive = true; }
  video.addEventListener('loadedmetadata', () => {
    if (t) video.currentTime = t;
    video.playbackRate = speed;
    syncAudio(true);
    video.play().catch(() => {});
  }, { once: true });
}

// Video and audio arrive as separate streams, so a hidden <audio> element follows the video.
const audio = new Audio();
audio.preload = 'auto';
let audioActive = false;
function syncAudio(hard) {
  if (!audioActive) return;
  audio.playbackRate = video.playbackRate;
  audio.volume = video.volume; audio.muted = video.muted;
  if (hard || Math.abs(audio.currentTime - video.currentTime) > 0.25) audio.currentTime = video.currentTime;
}
video.addEventListener('play', () => { syncAudio(true); if (audioActive) audio.play().catch(() => {}); });
video.addEventListener('pause', () => audioActive && audio.pause());
video.addEventListener('waiting', () => audioActive && audio.pause());
video.addEventListener('playing', () => { syncAudio(true); if (audioActive) audio.play().catch(() => {}); });
video.addEventListener('seeked', () => syncAudio(true));
video.addEventListener('ratechange', () => syncAudio(false));
video.addEventListener('volumechange', () => syncAudio(false));
setInterval(() => { if (audioActive && !video.paused) syncAudio(false); }, 1000);

function updateChannelRow() {
  if (!current) return;
  const subbed = isSub(current.channelId);
  $('#w-sub').textContent = subbed ? '✓ Subscribed' : '＋ Subscribe';
  $('#w-sub').classList.toggle('on', subbed);
}
$('#w-sub').onclick = async () => { await TOOLS.subscribe.run(); updateChannelRow(); renderToolbar(); };

async function openVideo(v) {
  current = v; segments = [];
  $('#main').hidden = true; $('#watch').hidden = false; $('#watch').scrollTop = 0;
  $('#w-title').textContent = v.title;
  $('#w-ch').textContent = v.channel || ''; $('#w-subs').textContent = ''; $('#r-likes').textContent = ''; $('#r-dislikes').textContent = ''; updateRateButtons(); $('#w-avatar').removeAttribute('src');
  $('#w-stats').textContent = [v.views, v.published].filter(Boolean).join(' • ');
  $('#w-desc-text').textContent = ''; $('#c-list').innerHTML = ''; $('#c-title').textContent = 'Comments'; $('#related').innerHTML = '';
  $('#w-desc').classList.toggle('collapsed', !settings.descExpanded); $('#desc-toggle').textContent = settings.descExpanded ? 'Show less' : 'Show more'; $('#desc-toggle').hidden = true;
  speed = settings.rememberSpeed && settings.speed ? settings.speed : parseFloat(settings.defaultSpeed) || 1;
  pushList('history', v); setWatched(v.id, true);
  capTracks = []; capLang = ''; setCaptionTrack(null);
  updateChannelRow(); renderToolbar();
  try {
    await loadStream(v.id, settings.quality || 'auto');
    const prog = lsGet('progress', {})[v.id];
    if (settings.resume && prog && prog.pct < 95) video.addEventListener('loadedmetadata', () => (video.currentTime = prog.t), { once: true });
  } catch (e) { $('#w-stats').textContent = 'Could not load stream: ' + e.message; }
  navigator.mediaSession && (navigator.mediaSession.metadata = new MediaMetadata({ title: v.title, artist: v.channel, artwork: [{ src: v.thumb }] }));
  loadSegments(v.id); loadVotes(v.id); loadCaptionList(v.id);
  try {
    const info = await api.video(v.id);
    if (!current || current.id !== v.id) return;
    current = { ...v, ...info, channelId: info.channelId || v.channelId, channelThumb: info.channelThumb };
    $('#w-title').textContent = info.title || v.title;
    $('#w-ch').textContent = info.channel || v.channel; $('#w-ch').onclick = () => info.channelId && openChannel(info.channelId);
    $('#w-subs').textContent = info.subs || '';
    if (info.channelThumb) $('#w-avatar').src = info.channelThumb;
    if (info.likes && !$('#r-likes').textContent) $('#r-likes').textContent = fmtNum(info.likes);
    daBranding(v.id).then((b) => { const r = daPick(b, v.id); if (settings.dearrow && r?.title && current?.id === v.id) { $('#w-title').title = info.title || v.title; $('#w-title').textContent = r.title; } });

    $('#w-stats').textContent = [info.views != null ? fmtNum(info.views) + ' views' : '', info.relative || info.published].filter(Boolean).join(' • ');
    $('#w-desc-text').innerHTML = rich(info.description || '');
    $('#desc-toggle').hidden = $('#w-desc-text').scrollHeight < 72; // short descriptions need no toggle
    updateChannelRow(); renderToolbar();
    renderVideos(info.related, $('#related'));
    queue = info.related.filter((x) => !x.isShort);
    loadComments(v.id);
  } catch {}
}
$('#desc-toggle').onclick = () => {
  const d = $('#w-desc'), open = d.classList.toggle('collapsed') === false;
  $('#desc-toggle').textContent = open ? 'Show less' : 'Show more';
};
async function loadComments(id) {
  $('#c-list').innerHTML = '<div class="hint">Loading comments…</div>';
  try {
    const cs = await api.comments(id, commentSort);
    if (!current || current.id !== id) return;
    $('#c-title').textContent = `Comments (${cs.length}${cs.length >= 20 ? '+' : ''})`;
    $('#c-list').innerHTML = cs.length ? cs.map((c) => `<div class="cm"><img src="${esc(c.thumb)}"><div><div class="head"><b>${esc(c.author)}</b><small>${esc(c.published)}</small></div><div class="body">${rich(c.text)}</div><div class="foot"><span>👍 ${esc(c.likes || '0')}</span></div></div></div>`).join('') : '<div class="hint">No comments.</div>';
    // Long comments are clamped; offer "Read more" only where they actually overflow.
    $('#c-list').querySelectorAll('.body').forEach((b) => {
      if (b.scrollHeight > b.clientHeight + 2) {
        const m = document.createElement('button'); m.className = 'link'; m.textContent = 'Read more';
        m.onclick = () => { const o = b.classList.toggle('open'); m.textContent = o ? 'Show less' : 'Read more'; };
        b.after(m);
      }
    });
  } catch { $('#c-list').innerHTML = '<div class="hint">Comments unavailable.</div>'; }
}
$('#c-sort').onchange = (e) => { commentSort = e.target.value; if (current) loadComments(current.id); };
$('#c-toggle').onclick = () => save({ commentsHidden: !settings.commentsHidden });

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
  if (!settings.dearrow || !v.id) return;
  const r = daPick(await daBranding(v.id), v.id); if (!r) return;
  const h = root.querySelector('h3'), img = root.querySelector('img');
  if (r.title && h) { h.title = h.textContent; h.textContent = r.title; }
  if (r.thumb && img) img.src = r.thumb;
}

// ---------- like / dislike (counts from Return YouTube Dislike) ----------
async function loadVotes(id) {
  if (settings.ryd === false) return;
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

// ---------- posting comments ----------
$('#c-post').onclick = async () => {
  const text = $('#c-input').value.trim(); if (!text || !current) return;
  if (!signedIn()) return promptLogin('Sign in to comment.');
  $('#c-post').disabled = true;
  try {
    await api.postComment(current.id, text);
    $('#c-input').value = ''; toast('Comment posted');
    commentSort = 'NEWEST_FIRST'; $('#c-sort').value = commentSort;
    setTimeout(() => current && loadComments(current.id), 2000);
  } catch (e) { toast('Could not post comment: ' + e.message); }
  $('#c-post').disabled = false;
};

// ---------- subtitles (fetched through yt-dlp) ----------
let capTracks = [], capLang = '';
function setCaptionTrack(vtt) {
  video.querySelectorAll('track').forEach((t) => t.remove());
  if (!vtt) return;
  const t = document.createElement('track');
  t.kind = 'subtitles'; t.label = 'Captions'; t.default = true;
  t.src = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
  video.appendChild(t); t.track.mode = 'showing';
}
async function loadCaptionList(id) {
  try {
    let l = await api.subsList(id); if (current?.id !== id) return;
    if (settings.subAllowAuto === false) l = l.filter((t) => !t.auto);
    capTracks = l; renderToolbar();
    const want = (settings.subLang || '').toLowerCase();
    const pref = want && (l.find((x) => x.lang.toLowerCase() === want) || l.find((x) => x.lang.toLowerCase().startsWith(want)));
    if (settings.subDefaultOn && pref) chooseCaption(pref.lang + (pref.auto ? '|a' : '|m'));
  } catch {}
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
  b.innerHTML = a?.avatar ? `<img src="${esc(a.avatar)}" style="width:28px;height:28px;border-radius:50%;vertical-align:middle">` : '👤';
  b.title = a ? a.name : 'Sign in';
}
async function onAccountChanged() {
  lsSet('subcache', { ts: 0, videos: [] }); remoteSubs = null;
  await refreshAuth();
  if (signedIn()) fetchSubs().catch(() => {});
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
  row('<span class="t">＋ Add another account</span>', () => { m.hidden = true; startLogin(); });
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
      const p = lsGet('progress', {}); p[current.id] = { t: video.currentTime, pct: (video.currentTime / video.duration) * 100 }; lsSet('progress', p);
    }
  }
  api.sendState({ src: video.currentSrc, audio: audioActive ? audio.currentSrc : null, time: video.currentTime, playing: !video.paused });
});
video.addEventListener('ended', () => { if (!video.loop && settings.autoplayNext !== false) playNext(); });
// The main process needs to know whether something is playing (for the mini player's open-on-minimize option).
for (const ev of ['play', 'pause']) video.addEventListener(ev, () => api.sendState({ src: video.currentSrc, audio: audioActive ? audio.currentSrc : null, time: video.currentTime, playing: !video.paused }));
function playNext() {
  const i = queue.findIndex((x) => x.id === current?.id);
  const n = i >= 0 ? queue[i + 1] : queue.find((x) => x.id !== current?.id);
  if (n) openVideo(n);
}

// ---------- media keys / tray / mini ----------
api.onMedia((c) => {
  if (c === 'toggle') video.paused ? video.play() : video.pause();
  else if (c === 'next') playNext();
  else if (c === 'prev') video.currentTime = 0;
  else if (c === 'mini-closed') { video.play().catch(() => {}); }
  else if (c === 'mini-ready') api.sendState({ src: video.currentSrc, audio: audioActive ? audio.currentSrc : null, time: video.currentTime, play: true }), video.pause();
  else if (c.startsWith('mini-time:')) video.currentTime = parseFloat(c.slice(10)) || video.currentTime;
});
if (navigator.mediaSession) {
  navigator.mediaSession.setActionHandler('nexttrack', playNext);
  navigator.mediaSession.setActionHandler('previoustrack', () => (video.currentTime = 0));
}

// ---------- right-click menus ----------
const ytUrl = (id) => `https://www.youtube.com/watch?v=${id}`;
document.addEventListener('contextmenu', async (e) => {
  const t = e.target;
  const card = t.closest?.('.card, .subrow'), vidEl = t.closest?.('video'), link = t.closest?.('a[data-url]');
  const items = [], run = {}, add = (id, label, fn, extra) => { items.push({ id, label, ...extra }); run[id] = fn; }, sep = () => items.length && items[items.length - 1].type !== 'separator' && items.push({ type: 'separator' });
  if (card?._v) {
    const v = card._v, w = isWatched(v.id), later = inList('watchlater', v.id);
    add('play', 'Play', () => openVideo(v));
    add('later', later ? 'Remove from Watch later' : 'Add to Watch later', () => toggleList('watchlater', v));
    add('watched', w ? 'Mark as unwatched' : 'Mark as watched', () => { setWatched(v.id, !w); if (view === 'subs') renderSubs(); else card.classList.toggle('watched', !w); });
    sep();
    add('dlv', 'Download video', () => startDownload('video', undefined, v));
    add('dla', 'Download audio', () => startDownload('audio', undefined, v));
    sep();
    add('copy', 'Copy link', () => api.copy(ytUrl(v.id)));
    add('web', 'Open on youtube.com', () => api.openExternal(ytUrl(v.id)));
    if (v.channelId) {
      sep();
      add('chan', v.channel ? `Go to ${v.channel}` : 'Go to channel', () => openChannel(v.channelId));
      const subbed = isSub(v.channelId);
      add('sub', subbed ? 'Unsubscribe' : 'Subscribe', () => setSub({ id: v.channelId, name: v.channel, avatar: '' }, !subbed));
    }
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

// ---------- keyboard shortcuts ----------
document.addEventListener('keydown', (e) => {
  if (!$('#settings').hidden) { if (e.key === 'Escape') $('#settings').hidden = true; return; }
  if (e.target.matches?.('input,textarea,select')) return;
  if (e.key === '/') { e.preventDefault(); $('#search').focus(); return; }
  if ($('#watch').hidden) return;
  const k = e.key.toLowerCase();
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
  await loadSettings(); await refreshAuth();
  video.volume = Math.min(1, Math.max(0, (settings.defaultVolume ?? 100) / 100));
  if (signedIn()) fetchSubs().catch(() => {});
  const start = { subs: () => document.querySelector('#side [data-nav=subs]').click(), playlists: () => document.querySelector('#side [data-nav=playlists]').click(), history: () => document.querySelector('#side [data-nav=history]').click() }[settings.startPage];
  (start || goHome)();
})();
