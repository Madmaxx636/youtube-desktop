const { app, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, shell, nativeImage, dialog, Notification, clipboard, safeStorage, screen } = require('electron');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');

let win, mini, tray, yt, lockLost = false;
// Test mode: nothing may appear on the user's screen (windows, tray, shortcuts, notifications, menus, browser).
const HIDDEN = !!process.env.YT_TEST_HIDDEN;
// Developer log: what the app did and what went wrong, kept in memory (the last 1,000 lines) and shown in the hidden Developer settings.
const logRing = []; let devVerbose = false;
const fmtLog = (a) => a.map((x) => (x instanceof Error ? x.stack || x.message : typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })())).join(' ');
const scrub = (t) => t.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]').replace(/([?&](?:ip|key|sig|signature|token|access_token|authorization)=)[^&\s"]+/gi, '$1…').slice(0, 400) + (t.length > 400 ? ' …' : '');
// Warnings and errors are also written to a file in the app's data folder (kept across restarts, about 2 MB at most), so a problem
// that closed the app or happened last week can still be reported.
const LOG_DIR = path.join(app.getPath('userData'), 'logs'), LOG_FILE = path.join(LOG_DIR, 'youtube-desktop.log');
let logBytes = 0;
function persist(line) {
  if (HIDDEN && !process.env.YT_TEST_LOG) return;
  try {
    if (!logBytes) { fs.mkdirSync(LOG_DIR, { recursive: true }); try { logBytes = fs.statSync(LOG_FILE).size; } catch { logBytes = 1; } }
    if (logBytes > 1024 * 1024) { try { fs.renameSync(LOG_FILE, LOG_FILE + '.1'); } catch {} logBytes = 1; }
    fs.appendFile(LOG_FILE, line + '\n', () => {}); logBytes += line.length + 1;
  } catch {}
}
const stamp = (t) => new Date(t).toISOString().replace('T', ' ').slice(0, 19);
function dlog(level, ...a) {
  const e = { t: Date.now(), level, src: 'main', msg: scrub(fmtLog(a)) };
  logRing.push(e); if (logRing.length > 1000) logRing.shift();
  // (the YouTube library's parser notes and Electron's deprecation notices are noise, not problems)
  if ((level === 'warn' || level === 'error') && !/^\[YOUTUBEJS\]|^\(electron\) /.test(e.msg)) persist(`${stamp(e.t)} ${level.toUpperCase()} main ${e.msg}`);
}
for (const k of ['log', 'info', 'warn', 'error']) { const o = console[k].bind(console); console[k] = (...a) => { dlog(k === 'log' ? 'info' : k, ...a); o(...a); }; }
process.on('uncaughtExceptionMonitor', (e) => dlog('error', 'uncaught exception:', e));
process.on('unhandledRejection', (e) => dlog('error', 'unhandled rejection:', e));
app.on('child-process-gone', (_e, d) => dlog('error', `${d.type} process gone: ${d.reason} (exit ${d.exitCode})`));
persist(`${stamp(Date.now())} ---- started ----`);
const showWin = (w) => { if (!HIDDEN && w && !w.isDestroyed()) w.show(); };
const jobs = new Map();
let playerPlaying = false;
// Prefer a user-installed, up-to-date yt-dlp: distro packages go stale and YouTube breaks them.
const localYtdlp = path.join(require('os').homedir(), '.local', 'bin', 'yt-dlp');
const bundledYtdlp = path.join(process.resourcesPath || '', 'yt-dlp.exe'); // shipped inside the Windows build
const YTDLP = process.platform === 'win32' && fs.existsSync(bundledYtdlp) ? bundledYtdlp : fs.existsSync(localYtdlp) ? localYtdlp : 'yt-dlp';
let quitting = false;

const store = {
  file: () => path.join(app.getPath('userData'), 'settings.json'),
  read() { try { return JSON.parse(fs.readFileSync(this.file(), 'utf8')); } catch { return {}; } },
  write(o) { fs.mkdirSync(path.dirname(this.file()), { recursive: true }); fs.writeFileSync(this.file(), JSON.stringify(o, null, 2)); },
};

// ---------- accounts ----------
// Sign-in uses Google's own device-code page, so this app never sees a password. Tokens are stored per
// account and sealed with the OS keyring (safeStorage) when a real keyring backend is available.
const acc = {
  file: () => path.join(app.getPath('userData'), 'accounts.json'),
  read() { try { return JSON.parse(fs.readFileSync(this.file(), 'utf8')); } catch { return { active: null, accounts: [] }; } },
  write(o) { fs.mkdirSync(path.dirname(this.file()), { recursive: true }); fs.writeFileSync(this.file(), JSON.stringify(o), { mode: 0o600 }); },
};
const keyringOk = () => { try { return safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== 'basic_text'; } catch { return false; } };
const seal = (o) => { const j = JSON.stringify(o); return keyringOk() ? { enc: true, data: safeStorage.encryptString(j).toString('base64') } : { enc: false, data: j }; };
const unseal = (r) => JSON.parse(r.enc ? safeStorage.decryptString(Buffer.from(r.data, 'base64')) : r.data);

let ytPromise = null, ytAuth = null, authPromise = null, pendingLogin = null;
function resetSession() { yt = null; ytPromise = null; ytAuth = null; authPromise = null; }

// Public data (search, playback, comments, channels, public playlists) always uses an anonymous session.
// YouTube rejects the signed-in OAuth token on the web client with HTTP 400, so attaching it to this session
// broke every request while signed in.
async function innertube() {
  if (yt) return yt;
  if (!ytPromise) ytPromise = import('youtubei.js').then(({ Innertube }) => Innertube.create({ generate_session_locally: true })).catch((e) => { ytPromise = null; throw e; });
  yt = await ytPromise;
  return yt;
}

// Account data uses a second, signed-in session. The token comes from Google's TV device flow, so every request
// from this session is sent as the TV client; that is the one client that accepts it.
// The TV player wants its own timestamp format: the web player's five digits with 001 added. Anything else gets "The page needs to be reloaded" (SmartTube found the same).
const tvSts = (i) => { const v = String(i.session.player?.signature_timestamp || ''); return +(v.length === 5 ? v + '001' : v) || 0; };
async function buildAuthSession() {
  const { Innertube } = await import('youtubei.js');
  const st = acc.read(), a = st.accounts.find((x) => x.id === st.active);
  if (!a) throw new Error('Sign in first.');
  const opts = { generate_session_locally: true };
  if (a.onBehalfOf) opts.on_behalf_of_user = a.onBehalfOf;
  const i = await Innertube.create(opts);
  i.session.on('update-credentials', ({ credentials }) => {
    const s2 = acc.read(), x = s2.accounts.find((y) => y.id === a.id);
    if (x) { x.creds = seal(credentials); acc.write(s2); }
  });
  await i.session.signIn(unseal(a.creds));
  // SmartTube: a visitor id made up for the signed-out session must not ride along with a signed-in one, or history is not recorded for the account.
  try { i.session.context.client.visitorData = ''; } catch {}
  const exec = i.actions.execute.bind(i.actions);
  i.actions.execute = (endpoint, args = {}) => exec(endpoint, { ...args, client: 'TV' });
  return i;
}
async function authed() {
  if (!acc.read().active) throw new Error('Sign in first.');
  if (ytAuth) return ytAuth;
  if (!authPromise) authPromise = buildAuthSession().catch((e) => { authPromise = null; throw e; });
  ytAuth = await authPromise;
  return ytAuth;
}
async function whoami(i) {
  try {
    const info = await i.account.getInfo();
    const it = info.contents?.contents?.[0] || info.contents;
    return { name: txt(it?.account_name) || 'Google account', avatar: thumb(it?.account_photo) };
  } catch { return { name: 'Google account', avatar: '' }; }
}

// ---------- TV-client responses (subscriptions, history, playlists, personalized home) ----------
const rt = (x) => x?.simpleText ?? (x?.runs || []).map((r) => r.text).join('');
function tilesOf(data) {
  const out = [];
  const walk = (o) => { if (!o || typeof o !== 'object') return; if (o.tileRenderer) { out.push(o.tileRenderer); return; } for (const v of Object.values(o)) walk(v); };
  walk(data);
  return out;
}
// Browse a TV page and follow its continuation token for a few more pages.
async function tvPages(i, browseId, maxPages = 3, from = null) {
  const all = [], seen = new Set();
  all.next = ''; // where the next page starts, when there is one (so a feed can be read further later)
  let res = await i.actions.execute('/browse', from ? { continuation: from } : { browseId });
  for (let n = 0; ; n++) {
    // YouTube sometimes returns the same page again for a continuation; only keep tiles we have not seen.
    const fresh = tilesOf(res.data).filter((t) => { const k = t.contentId || rt(t.metadata?.tileMetadataRenderer?.title); if (!k || seen.has(k)) return false; seen.add(k); return true; });
    all.push(...fresh);
    if (n > 0 && !fresh.length) { all.next = ''; break; }
    const tok = /"nextContinuationData":\{"continuation":"([^"]+)"/.exec(JSON.stringify(res.data))?.[1];
    all.next = tok || '';
    if (n + 1 >= maxPages || !tok) break;
    res = await i.actions.execute('/browse', { continuation: tok });
  }
  return all;
}
const histInfos = new Map();
let perfNow = { data: false, power: false }; // set by the player with each stream request (data saver, power saving)
const checkId = (id) => { if (!/^[\w-]{11}$/.test(String(id || ''))) throw new Error('Bad video id.'); return id; };
const checkLang = (l) => { if (!/^[\w-]{2,24}$/.test(String(l || ''))) throw new Error('Bad language.'); return l; };
const tileLines = (t) => (t.metadata?.tileMetadataRenderer?.lines || []).map((l) => (l.lineRenderer?.items || []).map((x) => rt(x.lineItemRenderer?.text)).filter((s) => s && s !== '•'));
const tileThumb = (t) => fixUrl((t.header?.tileHeaderRenderer?.thumbnail?.thumbnails || []).slice(-1)[0]?.url);
function tileVideo(t) {
  const type = t.contentType;
  if (type !== 'TILE_CONTENT_TYPE_VIDEO' && type !== 'TILE_CONTENT_TYPE_SHORTS') return null;
  const id = t.onSelectCommand?.watchEndpoint?.videoId || t.onSelectCommand?.reelWatchEndpoint?.videoId || t.contentId;
  if (!/^[\w-]{11}$/.test(id || '')) return null;
  const lines = tileLines(t), flat = lines.flat();
  const published = flat.find((x) => /\bago\b|^(streamed|premiered)/i.test(x)) || '';
  const views = flat.find((x) => /\b(views?|watching)\b/i.test(x)) || '';
  const first = lines[0]?.[0] || '';
  const duration = (t.header?.tileHeaderRenderer?.thumbnailOverlays || []).map((o) => rt(o.thumbnailOverlayTimeStatusRenderer?.text)).find(Boolean) || '';
  return {
    id, title: rt(t.metadata?.tileMetadataRenderer?.title), channel: first && first !== views && first !== published ? first : '',
    channelId: /"browseId":"(UC[\w-]{22})"/.exec(JSON.stringify(t))?.[1] || '', channelThumb: '',
    views, published, duration, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, isShort: type === 'TILE_CONTENT_TYPE_SHORTS',
    watchedPct: Number((t.header?.tileHeaderRenderer?.thumbnailOverlays || []).map((o) => o.thumbnailOverlayResumePlaybackRenderer?.percentDurationWatched).find((x) => x != null)) || 0,
  };
}
const tileVideos = (tiles) => { const seen = new Set(); return tiles.map(tileVideo).filter((v) => v && !seen.has(v.id) && seen.add(v.id)); };
function tilePlaylist(t) {
  if (t.contentType !== 'TILE_CONTENT_TYPE_PLAYLIST' || !t.contentId) return null;
  return { id: t.contentId, title: rt(t.metadata?.tileMetadataRenderer?.title), count: '', meta: tileLines(t).flat().join(' • '), thumb: tileThumb(t) };
}
function tileChannel(t) {
  if (t.contentType !== 'TILE_CONTENT_TYPE_CHANNEL' || !/^UC[\w-]{22}$/.test(t.contentId || '')) return null;
  const l = tileLines(t).flat();
  return { id: t.contentId, name: rt(t.metadata?.tileMetadataRenderer?.title), handle: l[0] || '', avatar: tileThumb(t) };
}
const PRIVATE_LISTS = { WL: 'Watch later', LL: 'Liked videos' };
async function privatePlaylist(id) {
  const i = await authed();
  const vids = tileVideos(await tvPages(i, 'VL' + id, 12));
  return { id, title: PRIVATE_LISTS[id] || 'Playlist', author: 'You', total: String(vids.length), videos: vids };
}
const publicAccounts = () => { const st = acc.read(); return { active: st.active, encrypted: keyringOk(), accounts: st.accounts.map((a) => ({ id: a.id, name: a.name, avatar: a.avatar, channel: a.channelName || '' })) }; };
const pushAuth = (m) => win?.webContents.send('auth', m);

