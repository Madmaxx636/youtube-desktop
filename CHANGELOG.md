# Changelog

## 0.11.5

- Fixed: videos you watch here now show as watched, with their progress, on YouTube on the web and on the phone. Cause: the signed-in player request the app made to get its tracking addresses was being refused by YouTube ("The page needs to be reloaded"), so the app silently fell back to the signed-out addresses, and YouTube never tied the views to your account. The TV player needs its own signature timestamp format (the usual five digits with 001 added) and a playback context, as SmartTube sends. With that, the request is accepted and the pings are recorded: in a test the video appeared at the top of the account's history with its progress.
- The signed-in session no longer sends a visitor id made up for the signed-out one.
- The transcript is looked up from every caption track the video has, so it still appears (under the chapters and in its own tab) when auto-generated captions are switched off for display.
- Chapters and the transcript are always in the side panel ("In this video"), whichever way the suggested videos are shown (beside, below or hidden); the panel keeps its column. The "Chapters go" setting is gone. The panel can still be turned off in Settings, Layout, which brings back the chapter strip below the video.
- Developer tab: the log now says what the signed-in player answered when history is reported (status, whether streams and tracking were returned).

## 0.11.4

- Chapters now have their transcript: each chapter in the "In this video" panel has a "Transcript" button that opens the words spoken during that chapter underneath it (click a line to jump there). It is collapsed until you press it.
- Watch history on YouTube: the pings now follow SmartTube's working requests. The playback id is sent in the signed-in player request and reused in the pings (it used to be made up afterwards), the pings carry only the standard parameters and the starting position. YouTube accepts them (HTTP 204), but in testing with the signed-in account the video still did not show up in the account's history, so this is still not confirmed to work.

## 0.11.3

- New Settings, About tab (version and a short description). Press and hold the app name there for five seconds, like tapping the build number on Android, to unlock hidden developer options. A Developer tab appears.
- Developer tab: a live log of what the app and the page are doing (the last 1,000 lines each). It records errors, failed requests with how long they took, unhandled exceptions, and the sound and stream problems the player recovers from. Filter it to warnings or errors, copy it, or clear it. "Verbose logging" also records every request and the player's buffering, seeking and stream events. IP addresses and tokens are removed from the log and long dumps are cut short, so it is safe to paste. "Turn developer options off" hides the tab again.

## 0.11.2

- "In this video" panel: it now starts collapsed, showing only its header and the Chapters / Transcript tabs (Transcript appears whenever the video has captions, even if captions are not shown). Click a tab to open it. The X closes the panel and it stays gone for other videos until you restart the app.
- Opening a half-watched video now continues where you left off. If this app has no saved position for the video (for example you watched it on your phone), it continues from the point YouTube says you reached. Positions under two seconds are ignored.
- Watch history on YouTube: the pings now come from a signed-in player request and report real watched ranges (start and end of each stretch, playing or paused, and a final report when you leave), every 30 seconds instead of one zero-length report. YouTube accepts them (HTTP 204), but in testing with the signed-in account the video still did not appear in the account's history or progress list, so this is not confirmed to fix the watched marks on the web and phone. The sign-in this app uses (the TV-style login) may simply not be allowed to write watch history.

## 0.11.1

