// Declarative settings: each tab lists groups of controls. The panel renderer in app.js builds the UI from
// this, and DEFAULTS is the single source for first-run values.
const opt = (...pairs) => pairs.map((p) => (Array.isArray(p) ? p : [String(p), String(p)]));
const RES = opt(['auto', 'Auto (up to 1080p)'], ['best', 'Highest available'], ['2160', '2160p (4K)'], ['1440', '1440p'], ['1080', '1080p'], ['720', '720p'], ['480', '480p'], ['360', '360p'], ['240', '240p'], ['144', '144p'], ['audio', 'Audio only']);
const DL_RES = opt(['0', 'Highest available'], ['2160', '2160p (4K)'], ['1440', '1440p'], ['1080', '1080p'], ['720', '720p'], ['480', '480p'], ['360', '360p']);
const CODECS = opt(['auto', 'Automatic'], ['avc1', 'H.264 (AVC)'], ['vp9', 'VP9'], ['av01', 'AV1']);
const THEME_LIST = opt(['auto', 'Match system'], ['dark', 'Dark'], ['light', 'Light'], ['amoled', 'AMOLED black'], ['nord', 'Nord'], ['dracula', 'Dracula'], ['solarized', 'Solarized dark'], ['custom', 'Custom colors…']);
const SB_CATS = [['sponsor', 'Sponsor'], ['selfpromo', 'Self promotion'], ['interaction', 'Interaction reminder'], ['intro', 'Intro'], ['outro', 'Outro / credits'], ['preview', 'Preview / recap'], ['music_offtopic', 'Non-music section'], ['filler', 'Filler tangent']];

