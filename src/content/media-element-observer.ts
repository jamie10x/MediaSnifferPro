// Watches for media added or mutated after initial load (lazy-loaded players,
// SPA route changes) and triggers a debounced rescan.

export function observeMediaChanges(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onChange, 600);
  };

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && (m.attributeName === 'src' || m.attributeName === 'currentSrc')) {
        schedule();
        return;
      }
      for (const node of m.addedNodes) {
        if (node instanceof HTMLElement && isMediaRelated(node)) {
          schedule();
          return;
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src'],
  });

  // Also rescan when any media element starts playing.
  document.addEventListener('play', schedule, true);

  return () => {
    observer.disconnect();
    document.removeEventListener('play', schedule, true);
    if (timer) clearTimeout(timer);
  };
}

function isMediaRelated(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'video' || tag === 'audio' || tag === 'source' || tag === 'track') return true;
  return el.querySelector('video, audio, source') != null;
}