- Fixed: the sound dropping out for good, after a long pause or after skipping ahead or back. Cause: the local stream cache forgot a stream's address after 20 minutes without a request, and the sound track is downloaded in the first few seconds and then not asked for again, so in a longer video (or after a long pause) its address was gone. The next skip needed the sound again, got "not found", and the sound stayed dead for the rest of the video while the picture carried on. Addresses now stay valid for six hours (only the cached data is freed when a stream has been idle), and a stream that is in the middle of being read is never cut off.
- The player now looks after the sound itself. Once a second while a video plays it restarts the sound if it was paused, starts it if its clock was lost, wakes the audio engine if it fell asleep, and replaces the sound element if it errors or has been stuck for six seconds (first with a fresh element for the same address, then by looking the video up again). A dropped stream reconnects up to four times in two minutes instead of once per video. In testing, each of these (a dead sound element, a suspended audio engine, a sound paused behind the player's back, a stuck element, a dead sound address after a skip) recovered within one to seven seconds.
- The stream cache asks again for a chunk it had cancelled instead of cutting the response, which would also have made the sound fail.
- A paused sound is no longer "re-synced" by seeking it, which hid a stalled sound from the check above.
- Settings, Video & audio, Troubleshooting: "Copy the playback log" copies a short record of anything that went wrong with the sound or the stream (errors, restarts, reconnects), so a drop I cannot reproduce can be looked at.
- A stream kept in memory (the sound and short videos) is capped at 128 MB; it could grow to the whole cache limit before.


## 0.11.0

- Floating player: going to the home page, a channel, a playlist, subscriptions or any other page no longer stops the video. It keeps playing in a small player in the bottom-right corner (size and corner are in Settings, Layout) that you can close with the x, or click to go back to the video with no reload. The next video of a queue or playlist loads there too, and Space, M, J, L and Shift+N work on it. Esc on the video page now minimizes it instead of stopping it.
- Notification bell next to your profile: a list of new videos from channels where you turned the bell on, finished downloads, updates and the sleep timer, with an unread count. Click one to open the video. It keeps working even when desktop pop-ups are off. (This is the app's own list; YouTube's own notification feed is not available to this kind of sign-in.)
- Fixed: a video starting with a black picture, the first seconds repeating, then playing normally. The sound now starts only once the picture is really moving, small drifts are corrected by nudging the speed instead of jumping back, and the video starts at your resume position from the first frame.
- Faster to open a video: the details, comments and suggestions no longer wait for the stream (they show in about a second), the captions come with the details instead of a second yt-dlp run (loading a caption file takes a fraction of a second instead of several), yt-dlp's HLS lookup is skipped (saves most of a second), the video you were watching stops downloading the moment you open another, and the picture of the new video shows at once with a spinner.
- Videos are looked up before you open them: rest the pointer on a video for a moment, or let the current one play for a few seconds (for the next one), and its stream address and first chunks are fetched ahead. A prefetched 4K video started playing in about a second in testing, an unprefetched one in 4 to 6 seconds (most of that is yt-dlp). Turn it off in Settings, Performance. It is off in data saver and power saving.
- Bigger and faster buffer: choose up to 30 minutes (default 3). Big buffers are kept on disk in your cache folder (not memory) up to a limit you choose, 1 GB by default, and removed when you quit. The part of the video that is about to play is downloaded first, with the look-ahead held back until it has arrived, and a seek forgets the look-ahead meant for the old spot. In testing a 4K stream filled at about 3.5 MB/s while playing without a stall.
- Fixed: rewinding after a video has ended (or any seek back) was sometimes slow. Version 0.10 threw away everything behind the playhead except one chunk, so every rewind downloaded the video again. Now the part you already watched stays in the buffer up to your limit, the first and last chunks of the file (its header and index) are never dropped, and when playback reaches the end the start is fetched again so a replay begins at once. A seek cancels the downloads meant for the old spot (they were taking the bandwidth), fetches the new spot in two halves at the same time with the next chunk beside it, dragging the seek bar moves the video about seven times a second instead of dozens, the sound is no longer re-seeked over and over while it loads, and scrubbing back clears the end screen and stops its countdown to the next video. In testing on a 4K video, rewinding to a watched part after the end resumed in 0.15 to 0.33 seconds. With a deliberately tiny buffer limit that forces the watched part to be dropped, a rewind to the start went from 2.0 seconds to 0.15 and to a spot in the middle from 5.2 to about 2 to 3.7 (a dropped spot has to come from the network again).
- Correction to 0.9.0: its "highest bitrate" pick ranked formats by the peak bitrate YouTube lists for HLS streams, which is an estimate far above what the file holds (the same file, in fact), so it gained nothing and made videos start slowly. It now ranks the real bitrates of the plain formats, which start fast and go through the buffer. The 4K VP9 pick (about 17 Mbps against 9 Mbps for AV1 on the test video) is unchanged.
- Faster app: the home page shows last time's feed straight away (0.2 s instead of 4 s to the first videos) and refreshes behind it; searches, playlists and channel pages you have just seen come back instantly when you go back to them; the web session and yt-dlp are warmed up at start; the signed-in watch-progress sync waits a few seconds after start-up; and the player bar and pictures do less work.


## 0.10.1

- Fixed: on videos that carry dubbed audio tracks, the app could play a dub (for example Indonesian) instead of the original audio. The highest-bitrate pick added in 0.9.0 chose by bitrate alone. The original audio now always comes first.
- New setting, Settings, Video & audio, "Audio language": Original (never a dubbed track, the default), Whatever has the highest bitrate, or a specific language (English, Spanish, French and others). If the video has no track in that language, the original is used. It applies to playback and downloads.


## 0.10.0

- Touch / tablet mode (Settings, Performance): automatic on touch screens without a mouse, or always on or off. Bigger buttons and a taller header, nothing that needs hovering (the video menu dots, quick actions and chapter buttons are always visible), a big play button on the video, tap the picture to show or hide the controls, double-tap the left or right of the video to jump 10 seconds, swipe in from the screen edge to go back or forward, and larger menus and tabs.
- Full titles: hover a video title for about half a second and a tooltip shows the whole title (and the original title when DeArrow has replaced it).
- Data saver (Settings, Performance): video capped at 480p by default (your choice: 240p to 720p) with a smaller audio bitrate, a 15-second buffer, and no DeArrow, dislike counts, seek-bar previews or new-video checks. Comments load only when you ask, and the suggested list is shorter.
- Power saving / low-end mode: no animations or blur, H.264 video capped at 720p by default (your choice: 360p to 1080p), no audio processing (stable audio is skipped), a 20-second and 48 MB buffer, the player bar repainting about once a second, and slower background timers. It can turn on by itself whenever the device is on battery, or only when the battery is at 20% or less. A chip in the header shows when a mode is on.
- Lower CPU and memory in general: the player bar only touches the page when a value changed (it used to rewrite its icons on every tick), long lists skip layout for rows that are off screen, and the stream cache is capped at 192 MB instead of 384 MB (and the 4K high-bitrate pick no longer needs the cache at all).


## 0.9.0

- Maximum bitrate: playback and downloads now pick the highest-bitrate stream at your chosen resolution instead of yt-dlp's default order. A 4K60 test video went from about 9 Mbps (AV1) to about 28 Mbps (VP9), and the "Auto" quality now means the highest the video offers instead of stopping at 1080p. Turn it off in Settings, Video & audio ("Always pick the highest-bitrate stream"). If a stream will not play, the app reconnects once with a standard pick. Downloads still honour your own height limit (Settings, Downloads): set it to "Highest available" to go all the way.
- Seek-bar preview: hovering or dragging on the seek bar shows a picture of the video at that moment (YouTube's own preview frames) above the time and chapter name. Switch it off in Settings, Appearance.
- Stable audio (Settings, Video & audio, or the in-player menu): evens out loudness between videos using the level YouTube reports, trimming loud ones and (optionally, up to 6 dB) lifting quiet ones, with a limiter so nothing clips. A second mode also squeezes the loud and quiet parts of one video together (light or strong) for late-night listening. It only affects playback, not downloads. It needs the local stream cache, so the app uses it automatically while stable audio is on.


## 0.8.1

- Clean-up release after a full code audit: unused styles, an unused icon and a leftover test hook were removed, and a record of notifications that was only meant for testing no longer grows while the app runs. A lint pass found no undefined names.
- Re-tested end to end: every settings tab, all themes and skins, search, the chapters panel and bar, tabs, autoplay modes and notification rules.


## 0.8.0

- Chapters: the current chapter's name sits in the player's control bar (click it for the full list), and the seek bar shows chapter breaks. Chapters now come with their own thumbnails.
- New "In this video" panel above the suggested videos, like YouTube: a Chapters tab (thumbnail, title, time; share a chapter's link or loop a chapter) and a Transcript tab (click a line to jump there; the current line follows the video). Hide it with the X, or put the chapters back under the video in Settings, Layout.
- Suggested videos have filter chips: All, From this channel, Not watched, Under 10 min, Over 30 min.
- Tabs: middle-click, Ctrl+click or a 3-finger tap (most touchpads send a middle click) on any video adds it to a tab strip at the top. Click a tab to switch to it (the video you leave stays as a tab), x or middle-click to close one. Turn the strip off in Settings, Layout.
- Under the title: a bell for new-video notifications, Share (copy link, link at the current time), Save (Watch later, playlist, queue), Download and a More menu, next to the Like / Dislike pill. They collapse to icons when the page is narrow.
- Classic skin has a dark version: it follows a dark theme, or pick Light / Dark in Settings, Appearance.
- Fixed: Like, Dislike and removing a rating failed with "status code 400". YouTube now needs the video in a different form than the library sends; the app sends it correctly.
- Security and cleanup: video ids and subtitle languages are checked before anything is passed to yt-dlp, the window can no longer navigate away from the app's own pages, every browser permission except full screen is refused, update downloads must come from this project's releases, and the interval for new-video checks now applies without a restart.
- Autoplay has three modes (Settings, Playback; also the Autoplay box above the suggested videos, the in-player menu, and right-click on the switch in the player bar): Endless keeps going into suggested videos, "Only when there is a queue or a playlist" moves on through your queue (tabs) and the playlist you started from and then stops, and Off stops after every video. The switch in the bar turns it on or off. The Next button and Shift+N always go to the next video.
- Fixed: playing a playlist did not continue through the playlist, because the suggested videos replaced it once the page loaded. It now plays the playlist in order (and Shuffle keeps its order).
- Player bar cleaned up to match YouTube: the seek bar is cut into chapter segments, the chapter name sits next to the time, and the buttons on the right run captions, quality (HD tag), sleep timer, theater, ⋮, full screen. The autoplay switch shows its mode.
- Signed in, what you watch is now reported to YouTube so it can show in your history on the web (Settings, General, "Add what I watch here to my YouTube history"; off while "Pause watch history" is on). If YouTube refuses, the app says so once.
- Marking videos as watched is now up to you: Settings, Playback, "Mark a video as watched once I have seen" (any of it, 25%, 50%, 75% or 90%; default 50%). Until then they keep their red progress bar.
- Desktop notifications (new Settings tab): new videos from channels where you turned the bell on (or every subscription), finished downloads, the sleep timer, the queue running out, the next video starting while you are away, and new app versions. They show only when the app is minimized or in the background unless you choose Always. Clicking one opens the video.


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
