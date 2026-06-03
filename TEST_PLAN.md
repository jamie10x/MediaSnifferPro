# Manual Test Plan — MediaSniffer Pro

Build (`npm run build`) and load `dist/` unpacked in Chrome before testing.

## 1. Direct files
- [ ] Page linking a direct `.mp4` → appears as **Downloadable**; Download saves it.
- [ ] Direct `.webm`, `.mp3`, `.m4a` similarly detected and downloadable.
- [ ] URL with signed query params (`?token=…&expires=…`) downloads intact (not collapsed).
- [ ] Two URLs differing only by tracking params collapse to one item.
- [ ] Filename with illegal characters is sanitized (no `/ \ : * ? " < > |`).

## 2. DOM detection
- [ ] `<video src>` and `<video><source></video>` detected.
- [ ] `<audio>` detected (when "Show audio" is on).
- [ ] `<track>` subtitles detected (when "Show subtitles" is on).
- [ ] Media inside an open shadow root detected.
- [ ] Lazy-loaded / late-inserted `<video>` detected after the observer fires.
- [ ] Open Graph / JSON-LD `VideoObject` URLs detected as source `metadata`.

## 3. Network detection
- [ ] Media that only loads after pressing Play is detected (source `network`).
- [ ] `.ts` / `.m4s` segments are hidden by default.
- [ ] An `.m3u8` request is detected as an **HLS** item.
- [ ] An `.mpd` request is detected as a **DASH** item.

## 4. Streams (HLS / DASH)
- [ ] Clear HLS (e.g. Apple BipBop test master `.m3u8`) shows a **Download** button and
      **Choose quality**; Download produces a playable **.mp4** named from the page title.
- [ ] HLS with TS segments → transmuxed via mux.js; fMP4 (`#EXT-X-MAP`) → init+segments concat.
- [ ] Progress advances (Downloading n/N segments → Remuxing → Saving file → Completed).
- [ ] A `.mpd`-named URL that actually serves an HLS playlist is reclassified to **HLS** on parse.
- [ ] DASH-IF reference `.mpd` (clear) → variants listed; status **Needs desktop helper**.
- [ ] HLS with `#EXT-X-KEY` (SAMPLE-AES) → **Protected stream likely**, unsupported message, no download.
- [ ] DASH with `ContentProtection` / Widevine UUID → **Protected stream likely**.
- [ ] A page using EME (DRM playback) → its stream item shows protected/unsupported.
- [ ] The player's `blob:` MSE element is hidden when a real manifest is present.

## 5. Downloads & jobs
- [ ] Direct download shows a job that progresses to **Completed**.
- [ ] Stream download with no companion installed shows **Needs desktop helper** (blocked).
- [ ] Protected item's Download is blocked with a clear reason.

## 6. Options
- [ ] Toggling each detector on/off changes what appears after a rescan.
- [ ] "Hide segments" off → `.ts` segments appear.
- [ ] Minimum file size filters out smaller items.
- [ ] Filename template change reflected in saved filenames.
- [ ] Blocklist domain → its media not shown. Allowlist set → only those pages scanned.
- [ ] Debug logs toggle controls console output (and output is redacted).

## 7. Privacy
- [ ] Inspect the service-worker Network tab: **zero** outbound requests except a
      manifest fetch triggered by "Choose quality".
- [ ] Close a tab → its candidates are removed from `chrome.storage.session`.
- [ ] Navigate to a new page → previous candidates cleared.
- [ ] Details modal shows redacted URL/headers (no tokens, no cookies).
- [ ] `chrome.storage.local` contains only settings (key `msp.settings`).

## 8. Native bridge (stub)
- [ ] With no companion installed, native status reads "not installed".
- [ ] Popup surfaces the helper banner for HLS/DASH items.
