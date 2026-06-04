// Native messaging host: reads length-prefixed requests from stdin, dispatches,
// and writes responses to stdout. Validates every message; ignores unknowns.

import { MessageDecoder, encodeMessage, type NativeRequest, type NativeResponse } from './protocol.js';

export type RequestHandler = (req: NativeRequest, send: (res: NativeResponse) => void) => void;

export function startHost(handler: RequestHandler): void {
  const decoder = new MessageDecoder();
  const send = (res: NativeResponse): void => {
    process.stdout.write(encodeMessage(res));
  };

  process.stdin.on('data', (chunk: Buffer) => {
    let requests: NativeRequest[];
    try {
      requests = decoder.push(chunk);
    } catch {
      // Malformed framing — drop the connection cleanly.
      process.exit(1);
    }
    for (const req of requests) {
      if (!isValidRequest(req)) continue;
      try {
        handler(req, send);
      } catch (err) {
        // Never crash on a single bad job.
        if ('jobId' in req && typeof (req as { jobId?: unknown }).jobId === 'string') {
          send({
            type: 'JOB_FAILED',
            jobId: (req as { jobId: string }).jobId,
            error: { code: 'handler_error', message: err instanceof Error ? err.message : 'unknown' },
          });
        }
      }
    }
  });

  // When Chrome closes the port, stdin ends — exit so we don't linger.
  process.stdin.on('end', () => process.exit(0));
}

function isValidRequest(req: unknown): req is NativeRequest {
  if (!req || typeof req !== 'object') return false;
  const type = (req as { type?: unknown }).type;
  return (
    type === 'PING' ||
    type === 'START_DOWNLOAD' ||
    type === 'CANCEL_DOWNLOAD' ||
    type === 'PAUSE_DOWNLOAD' ||
    type === 'RESUME_DOWNLOAD' ||
    type === 'GET_JOB_STATUS' ||
    type === 'OPEN_OUTPUT_FOLDER' ||
    type === 'PICK_FOLDER'
  );
}
