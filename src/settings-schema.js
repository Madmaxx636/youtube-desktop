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
    startPage: 'home', logoGoes: 'home', playerTheme: 'modern', playerAccentOn: false, playerAccent: '#ff3b3b', pbSide: 'right', pbAutoplay: true, dimWatched: true, pageAnim: 'slide', swipeNav: true, swipeDistance: 150, swipeInvert: false, hideShorts: true, closeToTray: false, windowSystem: 'auto',
    commentsPlace: 'below', commentsSideHeight: 75, commentsAuto: true, commentsSortDefault: 'TOP_COMMENTS', commentsSize: 100, commentsDensity: 'comfortable', commentsLines: '5', commentsAvatars: true, commentsLikes: true, commentsBadges: true, commentsActions: true, commentsBlock: '', commentsHideLinks: false, composerStyle: 'expand', composerSubmit: 'ctrl', composerConfirm: true, composerDrafts: true, composerCounter: true, afterPost: 'newest',
    autoplayNext: true, endScreen: true, endGrid: '3x1', autoplayDelay: '8', rememberVolume: true, searchView: 'list', resume: true, rememberSpeed: true, defaultSpeed: '1', defaultVolume: 100, sleepFade: '0', sleepAction: 'pause',
    quality: 'auto', fps: '0', codec: 'auto', maxVideoBitrate: '0', audioCodec: 'auto', maxAudioBitrate: '0', bufferProxy: true, bufferSeconds: '60',
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
    dearrow: true, ryd: true, pauseHistory: false,
  },
  tabs: [
    { id: 'general', label: 'General', groups: [
      { title: 'Trackpad', items: [
        { key: 'swipeNav', type: 'toggle', label: 'Two-finger swipe goes back and forward', hint: 'Swipe right to go back, left to go forward, like in a browser.' },
        { key: 'swipeDistance', type: 'range', label: 'Swipe distance needed', min: 60, max: 400, step: 10, unit: ' px', when: (s) => s.swipeNav },
        { key: 'swipeInvert', type: 'toggle', label: 'Reverse the swipe direction', when: (s) => s.swipeNav },
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
      { title: 'Reset', items: [{ type: 'button', label: 'Reset all settings to defaults', action: 'resetAll', danger: true }] },
    ] },
    { id: 'playback', label: 'Playback', groups: [
      { title: 'Behavior', items: [
        { key: 'autoplayNext', type: 'toggle', label: 'Play the next video automatically' },
        { key: 'endScreen', type: 'toggle', label: 'Show suggested videos when a video ends', hint: 'With autoplay on, a short countdown runs that you can cancel.' },
        { key: 'endGrid', type: 'select', label: 'Suggestions on the end screen', options: opt(['3x1', 'One row of 3 (like YouTube)'], ['2x2', '2 × 2'], ['3x3', '3 × 3'], ['4x4', '4 × 4']), hint: 'You can also switch on the end screen itself.', when: (s) => s.endScreen !== false },
        { key: 'autoplayDelay', type: 'select', label: 'Countdown before the next video', options: opt(['3', '3 seconds'], ['5', '5 seconds'], ['8', '8 seconds'], ['12', '12 seconds'], ['20', '20 seconds']), when: (s) => s.endScreen !== false && s.autoplayNext !== false },
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
        { key: 'maxVideoBitrate', type: 'select', label: 'Video bitrate limit', options: opt(['0', 'No limit'], ['1000', '1 Mbps'], ['2500', '2.5 Mbps'], ['5000', '5 Mbps'], ['8000', '8 Mbps'], ['15000', '15 Mbps']) },
      ] },
      { title: 'Buffering', hint: 'Streams go through a small local cache that downloads ahead in steady chunks. This smooths out stutters from slow or throttled connections.', items: [
        { key: 'bufferProxy', type: 'toggle', label: 'Buffer ahead through the local cache' },
        { key: 'bufferSeconds', type: 'select', label: 'Buffer ahead', options: opt(['15', '15 seconds'], ['30', '30 seconds'], ['60', '1 minute'], ['120', '2 minutes'], ['300', '5 minutes']), when: (s) => s.bufferProxy !== false, hint: 'More buffer uses more memory (a few hundred MB for 4K at 5 minutes). Applies to the next video.' },
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
      { title: 'Video player', items: [
        { key: 'playerTheme', type: 'select', label: 'Player theme', options: opt(['modern', 'Modern (like YouTube today, blue)'], ['youtube', 'YouTube (dark fade, red)'], ['classic', 'Classic (solid bar, blue)'], ['glass', 'Glass (floating, blurred)'], ['minimal', 'Minimal (thin line)'], ['amoled', 'AMOLED black (green)'], ['light', 'Light (white bar)']) },
        { key: 'playerAccentOn', type: 'toggle', label: 'Use my own accent color for the player' },
        { key: 'playerAccent', type: 'color', label: 'Player accent color', when: (s) => s.playerAccentOn },
        { key: 'pbAutoplay', type: 'toggle', label: 'Autoplay switch in the player bar' },
        { key: 'pbSide', type: 'select', label: 'Theater, captions, sleep and quality buttons sit', options: opt(['left', 'Next to the volume'], ['right', 'Next to full screen']) },
      ] },
      { title: 'Pages', items: [
        { key: 'pageAnim', type: 'select', label: 'Animation when going back or forward', options: opt(['slide', 'Slide'], ['fade', 'Fade'], ['none', 'None']) },
        { key: 'dimWatched', type: 'toggle', label: 'Fade out videos I have watched', hint: 'Turn off to show watched videos normally, with just the red progress bar.' },
      ] },
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
        { key: 'composerConfirm', type: 'toggle', label: 'Ask before posting', hint: 'Comments are public, so this is on by default.' },
        { key: 'composerDrafts', type: 'toggle', label: 'Keep a draft for each video until I post it' },
        { key: 'composerCounter', type: 'toggle', label: 'Show a character counter' },
        { key: 'afterPost', type: 'select', label: 'After I post', options: opt(['newest', 'Show newest comments so I can see mine'], ['keep', 'Keep the current sorting']) },
      ] },
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
        { type: 'button', label: 'Clear watch history and progress', action: 'clearHistory', danger: true },
        { type: 'button', label: 'Clear local subscriptions', action: 'clearSubs', danger: true },
      ] },
    ] },
  ],
};
