// Per-tab media + job store. Mirrored to chrome.storage.session so it survives
// service-worker termination, and cleared when a tab closes or navigates away.

import { STORAGE_KEYS } from '@shared/constants';
import type { DownloadJob, MediaCandidate } from '@shared/types';
import { logger } from '@shared/logger';

interface TabBucket {
  pageUrl: string;
  pageDomain: string;
  candidates: Record<string, MediaCandidate>; // keyed by canonicalKey
  jobs: Record<string, DownloadJob>; // keyed by jobId
}

function emptyBucket(): TabBucket {
  return { pageUrl: '', pageDomain: '', candidates: {}, jobs: {} };
}

const memory = new Map<number, TabBucket>();

function sessionKey(tabId: number): string {
  return `${STORAGE_KEYS.candidatesPrefix}${tabId}`;
}

async function persist(tabId: number): Promise<void> {
  const bucket = memory.get(tabId);
  if (!bucket) return;
  try {
    await chrome.storage.session.set({ [sessionKey(tabId)]: bucket });
  } catch (err) {
    logger.warn('persist failed', err);
  }
}

async function getBucket(tabId: number): Promise<TabBucket> {
  let bucket = memory.get(tabId);
  if (bucket) return bucket;
  // Rehydrate from session storage after a service-worker restart.
  const stored = await chrome.storage.session.get(sessionKey(tabId));
  bucket = (stored[sessionKey(tabId)] as TabBucket | undefined) ?? emptyBucket();
  memory.set(tabId, bucket);
  return bucket;
}

export async function setPageInfo(tabId: number, pageUrl: string, pageDomain: string): Promise<void> {
  const bucket = await getBucket(tabId);
  bucket.pageUrl = pageUrl;
  bucket.pageDomain = pageDomain;
  await persist(tabId);
}

/** Insert or merge a candidate by canonicalKey. Returns the stored candidate. */
export async function upsertCandidate(candidate: MediaCandidate): Promise<MediaCandidate> {
  const bucket = await getBucket(candidate.tabId);
  const existing = bucket.candidates[candidate.canonicalKey];
  const merged: MediaCandidate = existing
    ? { ...existing, ...stripUndefined(candidate), id: existing.id, createdAt: existing.createdAt, updatedAt: Date.now() }
    : candidate;
  bucket.candidates[candidate.canonicalKey] = merged;
  await persist(candidate.tabId);
  return merged;
}

export async function getCandidate(tabId: number, candidateId: string): Promise<MediaCandidate | undefined> {
  const bucket = await getBucket(tabId);
  return Object.values(bucket.candidates).find((c) => c.id === candidateId);
}

export async function findCandidateAnyTab(candidateId: string): Promise<MediaCandidate | undefined> {
  for (const bucket of memory.values()) {
    const found = Object.values(bucket.candidates).find((c) => c.id === candidateId);
    if (found) return found;
  }
  return undefined;
}

export async function listCandidates(tabId: number): Promise<MediaCandidate[]> {
  const bucket = await getBucket(tabId);
  return Object.values(bucket.candidates).sort((a, b) => a.createdAt - b.createdAt);
}

export async function listJobs(tabId: number): Promise<DownloadJob[]> {
  const bucket = await getBucket(tabId);
  return Object.values(bucket.jobs).sort((a, b) => a.createdAt - b.createdAt);
}

export async function upsertJob(tabId: number, job: DownloadJob): Promise<void> {
  const bucket = await getBucket(tabId);
  bucket.jobs[job.id] = job;
  await persist(tabId);
}

export async function getJob(tabId: number, jobId: string): Promise<DownloadJob | undefined> {
  const bucket = await getBucket(tabId);
  return bucket.jobs[jobId];
}

export async function removeJob(tabId: number, jobId: string): Promise<void> {
  const bucket = await getBucket(tabId);
  delete bucket.jobs[jobId];
  await persist(tabId);
}

export function findJobByBrowserDownloadId(
  browserDownloadId: number,
): { tabId: number; jobId: string } | null {
  for (const [tabId, bucket] of memory.entries()) {
    for (const job of Object.values(bucket.jobs)) {
      if (job.browserDownloadId === browserDownloadId) return { tabId, jobId: job.id };
    }
  }
  return null;
}

export async function getPageInfo(tabId: number): Promise<{ pageUrl: string; pageDomain: string }> {
  const bucket = await getBucket(tabId);
  return { pageUrl: bucket.pageUrl, pageDomain: bucket.pageDomain };
}

/** Clear a single tab's data (on navigation or close). */
export async function clearTab(tabId: number): Promise<void> {
  memory.delete(tabId);
  try {
    await chrome.storage.session.remove(sessionKey(tabId));
  } catch (err) {
    logger.warn('clearTab failed', err);
  }
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
