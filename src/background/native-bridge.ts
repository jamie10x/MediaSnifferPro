// Native messaging bridge to the (future) desktop companion.
//
// The protocol is fully typed and frozen now so the extension code is final; the
// companion app itself is built in a later phase. Until it is installed,
// connectNative() fails and we report `installed: false` to the UI.

import { NATIVE_HOST_NAME } from '@shared/constants';
import { logger } from '@shared/logger';
import type {
  NativeRequest,
  NativeResponse,
  NativeStatus,
} from '@shared/message-types';

type ProgressHandler = (msg: Extract<NativeResponse, { type: 'JOB_PROGRESS' | 'JOB_COMPLETED' | 'JOB_FAILED' }>) => void;

let port: chrome.runtime.Port | null = null;
const pending = new Map<string, (res: NativeResponse) => void>();
let progressHandler: ProgressHandler | null = null;

function connect(): chrome.runtime.Port | null {
  if (port) return port;
  try {
    port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
  } catch (err) {
    logger.debug('native connect threw', err);
    return null;
  }
  port.onMessage.addListener((raw) => {
    const msg = raw as NativeResponse;
    if ('requestId' in msg && pending.has(msg.requestId)) {
      pending.get(msg.requestId)!(msg);
      pending.delete(msg.requestId);
    } else if (msg.type === 'JOB_PROGRESS' || msg.type === 'JOB_COMPLETED' || msg.type === 'JOB_FAILED') {
      progressHandler?.(msg);
    }
  });
  port.onDisconnect.addListener(() => {
    logger.debug('native disconnected', chrome.runtime.lastError?.message);
    port = null;
    pending.clear();
  });
  return port;
}

export function setProgressHandler(handler: ProgressHandler): void {
  progressHandler = handler;
}

function send(req: NativeRequest, timeoutMs = 4000): Promise<NativeResponse> {
  return new Promise((resolve, reject) => {
    const p = connect();
    if (!p) {
      reject(new Error('native_host_unavailable'));
      return;
    }
    const requestId = 'requestId' in req ? req.requestId : '';
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error('native_timeout'));
    }, timeoutMs);
    pending.set(requestId, (res) => {
      clearTimeout(timer);
      resolve(res);
    });
    try {
      p.postMessage(req);
    } catch (err) {
      clearTimeout(timer);
      pending.delete(requestId);
      reject(err instanceof Error ? err : new Error('native_send_failed'));
    }
  });
}

let cachedStatus: NativeStatus | null = null;

export async function getNativeStatus(force = false): Promise<NativeStatus> {
  if (cachedStatus && !force) return cachedStatus;
  try {
    const res = await send({ type: 'PING', requestId: crypto.randomUUID() });
    if (res.type === 'PONG') {
      cachedStatus = { installed: true, version: res.version };
      return cachedStatus;
    }
    cachedStatus = { installed: false, reason: 'unexpected_response' };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown';
    cachedStatus = {
      installed: false,
      reason: reason === 'native_host_unavailable' ? 'not_installed' : reason,
    };
  }
  return cachedStatus;
}

export async function startNativeDownload(
  job: Extract<NativeRequest, { type: 'START_DOWNLOAD' }>['job'],
): Promise<{ accepted: boolean; jobId?: string; error?: string }> {
  try {
    const res = await send({ type: 'START_DOWNLOAD', requestId: crypto.randomUUID(), job });
    if (res.type === 'JOB_ACCEPTED') return { accepted: true, jobId: res.jobId };
    return { accepted: false, error: 'rejected' };
  } catch (err) {
    return { accepted: false, error: err instanceof Error ? err.message : 'unknown' };
  }
}

export async function cancelNativeDownload(jobId: string): Promise<void> {
  try {
    await send({ type: 'CANCEL_DOWNLOAD', requestId: crypto.randomUUID(), jobId });
  } catch (err) {
    logger.debug('cancelNativeDownload failed', err);
  }
}

export function openOutputFolder(jobId: string): void {
  // Fire-and-forget; the host opens the OS file manager, no response expected.
  try {
    const p = connect();
    p?.postMessage({ type: 'OPEN_OUTPUT_FOLDER', requestId: crypto.randomUUID(), jobId });
  } catch (err) {
    logger.debug('openOutputFolder failed', err);
  }
}

export async function pickFolder(): Promise<string | null> {
  try {
    const res = await send({ type: 'PICK_FOLDER', requestId: crypto.randomUUID() }, 120_000);
    return res.type === 'FOLDER_PICKED' ? res.path : null;
  } catch (err) {
    logger.debug('pickFolder failed', err);
    return null;
  }
}
