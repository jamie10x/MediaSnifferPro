// Final assembly: concatenate downloaded segments into a single playable MP4.
//   - TS segments  -> ffmpeg concat demuxer (-c copy, ADTS->ASC bitstream fix).
//   - fMP4 (m4s)   -> binary-concat init+fragments, then ffmpeg remux for faststart.

import { spawn } from 'node:child_process';
import { writeFileSync, createWriteStream, createReadStream, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { FFMPEG } from './ffmpeg-path.js';

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let tail = '';
    p.stderr?.on('data', (c: Buffer) => (tail = (tail + c.toString()).slice(-2000)));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${tail.split('\n').slice(-3).join(' ')}`))));
    p.on('error', (e) => reject(e));
  });
}

function appendFile(src: string, dest: NodeJS.WritableStream): Promise<void> {
  return new Promise((resolve, reject) => {
    const rs = createReadStream(src);
    rs.on('error', reject);
    rs.on('end', resolve);
    rs.pipe(dest, { end: false });
  });
}

/** Ordered segment file paths in tempDir (seg_00000.* …). */
function orderedSegmentFiles(tempDir: string): string[] {
  return readdirSync(tempDir)
    .filter((f) => f.startsWith('seg_'))
    .sort()
    .map((f) => join(tempDir, f));
}

export async function assembleMp4(opts: {
  tempDir: string;
  outputPath: string;
  isFmp4: boolean;
  initPath?: string;
}): Promise<void> {
  mkdirSync(dirname(opts.outputPath), { recursive: true });
  const segFiles = orderedSegmentFiles(opts.tempDir);

  if (opts.isFmp4) {
    // Binary-concat init + fragments into one file, then remux for a clean MP4.
    const combined = join(opts.tempDir, 'combined.mp4');
    const out = createWriteStream(combined);
    if (opts.initPath) await appendFile(opts.initPath, out);
    for (const f of segFiles) await appendFile(f, out);
    await new Promise<void>((res) => out.end(res));
    await runFfmpeg(['-y', '-i', combined, '-c', 'copy', '-movflags', '+faststart', opts.outputPath]);
    return;
  }

  // TS: concat demuxer over a list file.
  const listPath = join(opts.tempDir, 'concat.txt');
  writeFileSync(listPath, segFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');
  await runFfmpeg([
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-c', 'copy',
    '-bsf:a', 'aac_adtstoasc',
    '-movflags', '+faststart',
    opts.outputPath,
  ]);
}
