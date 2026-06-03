// Redaction helpers. Anything that might be stored, shown in the Details modal,
// or logged passes through here first. We never persist cookies, tokens, or auth.

import { SENSITIVE_HEADERS, SIGNING_PARAM_HINTS } from './constants';
import { safeParseUrl } from './url-utils';

const TOKEN_LIKE = /([?&#])([^=&#]*(?:token|sig|signature|key|secret|auth|session)[^=&#]*)=([^&#]+)/gi;

/** Redact signing/token query values from a URL for display. */
export function redactUrl(raw: string): string {
  const u = safeParseUrl(raw);
  if (!u) return raw.replace(TOKEN_LIKE, '$1$2=[redacted]');
  let changed = false;
  for (const [k] of [...u.searchParams.entries()]) {
    const lower = k.toLowerCase();
    const sensitive = SIGNING_PARAM_HINTS.some((h) =>
      h.endsWith('-') ? lower.startsWith(h) : lower === h,
    );
    if (sensitive) {
      u.searchParams.set(k, '[redacted]');
      changed = true;
    }
  }
  return changed ? u.href : u.href;
}

/** Drop sensitive headers entirely and keep only a safe summary of the rest. */
export function redactHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  for (const [name, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.has(name.toLowerCase())) continue;
    out[name] = value;
  }
  return out;
}

/** Redact a free-form string for safe logging. */
export function redactString(input: string): string {
  return input.replace(TOKEN_LIKE, '$1$2=[redacted]');
}