const txt = (t) => {
  if (t == null) return '';
  if (typeof t === 'string') return t;
  if (typeof t.text === 'string') return t.text;
  const s = t.toString?.();
  return s && s !== '[object Object]' ? s : '';
};
const fixUrl = (u) => (typeof u === 'string' && u.startsWith('//') ? 'https:' + u : u || '');
const thumb = (a) => (a && a.length ? fixUrl(a[a.length - 1].url) : '');

function mapVideo(v) {
  const id = v.id || v.video_id || v.content_id || v.on_tap_endpoint?.payload?.videoId;
  if (!id) return null;
  return {
    id,
    title: txt(v.title) || txt(v.metadata?.title) || txt(v.overlay_metadata?.primary_text),
    channel: txt(v.author?.name) || txt(v.short_byline_text) || '',
    channelId: v.author?.id || '',
    channelThumb: thumb(v.author?.thumbnails),
    views: txt(v.short_view_count) || txt(v.view_count) || txt(v.overlay_metadata?.secondary_text) || '',
    published: txt(v.published) || '',
    duration: txt(v.duration) || v.length_text?.text || '',
    thumb: thumb(v.thumbnails) || (Array.isArray(v.thumbnail) ? thumb(v.thumbnail) : '') || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    isShort: v.type === 'ShortsLockupView' || v.type === 'ReelItem',
    snippet: txt(v.description_snippet) || (v.snippets || []).map((s) => txt(s.text)).join(' '),
    badges: [v.is_live || v.is_upcoming ? (v.is_live ? 'LIVE' : 'UPCOMING') : '', ...(v.badges || []).map((b) => b.label || txt(b.text) || '')].filter(Boolean).slice(0, 4),
    verified: !!v.author?.is_verified,
    watchedPct: Number((v.thumbnail_overlays || []).find((o) => o.type === 'ThumbnailOverlayResumePlayback')?.percent_duration_watched) || 0,
  };
}

function collectVideos(nodes, out = []) {
  for (const n of nodes || []) {
    if (['Video', 'CompactVideo', 'GridVideo', 'PlaylistVideo', 'ReelItem', 'ShortsLockupView'].includes(n.type)) {
      const m = mapVideo(n);
      if (m) out.push(m);
    } else if (n.type === 'LockupView' && n.content_type === 'VIDEO') {
      const id = n.content_id;
      const meta = n.metadata;
      const rows = meta?.metadata?.metadata_rows || [];
      const parts = rows.flatMap((r) => (r.metadata_parts || []).map((p) => txt(p.text))).filter(Boolean);
      // Layout differs between search results ([channel, views, date]) and channel tabs ([views, date]),
      // so classify each part by what it looks like instead of by position.
      const isDate = (p) => /\bago\b|^(streamed|premiered|scheduled)/i.test(p);
      const isViews = (p) => /\b(views?|watching|waiting)\b/i.test(p);
      const published = parts.find(isDate) || '';
      const views = parts.find(isViews) || '';
      const channel = parts.find((p) => p !== published && p !== views) || '';
      let duration = '';
      try {
        for (const o of n.content_image?.overlays || []) for (const b of o.badges || []) if (/^\d+:\d{2}/.test(txt(b.text))) duration = txt(b.text);
      } catch {}
      let channelId = '';
      try { channelId = /UC[\w-]{22}/.exec(JSON.stringify(meta?.metadata || {}))?.[0] || ''; } catch {}
      out.push({
        id, title: txt(meta?.title), channel, channelId, channelThumb: fixUrl(meta?.image?.avatar?.image?.[0]?.url),
        views, published, duration, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, isShort: false,
      });
    } else {
      const inner = n.contents || n.items || n.content?.contents || n.videos;
      if (Array.isArray(inner)) collectVideos(inner, out);
    }
  }
  return out;
}


function mapPlaylist(p) {
  const id = p.id || p.content_id;
  if (!id) return null;
  if (p.type === 'LockupView') {
    let count = '';
    try { for (const o of p.content_image?.overlays || []) for (const b of o.badges || []) if (/\d/.test(txt(b.text))) count = txt(b.text); } catch {}
    return { id, title: txt(p.metadata?.title), count, thumb: thumb(p.content_image?.primary_thumbnail?.image) };
  }
  return { id, title: txt(p.title), count: txt(p.video_count) || txt(p.video_count_short) || '', thumb: thumb(p.thumbnails) || thumb(p.thumbnail) };
}
function collectPlaylists(nodes, out = []) {
  for (const n of nodes || []) {
    if (['Playlist', 'GridPlaylist'].includes(n.type) || (n.type === 'LockupView' && (n.content_type === 'PLAYLIST' || n.content_type === 'STATION'))) { const m = mapPlaylist(n); if (m) out.push(m); }
    else { const inner = n.contents || n.items || n.content?.contents; if (Array.isArray(inner)) collectPlaylists(inner, out); }
  }
  return out;
}

// YouTube sometimes asks for proof that the request is not from a bot ("Sign in to confirm you're not a bot"). yt-dlp can take your
// browser's YouTube sign-in (cookies) for that; Settings, Video & audio says which browser, or a cookies.txt file.
function cookieArgs() {
  const c = store.read(), file = String(c.cookiesFile || '').trim(), b = String(c.cookiesBrowser || 'none');
  if (file && fs.existsSync(file)) return ['--cookies', file];
  if (/^(firefox|chrome|chromium|brave|edge|vivaldi|opera|safari)$/.test(b)) return ['--cookies-from-browser', b];
  return [];
}
// YouTube hides some stream addresses behind a small puzzle (the "n" and signature challenges) that yt-dlp can only solve with a
// JavaScript runtime, and it only looks for Deno by default, so with none found it silently loses formats (SmartTube ships the same
// solver for this). This app already carries a JavaScript engine: its own program, started as plain Node (ELECTRON_RUN_AS_NODE).
const ytdlpEnv = () => ({ ...process.env, ELECTRON_RUN_AS_NODE: '1' });
const jsRuntimeArgs = () => ['--js-runtimes', 'node:' + process.execPath];
const BOT_RE = /confirm you.?re not a bot|sign in to confirm|Please sign in/i;
function ytdlp(args) {
  return new Promise((resolve, reject) => {
    execFile(YTDLP, ['--no-warnings', '--no-update', ...jsRuntimeArgs(), ...cookieArgs(), ...args], { maxBuffer: 64 * 1024 * 1024, env: ytdlpEnv() }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message)); else resolve(stdout);
    });
  });
}


