# Changelog

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
