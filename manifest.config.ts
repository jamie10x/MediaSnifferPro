import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

// MV3 manifest. host_permissions <all_urls> + webRequest powers network detection
// for the personal build. Before Chrome Web Store submission we narrow this to
// activeTab + optional host permissions (see STORE_COMPLIANCE.md).
export default defineManifest({
  manifest_version: 3,
  name: 'MediaSniffer Pro',
  version: pkg.version,
  description: 'Detect and download media files available on the current page.',
  minimum_chrome_version: '116',
  permissions: [
    'downloads',
    'storage',
    'activeTab',
    'scripting',
    'webRequest',
    'webNavigation',
    'nativeMessaging',
    'notifications',
    'offscreen',
  ],
  optional_permissions: ['tabs'],
  host_permissions: ['<all_urls>'],
  // wasm-unsafe-eval is required for the (flagged) ffmpeg.wasm fallback engine,
  // which is packaged locally — never loaded from a remote URL.
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  action: {
    default_title: 'MediaSniffer Pro',
    default_popup: 'src/popup/popup.html',
  },
  options_page: 'src/options/options.html',
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/content-script.ts'],
      run_at: 'document_idle',
      all_frames: true,
    },
  ],
  icons: {
    16: 'public/icons/icon16.png',
    32: 'public/icons/icon32.png',
    48: 'public/icons/icon48.png',
    128: 'public/icons/icon128.png',
  },
});
