import './options.css';
import type { Settings } from '@shared/constants';
import { loadSettings, saveSettings } from '@shared/settings';

type El = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const inputs = Array.from(document.querySelectorAll<El>('[data-key]'));

function fill(settings: Settings): void {
  for (const el of inputs) {
    const key = el.dataset.key!;
    switch (key) {
      case 'minFileSizeKb':
        (el as HTMLInputElement).value = String(Math.round(settings.minFileSizeBytes / 1024));
        break;
      case 'streamConcurrency':
        (el as HTMLInputElement).value = String(settings.streamConcurrency);
        break;
      case 'allowlist':
        (el as HTMLTextAreaElement).value = settings.allowlist.join('\n');
        break;
      case 'blocklist':
        (el as HTMLTextAreaElement).value = settings.blocklist.join('\n');
        break;
      default: {
        const value = (settings as unknown as Record<string, unknown>)[key];
        if (el instanceof HTMLInputElement && el.type === 'checkbox') {
          el.checked = Boolean(value);
        } else if (value !== undefined) {
          el.value = String(value);
        }
      }
    }
  }
}

function collect(base: Settings): Settings {
  const next: Settings = { ...base };
  for (const el of inputs) {
    const key = el.dataset.key!;
    switch (key) {
      case 'minFileSizeKb':
        next.minFileSizeBytes = Math.max(0, parseInt((el as HTMLInputElement).value, 10) || 0) * 1024;
        break;
      case 'streamConcurrency':
        next.streamConcurrency = Math.max(1, Math.min(12, parseInt((el as HTMLInputElement).value, 10) || 6));
        break;
      case 'allowlist':
        next.allowlist = splitLines((el as HTMLTextAreaElement).value);
        break;
      case 'blocklist':
        next.blocklist = splitLines((el as HTMLTextAreaElement).value);
        break;
      default: {
        const target = next as unknown as Record<string, unknown>;
        if (el instanceof HTMLInputElement && el.type === 'checkbox') {
          target[key] = el.checked;
        } else {
          target[key] = el.value;
        }
      }
    }
  }
  return next;
}

function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  let settings = await loadSettings();
  fill(settings);

  document.getElementById('save')!.addEventListener('click', async () => {
    settings = collect(settings);
    await saveSettings(settings);
    const hint = document.getElementById('saved')!;
    hint.textContent = 'Saved ✓';
    setTimeout(() => (hint.textContent = ''), 2000);
  });
}

void main();
