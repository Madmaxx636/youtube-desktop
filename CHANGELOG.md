# Changelog

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
