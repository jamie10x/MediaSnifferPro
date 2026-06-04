// MediaSniffer Pro — native companion entry point.
// Started by Chrome via native messaging; speaks the NativeRequest/Response
// protocol over stdio and uses real ffmpeg for heavy/complex stream jobs.

import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { dirname } from 'node:path';
import { startHost } from './native-messaging/host.js';
import { cancelJob, getOutputPath, pauseJob, resumeJob, startJob } from './downloader/job-manager.js';
import { pickFolder } from './system/folder-picker.js';

const VERSION = '0.1.0';

startHost((req, send) => {
  switch (req.type) {
    case 'PING':
      send({ type: 'PONG', requestId: req.requestId, version: VERSION });
      break;
    case 'START_DOWNLOAD':
      startJob(req.job, req.requestId, send);
      break;
    case 'CANCEL_DOWNLOAD':
      cancelJob(req.jobId, send);
      break;
    case 'PAUSE_DOWNLOAD':
      pauseJob(req.jobId);
      break;
    case 'RESUME_DOWNLOAD':
      resumeJob(req.jobId, send);
      break;
    case 'GET_JOB_STATUS':
      // Progress is pushed live; nothing extra to report here.
      break;
    case 'OPEN_OUTPUT_FOLDER': {
      const path = getOutputPath(req.jobId);
      if (path) openFolder(dirname(path));
      break;
    }
    case 'PICK_FOLDER':
      void pickFolder().then((path) => send({ type: 'FOLDER_PICKED', requestId: req.requestId, path }));
      break;
  }
});

function openFolder(dir: string): void {
  const cmd = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'explorer' : 'xdg-open';
  try {
    spawn(cmd, [dir], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    /* ignore */
  }
}
