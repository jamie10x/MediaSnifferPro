// Opens a native OS "choose folder" dialog and returns the selected path, or
// null if the user cancelled / no dialog tool is available.

import { execFile } from 'node:child_process';
import { platform } from 'node:os';

export function pickFolder(): Promise<string | null> {
  return new Promise((resolve) => {
    if (platform() === 'darwin') {
      execFile(
        'osascript',
        ['-e', 'POSIX path of (choose folder with prompt "Choose a download folder")'],
        (err, stdout) => resolve(err ? null : stdout.trim() || null),
      );
    } else if (platform() === 'linux') {
      execFile('zenity', ['--file-selection', '--directory'], (err, stdout) =>
        resolve(err ? null : stdout.trim() || null),
      );
    } else {
      resolve(null);
    }
  });
}
