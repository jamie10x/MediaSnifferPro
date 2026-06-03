// Optional permission helpers. The personal build ships with <all_urls>, but
// these helpers support the webstore path of requesting host access per-site.

export async function hasHostPermission(origin: string): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins: [origin] });
  } catch {
    return false;
  }
}

export async function requestHostPermission(origin: string): Promise<boolean> {
  try {
    return await chrome.permissions.request({ origins: [origin] });
  } catch {
    return false;
  }
}

export function originPatternFor(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return null;
  }
}
