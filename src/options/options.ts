import './options.css';
import type { Settings } from '@shared/constants';
import { loadSettings, saveSettings } from '@shared/settings';
import { expandTemplate, type TemplateContext } from '@shared/filename-utils';

const SAMPLE_CTX: TemplateContext = {
  title: "Marvel's Daredevil - S01E11",
  pageTitle: "Marvel's Daredevil - S01E11",
  domain: 'streamzy.to',
  quality: '1080p',
  mediaType: 'hls',
  ext: 'mp4',
  date: new Date().toISOString().slice(0, 10),
};

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
        } else if (el instanceof HTMLInputElement && el.type === 'number') {
          target[key] = Number(el.value) || 0;
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

function updateFilenamePreview(): void {
  const input = document.querySelector<HTMLInputElement>('[data-key="filenameTemplate"]');
  const preview = document.getElementById('filename-preview');
  if (!input || !preview) return;
  const tpl = input.value.trim() || '{title}.{ext}';
  preview.textContent = `Example: ${expandTemplate(tpl, SAMPLE_CTX)}`;
}

async function main(): Promise<void> {
  let settings = await loadSettings();
  fill(settings);
  updateFilenamePreview();
  document.querySelector<HTMLInputElement>('[data-key="filenameTemplate"]')?.addEventListener('input', updateFilenamePreview);

  document.getElementById('pick-folder')!.addEventListener('click', async () => {
    const res = (await chrome.runtime.sendMessage({ type: 'PICK_FOLDER' })) as
      | { type: 'FOLDER_PICKED'; path: string | null }
      | { type: 'ERROR' };
    if (res?.type === 'FOLDER_PICKED' && res.path) {
      const input = document.querySelector<HTMLInputElement>('[data-key="downloadFolder"]')!;
      input.value = res.path;
    }
  });

  document.getElementById('save')!.addEventListener('click', async () => {
    settings = collect(settings);
    await saveSettings(settings);
    const hint = document.getElementById('saved')!;
    hint.textContent = 'Saved ✓';
    setTimeout(() => (hint.textContent = ''), 2000);
  });
}

void main();
