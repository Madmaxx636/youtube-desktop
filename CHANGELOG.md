# Changelog

## 0.7.2

- Fixed: closing the window left the app running in the background, so opening it again started a second copy. Closing the window now quits the app (unless "Keep running in the tray" is on, which hides the window as before).
- Only one copy can run. Opening the app while it is already running brings the existing window forward instead of starting another.


## 0.7.1

- Settings, General, Updates is now a proper panel: your version, whether a newer one exists, what is new in it, a progress bar, and buttons to check, update and restart.
- Updating works inside the app on every kind of install except the portable .exe: the Windows installer and the AppImage update themselves, and a .deb install downloads the new .deb, checks it against the release's published checksum, and installs it through the system password prompt before offering to restart.
- The portable .exe still opens the download page.


## 0.7.0

- Update notice: the app checks this project's GitHub releases at start-up and every six hours and shows "Version X is available" with Update / Later. Nothing installs without your click. The Windows installer and the AppImage download the update and restart into it; the .deb and the portable .exe open the release page instead.
- Settings, General, Updates: turn the automatic check off, or check right now.
- The check contacts api.github.com only. This is the first version that can update itself, so 0.6.1 and older need one manual install of 0.7.0.


## 0.6.1

- Windows build: an installer (YouTube-Desktop-0.6.1-Setup.exe) and a portable .exe, with yt-dlp.exe bundled. Downloads that merge video and audio, and MP3 conversion, still need ffmpeg on PATH.
- New default player look, "Modern", matching YouTube's current bar: a thin full-width timeline with a blue dot, play and volume on the left with the time in a rounded pill, and on the right an autoplay switch, theater, captions, sleep timer, a quality gear that shows HD / 2K / 4K for the current stream, the ⋮ menu and full screen. Round, larger icons.
- The autoplay switch in the bar turns Autoplay on or off (and can be hidden in Settings, Appearance). The buttons now default to the right side; "Next to the volume" is still a choice.
- The earlier "YouTube" red look is still available as a theme.


## 0.6.0

- The video now has its own control bar instead of the browser's: play, volume (slides out on hover), the theater / captions / sleep / quality buttons right next to the volume, the time, ⋮, and full screen. Seek bar shows buffered video, SponsorBlock segments and chapter breaks, with a time and chapter tooltip when you hover. Click the picture to pause, double-click for full screen. The bar fades away while the video plays and comes back when you move the mouse.
- Player themes (Settings, Appearance): YouTube, Classic, Glass, Minimal, AMOLED black and Light, plus your own accent color. The theater / captions / sleep / quality buttons can sit next to the volume or next to full screen.
- Going back or forward (buttons, Alt+arrows, trackpad swipe) animates the page: slide, fade or none (Settings, Appearance).
- New option: stop fading out watched videos. With "Fade out videos I have watched" off, they show normally with just the red progress bar (a full bar if you marked it watched by hand).
- Captions lift above the bar while it is showing.


## 0.5.6

- The YouTube logo can go to Home, Subscriptions, Playlists or History. Pick it in Settings, General ("The YouTube logo goes to"). The tooltip follows your choice.

## 0.5.5

- The extra buttons (theater, captions, sleep, quality, ⋮) now sit on the same row as play, volume and full screen, instead of down on the timeline. The browser's own second ⋮ is hidden, so there is only one. They also stay up while the video is paused, like the rest of the bar.
- Starting a video no longer marks it watched. It keeps its red progress bar in Subscriptions and everywhere else, and counts as watched (and drops out of "hide watched") once you pass 90%. Videos already marked watched stay that way; use "Mark as unwatched" on them.

## 0.5.4

- Fixed buttons in the video's bottom bar, just left of the ⋮: theater mode (lit while on), captions, sleep timer (shows minutes left) and quality (shows the current choice). Captions, sleep and quality open their list right above the bar. Settings, Layout lets you turn each one off, and add a speed button.

## 0.5.3

- Two-finger trackpad swipe goes back and forward in the app: swipe right for back, left for forward. Settings, General, Trackpad: turn it off, set how far you have to swipe, or reverse the direction. It steps aside over anything that scrolls sideways.

