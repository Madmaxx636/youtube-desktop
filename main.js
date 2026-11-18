const { app, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, shell, nativeImage, dialog, Notification, clipboard, safeStorage, screen } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');

let win, mini, tray, yt;
const jobs = new Map();
let playerPlaying = false;
// Prefer a user-installed, up-to-date yt-dlp: distro packages go stale and YouTube breaks them.
const localYtdlp = path.join(require('os').homedir(), '.local', 'bin', 'yt-dlp');
const YTDLP = fs.existsSync(localYtdlp) ? localYtdlp : 'yt-dlp';
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

let ytPromise = null, pendingLogin = null, lastInfo = null;
function resetSession() { yt = null; ytPromise = null; lastInfo = null; }
async function buildSession() {
  const { Innertube } = await import('youtubei.js');
  const st = acc.read(), a = st.accounts.find((x) => x.id === st.active);
  const opts = { generate_session_locally: true };
  if (a?.onBehalfOf) opts.on_behalf_of_user = a.onBehalfOf;
  const i = await Innertube.create(opts);
  if (a) {
    i.session.on('update-credentials', ({ credentials }) => {
      const s = acc.read(), x = s.accounts.find((y) => y.id === a.id);
      if (x) { x.creds = seal(credentials); acc.write(s); }
    });
    await i.session.signIn(unseal(a.creds));
  }
  return i;
}
async function innertube() {
  if (yt) return yt;
  if (!ytPromise) ytPromise = buildSession().catch((e) => { ytPromise = null; throw e; });
  yt = await ytPromise;
  return yt;
}
async function authed() {
  const i = await innertube();
  if (!i.session.logged_in) throw new Error('Sign in first.');
  return i;
}
async function whoami(i) {
  try {
    const info = await i.account.getInfo();
    const it = info.contents?.contents?.[0] || info.contents;
    return { name: txt(it?.account_name) || 'Google account', avatar: thumb(it?.account_photo) };
  } catch { return { name: 'Google account', avatar: '' }; }
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
const thumb = (a) => (a && a.length ? a[a.length - 1].url : '');

function mapVideo(v) {
  const id = v.id || v.video_id || v.content_id;
  if (!id) return null;
  return {
    id,
    title: txt(v.title) || txt(v.metadata?.title),
    channel: txt(v.author?.name) || txt(v.short_byline_text) || '',
    channelId: v.author?.id || '',
    channelThumb: thumb(v.author?.thumbnails),
    views: txt(v.short_view_count) || txt(v.view_count) || '',
    published: txt(v.published) || '',
    duration: txt(v.duration) || v.length_text?.text || '',
    thumb: thumb(v.thumbnails) || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    isShort: v.type === 'ShortsLockupView' || v.type === 'ReelItem',
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
      out.push({
        id, title: txt(meta?.title), channel, channelId: '', channelThumb: '',
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
    if (['Playlist', 'GridPlaylist'].includes(n.type) || (n.type === 'LockupView' && n.content_type === 'PLAYLIST')) { const m = mapPlaylist(n); if (m) out.push(m); }
    else { const inner = n.contents || n.items || n.content?.contents; if (Array.isArray(inner)) collectPlaylists(inner, out); }
  }
  return out;
}

function ytdlp(args) {
  return new Promise((resolve, reject) => {
    execFile(YTDLP, ['--no-warnings', '--no-update', ...args], { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
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
  miniSize: 'medium', miniCorner: 'bottom-right', miniOnTop: true, miniOpacity: 100, miniFrameless: true, miniOnMinimize: false, miniMargin: 16,
};
const cfg = () => ({ ...DEF, ...store.read() });
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };
function vcodecFilter(c) {
  return c === 'avc1' ? "[vcodec^=avc1]" : c === 'vp9' ? "[vcodec~='^vp0?9']" : c === 'av01' ? "[vcodec^=av01]" : '';
}
function acodecFilter(c) { return c === 'aac' ? '[acodec^=mp4a]' : c === 'opus' ? '[acodec=opus]' : ''; }
// Streaming format: strictest match first, then progressively looser fallbacks so something always plays.
function streamFormat(quality, c) {
  const abr = num(c.maxAudioBitrate) ? `[abr<=${num(c.maxAudioBitrate)}]` : '';
  const ac = acodecFilter(c.audioCodec);
  if (quality === 'audio') return `ba${ac}${abr}/ba${abr}/ba`;
  const cap = quality === 'best' ? 0 : num(quality) || 1080;
  const h = cap ? `[height<=${cap}]` : '';
  const fps = num(c.fps) ? `[fps<=${num(c.fps)}]` : '';
  const br = num(c.maxVideoBitrate) ? `[tbr<=${num(c.maxVideoBitrate)}]` : '';
  // "auto" prefers H.264 up to 1080p (best hardware decoding); above that YouTube only offers VP9/AV1.
  const vc = c.codec === 'auto' ? (cap && cap <= 1080 ? vcodecFilter('avc1') : '') : vcodecFilter(c.codec);
  return [`bv*${h}${fps}${br}${vc}+ba${ac}${abr}`, `bv*${h}${fps}${br}+ba${abr}`, `bv*${h}${fps}+ba`, `bv*${h}+ba`, `b${h}`].join('/');
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
  const chain = [`bv*${h}${fps}${vc}+ba${ac}`];
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
    a.push('-f', 'ba/b', '-x', '--audio-format', /^(mp3|m4a|opus|flac|wav|vorbis|aac)$/.test(fmt) ? fmt : 'mp3');
    if (/^(0|[1-9]\d{1,2}K?)$/i.test(q)) a.push('--audio-quality', /^\d+$/.test(q) && q !== '0' ? q + 'K' : q);
    if (fmt !== 'wav' && c.dlEmbedThumb) a.push('--embed-thumbnail');
  } else {
    a.push('-f', downloadFormat(kind, o, c), '--merge-output-format', o.container || c.dlContainer);
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
  const p = spawn(YTDLP, [...args, playlist ? '--yes-playlist' : '--no-playlist', url]);
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
    if (!sig && cfg().dlNotify && Notification.isSupported()) new Notification({ title: code === 0 ? 'Download complete' : 'Download finished with errors', body: playlist ? `${item} of ${total} items` : key }).show();
  });
  return true;
}

const handlers = {
  async 'yt:home'(seeds) {
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
  async 'yt:video'(id) {
    const i = await innertube();
    const info = await i.getInfo(id);
    lastInfo = { id, info };
    const b = info.basic_info;
    const related = collectVideos(info.watch_next_feed || []);
    return {
      id, title: b.title, channel: b.author, channelId: b.channel_id,
      views: b.view_count, likes: b.like_count, description: b.short_description,
      duration: b.duration, keywords: b.keywords || [], isLive: b.is_live,
      published: txt(info.primary_info?.published) || '',
      relative: txt(info.primary_info?.relative_date) || '',
      channelThumb: thumb(info.secondary_info?.owner?.author?.thumbnails) || '',
      subs: txt(info.secondary_info?.owner?.subscriber_count) || '',
      related,
    };
  },
  async 'yt:comments'(id, sort) {
    const i = await innertube();
    const c = await i.getComments(id, sort === 'NEWEST_FIRST' ? 'NEWEST_FIRST' : 'TOP_COMMENTS');
    return (c.contents || []).map((t) => {
      const cm = t.comment;
      return cm && { author: txt(cm.author?.name), text: txt(cm.content), likes: txt(cm.like_count), published: txt(cm.published_time), thumb: thumb(cm.author?.thumbnails) };
    }).filter(Boolean);
  },
  async 'yt:channel'(id) {
    const i = await innertube();
    const ch = await i.getChannel(id);
    let vids = [];
    try { const v = await ch.getVideos(); vids = collectVideos(v.videos || v.contents?.contents || []); } catch {}
    return { id, name: txt(ch.metadata?.title), avatar: thumb(ch.metadata?.avatar), description: ch.metadata?.description || '', videos: vids };
  },
  async 'yt:stream'(id, quality) {
    // YouTube no longer serves combined streams, so resolve separate video and audio URLs.
    const c = cfg();
    const q = quality || c.quality || 'auto';
    const lines = (await ytdlp(['-g', '-f', streamFormat(q, c), '--no-playlist', `https://www.youtube.com/watch?v=${id}`])).trim().split('\n');
    if (q === 'audio') return { video: null, audio: lines[0] };
    return lines.length > 1 ? { video: lines[0], audio: lines[1] } : { video: lines[0], audio: null };
  },
  'yt:download'(id, kind, opts) {
    if (!/^[\w-]{11}$/.test(id)) throw new Error('Bad video id.');
    return runJob(id, `https://www.youtube.com/watch?v=${id}`, downloadArgs(kind, opts || {}));
  },
  // ----- sign-in -----
  'auth:status'() { return publicAccounts(); },
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
    const items = await i.account.getInfo(true);
    return items.map((it) => {
      const tokens = it.endpoint?.payload?.supportedTokens || [];
      const ds = tokens.map((t) => t.datasyncIdToken?.datasyncIdToken).find(Boolean) || '';
      return { name: txt(it.account_name), handle: txt(it.channel_handle) || txt(it.account_byline), avatar: thumb(it.account_photo), selected: !!it.is_selected, token: ds.includes('||') ? ds.split('||')[0] : '' };
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
    let f = await i.getSubscriptionsFeed();
    let vids = (f.videos || []).map(mapVideo).filter(Boolean);
    for (let n = 0; n < 2 && f.has_continuation; n++) { f = await f.getContinuation(); vids = vids.concat((f.videos || []).map(mapVideo).filter(Boolean)); }
    let channels = [];
    try { const c = await i.getChannelsFeed(); channels = (c.channels || []).map((x) => ({ id: x.id || x.author?.id, name: txt(x.author?.name) || txt(x.title), avatar: thumb(x.author?.thumbnails || x.thumbnails) })).filter((x) => x.id); } catch {}
    return { videos: vids, channels };
  },
  async 'me:history'() {
    const i = await authed();
    const h = await i.getHistory();
    return collectVideos(h.sections || h.contents?.contents || []);
  },
  async 'me:playlists'() {
    const i = await authed();
    const f = await i.getPlaylists();
    let list = (f.playlists || []).map(mapPlaylist).filter(Boolean);
    if (!list.length) list = collectPlaylists(f.contents?.contents || []);
    return list;
  },
  async 'me:notifs'() {
    const i = await authed();
    const n = await i.getNotifications();
    return (n.contents || []).map((x) => ({
      id: x.notification_id, text: txt(x.short_message), time: txt(x.sent_time), read: !!x.read,
      thumb: thumb(x.video_thumbnails) || thumb(x.thumbnails),
      videoId: x.endpoint?.payload?.videoId || /[?&]v=([\w-]{11})/.exec(x.endpoint?.metadata?.url || '')?.[1] || '',
    }));
  },
  async 'me:notifCount'() { const i = await authed(); return await i.getUnseenNotificationsCount(); },
  async 'me:rate'(id, kind) {
    const i = await authed();
    if (kind === 'like') await i.interact.like(id); else if (kind === 'dislike') await i.interact.dislike(id); else await i.interact.removeRating(id);
    return true;
  },
  async 'me:subscribe'(channelId, on) {
    const i = await authed();
    if (on) await i.interact.subscribe(channelId); else await i.interact.unsubscribe(channelId);
    return true;
  },
  async 'me:comment'(id, text) {
    const i = await authed();
    if (!String(text).trim()) throw new Error('Comment is empty.');
    await i.interact.comment(id, String(text));
    return true;
  },
  async 'me:addToPlaylist'(playlistId, videoId) { const i = await authed(); await i.playlist.addVideos(playlistId, [videoId]); return true; },
  async 'me:watched'(id) {
    const i = await authed();
    const info = lastInfo?.id === id ? lastInfo.info : await i.getInfo(id);
    await info.addToWatchHistory();
    return true;
  },

  // ----- playlists / captions / downloads -----
  async 'yt:playlist'(id) {
    const i = await innertube();
    let pl = await i.getPlaylist(id);
    const info = pl.info || {};
    let vids = (pl.videos || []).map(mapVideo).filter(Boolean);
    for (let n = 0; n < 20 && pl.has_continuation; n++) { pl = await pl.getContinuation(); vids = vids.concat((pl.videos || []).map(mapVideo).filter(Boolean)); }
    return { id, title: txt(info.title), author: txt(info.author?.name), total: txt(info.total_items) || String(vids.length), videos: vids };
  },
  async 'yt:subs-list'(id) {
    const d = JSON.parse(await ytdlp(['-J', '--skip-download', '--no-playlist', `https://www.youtube.com/watch?v=${id}`]));
    const manual = Object.keys(d.subtitles || {}).filter((k) => k !== 'live_chat').map((k) => ({ lang: k, name: d.subtitles[k]?.[0]?.name || k, auto: false }));
    const autoKeys = Object.keys(d.automatic_captions || {});
    let auto = autoKeys.filter((k) => k.endsWith('-orig'));
    if (!auto.length && d.language && autoKeys.includes(d.language)) auto = [d.language];
    return [...manual, ...auto.map((k) => ({ lang: k, name: (d.automatic_captions[k]?.[0]?.name || k).replace(/\s*\(.*\)/, '') + ' (auto)', auto: true }))];
  },
  async 'yt:subs-get'(id, lang, auto) {
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
  'app:openExternal'(url) { if (/^https:\/\//.test(url)) shell.openExternal(url); },
  'app:mini'(on) { toggleMini(on); },
  'app:relaunch'() { app.relaunch(); quitting = true; app.exit(0); return true; },
  'app:openDownloads'() { const d = cfg().downloadDir || app.getPath('downloads'); fs.mkdirSync(d, { recursive: true }); return shell.openPath(d); },
  'app:showFile'(p) {
    // Only reveal files that really exist inside the download folder.
    const root = path.resolve(cfg().downloadDir || app.getPath('downloads')), f = path.resolve(String(p || ''));
    if (f.startsWith(root + path.sep) && fs.existsSync(f)) { shell.showItemInFolder(f); return true; }
    return false;
  },
  'app:copy'(text) { clipboard.writeText(String(text)); return true; },
};

for (const [name, fn] of Object.entries(handlers)) {
  ipcMain.handle(name, async (_e, ...args) => {
    try { return { ok: true, data: await fn(...args) }; }
    catch (err) { return { ok: false, error: String(err.message || err) }; }
  });
}

function send(cmd) { win?.webContents.send('media', cmd); }

function createWindow() {
  const s = store.read();
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    backgroundColor: '#0f0f0f', title: 'YouTube Desktop', autoHideMenuBar: true,
    ...(s.bounds || {}),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  win.loadFile('src/index.html');
  win.on('minimize', () => { if (cfg().miniOnMinimize && playerPlaying && !mini) toggleMini(true); });
  win.on('close', (e) => {
    store.write({ ...store.read(), bounds: win.getBounds() });
    if (!quitting && store.read().closeToTray) { e.preventDefault(); win.hide(); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
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
    mini.show();
    // The window manager picks the first position when the window is mapped; move it once that has happened.
    for (const delay of [120, 400]) setTimeout(() => { if (mini && !mini.isDestroyed()) mini.setPosition(x, y); }, delay);
  });
  mini.on('close', () => { if (cfg().miniCorner === 'remember') store.write({ ...store.read(), miniBounds: mini.getBounds() }); });
  mini.on('closed', () => { mini = null; win?.show(); win?.webContents.send('media', 'mini-closed'); });
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
  createWindow();
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
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (process.platform !== 'darwin' && quitting) app.quit(); });
