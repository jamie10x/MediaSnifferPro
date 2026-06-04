// Persistent, capped download history in chrome.storage.local. Local-only.

import type { HistoryEntry } from '@shared/history';
import { logger } from '@shared/logger';

const KEY = 'msp.history';
const MAX_ENTRIES = 200;

export async function listHistory(): Promise<HistoryEntry[]> {
  const stored = await chrome.storage.local.get(KEY);
  return (stored[KEY] as HistoryEntry[] | undefined) ?? [];
}

export async function addHistory(entry: HistoryEntry): Promise<void> {
  const all = await listHistory();
  // De-dupe by jobId (a job only produces one terminal record).
  const filtered = all.filter((e) => e.jobId !== entry.jobId);
  filtered.unshift(entry);
  if (filtered.length > MAX_ENTRIES) filtered.length = MAX_ENTRIES;
  try {
    await chrome.storage.local.set({ [KEY]: filtered });
  } catch (err) {
    logger.warn('history save failed', err);
  }
}

export async function removeHistory(id: string): Promise<void> {
  const all = await listHistory();
  await chrome.storage.local.set({ [KEY]: all.filter((e) => e.id !== id) });
}

export async function clearCompletedHistory(): Promise<void> {
  const all = await listHistory();
  await chrome.storage.local.set({ [KEY]: all.filter((e) => e.status !== 'completed') });
}

export async function getHistoryEntry(id: string): Promise<HistoryEntry | undefined> {
  return (await listHistory()).find((e) => e.id === id);
}
