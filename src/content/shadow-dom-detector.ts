// Traverses open shadow roots so media inside web components is detected too.

import type { RawCandidate } from '@shared/message-types';
import { detectFromRoot } from './dom-detector';

const MAX_DEPTH = 12;

export function detectInShadowDom(): RawCandidate[] {
  const out: RawCandidate[] = [];
  const seen = new Set<ShadowRoot>();
  walk(document, 0, out, seen);
  return out;
}

function walk(root: ParentNode, depth: number, out: RawCandidate[], seen: Set<ShadowRoot>): void {
  if (depth > MAX_DEPTH) return;
  root.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const shadow = el.shadowRoot; // open shadow roots only
    if (shadow && !seen.has(shadow)) {
      seen.add(shadow);
      out.push(...detectFromRoot(shadow));
      walk(shadow, depth + 1, out, seen);
    }
  });
}
