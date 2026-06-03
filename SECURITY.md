# Security & Boundaries — MediaSniffer Pro

## Hard product boundary

MediaSniffer Pro is a media **detector and downloader for content you are allowed
to save**. It deliberately does **not** include, and will not include:

- DRM bypass of any kind (Widevine, PlayReady, FairPlay, ClearKey workarounds).
- Decryption of encrypted streams or extraction from license servers.
- Paywall or login bypass.
- Cookie, token, or session export.
- Screen recording of protected playback.
- Instructions for circumventing site restrictions.

When protected/encrypted/DRM media is detected, it is classified and shown as
**unsupported** with a clear message. See `src/shared/drm-detector.ts` — that module
only *classifies* signals (EME, `#EXT-X-KEY`, DASH `ContentProtection`, DRM system
UUIDs). It contains no circumvention logic, and `decideSupportStatus()` gates such
media to `protected_likely` / `unsupported`.

## Extension security

- **No remotely hosted code.** All logic ships in the package (MV3 requirement).
- **No remote plugins or eval of fetched code.**
- **Observational networking only.** `chrome.webRequest` is used without the
  `blocking` capability; requests are never modified or blocked.
- **Manifest fetches** use `credentials: 'omit'` and target only the media origin
  the page already loaded.
- **No secrets** are stored in the extension. There are no API keys or service
  credentials in the client.

## Native companion (future) security requirements

The desktop companion is not part of this build, but its protocol
(`src/shared/message-types.ts`) and bridge (`src/background/native-bridge.ts`) are
designed for a host that MUST:

- Validate every message against the schema and reject unknown commands.
- Sanitize filenames and prevent path traversal (`..`, absolute paths, reserved names).
- Refuse to overwrite arbitrary local files.
- Never execute shell commands supplied over the wire.
- Never accept cookies, tokens, or remote plugins.
- Reject DRM/encrypted manifests (a `protected-stream-rejector` stage).

## Reporting

This is a personal project. If used more widely, add a `SECURITY` contact and a
coordinated-disclosure process here.
