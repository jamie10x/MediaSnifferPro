// Zips the built dist/ folder for Chrome Web Store upload.
import { createWriteStream } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const dist = 'dist';
const out = 'media-sniffer-pro.zip';

if (!existsSync(dist)) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

// Use the system `zip` tool (available on macOS/Linux) for a clean archive.
try {
  execFileSync('zip', ['-r', '-q', `../${out}`, '.'], { cwd: dist, stdio: 'inherit' });
  console.log(`Created ${out}`);
} catch (err) {
  console.error('Failed to zip dist/. Is the `zip` CLI installed?', err.message);
  process.exit(1);
}

void createWriteStream;
