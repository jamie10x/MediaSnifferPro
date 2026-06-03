# Privacy Policy — MediaSniffer Pro

MediaSniffer Pro is built privacy-first. It runs locally in your browser and does
not depend on any server for its core detection or download features.

## What we do NOT do

- No analytics or tracking by default.
- No upload of your browsing history.
- No upload of detected media URLs.
- No access to, storage of, or transmission of cookies, authentication headers,
  or session tokens.
- No long-term storage of the pages you visit.

## What is stored, and where

| Data | Storage | Lifetime |
| --- | --- | --- |
| Your settings | `chrome.storage.local` | Until you change/clear them |
| Detected media for a tab | `chrome.storage.session` | Cleared when the tab closes or navigates, and when the browser session ends |
| Download job state | `chrome.storage.session` | Same as above |

Detected media is cached **per tab** and is purged automatically when the tab is
closed or navigates to a new page (`chrome.tabs.onRemoved` /
`webNavigation.onCommitted`).

## Network activity

The extension makes outbound requests **only** to fetch and parse an HLS/DASH
manifest that you explicitly ask to inspect ("Choose quality"), and only to the
same media origin the page already used. Those fetches use `credentials: 'omit'`.
There is no other extension-initiated network traffic.

## Redaction

Anything shown in the Details panel or written to debug logs is passed through a
redactor first. Signed-URL parameters (tokens, signatures, expiry) and sensitive
headers (`Authorization`, `Cookie`, …) are stripped or masked.

## Optional telemetry

There is none in this build. If opt-in telemetry is ever added, it will be strictly
opt-in and limited to: extension version, OS, browser version, a generic error
code, and the feature area where an error occurred — never full URLs, page titles,
media URLs, cookies, or personal data.

## Permissions rationale

- `downloads` — to save direct files via the browser download manager.
- `storage` — to persist your settings and per-tab detection cache.
- `webRequest` / `webNavigation` / `<all_urls>` — to observe response types so
  streaming media can be detected, and to clear a tab's cache on navigation.
  These are **observational only**; the extension never blocks or modifies requests.
- `activeTab` / `scripting` — to run detection on the page you're viewing.
- `nativeMessaging` — to talk to the optional local companion app (if installed).
- `notifications` — to notify you when a download completes.