## 0.5.2

- The ⋮ actions button now sits in the video's bottom control bar, where the browser's own ⋮ used to be (that one is emptied, so there is only one). Its menu opens upward from there. Picture in picture still works from the menu.
- Full screen from the control bar now keeps the ⋮ button and menu.

## 0.5.1

- Comments placement: below the video (as before), in the side column where live chat sits, or in the side column except in theater mode, where they drop back below the video. Pick it in Settings, Comments, or flip it with the new button in the comments header.
- Side panel height is adjustable (Settings, Comments). The comments scroll inside it and the header stays put. Works with related videos on the side, below, or hidden.

## 0.5.0

- Comments: the real total in the title, "Show more comments" paging, replies you can expand and page through, creator / pinned / member / creator-liked badges, a search box over the loaded comments, and Like and Reply buttons (signed in).
- New Settings tab, Comments. Viewing: load automatically or on click, default sort, text size, spacing, how many lines before "Read more", and whether to show avatars, like counts, badges and the action buttons. Hiding: words or names to hide, and hide comments with links. Writing: a one-line box that opens when clicked (or always open, or hidden), send with Ctrl+Enter, Enter or the button, ask before posting, per-video drafts, a character counter, and what to show after you post.
- Comment box keeps what you typed when you change its style.
- Reply fetching works with YouTube's current comment format (the library's own helper does not).

## 0.4.4

