// Tracks active jobs and bridges download requests to ffmpeg, emitting native
// responses (accepted / progress / completed / failed).

import { rmSync } from 'node:fs';
import { runFfmpeg } from './ffmpeg-runner.js';
import { assertNotProtected, resolveOutputPath, sanitizeFilename } from '../security/sanitizer.js';
import type { DownloadJobRequest, NativeResponse } from '../native-messaging/protocol.js';

interface ActiveJob {
  cancel: () => void;
  outputPath: string;
}

const jobs = new Map<string, ActiveJob>();
// Output paths are kept after completion so OPEN_OUTPUT_FOLDER still works.
const outputPaths = new Map<string, string>();

export function startJob(req: DownloadJobRequest, requestId: string, send: (res: NativeResponse) => void): void {
  try {
    assertNotProtected(req.url);
  } catch (err) {
    send({ type: 'JOB_FAILED', jobId: req.jobId, error: { code: 'protected', message: (err as Error).message } });
    return;
  }

  const filename = ensureMp4(sanitizeFilename(req.outputFilename, 'video'));
  let outputPath: string;
  try {
    outputPath = resolveOutputPath(req.outputDirectory, filename);
  } catch (err) {
    send({ type: 'JOB_FAILED', jobId: req.jobId, error: { code: 'bad_output_path', message: (err as Error).message } });
    return;
  }

  // Echo the original request's requestId so the extension's pending call resolves.
  send({ type: 'JOB_ACCEPTED', requestId, jobId: req.jobId });

  const handle = runFfmpeg(
    { url: req.url, outputPath, headers: req.headers },
    {
      onProgress: (p) =>
        send({
          type: 'JOB_PROGRESS',
          jobId: req.jobId,
          progress: {
            percent: p.percent,
            downloadedBytes: p.downloadedBytes,
            speedBytesPerSecond: p.speedBytesPerSecond,
            etaSeconds: p.etaSeconds,
            currentStep: p.currentStep,
          },
        }),
      onDone: (path) => {
        jobs.delete(req.jobId);
        outputPaths.set(req.jobId, path);
        send({ type: 'JOB_COMPLETED', jobId: req.jobId, outputPath: path });
      },
      onError: (code, message) => {
        jobs.delete(req.jobId);
        send({ type: 'JOB_FAILED', jobId: req.jobId, error: { code, message } });
      },
    },
  );

  jobs.set(req.jobId, { cancel: handle.cancel, outputPath });
  outputPaths.set(req.jobId, outputPath);
}

export function cancelJob(jobId: string, send: (res: NativeResponse) => void): void {
  const job = jobs.get(jobId);
  if (job) {
    job.cancel();
    jobs.delete(jobId);
    // Remove the partial (unfinalized) output file.
    try {
      rmSync(job.outputPath, { force: true });
    } catch {
      /* ignore */
    }
    send({ type: 'JOB_FAILED', jobId, error: { code: 'cancelled', message: 'Cancelled by user' } });
  }
}

export function getOutputPath(jobId: string): string | undefined {
  return jobs.get(jobId)?.outputPath ?? outputPaths.get(jobId);
}

function ensureMp4(name: string): string {
  return /\.(mp4|mkv|webm|m4a|mp3)$/i.test(name) ? name : `${name}.mp4`;
}
