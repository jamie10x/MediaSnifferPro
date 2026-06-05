// Cleans a browser tab title into a friendly media name by stripping the trailing
// site-name suffix (e.g. "Watch X - S1E11 - Streamzy" -> "Watch X - S1E11").

export function cleanPageTitle(title: string | undefined, domain: string | undefined): string {
  const raw = (title ?? '').trim();
  if (!raw) return '';

  // Domain words to match the trailing segment against (e.g. "streamzy").
  const domainWords = (domain ?? '')
    .toLowerCase()
    .replace(/^www\./, '')
    .split('.')
    .filter((w) => w.length > 2 && w !== 'com' && w !== 'net' && w !== 'org' && w !== 'tv');

  const parts = raw.split(/\s+[|–—-]\s+/); // " - ", " | ", " – ", " — "
  if (parts.length > 1) {
    const last = parts[parts.length - 1]!.toLowerCase().replace(/[^a-z0-9]/g, '');
    const looksLikeSite = domainWords.some((w) => last.includes(w) || w.includes(last));
    if (looksLikeSite && last.length >= 3) {
      const trimmed = parts.slice(0, -1).join(' - ').trim();
      if (trimmed) return trimmed;
    }
  }
  return raw;
}
