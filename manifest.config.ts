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
  // Pins a stable extension ID (pjfhilpldfmeaibbhbcfnnkhcdbkbfnf) across dev/prod
  // loads and reloads, so the native-messaging host registration always matches.
  // This is the PUBLIC key; the private key lives in .keys/ (gitignored).
  key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAy3q60sOijXJhdXeR1XCui5jLg7l9VW6ZDMsQWf0nkd6E9ROlce7gGBfFjx0IjLkqkVZfo/obsamH+S9eA4AyhWo1MrGXjhCGS30169pZyuRhl/WnfHvqZemnUcqnnMYRrhYnRebpE/3m3Ll7fepQZH3A6YnJB+VXTEGcJ6POkj6YBElweLJ+d9gQ+xbzHrb/cUZbxLFvwUGrgPfid34/JqCO+R0DV86T+Fs7I2Ska/EX329xuJylwvMdx6jl4ZslpnrHXDt4khizzTRvajlq7Jb76uE5ltu2AAIZmu5aoqChQXZs60t5qXxDhXhtf8EFHtEA/qKx3TTDIjpOL59sNQIDAQAB',
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
