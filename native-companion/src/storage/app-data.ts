// App data directory for job state and temporary segment files.

import { homedir, platform, tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

export function appDataDir(): string {
  const home = homedir();
  let base: string;
  if (platform() === 'darwin') base = join(home, 'Library', 'Application Support', 'MediaSnifferPro');
  else if (platform() === 'win32') base = join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'MediaSnifferPro');
  else base = join(process.env.XDG_DATA_HOME ?? join(home, '.local', 'share'), 'MediaSnifferPro');
  mkdirSync(base, { recursive: true });
  return base;
}

export function jobsDir(): string {
  const dir = join(appDataDir(), 'jobs');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function segmentsDir(jobId: string): string {
  // Temp segment files live under the OS temp dir to avoid cluttering app data.
  const dir = join(tmpdir(), 'media-sniffer-pro', jobId);
  mkdirSync(dir, { recursive: true });
  return dir;
}
