// Declarative settings: each tab lists groups of controls. The panel renderer in app.js builds the UI from
// this, and DEFAULTS is the single source for first-run values.
const opt = (...pairs) => pairs.map((p) => (Array.isArray(p) ? p : [String(p), String(p)]));
const RES = opt(['auto', 'Highest available (maximum bitrate)'], ['2160', '2160p (4K)'], ['1440', '1440p'], ['1080', '1080p'], ['720', '720p'], ['480', '480p'], ['360', '360p'], ['240', '240p'], ['144', '144p'], ['audio', 'Audio only']);
const DL_RES = opt(['0', 'Highest available'], ['2160', '2160p (4K)'], ['1440', '1440p'], ['1080', '1080p'], ['720', '720p'], ['480', '480p'], ['360', '360p']);
const CODECS = opt(['auto', 'Automatic'], ['avc1', 'H.264 (AVC)'], ['vp9', 'VP9'], ['av01', 'AV1']);
const THEME_LIST = opt(['auto', 'Match system'], ['dark', 'Dark'], ['light', 'Light'], ['amoled', 'AMOLED black'], ['nord', 'Nord'], ['dracula', 'Dracula'], ['solarized', 'Solarized dark'], ['custom', 'Custom colors…']);
const SB_CATS = [['sponsor', 'Sponsor'], ['selfpromo', 'Self promotion'], ['interaction', 'Interaction reminder'], ['intro', 'Intro'], ['outro', 'Outro / credits'], ['preview', 'Preview / recap'], ['music_offtopic', 'Non-music section'], ['filler', 'Filler tangent']];

