# MediaSniffer Pro — Native Companion

A small local app that MediaSniffer Pro talks to over **Chrome Native Messaging**.
It uses **real ffmpeg** to download and remux the streams the in-browser engine
won't handle: large HLS, fMP4, DASH, separate audio/video, broken timestamps, and
long downloads. It can also replay the page's `Referer`/`User-Agent` so it works
against CDNs that reject plain extension fetches.

> Boundary: this companion only handles **clear (non-DRM)** media. It refuses
> inputs that look DRM/license-server based and never bypasses DRM, cookies,
> paywalls, or protected playback.

## Architecture (hybrid)

```
Extension (default for simple clear HLS)        Native companion (this app)
  popup → service worker → offscreen → mux.js     background → native messaging → ffmpeg
  TS HLS → MP4, saved via chrome.downloads        large/fMP4/DASH/complex → MP4 on disk
```

## Build & install

Requires Node 18+. ffmpeg is bundled via `ffmpeg-static` (downloaded on `npm install`).

```bash
cd native-companion
npm install
npm run build

# Register the host with your browser. Get the ID from brave://extensions
# (or chrome://extensions) with Developer mode on.
node dist/install/register-host.js <YOUR_EXTENSION_ID>
```

Fully quit and reopen the browser. Open the MediaSniffer Pro popup — the helper
banner should now say it's connected.

### What registration does
- Writes a launcher `dist/run.sh` (execs `node dist/main.js`).
- Writes `com.mediasniffer.pro.companion.json` into the NativeMessagingHosts
  folder of Chrome, Brave, and Chromium (macOS/Linux). `allowed_origins` is locked
  to your extension ID, so only your extension can start the host.

### Windows
Native hosts are registered via a registry key
`HKCU\Software\Google\Chrome\NativeMessagingHosts\com.mediasniffer.pro.companion`
pointing at the manifest JSON. (Scripted Windows install is a TODO.)

## Protocol

Stdio, 4-byte little-endian length prefix + JSON. Types mirror the extension's
`src/shared/message-types.ts`:

- `PING` → `PONG{version}`
- `START_DOWNLOAD{job}` → `JOB_ACCEPTED` → `JOB_PROGRESS*` → `JOB_COMPLETED{outputPath}` / `JOB_FAILED{error}`
- `CANCEL_DOWNLOAD{jobId}`
- `OPEN_OUTPUT_FOLDER{jobId}`

Output goes to `~/Downloads/MediaSnifferPro/` by default; paths are sanitized and
confined to your home folder (no traversal).

## Status

Working skeleton: PING, HLS/DASH/direct download + remux via ffmpeg with progress,
cancel, open-folder, DRM rejection, path-safety. Not yet done: pause/resume, a
job database, checksum validation, subtitle muxing UI, and the extension-side
auto-handoff that sends `native_required` jobs here automatically.
