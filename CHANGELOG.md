# Changelog

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