// ---------- settings-driven yt-dlp options ----------
const DEF = {
  quality: 'auto', fps: 0, codec: 'auto', maxVideoBitrate: 0, audioCodec: 'auto', maxAudioBitrate: 0,
  dlContainer: 'mp4', dlMaxHeight: 1080, dlCodec: 'auto', dlFps: 0, dlAudioFormat: 'mp3', dlAudioQuality: '0',
  dlEmbedMeta: true, dlEmbedThumb: true, dlEmbedSubs: false, dlSubLangs: 'en.*,en', dlSponsorRemove: false,
  dlTemplate: '%(title)s [%(id)s].%(ext)s', dlRateLimit: '', dlFragments: 4, dlPlaylistFolders: true, dlNotify: true,
  bufferProxy: true, bufferSeconds: 180, bufferMaxMB: 1024,
  miniSize: 'medium', miniCorner: 'bottom-right', miniOnTop: true, miniOpacity: 100, miniFrameless: true, miniOnMinimize: false, miniMargin: 16,
};
const cfg = () => ({ ...DEF, ...store.read() });
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };
function vcodecFilter(c) {
  return c === 'avc1' ? "[vcodec^=avc1]" : c === 'vp9' ? "[vcodec~='^vp0?9']" : c === 'av01' ? "[vcodec^=av01]" : '';
}
function acodecFilter(c) { return c === 'aac' ? '[acodec^=mp4a]' : c === 'opus' ? '[acodec=opus]' : ''; }
// Streaming format: strictest match first, then progressively looser fallbacks so something always plays.
// Highest bitrate first: at the chosen resolution take the format with the most video and audio bitrate (yt-dlp's own
// default order prefers newer codecs even when they carry less data).
// 'lang' goes first so the original audio always wins over dubbed tracks (the bitrate order alone picked a dub on some videos).
const sortArgs = (c) => {
  const f = [];
  if (c.audioLang !== 'any') f.push('lang');
  // 'proto' keeps plain https formats ahead of the HLS ones: HLS lists an estimated peak bitrate that is often far above what the
  // file really holds, so sorting by it picked slow-starting HLS streams with no extra quality.
  if (c.maxBitrate !== false) f.push('res', 'fps', 'proto', 'vbr', 'tbr', 'abr', 'asr');
  return f.length ? ['-S', f.join(',')] : [];
};
// A specific audio language (say "es") is asked for first; if the video has no such track the normal pick is used.
const audioLangFilter = (c) => (/^[a-z]{2,3}(-[A-Za-z0-9]+)?$/.test(c.audioLang || '') ? `[language^=${c.audioLang}]` : '');
function streamFormat(quality, c, perf = {}) {
  const abrCap = perf.data ? Math.min(num(c.maxAudioBitrate) || 999, 96) : num(c.maxAudioBitrate);
  const abr = abrCap && abrCap < 999 ? `[abr<=${abrCap}]` : '';
  const ac = acodecFilter(c.audioCodec);
  const lf = audioLangFilter(c);
  if (quality === 'audio') return [lf && `ba${lf}${ac}${abr}`, `ba${ac}${abr}`, `ba${abr}`, 'ba'].filter(Boolean).join('/');
  let cap = quality === 'best' || quality === 'auto' ? 0 : num(quality) || 0; // 'auto' now means the highest the video offers
  // Data saver and power saving cap the picture size (and so prefer H.264 below, which most devices decode in hardware).
  const lim = Math.min(perf.data ? num(c.dataSaverRes) || 480 : Infinity, perf.power ? num(c.powerRes) || 720 : Infinity);
  if (Number.isFinite(lim)) cap = cap ? Math.min(cap, lim) : lim;
  const h = cap ? `[height<=${cap}]` : '';
  const fps = num(c.fps) ? `[fps<=${num(c.fps)}]` : '';
  const br = num(c.maxVideoBitrate) ? `[tbr<=${num(c.maxVideoBitrate)}]` : '';
  // "auto" prefers H.264 up to 1080p (best hardware decoding); above that YouTube only offers VP9/AV1.
  const vc = c.codec === 'auto' ? (cap && cap <= 1080 ? vcodecFilter('avc1') : '') : vcodecFilter(c.codec);
  return [lf && `bv*${h}${fps}${br}${vc}+ba${lf}${ac}${abr}`, `bv*${h}${fps}${br}${vc}+ba${ac}${abr}`, `bv*${h}${fps}${br}+ba${abr}`, `bv*${h}${fps}+ba`, `bv*${h}+ba`, `b${h}`].filter(Boolean).join('/');
}
function downloadFormat(kind, o, c) {
  const cap = num(o.height ?? c.dlMaxHeight), h = cap ? `[height<=${cap}]` : '';
  const fps = num(c.dlFps) ? `[fps<=${num(c.dlFps)}]` : '';
  const container = o.container || c.dlContainer, pref = o.codec || c.dlCodec;
  // "auto" picks the codec that plays everywhere for the chosen container; YouTube has no H.264 above 1080p,
  // so higher resolutions fall through to the looser alternatives.
  let vc = vcodecFilter(pref), ac = '';
  if (container === 'mp4') { if (pref === 'auto') vc = cap && cap <= 1080 ? vcodecFilter('avc1') : ''; ac = '[acodec^=mp4a]'; }
  else if (container === 'webm') { if (pref === 'auto') vc = vcodecFilter('vp9'); ac = '[acodec=opus]'; }
  const lf = audioLangFilter(c), chain = [];
  if (lf) chain.push(`bv*${h}${fps}${vc}+ba${lf}${ac}`);
  chain.push(`bv*${h}${fps}${vc}+ba${ac}`);
  if (container === 'webm') chain.push(`bv*${h}${fps}[vcodec~='^(vp0?9|av01)']+ba${ac}`);
  chain.push(`bv*${h}${fps}${vcodecFilter(pref === 'auto' ? (cap && cap <= 1080 ? 'avc1' : '') : pref)}+ba`, `bv*${h}${fps}+ba`, `bv*${h}+ba`, `b${h}`, 'b');
  return chain.join('/');
}
// A user-supplied output template must stay inside the download folder.
function safeTemplate(t) {
  const d = DEF.dlTemplate;
  if (!t || typeof t !== 'string' || t.startsWith('/') || t.startsWith('~') || t.includes('..') || /^[a-z]:/i.test(t)) return d;
  return /\.%\(ext\)s$/.test(t) ? t : t + '.%(ext)s';
}
function downloadArgs(kind, o = {}, { playlist = false } = {}) {
  const c = cfg();
  const dir = c.downloadDir || app.getPath('downloads');
  const a = ['--no-update', '--newline', '--ignore-errors', '-N', String(Math.min(16, num(c.dlFragments) || 4))];
  if (/^\d+(\.\d+)?[KMG]?$/i.test(String(c.dlRateLimit || ''))) a.push('-r', String(c.dlRateLimit));
  let tpl = safeTemplate(c.dlTemplate);
  if (playlist) tpl = `%(playlist_index)03d - ${tpl}`;
  const folder = playlist && c.dlPlaylistFolders ? '%(playlist_title)s' : '';
  a.push('-o', path.join(dir, folder, tpl));
  if (kind === 'subs') {
    a.push('--skip-download', '--write-subs', '--write-auto-subs', '--sub-langs', String(c.dlSubLangs || 'en.*,en'), '--convert-subs', 'srt');
    return a;
  }
  if (kind === 'audio') {
    const fmt = o.audioFormat || c.dlAudioFormat;
    const q = String(o.audioQuality ?? c.dlAudioQuality);
    a.push('-f', [audioLangFilter(c) && `ba${audioLangFilter(c)}`, 'ba', 'b'].filter(Boolean).join('/'), ...sortArgs(c), '-x', '--audio-format', /^(mp3|m4a|opus|flac|wav|vorbis|aac)$/.test(fmt) ? fmt : 'mp3');
    if (/^(0|[1-9]\d{1,2}K?)$/i.test(q)) a.push('--audio-quality', /^\d+$/.test(q) && q !== '0' ? q + 'K' : q);
    if (fmt !== 'wav' && c.dlEmbedThumb) a.push('--embed-thumbnail');
  } else {
    a.push('-f', downloadFormat(kind, o, c), ...sortArgs(c), '--merge-output-format', o.container || c.dlContainer);
    if (c.dlEmbedSubs) a.push('--write-subs', '--embed-subs', '--sub-langs', String(c.dlSubLangs || 'en.*,en'));
    if (c.dlEmbedThumb && (o.container || c.dlContainer) !== 'webm') a.push('--embed-thumbnail');
  }
  if (c.dlEmbedMeta) a.push('--embed-metadata');
  if (c.dlSponsorRemove) a.push('--sponsorblock-remove', 'sponsor,selfpromo,interaction');
  return a;
}
// One job runner for single videos and whole playlists: progress, final file path, cancel.
function runJob(key, url, args, { playlist = false } = {}) {
  if (jobs.has(key)) throw new Error('That download is already running.');
  const p = spawn(YTDLP, [...jsRuntimeArgs(), ...cookieArgs(), ...args, playlist ? '--yes-playlist' : '--no-playlist', url], { env: ytdlpEnv() });
  jobs.set(key, p);
  let item = 0, total = 0, pct = 0, file = '', errText = '';
  const send = (x) => win?.webContents.send('download-progress', { id: key, item, total, pct, file, ...x });
  p.stdout.on('data', (d) => {
    for (const line of d.toString().split('\n')) {
      const it = /Downloading item (\d+) of (\d+)/.exec(line); if (it) { item = +it[1]; total = +it[2]; pct = 0; }
      const q = /\[download\]\s+(\d+(?:\.\d+)?)%/.exec(line); if (q) pct = parseFloat(q[1]);
      const f = /(?:Destination:|Merging formats into|\[ExtractAudio\] Destination:|\[EmbedSubtitle\].*?"|Writing video subtitles to:)\s*"?([^"\n]+?)"?\s*$/.exec(line);
      if (f && /\.[a-z0-9]{2,4}$/i.test(f[1])) file = f[1];
    }
    send({});
  });
  p.stderr.on('data', (d) => { errText = (errText + d.toString()).slice(-600); });
  p.on('close', (code, sig) => {
    jobs.delete(key);
    send({ pct: code === 0 ? 100 : -1, done: true, cancelled: !!sig, error: code === 0 || sig ? '' : errText.split('\n').filter((l) => /ERROR/.test(l)).pop() || '' });
    if (!sig) notify('download', code === 0 ? 'Download complete' : 'Download finished with errors', playlist ? `${item} of ${total} items` : key);
  });
  return true;
}


// ---------- local streaming cache ----------
// The player reads video and audio from a loopback server instead of straight from YouTube. The server pulls each file in
// steady 2 MB ranges (the pattern yt-dlp uses to avoid throttling) and keeps the chosen number of seconds downloaded ahead of
// the playhead, so short network hiccups never reach the player. A big buffer (a few minutes of 4K is a gigabyte) lives on
// disk in a temporary folder so memory stays small; the folder is emptied when the app quits.
const CHUNK = 2 * 1024 * 1024, MB = 1024 * 1024, MAX_CONCURRENT = 6, MAX_LOW = 4;
const PROXY_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
// Not the system temp folder: on many Linux systems that is memory (tmpfs), which would defeat the point of a disk buffer.
let CACHE_PARENT;
try { CACHE_PARENT = path.join(app.getPath('cache'), 'youtube-desktop-streams'); } catch { CACHE_PARENT = path.join(os.tmpdir(), 'youtube-desktop-streams'); }
const CACHE_ROOT = path.join(CACHE_PARENT, String(process.pid));
// folders left behind by an earlier run that did not exit cleanly
function sweepOldCaches() {
  try {
    for (const n of fs.readdirSync(CACHE_PARENT)) {
      if (!/^\d+$/.test(n) || +n === process.pid) continue;
      let alive = false; try { process.kill(+n, 0); alive = true; } catch {}
      if (!alive) fs.rmSync(path.join(CACHE_PARENT, n), { recursive: true, force: true });
    }
  } catch {}
}
// How much to keep ahead, and the most a stream may hold, for the current mode.
function bufferPolicy() {
  const c = cfg();
  if (perfNow.power) return { secs: 20, cap: 48 * MB };
  if (perfNow.data) return { secs: 15, cap: 64 * MB };
  return { secs: Math.min(3600, Math.max(5, num(c.bufferSeconds) || 180)), cap: Math.max(64, num(c.bufferMaxMB) || 1024) * MB };
}
const streamsMap = new Map();
let proxyPromise = null, proxyPort = 0, activeFetches = 0, activeLo = 0, activeHi = 0;
const fetchQ = { hi: [], lo: [] };
// At most MAX_CONCURRENT downloads run at once, and at most MAX_LOW of them may be look-ahead ones: the chunk playback is waiting for
// always gets a connection right away and a good share of the bandwidth instead of queueing behind the buffer fill.
// While a chunk the player is waiting for is downloading (or waiting its turn), no new look-ahead download starts.
function canStart(hi) { return activeFetches < MAX_CONCURRENT && (hi || (activeLo < MAX_LOW && activeHi === 0 && !fetchQ.hi.length)); }
function startEntry(entry) { activeFetches++; entry.lo = !entry.hi; if (entry.lo) activeLo++; else activeHi++; entry.resolve(); }
function pump() {
  for (;;) {
    const e = fetchQ.hi.length && canStart(true) ? fetchQ.hi.shift() : fetchQ.lo.length && canStart(false) ? fetchQ.lo.shift() : null;
    if (!e) return; startEntry(e);
  }
}
function acquireSlot(entry, hi) {
  return new Promise((resolve, reject) => {
    entry.hi = hi; entry.resolve = resolve; entry.reject = reject;
    if (canStart(hi)) return startEntry(entry);
    (hi ? fetchQ.hi : fetchQ.lo).push(entry);
  });
}
function releaseSlot(entry) { activeFetches--; if (entry.lo) activeLo--; else activeHi--; pump(); }
function boostEntry(entry) { const i = fetchQ.lo.indexOf(entry); if (i >= 0) { fetchQ.lo.splice(i, 1); entry.hi = true; fetchQ.hi.push(entry); pump(); } }
const PIPE_AHEAD = () => (HIDDEN && globalThis.__pipeAhead != null ? globalThis.__pipeAhead : 1); // chunks fetched in parallel with the needed one after a jump (test mode can change it)
// Cancel a download (started or still waiting). Only for ones nothing is waiting on.
function abortEntry(e) {
  e.aborted = true; e.ctl?.abort();
  for (const q of [fetchQ.hi, fetchQ.lo]) { const i = q.indexOf(e); if (i >= 0) { q.splice(i, 1); e.reject(new Error('dropped')); } }
}
// A seek makes the look-ahead meant for the old spot useless; the downloads of it still under way stop too, so the bandwidth goes to
// where the player is now. (Entries a response is waiting on are left alone.)
function abortLookahead(st) {
  for (const e of st.chunks.values()) if (!e.done && !e.refs && (e.lo || e.pipe)) abortEntry(e);
}
// Forget the downloads queued (not started) for a stream, e.g. after a seek or when a newer video took over.
function dropQueued(st) {
  for (let i = fetchQ.lo.length - 1; i >= 0; i--) if (fetchQ.lo[i].st === st) { const e = fetchQ.lo.splice(i, 1)[0]; e.reject(new Error('dropped')); }
}
async function fetchChunk(st, ci, entry, hi) {
  const a = ci * CHUNK, b = Math.min(a + CHUNK - 1, st.size - 1), t0 = Date.now();
  await acquireSlot(entry, hi);
  const t1 = Date.now();
  try {
    for (let tries = 0; ; tries++) {
      try {
        if (entry.aborted) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
        entry.ctl = new AbortController(); // a download nobody wants any more (a seek, a newer video) can be cancelled
        // A chunk the player is waiting for is fetched as two halves at once: one connection tops out around 1.5 MB/s, two get it done in half the time.
        const get = async (x, y) => { const r = await fetch(`${st.url}&range=${x}-${y}`, { headers: { 'User-Agent': PROXY_UA }, signal: entry.ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return Buffer.from(await r.arrayBuffer()); };
        const parts = hi && b - a > 256 * 1024 ? 2 : 1, mid = a + Math.floor((b - a + 1) / parts);
        const buf = parts === 2 ? Buffer.concat(await Promise.all([get(a, mid - 1), get(mid, b)])) : await get(a, b);
        if (buf.length !== b - a + 1) throw new Error('short read');
        if (HIDDEN) (globalThis.__chunkLog ||= []).push([st.mime.slice(0, 1), ci, hi ? 'hi' : 'lo', t1 - t0, Date.now() - t1, Date.now()]); // test mode only
        return buf;
      } catch (e) { if (e.name === 'AbortError' || tries >= 2) throw e; await new Promise((r) => setTimeout(r, 300 * (tries + 1))); }
    }
  } finally { releaseSlot(entry); }
}
async function storeChunk(st, ci, buf) {
  if (!st.disk) return { buf };
  try {
    const dir = path.join(CACHE_ROOT, st.token);
    await fs.promises.mkdir(dir, { recursive: true });
    const file = path.join(dir, String(ci));
    await fs.promises.writeFile(file, buf);
    return { file };
  } catch { return { buf }; } // disk trouble: keep this one in memory instead
}
async function readChunk(st, ci, rec) {
  if (rec.buf) return rec.buf;
  let b = st.hot.get(ci);
  if (!b) { b = await fs.promises.readFile(rec.file); st.hot.set(ci, b); if (st.hot.size > 3) st.hot.delete(st.hot.keys().next().value); }
  return b;
}
function forgetChunk(st, ci) {
  const e = st.chunks.get(ci); st.chunks.delete(ci); st.hot.delete(ci);
  e?.p.then((rec) => { if (rec?.file) fs.promises.unlink(rec.file).catch(() => {}); }).catch(() => {});
}
// Once a stream holds more than its limit, chunks behind the playhead go first (the oldest of them); if there are none, the
// ones farthest ahead. Only finished chunks count: the look-ahead entries that are still waiting to download take no room.
function evict(st) {
  const cap = Math.max(8, Math.floor(st.policy.cap / CHUNK)), done = [];
  for (const [k, e] of st.chunks) if (e.done) done.push([k, e]);
  let over = done.length - cap; if (over <= 0) return;
  const here = st.lastCi ?? 0, last = Math.ceil(st.size / CHUNK) - 1;
  for (let i = done.length - 1; i >= 0; i--) if (done[i][0] <= 1 || done[i][0] >= last - 1) done.splice(i, 1); // the header and the index are never evicted: every seek, replay and restart needs them
  const behind = done.filter(([k]) => k < here - 1).sort((a, b) => a[1].at - b[1].at);
  for (const [k] of behind) { if (over-- <= 0) return; forgetChunk(st, k); }
  const ahead = done.filter(([k]) => k >= here - 1).sort((a, b) => b[0] - a[0]);
  for (const [k] of ahead) { if (over-- <= 0) return; forgetChunk(st, k); }
}
function chunk(st, ci, hi, pipe) {
  let entry = st.chunks.get(ci);
  if (!entry) {
    entry = { st, at: Date.now(), done: false, refs: 0, pipe: !!pipe };
    entry.p = fetchChunk(st, ci, entry, hi).then((buf) => storeChunk(st, ci, buf));
    entry.p.then(() => { entry.done = true; entry.at = Date.now(); evict(st); }).catch(() => { if (st.chunks.get(ci) === entry) st.chunks.delete(ci); }); // a failed chunk is retried on the next request
    st.chunks.set(ci, entry);
  } else { entry.at = Date.now(); if (hi) boostEntry(entry); }
  return entry.p;
}
function prefetch(st, ci) {
  if (st.retired) return;
  const { secs, cap } = st.policy, bps = st.dur ? st.size / st.dur : 400000;
  const ahead = Math.max(2, Math.min(Math.ceil((secs * bps) / CHUNK), Math.floor(cap / CHUNK) - 2));
  for (let k = 1; k <= ahead; k++) { const n = ci + k; if (n * CHUNK < st.size) chunk(st, n, false).catch(() => {}); }
}
function trimStream(st, keep) {
  const old = [...st.chunks.entries()].filter(([, e]) => e.done).sort((a, b) => b[1].at - a[1].at).slice(keep).map(([k]) => k);
  for (const k of old) forgetChunk(st, k);
}
// When a newer video takes over, the older streams stop downloading ahead (they still answer requests, e.g. for the mini player window).
function retireStreams() {
  for (const st of streamsMap.values()) {
    if (st.retired || st.warm) continue;
    st.retired = true; dropQueued(st);
    abortLookahead(st); // downloads of the old video already under way stop too
    trimStream(st, 4);
  }
}
function removeStream(token) {
  const st = streamsMap.get(token); if (!st) return;
  dropQueued(st); st.chunks.clear(); st.hot.clear(); streamsMap.delete(token);
  fs.promises.rm(path.join(CACHE_ROOT, token), { recursive: true, force: true }).catch(() => {});
}
// A stream the player may still come back to (a long pause) keeps its address; only its cached chunks are freed after a while. The address
// itself goes after 6 hours (YouTube's links expire then anyway), and an old video's stream goes after two minutes.
function sweepStreams(activeIdleMs = 20 * 60 * 1000) {
  for (const [k, s] of streamsMap) {
    const idle = Date.now() - (s.last || s.created);
    if (s.retired) { if (idle > 2 * 60 * 1000) removeStream(k); }
    else if (idle > 6 * 60 * 60 * 1000) removeStream(k);
    else if (idle > activeIdleMs && s.chunks.size) { dropQueued(s); for (const e of s.chunks.values()) if (!e.done && !e.refs) abortEntry(e); for (const ci of [...s.chunks.keys()]) if (s.chunks.get(ci)?.done) forgetChunk(s, ci); }
  }
}
setInterval(sweepStreams, 60 * 1000).unref();
if (HIDDEN) globalThis.__sweep = sweepStreams; // test mode only: lets a test act as if the player had been idle for a long time
if (HIDDEN) globalThis.__dropKind = (kind) => { for (const [t, st] of streamsMap) if (st.mime.startsWith(kind)) removeStream(t); }; // test mode only: makes a stream's address stop working, as if it had expired
async function handleProxy(req, res) {
  // The player runs the sound through Web Audio (stable audio), which needs the stream to be cross-origin readable.
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges' };
  if (req.method === 'OPTIONS') { res.writeHead(204, { ...cors, 'Access-Control-Allow-Headers': 'Range', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS' }); return res.end(); }
  const m = /^\/s\/([0-9a-f]{24})$/.exec((req.url || '').split('?')[0]);
  const st = m && streamsMap.get(m[1]);
  if (!st) { res.writeHead(404); return res.end(); }
  const size = st.size;
  let start = 0, end = size - 1;
  const rg = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (rg) {
    if (rg[1] === '' && rg[2] === '') { res.writeHead(416); return res.end(); }
    if (rg[1] === '') start = Math.max(0, size - +rg[2]); else { start = +rg[1]; if (rg[2] !== '') end = Math.min(+rg[2], size - 1); }
  }
  if (start >= size || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
  res.writeHead(rg ? 206 : 200, { ...cors, 'Content-Type': st.mime, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'no-store', ...(rg ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
  let closed = false;
  const gone = new Promise((r) => res.on('close', () => { closed = true; r(); }));
  try {
    let pos = start;
    const nChunks = Math.ceil(size / CHUNK);
    while (pos <= end && !closed) {
      const ci = Math.floor(pos / CHUNK);
      st.last = Date.now();
      // A chunk that was cancelled (a seek's clean-up can cancel one that a newer request wants) or whose file went missing is simply asked
      // for again; giving up on the response would make the player drop the stream, which for the sound means silence.
      let buf = null;
      for (let attempt = 0; !buf && !closed; attempt++) {
        const need = chunk(st, ci, true); // the chunk playback needs now jumps the queue
        const ent = st.chunks.get(ci); if (ent) ent.refs++;
        if (attempt === 0) {
          // The player jumping somewhere else (a seek) makes the queue and the downloads meant for the old spot useless. Reads near the
          // end of the file (the index) are only probes and do not count as a jump.
          if (ci < nChunks - 2) {
            if (st.lastCi == null || ci < st.lastCi || ci > st.lastCi + 2) { dropQueued(st); abortLookahead(st); st.sinceJump = 0; }
            st.lastCi = ci;
          }
          // Right after a jump (or at the very start) the next chunk is needed straight away too, so it downloads in parallel.
          if ((st.sinceJump ?? 0) < 3) for (let k = 1; k <= PIPE_AHEAD(); k++) if ((ci + k) * CHUNK < size) chunk(st, ci + k, true, true).catch(() => {});
          st.sinceJump = (st.sinceJump ?? 0) + 1;
          // Playback reached the end: get the start ready too, because the next thing is most likely a replay or a rewind.
          if (ci >= nChunks - 2 && st.lastCi != null && st.lastCi >= nChunks - 10 && !st.endWarmed && !st.retired) { st.endWarmed = true; for (let k = 0; k < Math.min(6, nChunks); k++) chunk(st, k, false).catch(() => {}); }
        }
        let rec = null, failure = null;
        try { rec = await Promise.race([need, gone.then(() => null)]); } catch (e) { failure = e; }
        finally { if (ent) { ent.refs--; if (closed && !ent.refs && !ent.done && ent.hi) abortEntry(ent); } } // the player gave up on this one (it seeked again)
        if (failure) { if (ent && st.chunks.get(ci) === ent) st.chunks.delete(ci); if (attempt >= 2) throw failure; continue; }
        if (!rec) break;
        prefetch(st, ci); // the look-ahead starts once the chunk that is needed has arrived, so it never takes bandwidth from it
        try { buf = await readChunk(st, ci, rec); } catch (e) { forgetChunk(st, ci); if (attempt >= 2) throw e; }
      }
      if (!buf) break;
      const piece = buf.subarray(pos - ci * CHUNK, Math.min(buf.length, end - ci * CHUNK + 1));
      if (!res.write(piece)) await Promise.race([new Promise((r) => res.once('drain', r)), gone]);
      pos += piece.length;
    }
  } catch { res.destroy(); return; }
  if (!closed) res.end();
}
function ensureProxy() {
  if (!proxyPromise) proxyPromise = new Promise((resolve, reject) => {
    const srv = http.createServer((q, s) => handleProxy(q, s).catch(() => s.destroy()));
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => { proxyPort = srv.address().port; resolve(); });
  });
  return proxyPromise;
}
// Returns a loopback URL for a googlevideo URL, or the original URL if it can't be proxied.
async function proxied(url, force, warm) {
  if (!url || (cfg().bufferProxy === false && !force)) return url;
  let u; try { u = new URL(url); } catch { return url; }
  const size = Number(u.searchParams.get('clen'));
  if (!size || !/googlevideo\.com$/.test(u.hostname)) return url;
  await ensureProxy();
  while (streamsMap.size >= 10) { // make room: old finished streams first, then unused warm ones, never the one that is playing if avoidable
    const all = [...streamsMap.entries()], victim = all.find(([, x]) => x.retired) || all.find(([, x]) => x.warm) || all[0];
    removeStream(victim[0]);
  }
  const token = crypto.randomBytes(12).toString('hex'), dur = Number(u.searchParams.get('dur')) || 0, policy = bufferPolicy();
  // a buffer worth more than about 48 MB goes to disk
  const st = { warm: !!warm, token, url, size, dur, mime: decodeURIComponent(u.searchParams.get('mime') || 'video/mp4'), chunks: new Map(), hot: new Map(), created: Date.now(), policy, lastCi: null };
  st.disk = Math.min(policy.cap, dur ? (policy.secs * size) / dur : policy.cap) > 48 * MB;
  if (!st.disk) st.policy = { ...policy, cap: Math.min(policy.cap, 128 * MB) }; // a stream kept in memory never grows past this
  streamsMap.set(token, st);
  // start on the first chunks before the player asks (a warm stream, i.e. one looked up ahead of time, gets a few more than usual)
  for (let k = 0; k < (warm && st.mime.startsWith('video') ? 3 : 1); k++) chunk(st, k, true).catch(() => {});
  return `http://127.0.0.1:${proxyPort}/s/${token}`;
}

// A video that is being looked up ahead of time (hover, next in line) also gets its first chunks downloaded, so it starts at once.
// These "warm" streams are handed over to the player when the video is opened, or dropped when too many pile up.
const proxyToken = (u) => /\/s\/([0-9a-f]{24})$/.exec(String(u || ''))?.[1];
async function warmStreams(r, force) {
  if (r.warm || !r.lines) return;
  r.warm = [];
  for (const u of r.lines) r.warm.push(await proxied(u, force, true));
  const warmOnes = [...streamsMap.entries()].filter(([, st]) => st.warm);
  while (warmOnes.length > 6) removeStream(warmOnes.shift()[0]);
}
function takeWarm(url) {
  const t = proxyToken(url), st = t && streamsMap.get(t);
  if (!st || !st.warm) return null; // only an unused warm stream can be handed over; one that already played (and was retired) is made afresh
  st.warm = false; st.created = Date.now();
  return url;
}

// ---------- channel helpers ----------
const chanCache = new Map(), chanConts = new Map();
async function getChannel(id) {
  if (!/^UC[\w-]{22}$/.test(id || '')) throw new Error('Not a channel id.');
  const hit = chanCache.get(id);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.ch;
  const ch = await (await innertube()).getChannel(id);
  chanCache.set(id, { ch, at: Date.now() });
  while (chanCache.size > 20) chanCache.delete(chanCache.keys().next().value);
  return ch;
}
function mapChannelNode(n) {
  const id = n.id || n.content_id;
  if (!/^UC[\w-]{22}$/.test(id || '')) return null;
  const parts = (n.metadata?.metadata?.metadata_rows || []).flatMap((r) => (r.metadata_parts || []).map((p) => txt(p.text))).filter(Boolean);
  return {
    id, name: txt(n.author?.name) || txt(n.title) || txt(n.metadata?.title),
    avatar: thumb(n.author?.thumbnails) || thumb(n.thumbnails) || fixUrl(n.content_image?.image?.[0]?.url),
    subs: txt(n.subscribers) || parts.find((p) => /subscribers?/i.test(p)) || '', handle: parts.find((p) => p.startsWith('@')) || '',
  };
}

// ---------- comment helpers ----------
const commentThreads = new Map(), commentViews = new Map(), commentFeeds = new Map(), replyMore = new Map();
const capMap = (map, n) => { while (map.size > n) map.delete(map.keys().next().value); };
function mapComment(cm, level = 0) {
  if (!cm || !cm.comment_id) return null;
  commentViews.set(cm.comment_id, cm); capMap(commentViews, 900);
  const likes = String(cm.like_count ?? '');
  return {
    id: cm.comment_id, author: txt(cm.author?.name), authorId: cm.author?.id || '',
    avatar: fixUrl(cm.author?.thumbnails?.[0]?.url || cm.author?.avatar_thumbnail_url || ''),
    text: txt(cm.content), likes: likes && likes !== '0' ? likes : '', liked: !!cm.is_liked,
    published: typeof cm.published_time === 'string' ? cm.published_time : txt(cm.published_time),
    isOwner: !!cm.author_is_channel_owner, pinned: !!cm.is_pinned, hearted: !!cm.is_hearted, member: !!cm.is_member, level,
  };
}

// The stats pings are not innertube calls, so the library does not attach the sign-in to them; do it here.
async function statsPing(i, url, client, params) {
  const u = new URL(url.replace('https://s.', 'https://www.'));
  // Only the parameters SmartTube sends (ns, ver, docid, len, cpn, cmt, ei, vm, of, st, et): extra client labels are not part of its working requests.
  u.searchParams.set('ns', 'yt'); u.searchParams.set('ver', '2');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const oauth = i.session.oauth;
  if (oauth.shouldRefreshToken()) await oauth.refreshAccessToken();
  const r = await fetch(u, { headers: { Authorization: `Bearer ${oauth.oauth2_tokens.access_token}`, 'User-Agent': 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version' } });
  if (HIDDEN) { (globalThis.__pingLog ||= []).push({ url: u.toString().replace(/(\?|&)(sdetail|ei|of|vm)=[^&]{12,}/g, '$1$2=…'), status: r.status, body: (await r.clone().text()).slice(0, 120) }); }
  return r;
}
// ---------- resolving a video: details (youtubei) and stream addresses (yt-dlp), each asked once and remembered ----------
const relInfos = new Map(); // the loaded video pages, kept so more suggested videos can be fetched from them
const infoCache = new Map(), captionUrls = new Map(), resolveCache = new Map();
let prefetching = 0;
function videoInfo(id) {
  const hit = infoCache.get(id);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.p;
  const p = (async () => {
    const i = await innertube();
    const info = await i.getInfo(id);
    const b = info.basic_info;
    const related = collectVideos(info.watch_next_feed || []);
    relInfos.set(id, info); if (relInfos.size > 8) relInfos.delete(relInfos.keys().next().value);
    const r = {
      id, title: b.title, channel: b.author, channelId: b.channel_id,
      views: b.view_count, likes: b.like_count, description: b.short_description,
      duration: b.duration, keywords: b.keywords || [], isLive: b.is_live,
      published: txt(info.primary_info?.published) || '',
      relative: txt(info.primary_info?.relative_date) || '',
      channelThumb: thumb(info.secondary_info?.owner?.author?.thumbnails) || '',
      subs: txt(info.secondary_info?.owner?.subscriber_count) || '',
      related,
      loudnessDb: (() => { const v = info.page?.[0]?.player_config?.audio_config?.loudness_db; return typeof v === 'number' ? v : null; })(),
      storyboard: (() => {
        try {
          const bs = (info.storyboards?.boards || []).filter((b) => b.template_url && b.thumbnail_width >= 80 && b.thumbnail_count > 0);
          const b = bs.find((x) => x.thumbnail_width === 160) || bs[bs.length - 1]; if (!b) return null;
          return { url: b.template_url, w: b.thumbnail_width, h: b.thumbnail_height, cols: b.columns, rows: b.rows, count: b.thumbnail_count, interval: b.interval };
        } catch { return null; }
      })(),
      chapters: (() => {
        try {
          const mm = info.player_overlays?.decorated_player_bar?.player_bar?.markers_map;
          const ch = mm?.find((m) => m.marker_key === 'DESCRIPTION_CHAPTERS')?.value?.chapters || [];
          return ch.map((c) => ({ t: (c.time_range_start_millis || 0) / 1000, title: c.title?.text || String(c.title || ''), thumb: fixUrl((c.thumbnail || [])[0]?.url || '') })).filter((c) => c.title);
        } catch { return []; }
      })(),
    };
    // Captions come with the details, so no second yt-dlp run is needed just to list them.
    const tracks = (info.captions?.caption_tracks || []).filter((t) => t.base_url && t.language_code);
    captionUrls.set(id, tracks.map((t) => ({ lang: t.language_code, auto: t.kind === 'asr', url: t.base_url })));
    capMap(captionUrls, 60);
    r.captionTracks = tracks.map((t) => ({ lang: t.language_code, name: String(t.name?.text || t.language_code).replace(/\s*\(auto-generated\)/i, ' (auto)'), auto: t.kind === 'asr' }));
    return r;
  })();
  infoCache.set(id, { p, at: Date.now() }); capMap(infoCache, 40);
  p.catch(() => infoCache.delete(id));
  return p;
}
const resolveKey = (id, q, c, perf, safe) => JSON.stringify([id, q, c.codec, c.fps, c.maxBitrate, c.audioLang, c.audioCodec, c.maxVideoBitrate, c.maxAudioBitrate, c.dataSaverRes, c.powerRes, !!perf.data, !!perf.power, !!safe]);
function resolveVideo(id, quality, perf, safe) {
  const c = cfg(), q = quality || c.quality || 'auto';
  perf = { data: !!perf?.data, power: !!perf?.power };
  const key = resolveKey(id, q, c, perf, safe), hit = resolveCache.get(key);
  if (hit && Date.now() - hit.at < 25 * 60 * 1000) return hit.p;
  const args = ['-g', '-f', streamFormat(q, c, perf), ...(safe || perf.data || perf.power ? [] : sortArgs(c)), '--no-playlist', `https://www.youtube.com/watch?v=${id}`];
  // Skipping yt-dlp's HLS lookup saves most of a second; the plain https formats are the ones used anyway. Live streams and the
  // odd video that only has HLS fail that way, so those are asked again the full way.
  const full = ytdlp(['--extractor-args', 'youtube:skip=hls', ...args]).catch(() => ytdlp(args));
  // If YouTube wants a sign-in for this video, ask as the Android app does: it still hands out one plain 360p stream, and the
  // reason is passed on so the page can say how to get full quality (cookies).
  const lowQ = (e) => ytdlp(['--extractor-args', 'youtube:player_client=android', '-g', '-f', 'b', '--no-playlist', `https://www.youtube.com/watch?v=${id}`])
    .then((out) => ({ out, limited: true }), () => { throw e; });
  const p = full.then((out) => ({ out, limited: false }), (e) => (BOT_RE.test(String(e.message)) ? lowQ(e) : Promise.reject(e)))
    .then(({ out, limited }) => { const lines = out.trim().split('\n').filter(Boolean); if (!lines.length) throw new Error('No playable stream found.'); return { lines, limited }; },
      (e) => { throw new Error(BOT_RE.test(String(e.message)) ? 'YouTube is asking this computer to prove it is not a bot, and this video has no stream without that. In Settings, Video & audio: first try "Update yt-dlp now" (Troubleshooting), then choose the browser you are signed in to YouTube with (Sign-in cookies).' : e.message); });
  resolveCache.set(key, { p, at: Date.now() }); capMap(resolveCache, 24);
  p.catch(() => resolveCache.delete(key));
  return p;
}

// Two lookups run at a time; the rest wait their turn (a video the pointer is resting on goes to the front).
const prefetchQ = [];
function pumpPrefetch() {
  while (prefetching < 2 && prefetchQ.length) {
    const { id, perf } = prefetchQ.shift(); prefetching++;
    const c = cfg(), force = !!(c.stableAudio && c.stableAudio !== 'off');
    const streamP = resolveVideo(id, undefined, perf).then((r) => (c.bufferProxy === false && !force ? null : warmStreams(r, force)));
    Promise.allSettled([videoInfo(id), streamP]).finally(() => { prefetching--; pumpPrefetch(); });
  }
}
const handlers = {
  async 'yt:home'(seeds) {
    // Signed in: your real recommendations from the TV home page.
    if (acc.read().active) {
      try { const mine = tileVideos(await tvPages(await authed(), 'FEwhat_to_watch', 2)); if (mine.length >= 8) return mine; } catch {}
    }
    const i = await innertube();
    const feed = await i.getHomeFeed();
    let vids = collectVideos(feed.contents?.contents || feed.contents || []);
    if (vids.length < 8) {
      // Anonymous sessions get an empty home feed, so build one from topic searches.
      const topics = (seeds && seeds.length ? seeds : ['trending today', 'new music', 'gaming', 'technology', 'documentary', 'science']).slice(0, 6);
      const res = await Promise.allSettled(topics.map((t) => i.search(t)));
      const lists = res.map((r) => (r.status === 'fulfilled' ? collectVideos(r.value.results || []).slice(0, 8) : []));
      const mixed = [];
      for (let n = 0; n < 8; n++) for (const l of lists) if (l[n]) mixed.push(l[n]);
      vids = vids.concat(mixed);
    }
    return vids;
  },
  async 'yt:search'(q, filters = {}) {
    const i = await innertube();
    const res = await i.search(q, filters);
    return { videos: collectVideos(res.results || []), playlists: collectPlaylists(res.results || []), channels: (res.results || []).filter((r) => r.type === 'Channel').map((c) => ({ id: c.id, name: txt(c.author?.name), thumb: thumb(c.author?.thumbnails), subs: txt(c.subscriber_count) })) };
  },
  async 'yt:suggest'(q) {
    const i = await innertube();
    return i.getSearchSuggestions(q);
  },
  async 'yt:video'(id) { checkId(id); return videoInfo(id); },
  // Starts resolving a video's stream and details ahead of time (hovering a video, the next one in line), so opening it is quick.
  'yt:prefetch'(id, perf, urgent) {
    checkId(id);
    if (!prefetchQ.some((j) => j.id === id)) { (urgent ? prefetchQ.unshift(...[{ id, perf }]) : prefetchQ.push({ id, perf })); while (prefetchQ.length > 6) prefetchQ.pop(); }
    pumpPrefetch();
    return true;
  },
  // ----- comments: pages, replies, and (signed in) reply / like -----
  async 'yt:comments'(id, sort, cont) {
    if (!cont) checkId(id);
    let feed, first = false;
    if (cont) {
      const prev = commentFeeds.get(cont); if (!prev) throw new Error('That list expired. Reload the comments.');
      commentFeeds.delete(cont); feed = await prev.getContinuation();
    } else {
      feed = await (await innertube()).getComments(id, sort === 'NEWEST_FIRST' ? 'NEWEST_FIRST' : 'TOP_COMMENTS'); first = true;
    }
    let more = null;
    if (feed.has_continuation) { more = crypto.randomBytes(6).toString('hex'); commentFeeds.set(more, feed); capMap(commentFeeds, 30); }
    const comments = (feed.contents || []).map((th) => {
      const c = mapComment(th.comment); if (!c) return null;
      c.hasReplies = !!th.has_replies; c.replies = String(th.comment?.reply_count || '');
      commentThreads.set(c.id, th); capMap(commentThreads, 400);
      return c;
    }).filter(Boolean);
    return { comments, more: !!more && more, total: first ? txt(feed.header?.comments_count) : undefined };
  },
  async 'yt:replies'(commentId, more) {
    // This comment format returns reply items directly (the library's own helper expects threads), so fetch them here.
    const th = commentThreads.get(commentId); if (!th) throw new Error('Reload the comments to see replies.');
    let endpoint;
    if (more) { endpoint = replyMore.get(commentId); if (!endpoint) throw new Error('There are no more replies.'); }
    else { endpoint = th.comment_replies_data?.contents?.[0]?.endpoint; if (!endpoint) throw new Error('This comment has no replies.'); }
    const resp = await endpoint.call((await innertube()).actions, { parse: true });
    const found = []; let next = null;
    for (const act of resp.on_response_received_endpoints || []) {
      for (const n of act.contents || []) {
        if (n.type === 'CommentView') found.push(n);
        else if (n.type === 'CommentThread' && n.comment) found.push(n.comment);
        else if (n.type === 'ContinuationItem') next = n.button?.endpoint || n.endpoint;
      }
    }
    if (next) replyMore.set(commentId, next); else replyMore.delete(commentId);
    return { replies: found.map((c) => mapComment(c, 1)).filter(Boolean), more: !!next };
  },
  async 'me:commentReply'(commentId, text) {
    const cm = commentViews.get(commentId); if (!cm) throw new Error('Reload the comments and try again.');
    if (!String(text).trim()) throw new Error('Reply is empty.');
    cm.setActions((await authed()).actions); await cm.reply(String(text)); return true;
  },
  async 'me:commentLike'(commentId, on) {
    const cm = commentViews.get(commentId); if (!cm) throw new Error('Reload the comments and try again.');
    cm.setActions((await authed()).actions); if (on) await cm.like(); else await cm.unlike(); return true;
  },
  async 'yt:channelInfo'(id) {
    const ch = await getChannel(id);
    const hc = ch.header?.content;
    const rows = (hc?.metadata?.metadata_rows || []).map((r) => (r.metadata_parts || []).map((p) => txt(p.text))).flat();
    const imgUrl = (x) => fixUrl((Array.isArray(x) ? x : x?.image || x?.thumbnails || []).map((t) => t.url).slice(-1)[0]);
    const desc = typeof hc?.description?.description === 'string' ? hc.description.description : txt(hc?.description?.description);
    return {
      id, name: txt(hc?.title?.text) || txt(hc?.title) || txt(ch.metadata?.title),
      handle: rows.find((x) => x.startsWith('@')) || '', subs: rows.find((x) => /subscribers?/i.test(x)) || '', videosCount: rows.find((x) => /\bvideos?\b/i.test(x)) || '',
      avatar: (imgUrl(hc?.image?.avatar) || thumb(ch.metadata?.avatar)).replace(/=s\d+-/, '=s176-'),
      banner: imgUrl(hc?.banner?.image || hc?.banner).replace(/=w\d+-/, '=w1707-'),
      description: desc || ch.metadata?.description || '',
      tabs: [...(ch.tabs || []).filter((t) => ['Home', 'Videos', 'Shorts', 'Live', 'Playlists'].includes(t)), 'About'],
    };
  },
  async 'yt:channelTab'(id, tab, sort, cont) {
    const pack = (feed, shape) => {
      let more = null;
      if (feed.has_continuation) { more = crypto.randomBytes(6).toString('hex'); chanConts.set(more, feed); while (chanConts.size > 30) chanConts.delete(chanConts.keys().next().value); }
      return { ...shape(feed), more, sorts: Array.isArray(feed.filters) && feed.filters.length ? feed.filters : null };
    };
    const vids = (feed) => ({ videos: collectVideos(feed.videos || []) });
    const lists = (feed) => ({ playlists: collectPlaylists(feed.playlists || feed.videos || []) });
    if (cont) {
      const feed = chanConts.get(cont); if (!feed) throw new Error('That list expired. Reload the tab.');
      chanConts.delete(cont);
      return pack(await feed.getContinuation(), tab === 'Playlists' ? lists : vids);
    }
    const ch = await getChannel(id);
    const sorted = async (feed) => (sort && sort !== 'Latest' && Array.isArray(feed.filters) && feed.filters.includes(sort) ? feed.applyFilter(sort) : feed);
    if (tab === 'Videos') return pack(await sorted(await ch.getVideos()), vids);
    if (tab === 'Shorts') return pack(await sorted(await ch.getShorts()), vids);
    if (tab === 'Live') return pack(await sorted(await ch.getLiveStreams()), vids);
    if (tab === 'Playlists') return pack(await ch.getPlaylists(), lists);
    if (tab === 'About') {
      const m = (await ch.getAbout()).metadata || {};
      const links = (m.links || []).map((l) => {
        // Each link keeps its real address behind a YouTube redirect (the "q" parameter).
        let url = l.link?.endpoint?.payload?.url || l.link?.runs?.[0]?.endpoint?.payload?.url || l.endpoint?.metadata?.url || '';
        try { const u = new URL(url); if (u.pathname === '/redirect') url = u.searchParams.get('q') || url; } catch {}
        return { title: txt(l.title), text: txt(l.link), url, icon: fixUrl(l.favicon?.[0]?.url) };
      }).filter((l) => /^https?:\/\//.test(l.url));
      return { about: { description: txt(m.description), subs: txt(m.subscriber_count), videos: txt(m.video_count), views: txt(m.view_count), joined: txt(m.joined_date), country: txt(m.country), links } };
    }
    // Home: the channel's own shelves (radios, mixes, featured channels, ...)
    const h = await ch.getHome(), shelves = [];
    for (const sh of h.shelves || []) {
      const items = sh.content?.items || sh.content?.contents || [];
      const s = { title: txt(sh.title), videos: collectVideos(items), playlists: collectPlaylists(items), channels: items.map(mapChannelNode).filter(Boolean) };
      if (s.videos.length || s.playlists.length || s.channels.length) shelves.push(s);
    }
    if (!shelves.length) { const v = collectVideos(h.videos || []); if (v.length) shelves.push({ title: 'Videos', videos: v, playlists: [], channels: [] }); }
    return { shelves };
  },
  async 'yt:channel'(id) {
    const i = await innertube();
    const ch = await i.getChannel(id);
    let vids = [];
    try { const v = await ch.getVideos(); vids = collectVideos(v.videos || v.contents?.contents || []); } catch {}
    return { id, name: txt(ch.metadata?.title), avatar: thumb(ch.metadata?.avatar), description: ch.metadata?.description || '', videos: vids };
  },
  async 'yt:stream'(id, quality, forceProxy, safe, perf) {
    checkId(id);
    // YouTube no longer serves combined streams, so resolve separate video and audio URLs.
    const c = cfg();
    const q = quality || c.quality || 'auto';
    perf = { data: !!perf?.data, power: !!perf?.power }; perfNow = perf;
    retireStreams(); // the video before this one stops downloading ahead
    const r = await resolveVideo(id, q, perf, safe), lines = r.lines;
    const force = forceProxy || (c.stableAudio && c.stableAudio !== 'off');
    const px = async (u, i) => (r.warm && takeWarm(r.warm[i])) || proxied(u, force);
    const lim = !!r.limited;   // YouTube asked for a sign-in, so this is the plain 360p stream
    if (q === 'audio') return { video: null, audio: await px(lines[0], 0), limited: lim };
    return lines.length > 1 ? { video: await px(lines[0], 0), audio: await px(lines[1], 1), limited: lim } : { video: await px(lines[0], 0), audio: null, limited: lim };
  },
  'yt:download'(id, kind, opts) {
    checkId(id);
    return runJob(id, `https://www.youtube.com/watch?v=${id}`, downloadArgs(kind, opts || {}));
  },
  // ----- sign-in -----
  'auth:status'() {
    // Right after sign-in the account name can be missing; fill it in the background and tell the UI when it arrives.
    const st = acc.read(), a = st.accounts.find((x) => x.id === st.active);
    if (a && a.name === 'Google account') {
      authed().then(whoami).then((w) => {
        if (w.name === 'Google account') return;
        const s2 = acc.read(), x = s2.accounts.find((y) => y.id === a.id);
        if (x) { x.name = w.name; if (w.avatar) x.avatar = w.avatar; acc.write(s2); pushAuth({ state: 'update', ...publicAccounts() }); }
      }).catch(() => {});
    }
    return publicAccounts();
  },
  async 'auth:begin'() {
    const { Innertube } = await import('youtubei.js');
    const i = await Innertube.create({ generate_session_locally: true });
    const mine = (pendingLogin = Symbol('login'));
    i.session.on('auth-pending', (d) => mine === pendingLogin && pushAuth({ state: 'pending', code: d.user_code, url: d.verification_url }));
    i.session.on('auth-error', (e) => mine === pendingLogin && pushAuth({ state: 'error', error: String(e?.message || e) }));
    i.session.on('auth', async ({ credentials }) => {
      if (mine !== pendingLogin) return;
      pendingLogin = null;
      const who = await whoami(i);
      const st = acc.read();
      const id = 'a' + Date.now().toString(36);
      st.accounts.push({ id, name: who.name, avatar: who.avatar, creds: seal(credentials) });
      st.active = id; acc.write(st);
      resetSession();
      pushAuth({ state: 'done', ...publicAccounts() });
    });
    i.session.signIn().catch((e) => mine === pendingLogin && pushAuth({ state: 'error', error: String(e?.message || e) }));
    return true;
  },
  'auth:cancel'() { pendingLogin = null; return true; },
  'auth:switch'(id) { const st = acc.read(); if (st.accounts.some((a) => a.id === id)) { st.active = id; acc.write(st); resetSession(); } return publicAccounts(); },
  async 'auth:remove'(id) {
    const st = acc.read();
    try { if (st.active === id) { const i = await innertube(); if (i.session.logged_in) await i.session.signOut(); } } catch {}
    st.accounts = st.accounts.filter((a) => a.id !== id);
    if (st.active === id) st.active = st.accounts[0]?.id || null;
    acc.write(st); resetSession();
    return publicAccounts();
  },
  // Brand accounts / channels under the signed-in Google account.
  async 'auth:channels'() {
    const i = await authed();
    const x = await i.actions.execute('/account/accounts_list', { requestType: 'ACCOUNTS_LIST_REQUEST_TYPE_CHANNEL_SWITCHER', callCircumstance: 'SWITCHING_USERS_FULL' });
    const items = [];
    const walk = (o) => { if (!o || typeof o !== 'object') return; if (o.accountItem) { items.push(o.accountItem); return; } for (const v of Object.values(o)) walk(v); };
    walk(x.data);
    return items.map((it) => {
      const ds = /"datasyncIdToken":"([^"]+)"/.exec(JSON.stringify(it))?.[1] || '';
      return { name: rt(it.accountName), handle: rt(it.channelHandle) || rt(it.accountByline), avatar: fixUrl((it.accountPhoto?.thumbnails || []).slice(-1)[0]?.url), selected: !!it.isSelected, token: ds.includes('||') ? ds.split('||')[0] : '' };
    });
  },
  async 'auth:setChannel'(token, name) {
    const st = acc.read(), a = st.accounts.find((x) => x.id === st.active);
    if (!a) throw new Error('Sign in first.');
    if (token) { a.onBehalfOf = token; a.channelName = name || ''; } else { delete a.onBehalfOf; delete a.channelName; }
    acc.write(st); resetSession();
    return publicAccounts();
  },

  // ----- signed-in data -----
  async 'me:subs'() {
    const i = await authed();
    const [vt, ct] = await Promise.all([tvPages(i, 'FEsubscriptions', 5), tvPages(i, 'FEchannels', 2).catch(() => [])]);
    const channels = ct.map(tileChannel).filter(Boolean);
    const byName = new Map(channels.map((c) => [c.name, c.id]));
    const videos = tileVideos(vt).map((v) => ({ ...v, channelId: v.channelId || byName.get(v.channel) || '' }));
    return { videos, channels, next: vt.next };
  },
  // The next uploads in the subscriptions feed, from where the last load stopped.
  async 'me:subs-more'(cursor) {
    const i = await authed(), vt = await tvPages(i, 'FEsubscriptions', 4, String(cursor));
    return { videos: tileVideos(vt), next: vt.next };
  },
  // YouTube's own resume positions for recently watched videos, so every thumbnail can show its progress bar.
  async 'me:progress'() { const i = await authed(); return tileVideos(await tvPages(i, 'FEhistory', 8)).filter((v) => v.watchedPct > 0).map((v) => ({ id: v.id, pct: v.watchedPct })); },
  async 'me:history'() { const i = await authed(); return tileVideos(await tvPages(i, 'FEhistory', 2)); },
  async 'me:playlists'() { const i = await authed(); return (await tvPages(i, 'FEplaylist_aggregation', 2)).map(tilePlaylist).filter(Boolean); },
  async 'me:rate'(id, kind) {
    checkId(id);
    const i = await authed();
    // The library still sends the video as a bare string; YouTube now wants {videoId}.
    const path = kind === 'like' ? '/like/like' : kind === 'dislike' ? '/like/dislike' : '/like/removelike';
    await i.actions.execute(path, { target: { videoId: id } });
    return true;
  },
  async 'me:subscribe'(channelId, on) {
    const i = await authed();
    if (on) await i.interact.subscribe(channelId); else await i.interact.unsubscribe(channelId);
    return true;
  },
  async 'me:comment'(id, text) {
    checkId(id);
    const i = await authed();
    if (!String(text).trim()) throw new Error('Comment is empty.');
    await i.interact.comment(id, String(text));
    return true;
  },
  async 'me:addToPlaylist'(playlistId, videoId) { const i = await authed(); await i.playlist.addVideos(playlistId, [videoId]); return true; },

  // ----- playlists / captions / downloads -----
  async 'yt:playlist'(id) {
    if (PRIVATE_LISTS[id] && acc.read().active) return privatePlaylist(id);
    const i = await innertube();
    let pl;
    try { pl = await i.getPlaylist(id); }
    catch (e) { if (acc.read().active) return privatePlaylist(id); throw e; }
    const info = pl.info || {};
    let vids = collectVideos(pl.videos || []);
    for (let n = 0; n < 20 && pl.has_continuation; n++) { pl = await pl.getContinuation(); vids = vids.concat(collectVideos(pl.videos || [])); }
    return {
      id, title: txt(info.title), author: txt(info.author?.name), authorId: info.author?.id || '', authorThumb: thumb(info.author?.thumbnails),
      description: txt(info.description), views: txt(info.views), updated: txt(info.last_updated),
      cover: thumb(info.thumbnails), total: txt(info.total_items) || String(vids.length), videos: vids,
    };
  },
  async 'yt:subs-list'(id) {
    checkId(id);
    try { return (await videoInfo(id)).captionTracks || []; } catch {}
    // (fallback) ask yt-dlp
    const d = JSON.parse(await ytdlp(['-J', '--skip-download', '--no-playlist', `https://www.youtube.com/watch?v=${id}`]));
    const manual = Object.keys(d.subtitles || {}).filter((k) => k !== 'live_chat').map((k) => ({ lang: k, name: d.subtitles[k]?.[0]?.name || k, auto: false }));
    const autoKeys = Object.keys(d.automatic_captions || {});
    let auto = autoKeys.filter((k) => k.endsWith('-orig'));
    if (!auto.length && d.language && autoKeys.includes(d.language)) auto = [d.language];
    return [...manual, ...auto.map((k) => ({ lang: k, name: (d.automatic_captions[k]?.[0]?.name || k).replace(/\s*\(.*\)/, '') + ' (auto)', auto: true }))];
  },
  async 'yt:subs-get'(id, lang, auto) {
    checkId(id); checkLang(lang);
    // Straight from YouTube's caption address (no yt-dlp run); yt-dlp stays as the fallback.
    try {
      await videoInfo(id);
      const t = (captionUrls.get(id) || []).find((x) => x.lang === lang && x.auto === !!auto);
      if (t) {
        const r = await fetch(t.url + (t.url.includes('?') ? '&' : '?') + 'fmt=vtt', { headers: { 'User-Agent': PROXY_UA } });
        const txt = r.ok ? await r.text() : '';
        if (txt.startsWith('WEBVTT')) return txt;
      }
    } catch {}
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytd-subs-'));
    try {
      await ytdlp(['--skip-download', auto ? '--write-auto-subs' : '--write-subs', '--sub-langs', lang, '--sub-format', 'vtt', '--no-playlist', '-o', path.join(dir, '%(id)s.%(ext)s'), `https://www.youtube.com/watch?v=${id}`]);
      const f = fs.readdirSync(dir).find((n) => n.endsWith('.vtt'));
      if (!f) throw new Error('No captions file was produced.');
      return fs.readFileSync(path.join(dir, f), 'utf8');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  },
  'yt:download-playlist'(id, kind, opts) {
    if (!/^[\w-]{10,}$/.test(id)) throw new Error('Bad playlist id.');
    return runJob('PL:' + id, `https://www.youtube.com/playlist?list=${id}`, downloadArgs(kind, opts || {}, { playlist: true }), { playlist: true });
  },
  'dl:cancel'(key) { jobs.get(key)?.kill('SIGTERM'); return true; },
  'settings:get'() { return store.read(); },
  'settings:set'(patch) { const s = { ...store.read(), ...patch }; store.write(s); return s; },
  async 'app:pickDir'() {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  },
  'app:openExternal'(url) {
    if (HIDDEN) return; if (/^https:\/\//.test(url)) shell.openExternal(url); },
  'app:mini'(on) { toggleMini(on); },
  // Diagnostics: how much each active stream has downloaded ahead in the local cache.
  // The next page of suggested videos for a video that is open (the list that came with it is only about twenty).
  async 'yt:related-more'(id) {
    const info = relInfos.get(String(id)); if (!info) return { videos: [], done: true };
    try { await info.getWatchNextContinuation(); } catch { return { videos: [], done: true }; }
    return { videos: collectVideos(info.watch_next_feed || []), done: false };
  },
  // Developer check: what the signed-in player answers for a video (read only, nothing is reported to YouTube).
  async 'dev:playerCheck'(id, o = {}) {
    checkId(id);
    const i = await authed();
    if (o.visitor !== undefined) i.session.context.client.visitorData = o.visitor;
    const sts = o.sts ?? tvSts(i);
    const body = { videoId: id, cpn: crypto.randomBytes(12).toString('base64url').slice(0, 16), contentCheckOk: true, racyCheckOk: true, parse: false };
    if (!o.noCtx) body.playbackContext = { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS', lactMilliseconds: 60000, isInlinePlaybackNoAd: true, signatureTimestamp: sts }, devicePlaybackCapabilities: { supportsVp9Encoding: true, supportXhr: false } };
    const raw = await i.actions.execute('/player', body);
    const d = raw.data || raw;
    return { status: d.playabilityStatus?.status, reason: d.playabilityStatus?.reason || '', streams: !!d.streamingData, tracking: Object.keys(d.playbackTracking || {}), sts: i.session.player?.signature_timestamp || 0 };
  },
  // What the page logs as a warning or error is kept in the same file.
  'dev:pageLog'(level, msg) { const l = level === 'error' ? 'error' : 'warn'; persist(`${stamp(Date.now())} ${l.toUpperCase()} page ${scrub(String(msg))}`); return true; },
  'app:openLogs'() { if (HIDDEN) return false; fs.mkdirSync(LOG_DIR, { recursive: true }); shell.openPath(LOG_DIR); return true; },
  // A text report to paste into a bug report: versions, system, settings and the recent warnings and errors. No tokens or passwords.
  async 'app:report'() {
    const os = require('os'), home = os.homedir();
    const hide = (t) => String(t).split(home).join('~');
    let ytv = 'not found';
    try { ytv = (await new Promise((res, rej) => execFile(YTDLP, ['--version'], { timeout: 5000 }, (e, o) => (e ? rej(e) : res(o))))).trim(); } catch {}
    let fileTail = '';
    try { const b = fs.readFileSync(LOG_FILE, 'utf8'); fileTail = b.slice(-60000).split('\n').slice(-250).join('\n'); } catch { fileTail = '(no log file yet)'; }
    const st = store.read(), signed = !!acc.read().active;
    const lines = [
      'YouTube Desktop bug report',
      `Version: ${thisVersion()}${isDeb() ? ' (deb)' : ''}`,
      `Electron ${process.versions.electron}, Chromium ${process.versions.chrome}, Node ${process.versions.node}`,
      `System: ${os.type()} ${os.release()} ${os.arch()}, session ${process.env.XDG_SESSION_TYPE || 'n/a'}, ${Math.round(os.totalmem() / 1048576)} MB RAM`,
      `yt-dlp: ${ytv} (JavaScript runtime for its challenges: this app's own engine, Node ${process.versions.node})`,
      `Signed in: ${signed ? 'yes' : 'no'}`,
      `Playing: ${playerPlaying ? 'yes' : 'no'}`,
      '', '--- settings (changed from the defaults are all listed) ---', hide(JSON.stringify(st)),
      '', '--- log file (warnings and errors, newest last) ---', hide(fileTail),
      '', '--- this session, recent (all levels) ---', hide(logRing.slice(-120).map((l) => `${stamp(l.t)} ${l.level.toUpperCase()} ${l.src} ${l.msg}`).join('\n')),
    ];
    return lines.join('\n');
  },
  // Updates yt-dlp itself (YouTube changes often and an old copy stops finding streams). Only a copy that can replace itself: the one
  // in ~/.local/bin or next to the Windows app; a distro package has to be updated with the system.
  async 'app:updateYtdlp'() {
    const before = await new Promise((res) => execFile(YTDLP, ['--version'], { timeout: 8000 }, (e, o) => res(e ? '?' : o.trim())));
    const out = await new Promise((res) => execFile(YTDLP, ['-U'], { timeout: 120000 }, (e, o, se) => res((o || '') + (se || '') + (e && !o ? e.message : ''))));
    const after = await new Promise((res) => execFile(YTDLP, ['--version'], { timeout: 8000 }, (e, o) => res(e ? '?' : o.trim())));
    resolveCache.clear();
    if (after !== before) return `Updated yt-dlp: ${before} to ${after}.`;
    if (/up to date|latest/i.test(out)) return `yt-dlp ${after} is the latest version.`;
    if (/package manager|apt|pacman|dnf|snap|pip/i.test(out)) return `yt-dlp ${after} came from a package manager; update it there (or install the official build in ~/.local/bin).`;
    return `yt-dlp ${after}: ${out.trim().split('\n').pop().slice(0, 160)}`;
  },
  'dev:log'(since) { return logRing.filter((l) => l.t > (+since || 0)); },
  'dev:logClear'() { logRing.length = 0; return true; },
  'dev:verbose'(on) { devVerbose = !!on; dlog('info', 'verbose logging ' + (devVerbose ? 'on' : 'off')); return true; },
  'dev:streamStats'() {
    return [...streamsMap.values()].map((s) => {
      const done = [...s.chunks.entries()].filter(([, e]) => e.done).length, bps = s.dur ? s.size / s.dur : 0;
      return { kind: s.mime.split('/')[0], mb: +(s.size / 1048576).toFixed(1), seconds: s.dur, cachedChunks: done, queued: s.chunks.size - done, disk: !!s.disk, cachedSecondsApprox: bps ? Math.round((done * CHUNK) / bps) : null, cachedMB: +((done * CHUNK) / 1048576).toFixed(1) };
    });
  },
  'app:quit'() { quitting = true; app.quit(); return true; },
  'app:relaunch'() { app.relaunch(); quitting = true; app.exit(0); return true; },
  'app:openDownloads'() { const d = cfg().downloadDir || app.getPath('downloads'); fs.mkdirSync(d, { recursive: true }); return shell.openPath(d); },
  'app:showFile'(p) {
    // Only reveal files that really exist inside the download folder.
    const root = path.resolve(cfg().downloadDir || app.getPath('downloads')), f = path.resolve(String(p || ''));
    if (f.startsWith(root + path.sep) && fs.existsSync(f)) { shell.showItemInFolder(f); return true; }
    return false;
  },
  'app:notify'(kind, title, body, vid) { return notify(kind, String(title || ''), String(body || ''), vid || null); },
  // ----- adds what you watch here to your YouTube watch history (signed in) -----
  async 'me:historyStart'(id, start) {
    checkId(id);
    const i = await authed();
    const { Constants } = await import('youtubei.js'), tv = Constants?.CLIENTS?.TV || { NAME: 'TVHTML5', VERSION: '7.20260311.12.00' };
    // The tracking addresses must come from a player request made while signed in, otherwise YouTube does not tie the view to your account.
    // SmartTube's finding: the playback nonce (cpn) has to be sent in the player request itself and then reused in the pings; a nonce YouTube never saw is ignored.
    const cpn = crypto.randomBytes(12).toString('base64url').slice(0, 16);
    let pt = null;
    try {
      const raw = await i.actions.execute('/player', {
        videoId: id, cpn, contentCheckOk: true, racyCheckOk: true, parse: false,
        // The same playback context SmartTube sends (without the signature timestamp the TV player answers "The page needs to be reloaded").
        playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS', lactMilliseconds: 60000, isInlinePlaybackNoAd: true, signatureTimestamp: tvSts(i) }, devicePlaybackCapabilities: { supportsVp9Encoding: true, supportXhr: false } },
      });
      const t = (raw.data || raw).playbackTracking, d0 = raw.data || raw;
      console.info(`history: player ${d0.playabilityStatus?.status || '?'}${d0.playabilityStatus?.reason ? ' (' + d0.playabilityStatus.reason + ')' : ''}, streams ${d0.streamingData ? 'yes' : 'no'}, tracking ${Object.keys(t || {}).join(',') || 'none'}`);
      if (t?.videostatsPlaybackUrl?.baseUrl) pt = { videostats_playback_url: t.videostatsPlaybackUrl.baseUrl, videostats_watchtime_url: t.videostatsWatchtimeUrl?.baseUrl };
    } catch {}
    if (!pt?.videostats_playback_url) { const info = await (await innertube()).getInfo(id); pt = info.page?.[0]?.playback_tracking || info.playback_tracking; }
    if (!pt?.videostats_playback_url) throw new Error('YouTube gave no playback tracking for this video.');
    const client = { name: tv.NAME, version: tv.VERSION };
    histInfos.set(id, { pt, cpn, client, last: +start || 0 }); capMap(histInfos, 20);
    const r = await statsPing(i, pt.videostats_playback_url, client, { cpn, cmt: (+start || 0).toFixed(3) });
    if (!r.ok) throw new Error('YouTube answered ' + r.status);
    return true;
  },
  // mode: 'playing' (a regular report), 'paused', or 'final' (the video was left or ended). Each report covers the stretch watched since the last one.
  async 'me:historyTime'(id, seconds, mode) {
    const h = histInfos.get(String(id)); if (!h?.pt?.videostats_watchtime_url) return false;
    const t = Math.max(0, +seconds || 0), st = Math.min(h.last || 0, t);
    const p = { cpn: h.cpn, st: st.toFixed(3), et: t.toFixed(3), cmt: t.toFixed(3) };
    if (mode === 'final') p.final = '1';
    h.last = t;
    const r = await statsPing(await authed(), h.pt.videostats_watchtime_url, h.client, p);
    return r.ok;
  },
  'update:check'() { return checkUpdate(true); },
  'update:state'() { const { _assets, ...u } = upd; return { ...u, current: thisVersion(), auto: canSelfUpdate() }; },
  async 'update:install'() {
    if (upd.status !== 'available') return upd;
    if (!canSelfUpdate()) { if (!HIDDEN && /^https:\/\//.test(upd.url || '')) shell.openExternal(upd.url); return upd; }
    pushUpd({ status: 'downloading', pct: 0 });
    try {
      if (isDeb()) await updateDeb();
      else { const u = getUpdater(); await u.checkForUpdates(); await u.downloadUpdate(); }
    } catch (e) { pushUpd({ status: 'error', error: String(e.message || e), manual: true }); }
    return upd;
  },
  'update:restart'() { if (upd.status !== 'ready') return true; if (upd.via === 'deb') { app.relaunch(); app.exit(0); } else getUpdater().quitAndInstall(); return true; },
  'app:copy'(text) { clipboard.writeText(String(text)); return true; },
};


// ---------- desktop notifications ----------
// kind: 'upload' | 'download' | 'sleep' | 'queue' | 'update' | 'playing' | 'test'. The settings decide whether it shows,
// and (when "only in the background" is on) whether the window is out of sight right now.
if (HIDDEN) globalThis.__notifLog = [];
const inBackground = () => !win || win.isDestroyed() || win.isMinimized() || !win.isVisible() || !win.isFocused();
function notify(kind, title, body, vid) {
  const c = cfg();
  if (c.notifyOn === false) return false;
  const kinds = { upload: 'notifyUploads', download: 'dlNotify', sleep: 'notifySleep', queue: 'notifyQueue', update: 'notifyUpdate', playing: 'notifyPlaying' };
  if (kind !== 'test' && kinds[kind] && c[kinds[kind]] === false) return false;
  if (kind === 'playing' && c.notifyPlaying !== true) return false;
  if (kind !== 'test' && (c.notifyWhen || 'background') === 'background' && !inBackground()) return false;
  if (HIDDEN) globalThis.__notifLog.push({ kind, title, body }); // test mode only: nothing is shown, so keep a record
  if (HIDDEN || !Notification.isSupported()) return true;
  const n = new Notification({ title, body: body || '', silent: c.notifySound === false, icon: path.join(__dirname, 'src', 'icon.png') });
  n.on('click', () => { showWin(win); if (win?.isMinimized()) win.restore(); win?.focus(); if (vid) win?.webContents.send('open-video', vid); });
  n.show();
  return true;
}

// ---------- updates ----------
// Looks at the latest GitHub release. The NSIS installer (Windows) and the AppImage can update themselves through
// electron-updater; the .deb and the portable .exe just get a link to the release page.
const UPDATE_REPO = 'Madmaxx636/youtube-desktop';
const thisVersion = () => process.env.YT_FAKE_VERSION || app.getVersion();
const cmpVer = (a, b) => { const x = String(a).replace(/^v/, '').split('.').map(Number), y = String(b).replace(/^v/, '').split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1; } return 0; };
const isDeb = () => process.platform === 'linux' && app.isPackaged && !process.env.APPIMAGE && process.execPath.startsWith('/opt/');
const canSelfUpdate = () => isDeb() || app.isPackaged && ((process.platform === 'win32' && !process.env.PORTABLE_EXECUTABLE_DIR) || (process.platform === 'linux' && !!process.env.APPIMAGE));
let upd = { status: 'idle', current: null };
const pushUpd = (patch) => { upd = { ...upd, ...patch, current: thisVersion() }; const { _assets, ...pub } = upd; for (const w of [win]) if (w && !w.isDestroyed()) w.webContents.send('update', pub); return pub; };
let updater;
function getUpdater() {
  if (updater) return updater;
  updater = require('electron-updater').autoUpdater;
  updater.autoDownload = false; updater.autoInstallOnAppQuit = true;
  updater.on('download-progress', (p) => pushUpd({ status: 'downloading', pct: Math.round(p.percent) }));
  updater.on('update-downloaded', () => pushUpd({ status: 'ready' }));
  updater.on('error', (e) => pushUpd({ status: 'error', error: String(e.message || e).slice(0, 200) }));
  return updater;
}
async function checkUpdate(manual) {
  if (['downloading', 'installing', 'ready'].includes(upd.status)) return upd;
  try {
    const r = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'youtube-desktop-updater' } });
    if (!r.ok) throw new Error('GitHub answered ' + r.status);
    const rel = await r.json();
    const v = String(rel.tag_name || '').replace(/^v/, '');
    if (!v || cmpVer(v, thisVersion()) <= 0) return pushUpd({ status: 'none', version: v, manual: !!manual });
    upd._assets = rel.assets || [];
    return pushUpd({ status: 'available', version: v, url: rel.html_url, notes: String(rel.body || '').slice(0, 1500), auto: canSelfUpdate(), manual: !!manual });
  } catch (e) {
    return pushUpd({ status: manual ? 'error' : upd.status, error: String(e.message || e), manual: !!manual });
  }
}

// .deb installs: download the new .deb, check it against the release's SHA256SUMS, then let apt install it through the system password prompt (pkexec).
async function updateDeb() {
  const assets = upd._assets || [], deb = assets.find((a) => /_amd64\.deb$/.test(a.name)), sums = assets.find((a) => a.name === 'SHA256SUMS');
  if (!deb || !sums) throw new Error('This release has no .deb to install.');
  const dir = path.join(os.tmpdir(), 'youtube-desktop-update'); fs.mkdirSync(dir, { recursive: true });
  if (!/^[\w.+-]+$/.test(deb.name) || !String(deb.browser_download_url).startsWith(`https://github.com/${UPDATE_REPO}/releases/download/`)) throw new Error('The release lists an unexpected download address, so it was not used.');
  const file = path.join(dir, deb.name);
  const r = await fetch(deb.browser_download_url, { headers: { 'User-Agent': 'youtube-desktop-updater' } });
  if (!r.ok) throw new Error('Download failed (' + r.status + ')');
  const total = +r.headers.get('content-length') || deb.size || 0, out = fs.createWriteStream(file), hash = crypto.createHash('sha256');
  let got = 0, last = 0;
  for await (const chunk of r.body) { out.write(chunk); hash.update(chunk); got += chunk.length; if (total && Date.now() - last > 300) { last = Date.now(); pushUpd({ status: 'downloading', pct: Math.round((got / total) * 100) }); } }
  await new Promise((res) => out.end(res));
  const want = String(await (await fetch(sums.browser_download_url, { headers: { 'User-Agent': 'youtube-desktop-updater' } })).text()).split('\n').map((l) => l.trim().split(/\s+/)).find((x) => x[1] === deb.name)?.[0];
  if (!want || want !== hash.digest('hex')) { fs.rmSync(file, { force: true }); throw new Error('The downloaded file did not match its published checksum, so it was not installed.'); }
  pushUpd({ status: 'installing' });
  await new Promise((res, rej) => execFile('pkexec', ['apt-get', 'install', '-y', '--allow-downgrades', file], { timeout: 5 * 60 * 1000 }, (err, _o, se) => (err ? rej(new Error(err.code === 126 || err.code === 127 ? 'Installing was cancelled.' : String(se || err.message).slice(0, 200))) : res())));
  fs.rmSync(file, { force: true });
  pushUpd({ status: 'ready', via: 'deb' });
}
function scheduleUpdateChecks() {
  if (!app.isPackaged && !process.env.YT_FAKE_VERSION) return;
  const run = () => { if (cfg().autoUpdateCheck !== false) checkUpdate(false); };
  setTimeout(run, 20000); setInterval(run, 6 * 3600 * 1000);
}

for (const [name, fn] of Object.entries(handlers)) {
  ipcMain.handle(name, async (_e, ...args) => {
    const t0 = Date.now();
    try { const data = await fn(...args); if (devVerbose && !name.startsWith('dev:')) dlog('debug', `${name} ok in ${Date.now() - t0} ms`); return { ok: true, data }; }
    catch (err) { dlog('warn', `${name} failed after ${Date.now() - t0} ms: ${err.message || err}`); return { ok: false, error: String(err.message || err) }; }
  });
}

function send(cmd) { win?.webContents.send('media', cmd); }

// The page describes a menu; we show it natively and report which item was picked (or null if dismissed).
ipcMain.handle('ctx:menu', (e, items) => new Promise((resolve) => {
  let picked = null;
  if (HIDDEN) return resolve(globalThis.__pick ?? null); // tests choose items programmatically
  const tpl = (Array.isArray(items) ? items : []).slice(0, 40).map((it) => it.type === 'separator' ? { type: 'separator' }
    : { label: String(it.label || ''), enabled: it.enabled !== false, ...(it.checked !== undefined ? { type: 'checkbox', checked: !!it.checked } : {}), click: () => { picked = String(it.id); } });
  Menu.buildFromTemplate(tpl).popup({ window: BrowserWindow.fromWebContents(e.sender) || win, callback: () => resolve(picked) });
}));

function createWindow() {
  const s = store.read();
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    backgroundColor: '#0f0f0f', title: 'YouTube Desktop', autoHideMenuBar: true, show: !HIDDEN,
    ...(s.bounds || {}),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: !HIDDEN },
  });
  win.loadFile('src/index.html');
  try { const ss = win.webContents.session; if (!ss.getSpellCheckerLanguages().length) ss.setSpellCheckerLanguages(['en-US']); } catch {}
  win.webContents.on('render-process-gone', (_e, d) => dlog('error', `page process gone: ${d.reason} (exit ${d.exitCode})`));
  win.on('unresponsive', () => dlog('error', 'the window stopped responding'));
  win.webContents.on('context-menu', (_e, p) => {
    if (!p.isEditable && !p.selectionText) return;
    const f = p.editFlags;
    const fix = p.isEditable && p.misspelledWord ? [...p.dictionarySuggestions.slice(0, 5).map((w) => ({ label: w, click: () => win.webContents.replaceMisspelling(w) })), ...(p.dictionarySuggestions.length ? [] : [{ label: 'No suggestions', enabled: false }]), { label: 'Add to dictionary', click: () => win.webContents.session.addWordToSpellCheckerDictionary(p.misspelledWord) }, { type: 'separator' }] : [];
    Menu.buildFromTemplate(p.isEditable
      ? [...fix, { role: 'cut', enabled: f.canCut }, { role: 'copy', enabled: f.canCopy }, { role: 'paste', enabled: f.canPaste }, { type: 'separator' }, { role: 'selectAll' }]
      : [{ role: 'copy' }]).popup({ window: win });
  });
  win.on('minimize', () => { if (cfg().miniOnMinimize && playerPlaying && !mini) toggleMini(true); });
  win.on('close', (e) => {
    store.write({ ...store.read(), bounds: win.getBounds() });
    if (!quitting && store.read().closeToTray) { e.preventDefault(); win.hide(); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url) && !HIDDEN) shell.openExternal(url); return { action: 'deny' }; });
  // The window only ever shows the app's own pages; anything else that tries to navigate it goes to the browser instead.
  const stay = (e, url) => { if (!url.startsWith('file://')) { e.preventDefault(); if (/^https:\/\//.test(url) && !HIDDEN) shell.openExternal(url); } };
  win.webContents.on('will-navigate', stay); win.webContents.on('will-redirect', stay);
}

function toggleMini(on) {
  if (!on) { mini?.close(); return; }
  if (mini) return;
  const c = cfg();
  const sizes = { small: [360, 203], medium: [480, 270], large: [640, 360], xl: [800, 450] };
  let [w, h] = sizes[c.miniSize] || sizes.medium;
  const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea, m = Math.max(0, num(c.miniMargin));
  const corners = { 'bottom-right': [wa.x + wa.width - w - m, wa.y + wa.height - h - m], 'bottom-left': [wa.x + m, wa.y + wa.height - h - m], 'top-right': [wa.x + wa.width - w - m, wa.y + m], 'top-left': [wa.x + m, wa.y + m] };
  let [x, y] = corners[c.miniCorner] || corners['bottom-right'];
  if (c.miniCorner === 'remember' && c.miniBounds) ({ x, y, width: w, height: h } = c.miniBounds);
  mini = new BrowserWindow({
    x, y, width: w, height: h, useContentSize: true, alwaysOnTop: c.miniOnTop !== false, frame: c.miniFrameless === false,
    resizable: true, skipTaskbar: true, backgroundColor: '#000', title: 'Mini player', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  mini.setAspectRatio(16 / 9);
  const op = Number(c.miniOpacity) || 100; // stored as a percentage (30-100)
  mini.setOpacity(Math.min(1, Math.max(0.3, op > 1 ? op / 100 : op)));
  mini.loadFile('src/mini.html');
  // Some Linux window managers (Wayland in particular) ignore the position given at creation, so place it once it exists.
  mini.once('ready-to-show', () => {
    if (HIDDEN) return;
    mini.show();
    // The window manager picks the first position when the window is mapped; move it once that has happened.
    for (const delay of [120, 400]) setTimeout(() => { if (mini && !mini.isDestroyed()) mini.setPosition(x, y); }, delay);
  });
  mini.on('close', () => { if (cfg().miniCorner === 'remember') store.write({ ...store.read(), miniBounds: mini.getBounds() }); });
  mini.on('closed', () => { mini = null; showWin(win); win?.webContents.send('media', 'mini-closed'); });
  win.hide();
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'src', 'icon.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 22, height: 22 }));
  tray.setToolTip('YouTube Desktop');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show', click: () => { win.show(); win.focus(); } },
    { label: 'Play / Pause', click: () => send('toggle') },
    { label: 'Next', click: () => send('next') },
    { label: 'Previous', click: () => send('prev') },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => (win.isVisible() ? win.hide() : win.show()));
}

// Wayland compositors decide where windows go, which breaks the mini player's screen-corner placement and stay-on-top.
// Running through XWayland ("x11") restores both. This has to be chosen before the app is ready, so read the file directly.
try {
  const early = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8'));
  if (early.windowSystem === 'x11') app.commandLine.appendSwitch('ozone-platform', 'x11');
} catch {}

app.whenReady().then(() => {
  if (lockLost) return;
  // Nothing in the app needs camera, microphone, location and so on: refuse every permission except full screen.
  require('electron').session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'fullscreen'));
  scheduleUpdateChecks();
  sweepOldCaches();
  innertube().catch(() => {}); // set the web session up in the background so the first page does not wait for it
  setTimeout(() => execFile(YTDLP, ['--version'], () => {}), 1500); // read yt-dlp from disk once, so the first video starts sooner
  createWindow();
  if (HIDDEN) return;
  createTray();
  globalShortcut.register('MediaPlayPause', () => send('toggle'));
  globalShortcut.register('MediaNextTrack', () => send('next'));
  globalShortcut.register('MediaPreviousTrack', () => send('prev'));
  globalShortcut.register('CommandOrControl+Alt+Y', () => (win.isVisible() && win.isFocused() ? win.hide() : (win.show(), win.focus())));
});

// Media-session (MPRIS) on Linux comes from Chromium; keep it enabled.
app.commandLine.appendSwitch('enable-features', 'MediaSessionService,HardwareMediaKeyHandling');
ipcMain.on('mini-cmd', (_e, c) => send(c));
ipcMain.on('mini-state', (_e, s) => mini?.webContents.send('mini-state', s));
ipcMain.on('player-state', (_e, s) => { playerPlaying = !!s.playing; mini?.webContents.send('mini-state', s); });
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => { globalShortcut.unregisterAll(); try { fs.rmSync(CACHE_ROOT, { recursive: true, force: true }); fs.rmdirSync(CACHE_PARENT); } catch {} });
// Closing the last window really quits (the "keep running in the tray" option hides the window instead, so it never gets here).
app.on('window-all-closed', () => { if (process.platform !== 'darwin') { quitting = true; app.quit(); } });
// Only one copy runs: opening the app again brings the existing window forward instead of starting another.
if (!app.requestSingleInstanceLock()) { lockLost = true; quitting = true; app.quit(); }
else app.on('second-instance', () => {
  if (!win || win.isDestroyed()) { if (app.isReady()) createWindow(); return; }
  if (HIDDEN) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
});
