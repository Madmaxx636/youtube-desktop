'use strict';
// Streams for a signed-in account, the way SmartTube gets them (github.com/yuliskov/SmartTube, MediaServiceCore):
//
//   1. ask YouTube as the TV app, signed in with the account's own login;
//   2. carry a proof-of-origin token ("poToken"), made by running YouTube's own BotGuard script in a hidden window, together with
//      the TV app's living-room token id and visitor data from the same page;
//   3. unscramble the stream addresses (the "n" challenge) and add the token to each address.
//
// It is the fallback for when yt-dlp is turned away with "Sign in to confirm you're not a bot" (a VPN or hosting-company address).
// Nothing here is written to the account; it only reads what a TV app would read.

const crypto = require('crypto');

// Public API key that YouTube's own BotGuard requests carry (found in its web pages).
const GOOGLE_API_KEY = 'AIzaSyDyT5W0Jh49F30Pqqtyfdf7pDLFKLJoAnw';
// The TV app's user agent (a Fire TV, like SmartTube): it is also what the stream addresses expect.
const TV_UA = 'Mozilla/5.0 (Linux armeabi-v7a; Android 7.1.2; Fire OS 6.0) Cobalt/22.lts.3.306369-gold (unlike Gecko) v8/8.8.278.8-jit gles Starboard/13, Amazon_ATV_mediatek8695_2019/NS6294 (Amazon, AFTMM, Wireless) com.amazon.firetv.youtube/22.3.r2.v66.0';
const BG_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const FALLBACK_TV_VERSION = '7.20260901.15.00';
const COBALT_OLD_UA = 'Mozilla/5.0 (DirectFB; Linux x86_64) Cobalt/4.13031-qa (unlike Gecko) Starboard/1';
const TIZEN_UA = 'Mozilla/5.0 (SMART-TV; Linux; Tizen 2.4.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/2.4.0 TV Safari/538.1';
// The newest TV app (7.x) now gets only "server-side streaming" (no addresses a plain player can read), so the older TV identities
// are used: they still get ordinary addresses. Each is tried in turn; the later ones also carry the BotGuard token.
const IDENTITIES = [
  { name: 'TV (older app)', pot: false, o: { version: '5.20260901', ua: COBALT_OLD_UA, noTvApp: true, noPot: true } },
  { name: 'TV (older app, with token)', pot: true, o: { version: '5.20260901', ua: COBALT_OLD_UA, noTvApp: true } },
  { name: 'Samsung TV, with token', pot: true, o: { version: '5.20260707', ua: TIZEN_UA, client: { osName: 'Tizen', osVersion: '2.4.0', deviceMake: 'Samsung', deviceModel: 'UKS9800' } } },
];
const MIN = 60 * 1000;