const SCHEMA = {
  defaults: {
    startPage: 'home', hideShorts: true, closeToTray: false, windowSystem: 'auto',
    autoplayNext: true, resume: true, rememberSpeed: true, defaultSpeed: '1', defaultVolume: 100,
    quality: 'auto', fps: '0', codec: 'auto', maxVideoBitrate: '0', audioCodec: 'auto', maxAudioBitrate: '0',
    dlContainer: 'mp4', dlMaxHeight: '1080', dlCodec: 'auto', dlFps: '0', dlAudioFormat: 'mp3', dlAudioQuality: '0',
    dlEmbedMeta: true, dlEmbedThumb: true, dlEmbedSubs: false, dlSubLangs: 'en.*,en', dlSponsorRemove: false,
    dlTemplate: '%(title)s [%(id)s].%(ext)s', dlRateLimit: '', dlFragments: '4', dlPlaylistFolders: true, dlNotify: true,
    subDefaultOn: false, subLang: 'en', subAllowAuto: true, subSize: 100, subFont: 'sans', subColor: '#ffffff', subBg: '#000000', subBgOpacity: 75, subEdge: 'none',
    miniSize: 'medium', miniCorner: 'bottom-right', miniOnTop: true, miniOpacity: 100, miniFrameless: true, miniOnMinimize: false, miniMargin: 16,
    skin: 'modern', theme: 'dark', accent: '#ff0000', cBg: '#0f0f0f', cSurface: '#272727', cText: '#f1f1f1', cLink: '#3ea6ff', uiScale: '1', density: 'comfortable', css: '',
    gridSize: 300, sidebarDefault: true, nav_home: true, nav_subs: true, nav_playlists: true, nav_history: true, nav_watchlater: true, nav_downloads: true,
    watchRelated: 'side', theater: false, commentsHidden: false, descExpanded: false, showDislikes: true,
    subsView: 'grouped', subsGroupBy: 'date', subsHideWatched: true, subsSort: 'new', subsLayout: 'list',
    sponsorblock: true, sbc_sponsor: true, sbc_selfpromo: true, sbc_interaction: true, sbc_intro: true, sbc_outro: true, sbc_preview: false, sbc_music_offtopic: false, sbc_filler: false,
    dearrow: true, ryd: true,
  },
  tabs: [
    { id: 'general', label: 'General', groups: [
      { title: 'Startup', items: [
        { key: 'startPage', type: 'select', label: 'Open on', options: opt(['home', 'Home'], ['subs', 'Subscriptions'], ['playlists', 'Playlists'], ['history', 'History']) },
        { key: 'closeToTray', type: 'toggle', label: 'Keep running in the tray when the window is closed' },
        { key: 'hideShorts', type: 'toggle', label: 'Hide Shorts' },
      ] },
      { title: 'Advanced', items: [
        { key: 'windowSystem', type: 'select', label: 'Window system', options: opt(['auto', 'Automatic'], ['x11', 'X11 (XWayland)']), hint: 'On Linux with Wayland, apps cannot choose where their windows appear or keep them on top. X11 restores both for the mini player. Needs a restart.' },
        { type: 'button', label: 'Restart the app now', action: 'relaunch' },
      ] },
      { title: 'Reset', items: [{ type: 'button', label: 'Reset all settings to defaults', action: 'resetAll', danger: true }] },
    ] },
    { id: 'playback', label: 'Playback', groups: [
      { title: 'Behavior', items: [
        { key: 'autoplayNext', type: 'toggle', label: 'Play the next video automatically' },
        { key: 'resume', type: 'toggle', label: 'Resume where I left off' },
        { key: 'rememberSpeed', type: 'toggle', label: 'Remember the speed I last used' },
        { key: 'defaultSpeed', type: 'select', label: 'Default speed', options: opt('0.5', '0.75', '1', '1.25', '1.5', '1.75', '2'), when: (s) => !s.rememberSpeed },
        { key: 'defaultVolume', type: 'range', label: 'Starting volume', min: 0, max: 100, step: 5, unit: '%' },
      ] },
    ] },
    { id: 'video', label: 'Video & audio', groups: [
      { title: 'Streaming quality', hint: 'Applies to the next video you open. If a combination does not exist for a video, the closest match plays instead.', items: [
        { key: 'quality', type: 'select', label: 'Resolution', options: RES },
        { key: 'fps', type: 'select', label: 'Frame rate limit', options: opt(['0', 'No limit'], ['30', '30 fps'], ['60', '60 fps']) },
        { key: 'codec', type: 'select', label: 'Video codec', options: CODECS, hint: 'Automatic uses H.264 up to 1080p for the smoothest playback.' },
        { key: 'maxVideoBitrate', type: 'select', label: 'Video bitrate limit', options: opt(['0', 'No limit'], ['1000', '1 Mbps'], ['2500', '2.5 Mbps'], ['5000', '5 Mbps'], ['8000', '8 Mbps'], ['15000', '15 Mbps']) },
      ] },
      { title: 'Audio', items: [
        { key: 'audioCodec', type: 'select', label: 'Audio codec', options: opt(['auto', 'Automatic'], ['aac', 'AAC'], ['opus', 'Opus']) },
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
      { title: 'Look', items: [
        { key: 'skin', type: 'select', label: 'Skin', options: opt(['modern', 'Modern'], ['classic', 'Classic (2012)']), hint: 'Classic uses its own light colors and ignores the theme below.' },
        { key: 'theme', type: 'select', label: 'Theme', options: THEME_LIST },
        { key: 'accent', type: 'color', label: 'Accent color' },
        { key: 'cBg', type: 'color', label: 'Background', when: (s) => s.theme === 'custom' },
        { key: 'cSurface', type: 'color', label: 'Panels and buttons', when: (s) => s.theme === 'custom' },
        { key: 'cText', type: 'color', label: 'Text', when: (s) => s.theme === 'custom' },
        { key: 'cLink', type: 'color', label: 'Links', when: (s) => s.theme === 'custom' },
      ] },
      { title: 'Size and spacing', items: [
        { key: 'uiScale', type: 'select', label: 'Interface scale', options: opt(['0.85', '85%'], ['0.9', '90%'], ['1', '100%'], ['1.1', '110%'], ['1.25', '125%'], ['1.5', '150%']) },
        { key: 'density', type: 'select', label: 'Spacing', options: opt(['compact', 'Compact'], ['comfortable', 'Comfortable'], ['spacious', 'Spacious']) },
      ] },
      { title: 'Custom CSS', items: [{ key: 'css', type: 'textarea', label: 'Your own styles' }] },
    ] },
    { id: 'layout', label: 'Layout', groups: [
      { title: 'Video grid', items: [{ key: 'gridSize', type: 'range', label: 'Thumbnail size', min: 200, max: 460, step: 20, unit: ' px' }] },
      { title: 'Sidebar', items: [
        { key: 'sidebarDefault', type: 'toggle', label: 'Show the sidebar' },
        { key: 'nav_home', type: 'toggle', label: 'Home' }, { key: 'nav_subs', type: 'toggle', label: 'Subscriptions' },
        { key: 'nav_playlists', type: 'toggle', label: 'Playlists' }, { key: 'nav_history', type: 'toggle', label: 'History' },
        { key: 'nav_watchlater', type: 'toggle', label: 'Watch later' }, { key: 'nav_downloads', type: 'toggle', label: 'Downloads' },
      ] },
      { title: 'Watch page', items: [
        { key: 'theater', type: 'toggle', label: 'Theater mode (wide player)' },
        { key: 'watchRelated', type: 'select', label: 'Related videos', options: opt(['side', 'Beside the video'], ['below', 'Below'], ['hidden', 'Hidden']) },
        { key: 'descExpanded', type: 'toggle', label: 'Show the full description by default' },
        { key: 'commentsHidden', type: 'toggle', label: 'Hide comments' },
        { key: 'showDislikes', type: 'toggle', label: 'Show dislike counts' },
        { type: 'info', text: 'Player buttons: use ✎ under the video to add, remove or reorder them.' },
        { type: 'button', label: 'Reset player buttons', action: 'resetToolbar' },
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
        { type: 'button', label: 'Clear watch history and progress', action: 'clearHistory', danger: true },
        { type: 'button', label: 'Clear local subscriptions', action: 'clearSubs', danger: true },
      ] },
    ] },
  ],
};
