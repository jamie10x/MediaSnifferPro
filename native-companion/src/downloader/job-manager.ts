// Tracks active jobs and bridges download requests to ffmpeg, emitting native
// responses (accepted / progress / completed / failed).

import { runFfmpeg } from './ffmpeg-runner';
import { assertNotProtected, resolveOutputPath, sanitizeFilename } from '../security/sanitizer';
import type { DownloadJobRequest, NativeResponse } from '../native-messaging/protocol';

interface ActiveJob {
  cancel: () => void;
  outputPath: string;
}

const jobs = new Map<string, ActiveJob>();

export function startJob(req: DownloadJobRequest, send: (res: NativeResponse) => void): void {
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

  send({ type: 'JOB_ACCEPTED', requestId: req.jobId, jobId: req.jobId });

  const handle = runFfmpeg(
    { url: req.url, outputPath, headers: req.headers },
    {
      onProgress: (percent, currentStep) =>
        send({ type: 'JOB_PROGRESS', jobId: req.jobId, progress: { percent, downloadedBytes: 0, currentStep } }),
      onDone: (path) => {
        jobs.delete(req.jobId);
        send({ type: 'JOB_COMPLETED', jobId: req.jobId, outputPath: path });
      },
      onError: (code, message) => {
        jobs.delete(req.jobId);
        send({ type: 'JOB_FAILED', jobId: req.jobId, error: { code, message } });
      },
    },
  );

  jobs.set(req.jobId, { cancel: handle.cancel, outputPath });
}

export function cancelJob(jobId: string, send: (res: NativeResponse) => void): void {
  const job = jobs.get(jobId);
  if (job) {
    job.cancel();
    jobs.delete(jobId);
    send({ type: 'JOB_FAILED', jobId, error: { code: 'cancelled', message: 'Cancelled by user' } });
  }
}

export function getOutputPath(jobId: string): string | undefined {
  return jobs.get(jobId)?.outputPath;
}

function ensureMp4(name: string): string {
  return /\.(mp4|mkv|webm|m4a|mp3)$/i.test(name) ? name : `${name}.mp4`;
}
