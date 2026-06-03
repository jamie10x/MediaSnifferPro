// Privacy-aware logger. Off by default; gated by the debugLogs setting. All
// string arguments are redacted before they reach the console.

import { redactString } from './privacy-utils';

let debugEnabled = false;

export function setDebugLogging(enabled: boolean): void {
  debugEnabled = enabled;
}

function redactArg(arg: unknown): unknown {
  if (typeof arg === 'string') return redactString(arg);
  return arg;
}

export const logger = {
  debug(...args: unknown[]): void {
    if (!debugEnabled) return;
    console.debug('[MSP]', ...args.map(redactArg));
  },
  info(...args: unknown[]): void {
    if (!debugEnabled) return;
    console.info('[MSP]', ...args.map(redactArg));
  },
  warn(...args: unknown[]): void {
    console.warn('[MSP]', ...args.map(redactArg));
  },
  error(...args: unknown[]): void {
    console.error('[MSP]', ...args.map(redactArg));
  },
};
