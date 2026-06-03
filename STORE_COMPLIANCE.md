# Chrome Web Store Compliance Notes

## Listing language

**Do say:**

> MediaSniffer Pro detects media files available on the current page and helps you
> download media you own, have permission to download, or are legally allowed to save.

**Do NOT say (policy + truthfulness risk):**

- "Download any video from any website"
- "Download protected/streaming/Netflix/Prime/Disney+ videos"
- "Bypass restrictions" / "save paid course videos"

## Permissions to justify in the submission

| Permission | Justification |
| --- | --- |
| `downloads` | Save detected direct files via the browser download manager. |
| `storage` | Persist user settings; per-tab detection cache in session storage. |
| `webRequest` (observational) | Detect streaming media by response Content-Type. No blocking. |
| `webNavigation` | Clear a tab's detection cache when it navigates (privacy). |
| `activeTab` / `scripting` | Run detection on the page the user is viewing. |
| `nativeMessaging` | Communicate with the optional, user-installed companion app. |
| `notifications` | Notify on download completion. |
| `<all_urls>` host access | Detect media across sites the user visits. |

## Before submission — narrow host access

The personal build uses `host_permissions: ["<all_urls>"]` so network detection
works everywhere. Reviewers scrutinize broad host access. Recommended changes for
the store build:

1. Move broad host access to `optional_host_permissions` and request per-site on
   demand (helpers already exist in `src/background/permission-manager.ts`).
2. Lean on `activeTab` for DOM/performance detection, which needs no host grant.
3. Document clearly that network detection requires host access and is observational.
4. Provide a concrete privacy policy URL (host `PRIVACY.md` content publicly).

## Single purpose

The single purpose is: **detect downloadable media on the current page and help the
user save media they're permitted to download.** All permissions trace back to this.

## Data disclosure (Web Store Data tab)

- Does the extension collect user data? **No** (no remote collection in this build).
- If opt-in telemetry is added later, update this section and the Data tab to match
  exactly what `PRIVACY.md` describes.
