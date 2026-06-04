// Registers the native messaging host manifest with installed Chromium browsers.
//
// Usage:  node dist/install/register-host.js <EXTENSION_ID>
//
// The extension ID is shown at chrome://extensions (or brave://extensions) with
// Developer mode on. It's required so only this extension can launch the host.

import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST_NAME = 'com.mediasniffer.pro.companion';

function nativeHostDirs(): string[] {
  const home = homedir();
  if (platform() === 'darwin') {
    const base = join(home, 'Library', 'Application Support');
    return [
      join(base, 'Google', 'Chrome', 'NativeMessagingHosts'),
      join(base, 'BraveSoftware', 'Brave-Browser', 'NativeMessagingHosts'),
      join(base, 'Chromium', 'NativeMessagingHosts'),
    ];
  }
  // Linux
  const cfg = join(home, '.config');
  return [
    join(cfg, 'google-chrome', 'NativeMessagingHosts'),
    join(cfg, 'BraveSoftware', 'Brave-Browser', 'NativeMessagingHosts'),
    join(cfg, 'chromium', 'NativeMessagingHosts'),
  ];
}

function main(): void {
  const extensionId = process.argv[2];
  if (!extensionId || !/^[a-p]{32}$/.test(extensionId)) {
    console.error('Usage: node dist/install/register-host.js <EXTENSION_ID>');
    console.error('Find the ID at brave://extensions or chrome://extensions (Developer mode).');
    process.exit(1);
  }

  if (platform() === 'win32') {
    console.error('Windows: register the host manifest under the registry key');
    console.error(`HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}. See README.`);
    process.exit(1);
  }

  const distDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const mainJs = join(distDir, 'main.js');

  // Chrome runs an executable, not a .js — write a launcher and point at it.
  const launcher = join(distDir, 'run.sh');
  writeFileSync(launcher, `#!/usr/bin/env bash\nexec "$(command -v node)" "${mainJs}" "$@"\n`, 'utf8');
  chmodSync(launcher, 0o755);

  const manifest = {
    name: HOST_NAME,
    description: 'MediaSniffer Pro native companion',
    path: launcher,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${extensionId}/`],
  };

  for (const dir of nativeHostDirs()) {
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${HOST_NAME}.json`), JSON.stringify(manifest, null, 2), 'utf8');
      console.log('registered:', join(dir, `${HOST_NAME}.json`));
    } catch (err) {
      console.warn('skip', dir, (err as Error).message);
    }
  }
  console.log('\nDone. Fully quit and reopen your browser, then test the helper from the popup.');
}

main();