const SCHEMA = {
  defaults: {
    startPage: 'home', logoGoes: 'home', chaptersPlace: 'side', sidePanel: true, relatedChips: true, tabsBar: true, classicMode: 'auto', notifyOn: true, notifyWhen: 'background', notifySound: true, notifyUploadsOn: true, notifyUploadMode: 'bell', notifyInterval: 30, notifySleep: true, notifyQueue: true, notifyUpdate: true, notifyPlaying: false, autoUpdateCheck: true, playerTheme: 'modern', playerAccentOn: false, playerAccent: '#ff3b3b', pbSide: 'right', pbAutoplay: true, seekPreview: true, stableAudio: 'levels', stableBoost: true, stableCompress: 'strong', dimWatched: true, pageAnim: 'slide', swipeNav: true, swipeDistance: 150, swipeInvert: false, hideShorts: true, closeToTray: false, windowSystem: 'auto',
    commentsPlace: 'below', commentsSideHeight: 75, commentsAuto: true, commentsSortDefault: 'TOP_COMMENTS', commentsSize: 100, commentsDensity: 'comfortable', commentsLines: '5', commentsAvatars: true, commentsLikes: true, commentsBadges: true, commentsActions: true, commentsBlock: '', commentsHideLinks: false, composerStyle: 'expand', composerSubmit: 'ctrl', composerConfirm: true, composerDrafts: true, composerCounter: true, afterPost: 'newest',
    autoplayMode: 'endless', dataSaver: false, powerSaver: false, powerAuto: 'off', dataSaverRes: '480', powerRes: '720', touchMode: 'auto', watchedAt: '50', syncHistory: true, endScreen: true, endGrid: '3x1', autoplayDelay: '8', rememberVolume: true, searchView: 'list', resume: true, rememberSpeed: true, defaultSpeed: '1', defaultVolume: 100, sleepFade: '0', sleepAction: 'pause',
    quality: 'auto', maxBitrate: true, audioLang: 'original', fps: '0', codec: 'auto', maxVideoBitrate: '0', audioCodec: 'auto', maxAudioBitrate: '0', bufferProxy: true, bufferSeconds: '180', bufferMaxMB: '1024', prefetchNext: true, bellOn: true, floatPlayer: true, floatSize: 'medium', floatCorner: 'br',
    dlContainer: 'mp4', dlMaxHeight: '1080', dlCodec: 'auto', dlFps: '0', dlAudioFormat: 'mp3', dlAudioQuality: '0',
    dlEmbedMeta: true, dlEmbedThumb: true, dlEmbedSubs: false, dlSubLangs: 'en.*,en', dlSponsorRemove: false,
    dlTemplate: '%(title)s [%(id)s].%(ext)s', dlRateLimit: '', dlFragments: '4', dlPlaylistFolders: true, dlNotify: true,
    subDefaultOn: false, subLang: 'en', subAllowAuto: true, subSize: 100, subFont: 'sans', subColor: '#ffffff', subBg: '#000000', subBgOpacity: 75, subEdge: 'none',
    miniSize: 'medium', miniCorner: 'bottom-right', miniOnTop: true, miniOpacity: 100, miniFrameless: true, miniOnMinimize: false, miniMargin: 16,
    skin: 'modern', theme: 'dark', accent: '#ff0000', cBg: '#0f0f0f', cSurface: '#272727', cText: '#f1f1f1', cLink: '#3ea6ff', uiScalePct: 100, fontSize: 14, iconSize: 20, density: 'comfortable', css: '',
    gridSize: 300, sidebarDefault: true, sidebarWidth: 200, sidebarAutoHide: 'never', relatedWidth: 400, toolbarSize: 40, toolLabels: false, showToolbar: false, pbTheater: true, pbCaptions: true, pbSleep: true, pbQuality: true, pbSpeed: false, menuActions: null, nav_home: true, nav_subs: true, nav_playlists: true, nav_history: true, nav_watchlater: true, nav_downloads: true,
    watchRelated: 'side', theater: false, commentsHidden: false, descExpanded: false, showDislikes: true,
    subsView: 'grouped', subsGroupBy: 'date', subsHideWatched: true, subsSort: 'new', subsLayout: 'list',
    sponsorblock: true, sbc_sponsor: true, sbc_selfpromo: true, sbc_interaction: true, sbc_intro: true, sbc_outro: true, sbc_preview: false, sbc_music_offtopic: false, sbc_filler: false,
    dearrow: true, ryd: true, pauseHistory: false, autocorrect: true, miniConfirmClose: true, devMode: false, devVerbose: false,
  },
  tabs: [
    { id: 'general', label: 'General', groups: [
      { title: 'Trackpad', items: [
        { key: 'swipeNav', type: 'toggle', label: 'Two-finger swipe goes back and forward', hint: 'Swipe right to go back, left to go forward, like in a browser.' },
        { key: 'swipeDistance', type: 'range', label: 'Swipe distance needed', min: 60, max: 400, step: 10, unit: ' px', when: (s) => s.swipeNav },
        { key: 'swipeInvert', type: 'toggle', label: 'Reverse the swipe direction', when: (s) => s.swipeNav },
      ] },
      { title: 'Typing', items: [
        { key: 'autocorrect', type: 'toggle', label: 'Correct misspelled words as I type', hint: 'In comments, replies and the search box. A correction is made when you press space; Ctrl+Z undoes it. Misspelled words are also underlined, with suggestions in the right-click menu.' },
      ] },
      { title: 'Startup', items: [
        { key: 'startPage', type: 'select', label: 'Open on', options: opt(['home', 'Home'], ['subs', 'Subscriptions'], ['playlists', 'Playlists'], ['history', 'History']) },
        { key: 'logoGoes', type: 'select', label: 'The YouTube logo goes to', options: opt(['home', 'Home'], ['subs', 'Subscriptions'], ['playlists', 'Playlists'], ['history', 'History']) },
        { key: 'closeToTray', type: 'toggle', label: 'Keep running in the tray when the window is closed' },
        { key: 'hideShorts', type: 'toggle', label: 'Hide Shorts' },
      ] },
      { title: 'Advanced', items: [
        { key: 'windowSystem', type: 'select', label: 'Window system', options: opt(['auto', 'Automatic'], ['x11', 'X11 (XWayland)']), hint: 'On Linux with Wayland, apps cannot choose where their windows appear or keep them on top. X11 restores both for the mini player. Needs a restart.' },
        { type: 'button', label: 'Restart the app now', action: 'relaunch' },
      ] },
      { title: 'Updates', items: [
        { key: 'autoUpdateCheck', type: 'toggle', label: 'Check for new versions automatically', hint: 'Looks at this app\'s GitHub releases when it starts and every few hours. Nothing is installed without your OK.' },
        { type: 'updatepanel' },
      ] },
      { title: 'Reset', items: [{ type: 'button', label: 'Reset all settings to defaults', action: 'resetAll', danger: true }] },
    ] },
    { id: 'playback', label: 'Playback', groups: [
      { title: 'Behavior', items: [
        { key: 'watchedAt', type: 'select', label: 'Mark a video as watched once I have seen', options: opt(['1', 'Any of it (as soon as it starts)'], ['25', '25%'], ['50', '50%'], ['75', '75%'], ['90', '90%']), hint: 'Watched videos are hidden from Subscriptions when "hide watched" is on. Until then they keep their red progress bar.' },
        { key: 'autoplayMode', type: 'select', label: 'Autoplay', options: opt(['endless', 'Endless: keep playing the suggested videos'], ['queue', 'Only when there is a queue or a playlist'], ['off', 'Off: stop after each video']), hint: 'Endless goes on into the next suggested video. The second option moves on only through your queue (tabs) or the playlist you started from, then stops.' },
        { key: 'endScreen', type: 'toggle', label: 'Show suggested videos when a video ends', hint: 'With autoplay on, a short countdown runs that you can cancel.' },
        { key: 'endGrid', type: 'select', label: 'Suggestions on the end screen', options: opt(['3x1', 'One row of 3 (like YouTube)'], ['2x2', '2 × 2'], ['3x3', '3 × 3'], ['4x4', '4 × 4']), hint: 'You can also switch on the end screen itself.', when: (s) => s.endScreen !== false },
        { key: 'autoplayDelay', type: 'select', label: 'Countdown before the next video', options: opt(['3', '3 seconds'], ['5', '5 seconds'], ['8', '8 seconds'], ['12', '12 seconds'], ['20', '20 seconds']), when: (s) => s.endScreen !== false && s.autoplayMode !== 'off' },
        { key: 'resume', type: 'toggle', label: 'Resume where I left off' },
        { key: 'rememberVolume', type: 'toggle', label: 'Remember my volume and mute between sessions' },
        { key: 'rememberSpeed', type: 'toggle', label: 'Remember the speed I last used' },
        { key: 'defaultSpeed', type: 'select', label: 'Default speed', options: opt('0.5', '0.75', '1', '1.25', '1.5', '1.75', '2'), when: (s) => !s.rememberSpeed },
        { key: 'defaultVolume', type: 'range', label: 'Starting volume', min: 0, max: 100, step: 5, unit: '%' },
      ] },
      { title: 'Sleep timer', items: [
        { key: 'sleepAction', type: 'select', label: 'When the timer ends', options: opt(['pause', 'Pause playback'], ['quit', 'Pause and quit the app']) },
        { key: 'sleepFade', type: 'select', label: 'Fade the volume out over', options: opt(['0', 'No fade'], ['10', '10 seconds'], ['30', '30 seconds'], ['60', '1 minute']) },
      ] },
    ] },
    { id: 'video', label: 'Video & audio', groups: [
      { title: 'Streaming quality', hint: 'Applies to the next video you open. If a combination does not exist for a video, the closest match plays instead.', items: [
        { key: 'quality', type: 'select', label: 'Resolution', options: RES },
        { key: 'fps', type: 'select', label: 'Frame rate limit', options: opt(['0', 'No limit'], ['30', '30 fps'], ['60', '60 fps']) },
        { key: 'codec', type: 'select', label: 'Video codec', options: CODECS, hint: 'Automatic uses H.264 up to 1080p for the smoothest playback.' },
        { key: 'maxBitrate', type: 'toggle', label: 'Always pick the highest-bitrate stream', hint: 'At the chosen resolution, take the format with the most video and audio data (playback and downloads). Turn off to let yt-dlp prefer newer, smaller codecs.' },
        { key: 'maxVideoBitrate', type: 'select', label: 'Video bitrate limit', options: opt(['0', 'No limit'], ['1000', '1 Mbps'], ['2500', '2.5 Mbps'], ['5000', '5 Mbps'], ['8000', '8 Mbps'], ['15000', '15 Mbps']) },
      ] },
      { title: 'Buffering', hint: 'Streams go through a local cache that downloads ahead in steady chunks, so slow or throttled connections do not stutter. A big buffer is kept on disk (in your cache folder) and removed when you quit.', items: [
        { key: 'bufferProxy', type: 'toggle', label: 'Buffer ahead through the local cache' },
        { key: 'bufferSeconds', type: 'select', label: 'Buffer ahead', options: opt(['15', '15 seconds'], ['30', '30 seconds'], ['60', '1 minute'], ['120', '2 minutes'], ['180', '3 minutes'], ['300', '5 minutes'], ['600', '10 minutes'], ['1200', '20 minutes'], ['1800', '30 minutes']), when: (s) => s.bufferProxy !== false, hint: 'More buffer uses more memory (a few hundred MB for 4K at 5 minutes). Applies to the next video.' },
        { key: 'bufferMaxMB', type: 'select', label: 'Most the buffer may hold', options: opt(['256', '256 MB'], ['512', '512 MB'], ['1024', '1 GB'], ['2048', '2 GB'], ['4096', '4 GB']), hint: 'Big buffers are kept in a temporary folder on disk (emptied when you quit), so memory stays low. A few minutes of 4K is about a gigabyte.', when: (s) => s.bufferProxy !== false },
      ] },
      { title: 'Troubleshooting', items: [
        { type: 'button', label: 'Copy the playback log (what went wrong with the sound or the stream, for bug reports)', action: 'copyMediaLog' },
      ] },
      { title: 'Audio', items: [
        { key: 'audioCodec', type: 'select', label: 'Audio codec', options: opt(['auto', 'Automatic'], ['aac', 'AAC'], ['opus', 'Opus']) },
        { key: 'stableAudio', type: 'select', label: 'Stable audio', options: opt(['off', 'Off'], ['levels', 'Even out loudness between videos'], ['compress', 'Also even out loud and quiet parts inside a video']), hint: 'Uses the loudness YouTube reports for each video. Nothing changes the file you download.' },
        { key: 'stableBoost', type: 'toggle', label: 'Also lift videos that are too quiet (up to 6 dB)', when: (s) => s.stableAudio !== 'off' },
        { key: 'stableCompress', type: 'select', label: 'Squeeze strength', options: opt(['light', 'Light'], ['strong', 'Strong (night listening)']), when: (s) => s.stableAudio === 'compress' },
        { key: 'audioLang', type: 'select', label: 'Audio language', options: opt(['original', 'Original (never a dubbed track)'], ['any', 'Whatever has the highest bitrate'], ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['pt', 'Portuguese'], ['it', 'Italian'], ['ru', 'Russian'], ['ja', 'Japanese'], ['ko', 'Korean'], ['hi', 'Hindi'], ['id', 'Indonesian'], ['ar', 'Arabic'], ['tr', 'Turkish'], ['zh', 'Chinese']), hint: 'Some videos carry dubbed audio tracks. This picks which one plays and downloads; if the video has no track in the language you choose, the original is used.' },
        { key: 'maxAudioBitrate', type: 'select', label: 'Audio bitrate limit', options: opt(['0', 'No limit'], ['64', '64 kbps'], ['96', '96 kbps'], ['128', '128 kbps'], ['160', '160 kbps']) },
      ] },
    ] },
    { id: 'downloads', label: 'Downloads', groups: [
      { title: 'Location', items: [
        { key: 'downloadDir', type: 'dir', label: 'Download folder' },
        { type: 'button', label: 'Open the folder', action: 'openDownloads' },
        { key: 'dlTemplate', type: 'text', label: 'File name', hint: 'yt-dlp template, e.g. %(uploader)s - %(title)s.%(ext)s. Must stay inside the folder.' },
        { key: 'dlPlaylistFolders', type: 'toggle', label: 'Put playlists in their own folder, numbered in order' },
      ] },
      { title: 'Video', items: [
        { key: 'dlContainer', type: 'select', label: 'Format', options: opt(['mp4', 'MP4'], ['mkv', 'MKV'], ['webm', 'WebM']) },
        { key: 'dlMaxHeight', type: 'select', label: 'Maximum resolution', options: DL_RES },
        { key: 'dlCodec', type: 'select', label: 'Video codec', options: CODECS },
        { key: 'dlFps', type: 'select', label: 'Frame rate limit', options: opt(['0', 'No limit'], ['30', '30 fps'], ['60', '60 fps']) },
      ] },
      { title: 'Audio (MP3 and others)', items: [
        { key: 'dlAudioFormat', type: 'select', label: 'Format', options: opt(['mp3', 'MP3'], ['m4a', 'M4A (AAC)'], ['opus', 'Opus'], ['flac', 'FLAC (lossless)'], ['wav', 'WAV']) },
        { key: 'dlAudioQuality', type: 'select', label: 'Quality', options: opt(['0', 'Best'], ['320', '320 kbps'], ['256', '256 kbps'], ['192', '192 kbps'], ['128', '128 kbps'], ['96', '96 kbps']), hint: 'Ignored for FLAC and WAV.' },
      ] },
      { title: 'Extras', items: [
        { key: 'dlEmbedMeta', type: 'toggle', label: 'Embed title, artist and description' },
        { key: 'dlEmbedThumb', type: 'toggle', label: 'Embed the thumbnail as cover art' },
        { key: 'dlEmbedSubs', type: 'toggle', label: 'Embed subtitles in video downloads' },
        { key: 'dlSubLangs', type: 'text', label: 'Subtitle languages to download', hint: 'Comma-separated, e.g. en.*,es' },
        { key: 'dlSponsorRemove', type: 'toggle', label: 'Cut out sponsor, self-promo and interaction segments', hint: 'Re-encodes the cut points, so it is slower.' },
        { key: 'dlNotify', type: 'toggle', label: 'Show a notification when a download finishes' },
      ] },
      { title: 'Speed', items: [
        { key: 'dlRateLimit', type: 'select', label: 'Speed limit', options: opt(['', 'No limit'], ['500K', '500 KB/s'], ['1M', '1 MB/s'], ['2M', '2 MB/s'], ['5M', '5 MB/s'], ['10M', '10 MB/s']) },
        { key: 'dlFragments', type: 'select', label: 'Parallel connections', options: opt('1', '2', '4', '8', '16') },
      ] },
    ] },
    { id: 'subtitles', label: 'Subtitles', groups: [
      { title: 'Behavior', items: [
        { key: 'subDefaultOn', type: 'toggle', label: 'Turn subtitles on automatically' },
        { key: 'subLang', type: 'text', label: 'Preferred language code', hint: 'e.g. en, es, de, ja. Picks that track when a video has it.' },
        { key: 'subAllowAuto', type: 'toggle', label: 'Include auto-generated captions' },
      ] },
      { title: 'Appearance', items: [
        { key: 'subSize', type: 'range', label: 'Size', min: 50, max: 250, step: 10, unit: '%' },
        { key: 'subFont', type: 'select', label: 'Font', options: opt(['sans', 'Sans-serif'], ['serif', 'Serif'], ['mono', 'Monospace'], ['casual', 'Casual']) },
        { key: 'subColor', type: 'color', label: 'Text color' },
        { key: 'subBg', type: 'color', label: 'Background color' },
        { key: 'subBgOpacity', type: 'range', label: 'Background opacity', min: 0, max: 100, step: 5, unit: '%' },
        { key: 'subEdge', type: 'select', label: 'Text edge', options: opt(['none', 'None'], ['shadow', 'Drop shadow'], ['outline', 'Outline']) },
        { type: 'subpreview' },
      ] },
    ] },
    { id: 'mini', label: 'Mini player', groups: [
      { title: 'Window', items: [
        { type: 'info', text: 'You are on Wayland, where the screen-corner and stay-on-top options are ignored. Set General → Advanced → Window system to X11 and restart.', when: (s) => IS_WAYLAND && s.windowSystem !== 'x11' },
        { key: 'miniSize', type: 'select', label: 'Size', options: opt(['small', 'Small (360 px)'], ['medium', 'Medium (480 px)'], ['large', 'Large (640 px)'], ['xl', 'Extra large (800 px)']) },
        { key: 'miniCorner', type: 'select', label: 'Opens in', options: opt(['bottom-right', 'Bottom right'], ['bottom-left', 'Bottom left'], ['top-right', 'Top right'], ['top-left', 'Top left'], ['remember', 'Where I left it']) },
        { key: 'miniMargin', type: 'range', label: 'Distance from screen edge', min: 0, max: 80, step: 4, unit: ' px' },
        { key: 'miniOnTop', type: 'toggle', label: 'Stay on top of other windows' },
        { key: 'miniFrameless', type: 'toggle', label: 'No title bar (drag the top edge to move)' },
        { key: 'miniOpacity', type: 'range', label: 'Opacity', min: 30, max: 100, step: 5, unit: '%' },
      ] },
      { title: 'Automatic', items: [{ key: 'miniOnMinimize', type: 'toggle', label: 'Open the mini player when I minimize the window while a video is playing' }] },
    ] },
    { id: 'appearance', label: 'Appearance', groups: [
      { title: 'Video player', items: [
        { key: 'playerTheme', type: 'select', label: 'Player theme', options: opt(['modern', 'Modern (like YouTube today, blue)'], ['youtube', 'YouTube (dark fade, red)'], ['classic', 'Classic (solid bar, blue)'], ['glass', 'Glass (floating, blurred)'], ['minimal', 'Minimal (thin line)'], ['amoled', 'AMOLED black (green)'], ['light', 'Light (white bar)']) },
        { key: 'playerAccentOn', type: 'toggle', label: 'Use my own accent color for the player' },
        { key: 'playerAccent', type: 'color', label: 'Player accent color', when: (s) => s.playerAccentOn },
        { key: 'seekPreview', type: 'toggle', label: 'Show a picture of the video when hovering over the seek bar' },
        { key: 'pbAutoplay', type: 'toggle', label: 'Autoplay switch in the player bar' },
        { key: 'pbSide', type: 'select', label: 'Theater, captions, sleep and quality buttons sit', options: opt(['left', 'Next to the volume'], ['right', 'Next to full screen']) },
      ] },
      { title: 'Pages', items: [
        { key: 'pageAnim', type: 'select', label: 'Animation when going back or forward', options: opt(['slide', 'Slide'], ['fade', 'Fade'], ['none', 'None']) },
        { key: 'dimWatched', type: 'toggle', label: 'Fade out videos I have watched', hint: 'Turn off to show watched videos normally, with just the red progress bar.' },
      ] },
      { title: 'Look', items: [
        { key: 'skin', type: 'select', label: 'Skin', options: opt(['modern', 'Modern'], ['classic', 'Classic (2012)']), hint: 'Classic has its own colors (light or dark, see the next option) and ignores the theme below.' },
        { key: 'classicMode', type: 'select', label: 'Classic skin colors', options: opt(['auto', 'Follow the theme (dark theme gives dark Classic)'], ['light', 'Always light'], ['dark', 'Always dark']), when: (s) => s.skin === 'classic' },
        { key: 'theme', type: 'select', label: 'Theme', options: THEME_LIST },
        { key: 'accent', type: 'color', label: 'Accent color' },
        { key: 'cBg', type: 'color', label: 'Background', when: (s) => s.theme === 'custom' },
        { key: 'cSurface', type: 'color', label: 'Panels and buttons', when: (s) => s.theme === 'custom' },
        { key: 'cText', type: 'color', label: 'Text', when: (s) => s.theme === 'custom' },
        { key: 'cLink', type: 'color', label: 'Links', when: (s) => s.theme === 'custom' },
      ] },
      { title: 'Size and spacing', items: [
        { key: 'uiScalePct', type: 'range', label: 'Interface scale (everything)', min: 70, max: 200, step: 5, unit: '%' },
        { key: 'fontSize', type: 'range', label: 'Text size', min: 11, max: 22, step: 1, unit: ' px' },
        { key: 'iconSize', type: 'range', label: 'Icon size', min: 14, max: 32, step: 1, unit: ' px' },
        { key: 'density', type: 'select', label: 'Spacing', options: opt(['compact', 'Compact'], ['comfortable', 'Comfortable'], ['spacious', 'Spacious']) },
      ] },
      { title: 'Custom CSS', items: [{ key: 'css', type: 'textarea', label: 'Your own styles' }] },
    ] },
    { id: 'layout', label: 'Layout', groups: [
      { title: 'Video grid', items: [
        { key: 'searchView', type: 'select', label: 'Search results', options: opt(['list', 'List (with descriptions)'], ['grid', 'Grid']), hint: 'You can also switch with the buttons above the results.' },{ key: 'gridSize', type: 'range', label: 'Thumbnail size', min: 200, max: 460, step: 20, unit: ' px' }] },
      { title: 'Sidebar', items: [
        { key: 'sidebarDefault', type: 'toggle', label: 'Show the sidebar' },
        { key: 'sidebarWidth', type: 'range', label: 'Sidebar width (you can also drag its edge)', min: 150, max: 420, step: 5, unit: ' px' },
        { key: 'sidebarAutoHide', type: 'select', label: 'Hide the sidebar automatically', options: opt(['never', 'Never'], ['watch', 'While watching a video']), hint: 'While watching, the menu button slides the sidebar in over the video.' },
        { key: 'nav_home', type: 'toggle', label: 'Home' }, { key: 'nav_subs', type: 'toggle', label: 'Subscriptions' },
        { key: 'nav_playlists', type: 'toggle', label: 'Playlists' }, { key: 'nav_history', type: 'toggle', label: 'History' },
        { key: 'nav_watchlater', type: 'toggle', label: 'Watch later' }, { key: 'nav_downloads', type: 'toggle', label: 'Downloads' },
      ] },
      { title: 'Watch page', items: [
        { key: 'theater', type: 'toggle', label: 'Theater mode (wide player)' },
        { key: 'floatPlayer', type: 'toggle', label: 'Keep the video playing in a corner while I browse', hint: 'Going to the home page, a channel, a playlist or subscriptions keeps the video going in a small player you can close or click to go back to.' },
        { key: 'floatSize', type: 'select', label: 'Floating player size', options: opt(['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']), when: (s) => s.floatPlayer !== false },
        { key: 'miniConfirmClose', type: 'toggle', label: 'Ask before closing the floating player' },
        { key: 'floatCorner', type: 'select', label: 'Floating player corner', options: opt(['br', 'Bottom right'], ['bl', 'Bottom left'], ['tr', 'Top right'], ['tl', 'Top left']), when: (s) => s.floatPlayer !== false },
        { key: 'sidePanel', type: 'toggle', label: 'Show the "In this video" panel (chapters and transcript) beside the video' },
        { key: 'relatedChips', type: 'toggle', label: 'Filter chips above the suggested videos' },
        { key: 'tabsBar', type: 'toggle', label: 'Show open videos as tabs at the top (middle-click, Ctrl+click or a 3-finger tap on a video adds one)' },
        { key: 'pbTheater', type: 'toggle', label: 'Video bar: theater mode button' },
        { key: 'pbCaptions', type: 'toggle', label: 'Video bar: captions button' },
        { key: 'pbSleep', type: 'toggle', label: 'Video bar: sleep timer button' },
        { key: 'pbQuality', type: 'toggle', label: 'Video bar: quality button' },
        { key: 'pbSpeed', type: 'toggle', label: 'Video bar: speed button' },
        { key: 'showToolbar', type: 'toggle', label: 'Also show the button row under the video', hint: 'All actions are in the ⋮ menu on the video. Turn this on to keep them below the video as well.' },
        { key: 'toolbarSize', type: 'range', label: 'Under-video button size', min: 28, max: 64, step: 2, unit: ' px', when: (s) => s.showToolbar },
        { key: 'toolLabels', type: 'toggle', label: 'Show text labels on those buttons', when: (s) => s.showToolbar },
        { key: 'relatedWidth', type: 'range', label: 'Related videos column width', min: 280, max: 600, step: 10, unit: ' px', when: (s) => s.watchRelated === 'side' },
        { key: 'watchRelated', type: 'select', label: 'Related videos', options: opt(['side', 'Beside the video'], ['below', 'Below'], ['hidden', 'Hidden']) },
        { key: 'descExpanded', type: 'toggle', label: 'Show the full description by default' },
        { key: 'commentsHidden', type: 'toggle', label: 'Hide comments' },
        { key: 'showDislikes', type: 'toggle', label: 'Show dislike counts' },
        { type: 'info', text: 'The ⋮ menu on the video holds every action, plus quality, speed, subtitles, sleep timer and buffer. Use “Customize this menu” inside it to choose what it shows.' },
        { type: 'button', label: 'Reset the video menu and buttons', action: 'resetToolbar' },
      ] },
    ] },
    { id: 'subs', label: 'Subscriptions', groups: [
      { title: 'Page', items: [
        { key: 'subsView', type: 'select', label: 'Layout', options: opt(['grouped', 'Grouped (2016–2018 style)'], ['box', 'Subscription box with channel list (2012 style)']) },
        { key: 'subsGroupBy', type: 'select', label: 'Group by', options: opt(['date', 'Day and week'], ['channel', 'Channel']), when: (s) => s.subsView === 'grouped' },
        { key: 'subsLayout', type: 'select', label: 'Video style', options: opt(['list', 'List'], ['grid', 'Grid']), when: (s) => s.subsView === 'box' },
        { key: 'subsSort', type: 'select', label: 'Sort', options: opt(['new', 'Newest first'], ['old', 'Oldest first']) },
        { key: 'subsHideWatched', type: 'toggle', label: 'Hide videos I have watched' },
      ] },
      { title: 'Import', items: [{ type: 'file', label: 'Import subscriptions (Google Takeout subscriptions.csv)', accept: '.csv', action: 'importSubs' }] },
    ] },
    { id: 'comments', label: 'Comments', groups: [
      { title: 'Where the comments go', items: [
        { key: 'commentsPlace', type: 'select', label: 'Placement', options: opt(['below', 'Below the video (the original place)'], ['side', 'In the side column, where live chat would be'], ['side-normal', 'In the side column, but below the video in theater mode']), hint: 'You can also flip it with the button on the comments header.' },
        { key: 'commentsSideHeight', type: 'range', label: 'Side panel height', min: 40, max: 95, step: 5, unit: '% of the window', when: (s) => s.commentsPlace === 'side' || s.commentsPlace === 'side-normal' },
      ] },
      { title: 'Viewing', items: [
        { key: 'commentsAuto', type: 'toggle', label: 'Load comments automatically', hint: 'Off shows a “Show comments” button instead, which saves data.' },
        { key: 'commentsSortDefault', type: 'select', label: 'Sort comments by', options: opt(['TOP_COMMENTS', 'Top'], ['NEWEST_FIRST', 'Newest first']) },
        { key: 'commentsSize', type: 'range', label: 'Text size', min: 85, max: 140, step: 5, unit: '%' },
        { key: 'commentsDensity', type: 'select', label: 'Spacing', options: opt(['comfortable', 'Comfortable'], ['compact', 'Compact']) },
        { key: 'commentsLines', type: 'select', label: 'Collapse long comments after', options: opt(['3', '3 lines'], ['5', '5 lines'], ['8', '8 lines'], ['12', '12 lines'], ['0', 'Never']) },
        { key: 'commentsAvatars', type: 'toggle', label: 'Show profile pictures' },
        { key: 'commentsLikes', type: 'toggle', label: 'Show like counts' },
        { key: 'commentsBadges', type: 'toggle', label: 'Show creator, pinned, member and creator-liked badges' },
        { key: 'commentsActions', type: 'toggle', label: 'Show Like and Reply buttons', hint: 'Liking and replying need you to be signed in.' },
      ] },
      { title: 'Hide comments', items: [
        { key: 'commentsBlock', type: 'textarea', label: 'Words or names to hide (one per line)', hint: 'Matches the comment text and the author name, ignoring case.' },
        { key: 'commentsHideLinks', type: 'toggle', label: 'Hide comments that contain links' },
      ] },
      { title: 'Writing a comment', items: [
        { key: 'composerStyle', type: 'select', label: 'Comment box', options: opt(['expand', 'One line, opens when clicked (like YouTube)'], ['full', 'Always open'], ['hidden', 'Hidden']) },
        { key: 'composerSubmit', type: 'select', label: 'Send with', options: opt(['ctrl', 'Ctrl + Enter'], ['enter', 'Enter (Shift + Enter for a new line)'], ['button', 'The button only']) },
        { key: 'composerDrafts', type: 'toggle', label: 'Keep a draft for each video until I post it' },
        { key: 'composerCounter', type: 'toggle', label: 'Show a character counter' },
        { key: 'afterPost', type: 'select', label: 'After I post', options: opt(['newest', 'Show newest comments so I can see mine'], ['keep', 'Keep the current sorting']) },
      ] },
    ] },
    { id: 'performance', label: 'Performance', groups: [
      { title: 'Saving modes', items: [
        { key: 'dataSaver', type: 'toggle', label: 'Data saver', hint: 'Smaller video, a short buffer, and no extras that fetch more: DeArrow, dislike counts, seek-bar previews, new-video checks, and comments until you ask for them.' },
        { key: 'powerSaver', type: 'toggle', label: 'Power saving (low-end mode)', hint: 'For tablets and older devices: no animations or blur, H.264 video at a lower size (most devices decode it in hardware), no audio processing, slower timers and a smaller memory buffer.' },
        { key: 'prefetchNext', type: 'toggle', label: 'Get videos ready before you open them', hint: 'Looks a video up when you rest the pointer on it and the next one while the current one plays, so it starts sooner. Off in data saver and power saving.' },
        { key: 'powerAuto', type: 'select', label: 'Turn power saving on by itself', options: opt(['off', 'Never'], ['battery', 'Whenever the device runs on battery'], ['low', 'When on battery and 20% or less is left']) },
      ] },
      { title: 'Limits while a mode is on', items: [
        { key: 'dataSaverRes', type: 'select', label: 'Data saver picture size', options: opt(['240', '240p'], ['360', '360p'], ['480', '480p'], ['720', '720p']), when: (s) => s.dataSaver },
        { key: 'powerRes', type: 'select', label: 'Power saving picture size', options: opt(['360', '360p'], ['480', '480p'], ['720', '720p'], ['1080', '1080p']), when: (s) => s.powerSaver || s.powerAuto !== 'off' },
      ] },
      { title: 'Touch screens', items: [
        { key: 'touchMode', type: 'select', label: 'Touch mode', options: opt(['auto', 'Automatic (on for touch screens without a mouse)'], ['on', 'Always on'], ['off', 'Always off']), hint: 'Bigger buttons, nothing that needs hovering, double-tap the left or right of the video to jump 10 seconds, tap to show or hide the controls, and swipe in from the screen edge to go back or forward.' },
      ] },
    ] },
    { id: 'notifications', label: 'Notifications', groups: [
      { title: 'Desktop notifications', items: [
        { key: 'bellOn', type: 'toggle', label: 'Show the notification bell in the header', hint: 'Keeps a list of new videos, finished downloads and updates, even when desktop pop-ups are off.' },
        { key: 'notifyOn', type: 'toggle', label: 'Show desktop notifications' },
        { key: 'notifyWhen', type: 'select', label: 'Show them', options: opt(['background', 'Only when the app is minimized, hidden or in the background'], ['always', 'Always']), when: (s) => s.notifyOn },
        { key: 'notifySound', type: 'toggle', label: 'Play the system notification sound', when: (s) => s.notifyOn },
        { type: 'button', label: 'Send a test notification', action: 'testNotify' },
      ] },
      { title: 'What to tell me about', items: [
        { key: 'notifyUploadsOn', type: 'toggle', label: 'New videos from my subscriptions', when: (s) => s.notifyOn },
        { key: 'notifyUploadMode', type: 'select', label: 'Which channels', options: opt(['bell', 'Only channels where I turned the bell on (bell next to Subscribe)'], ['all', 'Every channel I subscribe to']), when: (s) => s.notifyOn && s.notifyUploadsOn },
        { key: 'notifyInterval', type: 'select', label: 'Look for new videos every', options: opt(['10', '10 minutes'], ['30', '30 minutes'], ['60', 'Hour'], ['180', '3 hours']), when: (s) => s.notifyOn && s.notifyUploadsOn },
        { key: 'dlNotify', type: 'toggle', label: 'A download finishes', when: (s) => s.notifyOn },
        { key: 'notifySleep', type: 'toggle', label: 'The sleep timer pauses playback', when: (s) => s.notifyOn },
        { key: 'notifyQueue', type: 'toggle', label: 'The queue or autoplay runs out', when: (s) => s.notifyOn },
        { key: 'notifyPlaying', type: 'toggle', label: 'The next video starts playing in the background', when: (s) => s.notifyOn },
        { key: 'notifyUpdate', type: 'toggle', label: 'A new version of this app is available', when: (s) => s.notifyOn },
      ] },
      { title: 'Notes', items: [{ type: 'info', text: 'A bell on the video page turns on new-video notifications for that channel. Clicking a notification opens the video. Nothing is sent anywhere: the app checks your subscriptions itself while it is running.' }] },
    ] },
    { id: 'integrations', label: 'Integrations', groups: [
      { title: 'SponsorBlock', items: [
        { key: 'sponsorblock', type: 'toggle', label: 'Skip community-marked segments while playing' },
        ...SB_CATS.map(([k, l]) => ({ key: 'sbc_' + k, type: 'toggle', label: l, when: (s) => s.sponsorblock })),
      ] },
      { title: 'Other services', items: [
        { key: 'dearrow', type: 'toggle', label: 'DeArrow: community titles and thumbnails', hint: 'Only a 4-character hash of each video ID is sent.' },
        { key: 'ryd', type: 'toggle', label: 'Return YouTube Dislike: show dislike counts' },
      ] },
      { title: 'Local data', items: [
        { key: 'pauseHistory', type: 'toggle', label: 'Pause watch history', hint: 'Stops recording what you watch in this app. Your YouTube history is not affected.' },
        { key: 'syncHistory', type: 'toggle', label: 'Add what I watch here to my YouTube history (signed in)', hint: 'Sends YouTube the usual playback report so videos show in your history on the web. Off while "Pause watch history" is on.' },
        { type: 'button', label: 'Clear watch history and progress', action: 'clearHistory', danger: true },
        { type: 'button', label: 'Clear local subscriptions', action: 'clearSubs', danger: true },
      ] },
    ] },
    { id: 'about', label: 'About', groups: [
      { title: 'YouTube Desktop', items: [{ type: 'about' }] },
    ] },
    { id: 'dev', label: 'Developer', hidden: (s) => !s.devMode, groups: [
      { title: 'Log', items: [
        { key: 'devVerbose', type: 'toggle', label: 'Verbose logging', hint: 'Also records every request the app makes to its own backend and the player\'s buffering, seeking and stream events.' },
        { type: 'logview' },
        { type: 'button', label: 'Copy the log', action: 'copyDevLog' },
        { type: 'button', label: 'Clear the log', action: 'clearDevLog' },
      ] },
      { title: 'Developer options', items: [
        { type: 'button', label: 'Turn developer options off and hide this tab', action: 'devOff', danger: true },
      ] },
    ] },
  ],
};