- End screen grid is adjustable: one row of three (like YouTube's own), 2 x 2, 3 x 3 or 4 x 4. Switch it right on the end screen, or in Settings, Playback. Cards are sized to fit the player, so bigger players (theater mode, full screen) get bigger thumbnails.

## 0.4.3

- End screen: when a video finishes, a grid of suggested videos appears over the player with Replay and Close buttons. Your queue comes first, then the rest of the playlist you came from, then related videos.
- With autoplay on, an "Up next in N seconds" countdown runs with a Cancel button, so the grid is never skipped past. With autoplay off, the grid just stays.
- Settings, Playback: turn the end screen off, or change the countdown (3 to 20 seconds).

## 0.4.2

- The three-dot (⋮) button on the video now holds every action that used to sit in the row under it: loop, theater mode, picture in picture, mini player, save to Watch later or a playlist, download (with presets), audio only, copy link, copy link at the current time, open on youtube.com and next video. Quality, speed, subtitles, sleep timer and buffer are below them.
- "Customize this menu" in the menu chooses which actions show.
- The row under the video is hidden by default; Settings, Layout can bring it back.
- A small yellow dot on the ⋮ button shows that a sleep timer is running.

## 0.4.1

- Playlist pages follow the desktop layout: a gradient card with the cover, title, owner, description, view count and Play all, Save, Share and More buttons, beside a list of videos with the channel, views and date, a three-dot menu, and Watch later / Add to queue buttons on hover. Watch later uses the same page.
- Watch history follows the desktop layout: filter chips (All, Videos, Shorts), day headings, large rows, and a side panel with search, clear, pause and manage links. Videos you watch in the app are grouped by day; your YouTube history appears in its own section because YouTube gives no dates for it.
- "Pause watch history" stops the app recording what you watch (also in Settings).
- Playlist videos now show their channel, views, date and channel link.
- "Save playlist" keeps a playlist in the app; saved playlists appear on the Playlists page.

## 0.4.0

- Three-dot menu on every video (grids, lists, playlists, related videos): play, play next, add to queue, save to Watch later or a playlist, mark watched, video details, downloads, copy link, go to channel, subscribe.
- Video details: search results and history show each video as a row with its views, date, channel (with avatar and verified tick), description and badges. The "Video details" panel shows the full description, likes and dislikes, duration and tags.
- Search results can be shown as a list (default) or a grid, with a switch above the results and a setting.
- Back and forward buttons in the header, the mouse back/forward buttons, and Alt+Left / Alt+Right. Each page remembers its scroll position.
- Up next: an autoplay switch and a play queue next to the video.
- Chapters from the description, with the current chapter shown and click to jump.
- Search history in the search box, with removable entries.
- More keyboard shortcuts (C subtitles, 0-9 seek, Home/End, frame step, Shift+N / Shift+P, I mini player) and a shortcut sheet on ?.
- The volume and mute state are remembered between sessions.
- Fix: after changing any setting, the app forgot the defaults of settings you had not touched (for example it could start showing Shorts again).
- History and Watch later are shown as lists.

## 0.3.0

- Channel pages now work like the desktop site: banner, avatar, handle, subscriber and video counts, and tabs for Home (the channel's own shelves), Videos, Shorts, Live, Playlists and About (description, stats, links). Videos, Shorts and Live can be sorted Latest, Popular or Oldest, and load more as you scroll.
- Playlist pages are a numbered list with the cover, title, Play all, Shuffle and download buttons in a side panel.
- Fix: the Playlists page listed every playlist twice.
- Watch-progress bars now appear on every thumbnail (channels, playlists, search, subscriptions), using your YouTube history when signed in. They also update right after you close a video, instead of only after the page reloads.
- Test mode: with YT_TEST_HIDDEN=1 the app never shows or focuses a window.

## 0.2.0

- Subtitles are centered and plain: YouTube's left-pinned positioning and grey "not yet spoken" word styling are removed.
- Minimal line icons everywhere instead of emoji.
- Quality, speed, subtitles, sleep timer and buffer moved into a settings menu on the video itself (the slider button, top right of the player).
- Larger, rounded player buttons with a size setting and optional text labels; "Customize" replaces the pencil.
- Sleep timer (15 minutes to 2 hours, or end of video) with optional volume fade and an option to quit the app.
- Sidebar: drag its edge to resize, and optionally hide it automatically while watching (the menu button slides it back in).
- Buffering: streams go through a local cache that downloads ahead in steady chunks; choose 15 seconds to 5 minutes. Fixes stutters from slow or throttled connections. A dropped stream reconnects once automatically.
- Watched progress bars on thumbnails (thicker, with a track), using YouTube's own resume positions when signed in.
- More scaling controls: interface scale (70-200%), text size, icon size, player button size, sidebar width and related-column width.

## 0.1.2

- Fix: after opening the grouped subscriptions page, it stayed on screen under every other page, so the sidebar buttons, Manage and channel pages looked dead.
- Fix: channel icons did not load (YouTube returns addresses without "https:").
- A failed DeArrow thumbnail now falls back to the original image.
- Grouped layout: your subscriptions now live in the sidebar, with unwatched counts and a Manage link.
- The logo click now highlights Home.

## 0.1.1

- Fix: after signing in, every request failed with HTTP 400 (home, search, playback, comments, subscriptions). Public data now uses an anonymous session, and account data uses a separate session that talks to YouTube as the TV client, which is the client the sign-in token is valid for.
- Signed in, you now get your own recommendations on Home, your subscriptions (with the full channel list), history, and all your playlists including Watch later and Liked videos.
- Right-click menus on videos, playlists, the player, links and text fields.
- Removed notifications and "add to YouTube history": YouTube does not serve them to this sign-in type.
- Account name and avatar now fill in after sign-in.

## 0.1.0 (unreleased)

First working version of the desktop client.

- Browse, search (with filters), channels, comments, related videos; paste a YouTube link into search to open it
- Playback up to 4K with resolution, frame rate, codec and bitrate settings; audio-only mode
- Subtitles with their own appearance settings
- Downloads of video and audio (container, codec, MP3/M4A/Opus/FLAC/WAV, bitrate, embedded cover art and metadata) and whole playlists
- Grouped subscriptions page (by day or channel) and a classic subscription box; manage and import subscriptions
- Google sign-in through the device-code page, account and channel switching, notifications, like/dislike, comments, subscribe (written, not yet tested against a real account)
- SponsorBlock, DeArrow, Return YouTube Dislike
- Mini player with size, corner, opacity and stay-on-top settings; tray, media keys, picture-in-picture
- Customizable player buttons, theater mode, Modern and Classic skins, themes, interface scale, layout options
- Tabbed settings panel
- Linux packages: AppImage and .deb built with `npm run dist` (needs yt-dlp and ffmpeg at runtime)