module.exports = function createTvStream({ authed, electron, cfg, dlog = () => {}, onStale = null }) {
  const { BrowserWindow, session, net } = electron;
  // Chromium's own network stack: Node's fetch refuses the TV page's very large response headers (UND_ERR_HEADERS_OVERFLOW).
  const nfetch = (url, o = {}) => net.fetch(url, { credentials: 'omit', ...o });
  const state = { env: null, pot: null, potPromise: null, solver: null, solverTimer: null, last: null, refreshed: false };

  async function http(url, { method = 'GET', headers = {}, body, ms = 25000 } = {}) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await nfetch(url, { method, headers, body, signal: ctl.signal });
      const text = await r.text();
      if (!r.ok) throw new Error(`${new URL(url).pathname} answered ${r.status}`);
      return text;
    } finally { clearTimeout(t); }
  }
  const pick = (re, s) => { const m = re.exec(s); return m ? m[1] : null; };
  const unescapeJs = (s) => (s == null ? s : s.replace(/\\u003d/gi, '=').replace(/\\u0026/gi, '&').replace(/\\\//g, '/'));

  // ----- what the TV app reads when it starts: its page and its config -----
  async function tvEnv(force) {
    if (!force && state.env && Date.now() - state.env.at < 20 * MIN) return state.env;
    const [page, conf] = await Promise.all([
      http('https://www.youtube.com/tv', { headers: { 'User-Agent': TV_UA } }),
      http('https://www.youtube.com/tv_config?action_get_config=true&client=lb4&theme=cl', { headers: { 'User-Agent': TV_UA } }),
    ]);
    const env = {
      at: Date.now(),
      livingRoom: unescapeJs(pick(/"LIVING_ROOM_PO_TOKEN_ID":"(.*?)"/, page)),
      visitorData: unescapeJs(pick(/"visitorData":"(.*?)"/, page)),
      version: pick(/"clientVersion":"(7\.\d+\.\d+\.\d+)/, page) || FALLBACK_TV_VERSION,
      requestKey: pick(/"challengeRequestKey":"(.*?)"/, conf),
    };
    if (!env.livingRoom || !env.visitorData) throw new Error('The TV page has no living-room token id or visitor data.');
    if (!env.requestKey) throw new Error('The TV config has no BotGuard request key.');
    state.env = env;
    return env;
  }

  // ----- hidden, locked-down windows: YouTube's own scripts (BotGuard, the player's address function) run in these, not in the app -----
  // No Node, no preload, a sandboxed renderer; the page is served from here under youtube.com's name (BotGuard looks at where it runs)
  // and every other request, of any kind, is cancelled.
  const PAGE = 'https://www.youtube.com/__pot';
  async function makeWindow() {
    const ses = session.fromPartition('tv-pot-' + crypto.randomBytes(4).toString('hex'));
    ses.protocol.handle('https', (req) => (req.url === PAGE
      ? new Response('<!doctype html><html><head><meta charset="utf-8"><title></title></head><body></body></html>', { headers: { 'content-type': 'text/html' } })
      : new Response('', { status: 404 })));
    ses.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !(d.url === PAGE || d.url.startsWith('devtools:')) }));
    ses.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
    const win = new BrowserWindow({ show: false, width: 800, height: 600, webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, webSecurity: true } });
    win.webContents.setUserAgent(BG_UA);
    await win.loadURL(PAGE);
    return win;
  }
  const kill = (w) => { try { if (w && !w.isDestroyed()) w.destroy(); } catch {} };
  // runs code in a window, giving up (and closing the window) if it takes too long
  async function inWindow(win, code, ms = 15000) {
    let timer;
    try { return await Promise.race([win.webContents.executeJavaScript(code, true), new Promise((_, rej) => { timer = setTimeout(() => { kill(win); rej(new Error('The script took too long.')); }, ms); })]); }
    finally { clearTimeout(timer); }
  }
  // the window that unscrambles addresses stays for a few minutes after the last use
  async function solverWindow() {
    if (!state.solver || state.solver.isDestroyed()) state.solver = await makeWindow();
    clearTimeout(state.solverTimer); state.solverTimer = setTimeout(() => { kill(state.solver); state.solver = null; }, 3 * MIN);
    return state.solver;
  }

  const b64u = (bytes) => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  const unb64 = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/').replace(/\./g, '='), 'base64');
  const bgHeaders = (extra = {}) => ({ 'User-Agent': BG_UA, Accept: 'application/json', 'Content-Type': 'application/json+protobuf', 'x-goog-api-key': GOOGLE_API_KEY, 'x-user-agent': 'grpc-web-javascript/0.1', ...extra });

  async function makePoToken(env) {
    // 1. the challenge for the TV client, and the script that answers it
    const att = JSON.parse(await http('https://www.youtube.com/youtubei/v1/att/get?prettyPrint=false', {
      method: 'POST', headers: bgHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ context: { client: { clientName: 'TVHTML5', clientVersion: env.version } }, engagementType: 'ENGAGEMENT_TYPE_UNBOUND' }),
    }));
    const bg = att.bgChallenge;
    if (!bg || !bg.program || !bg.globalName || !bg.interpreterUrl) throw new Error('YouTube sent no BotGuard challenge.');
    const interpUrl = bg.interpreterUrl.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;
    const interpreterJavascript = await http('https:' + interpUrl, { headers: { 'User-Agent': BG_UA }, ms: 40000 });
    // 2. run it in the window to get the BotGuard response
    const win = await makeWindow();
    try {
      const run = `(async () => {
        const ch = ${JSON.stringify({ interpreterJavascript, globalName: bg.globalName, program: bg.program })};
        new Function(ch.interpreterJavascript)();
        const vm = globalThis[ch.globalName];
        if (!vm) throw new Error('BotGuard VM not found');
        if (!vm.a) throw new Error('BotGuard program could not be loaded');
        let fns = {};
        vm.a(ch.program, (a, s, p, c) => { fns = { asyncSnapshotFunction: a }; }, true, undefined, () => {}, [[], []]);
        for (let i = 0; i < 10000 && !fns.asyncSnapshotFunction; i++) await new Promise((r) => setTimeout(r, 1));
        if (!fns.asyncSnapshotFunction) throw new Error('BotGuard gave no snapshot function');
        const webPoSignalOutput = [];
        const response = await new Promise((resolve) => fns.asyncSnapshotFunction(resolve, [undefined, undefined, webPoSignalOutput, undefined]));
        if (!webPoSignalOutput.length) throw new Error('BotGuard gave no minter');
        window.__pot = { webPoSignalOutput };
        return response;
      })()`;
      const botguardResponse = await inWindow(win, run, 30000);
      // 3. exchange it for an integrity token
      const it = JSON.parse(await http('https://www.youtube.com/api/jnn/v1/GenerateIT', { method: 'POST', headers: bgHeaders(), body: JSON.stringify([env.requestKey, botguardResponse]) }));
      const integrity = Array.from(unb64(it[0])), ttl = +it[1] || 3600;
      // 4. the minter turns the living-room token id into the token
      const idBytes = Array.from(Buffer.from(env.livingRoom, 'utf8'));
      const bytes = await inWindow(win, `(() => {
        const mint = window.__pot.webPoSignalOutput[0](new Uint8Array(${JSON.stringify(integrity)}));
        if (typeof mint !== 'function') throw new Error('minter is not a function');
        const r = mint(new Uint8Array(${JSON.stringify(idBytes)}));
        if (!(r instanceof Uint8Array)) throw new Error('token has the wrong type');
        window.__pot = null;
        return Array.from(r);
      })()`);
      return { token: b64u(bytes), expires: Date.now() + Math.max(2, ttl - 600) * 1000, livingRoom: env.livingRoom };
    } finally { kill(win); }
  }

  async function poToken(env) {
    const p = state.pot;
    if (p && p.expires > Date.now() && p.livingRoom === env.livingRoom) return p.token;
    if (!state.potPromise) {
      state.potPromise = makePoToken(env).then((r) => { state.pot = r; return r; }).finally(() => { state.potPromise = null; });
    }
    return (await state.potPromise).token;
  }

  // youtubei.js ships no JavaScript evaluator (it asks for one), and unscrambling an address means running a function taken from
  // YouTube's player script. That runs in the locked-down window above, never in the app itself.
  let evalReady = false;
  async function ensureEvaluator() {
    if (evalReady) return;
    const { Platform } = await import('youtubei.js');
    // The script the library hands over is a function body: it defines the extracted function and ends with `return process(n, sp, s)`.
    Platform.shim.eval = async (data) => inWindow(await solverWindow(), `(function () {\n${data.output}\n})()`, 10000);
    evalReady = true;
  }

  // ----- the player request, as the TV app makes it -----
  // `o` (tests and the other TV identities): version, ua, clientName, client (extra context fields), noPot, noTvApp
  async function playerRequest(i, id, env, token, sts, o = {}) {
    const oauth = i.session.oauth;
    if (oauth.shouldRefreshToken()) await oauth.refreshAccessToken();
    const cpn = crypto.randomBytes(12).toString('base64url').slice(0, 16);
    const page = i.session.context?.user?.onBehalfOfUser;
    const body = {
      context: {
        client: { clientName: o.clientName || 'TVHTML5', clientVersion: o.version || env.version, clientScreen: 'WATCH', userAgent: o.ua || TV_UA, ...(o.noTvApp ? {} : { tvAppInfo: { livingRoomPoTokenId: env.livingRoom } }), ...(o.client || {}), acceptLanguage: 'en', acceptRegion: 'US', utcOffsetMinutes: '0', visitorData: env.visitorData },
        user: { enableSafetyMode: false, lockedSafetyMode: false },
      },
      playbackContext: {
        contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS', lactMilliseconds: 60000, isInlinePlaybackNoAd: true, signatureTimestamp: sts },
        devicePlaybackCapabilities: { supportsVp9Encoding: true, supportXhr: false },
      },
      ...(o.noPot ? {} : { serviceIntegrityDimensions: { poToken: token } }),
      racyCheckOk: true, contentCheckOk: true, videoId: id, cpn,
    };
    const headers = {
      'Content-Type': 'application/json', 'User-Agent': o.ua || TV_UA, 'X-Goog-Visitor-Id': env.visitorData, 'X-Youtube-Client-Name': '7', 'X-Youtube-Client-Version': o.version || env.version,
      Authorization: `Bearer ${oauth.oauth2_tokens.access_token}`, Origin: 'https://www.youtube.com', Referer: 'https://www.youtube.com/tv',
    };
    if (page) headers['X-Goog-PageId'] = page;
    const r = await nfetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', { method: 'POST', headers, body: JSON.stringify(body) });
    const text = await r.text();
    if (!r.ok) throw new Error(`The TV player request answered ${r.status}`);
    return { json: JSON.parse(text), cpn };
  }

  // ----- choosing from what comes back (the same preferences as the yt-dlp format string) -----
  const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };
  const codecOf = (f) => { const m = /codecs="([^"]+)"/.exec(f.mimeType || ''); return m ? m[1] : ''; };
  const isVideo = (f) => /^video\//.test(f.mimeType || '');
  const isAudio = (f) => /^audio\//.test(f.mimeType || '');
  const hasUrl = (f) => !!(f.url || f.signatureCipher || f.cipher);
  function pickFormats(sd, quality, c, perf = {}) {
    const adaptive = (sd.adaptiveFormats || []).filter(hasUrl), combined = (sd.formats || []).filter(hasUrl);
    // audio
    const lang = /^[a-z]{2,3}(-[A-Za-z0-9]+)?$/.test(c.audioLang || '') ? c.audioLang : '';
    let audios = adaptive.filter(isAudio);
    const original = audios.filter((f) => !f.audioTrack || f.audioTrack.audioIsDefault);
    if (lang) { const l = audios.filter((f) => (f.audioTrack?.id || '').startsWith(lang)); if (l.length) audios = l; else if (original.length) audios = original; }
    else if (c.audioLang !== 'any' && original.length) audios = original;
    const acodec = c.audioCodec === 'aac' ? /mp4a/ : c.audioCodec === 'opus' ? /opus/ : null;
    if (acodec) { const a = audios.filter((f) => acodec.test(codecOf(f))); if (a.length) audios = a; }
    const abrCap = perf.data ? Math.min(num(c.maxAudioBitrate) || 999, 96) : num(c.maxAudioBitrate);
    if (abrCap && abrCap < 999) { const a = audios.filter((f) => (f.averageBitrate || f.bitrate || 0) / 1000 <= abrCap); if (a.length) audios = a; }
    // stereo first: the 5.1 track has the highest bitrate but plays no better on a computer's speakers
    const stereo = audios.filter((f) => !f.audioChannels || f.audioChannels <= 2); if (stereo.length) audios = stereo;
    const audio = audios.slice().sort((a, b) => (b.averageBitrate || b.bitrate || 0) - (a.averageBitrate || a.bitrate || 0))[0] || null;
    if (quality === 'audio') return audio ? { audio } : null;
    // video
    let cap = quality === 'best' || quality === 'auto' ? 0 : num(quality);
    const lim = Math.min(perf.data ? num(c.dataSaverRes) || 480 : Infinity, perf.power ? num(c.powerRes) || 720 : Infinity);
    if (Number.isFinite(lim)) cap = cap ? Math.min(cap, lim) : lim;
    let vids = adaptive.filter(isVideo);
    if (cap) { const v = vids.filter((f) => (f.height || 0) <= cap); if (v.length) vids = v; }
    if (num(c.fps)) { const v = vids.filter((f) => (f.fps || 30) <= num(c.fps)); if (v.length) vids = v; }
    if (num(c.maxVideoBitrate)) { const v = vids.filter((f) => (f.averageBitrate || f.bitrate || 0) / 1000 <= num(c.maxVideoBitrate)); if (v.length) vids = v; }
    const want = c.codec === 'auto' ? (cap && cap <= 1080 ? /avc1/ : null) : c.codec === 'avc1' ? /avc1/ : c.codec === 'vp9' ? /vp0?9/ : c.codec === 'av01' ? /av01/ : null;
    if (want) { const v = vids.filter((f) => want.test(codecOf(f))); if (v.length) vids = v; }
    const video = vids.slice().sort((a, b) => (b.height || 0) - (a.height || 0) || (b.fps || 0) - (a.fps || 0) || (b.averageBitrate || b.bitrate || 0) - (a.averageBitrate || a.bitrate || 0))[0] || null;
    if (video && audio) return { video, audio };
    // no separate streams: the best combined one (usually 360p)
    let comb = combined.slice();
    if (cap) { const v = comb.filter((f) => (f.height || 0) <= cap); if (v.length) comb = v; }
    const one = comb.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
    return one ? { video: one, audio: null } : null;
  }

  // ----- the whole thing -----
  const hasAddresses = (sd) => !!sd && [...(sd.adaptiveFormats || []), ...(sd.formats || [])].some((f) => f.url || f.signatureCipher || f.cipher);
  async function resolve(id, quality, perf, from = 0) {   // `from`: which identity to start with (tests)
    const t0 = Date.now(), c = cfg();
    let i = await authed();                                     // throws "Sign in first." without an account
    await ensureEvaluator();
    const reasons = [];
    for (const idn of IDENTITIES.slice(from)) {
      try {
        const player = i.session.player;
        if (!player) throw new Error('The player script is not loaded, so the addresses cannot be unscrambled.');
        let token = null, env = null;
        if (idn.pot) { env = await tvEnv(); token = await poToken(env); }
        env = env || await tvEnv();
        // the older TV identities name the web player's own (five digit) signature timestamp
        const { json } = await playerRequest(i, id, env, token, player.signature_timestamp, idn.o);
        const ps = json.playabilityStatus || {};
        if (ps.status !== 'OK') throw new Error(`${ps.status || '?'}${ps.reason ? ' (' + ps.reason + ')' : ''}`);
        if (!hasAddresses(json.streamingData)) throw new Error('no stream addresses (server-side streaming only)');
        const pick = pickFormats(json.streamingData, quality || c.quality || 'auto', c, perf || {});
        if (!pick) throw new Error('no usable stream');
        const cache = new Map();                                  // one "n" challenge answers every address of this response
        const solve = async (f) => { const u = await player.decipher(f.url, f.signatureCipher, f.cipher, cache); if (!token) return u; const x = new URL(u); x.searchParams.set('pot', token); return x.toString(); };
        const lines = [];
        if (pick.video) lines.push(await solve(pick.video));
        if (pick.audio) lines.push(await solve(pick.audio));
        const info = { identity: idn.name, ms: Date.now() - t0, video: pick.video ? `${pick.video.height || '?'}p ${codecOf(pick.video).split('.')[0]}` : null, audio: pick.audio ? codecOf(pick.audio).split('.')[0] : null };
        state.last = { at: Date.now(), id, ok: true, ...info }; state.refreshed = false;
        dlog('info', `sign-in stream for ${id} via ${info.identity}: ${info.video || 'audio'}${info.audio ? ' + ' + info.audio : ''} in ${info.ms} ms`);
        return { lines, ua: idn.o.ua };
      } catch (e) {
        const msg = String(e.message || e);
        reasons.push(`${idn.name}: ${msg}`);
        if (/Sign in first/.test(msg)) throw e;
        // an old copy of the player script (the app has been open for days): start the session afresh, once
        if (/needs to be reloaded/i.test(msg) && onStale && !state.refreshed) { state.refreshed = true; try { onStale(); i = await authed(); } catch {} }
      }
    }
    state.last = { at: Date.now(), id, ok: false, reasons };
    dlog('warn', `sign-in stream for ${id} failed: ${reasons.join(' | ')}`);
    throw new Error(reasons[0] || 'The sign-in lookup failed.');
  }

  const status = () => ({ last: state.last, tokenExpires: state.pot ? state.pot.expires : null });
  return { resolve, status, _debug: { ensureEvaluator, tvEnv, makePoToken, poToken, playerRequest, pickFormats, TV_UA, solverWindow, makeWindow } };
};
