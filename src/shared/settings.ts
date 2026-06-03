// Typed settings persistence. Settings are the ONLY thing stored in
// chrome.storage.local (privacy-first). Per-tab media lives in storage.session.

import { DEFAULT_SETTINGS, STORAGE_KEYS, type Settings } from './constants';

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.settings);
  const value = stored[STORAGE_KEYS.settings] as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...(value ?? {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
}

export async function patchSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const next = { ...current, ...patch };
  await saveSettings(next);
  return next;
}

export function onSettingsChanged(callback: (settings: Settings) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const change = changes[STORAGE_KEYS.settings];
    if (!change) return;
    callback({ ...DEFAULT_SETTINGS, ...(change.newValue as Partial<Settings> | undefined) });
  });
}
