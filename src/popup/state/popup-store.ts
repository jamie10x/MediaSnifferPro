// Lightweight popup state container. Connects a long-lived port to the background
// for live candidate/job pushes and exposes a tiny subscribe API.

import {
  POPUP_PORT,
  type NativeStatus,
  type PushMessage,
  type TabState,
  type UiRequest,
  type UiResponse,
} from '@shared/message-types';

export interface PopupState {
  tab: TabState | null;
  native: NativeStatus | null;
  loading: boolean;
}

type Listener = (state: PopupState) => void;

class PopupStore {
  private state: PopupState = { tab: null, native: null, loading: true };
  private listeners = new Set<Listener>();
  private port: chrome.runtime.Port | null = null;
  private tabId: number | null = null;

  private historyListeners = new Set<() => void>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  onHistoryChanged(cb: () => void): void {
    this.historyListeners.add(cb);
  }

  private set(patch: Partial<PopupState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  async init(): Promise<void> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    this.tabId = tab?.id ?? null;
    if (this.tabId == null) {
      this.set({ loading: false });
      return;
    }

    const res = await this.request({ type: 'GET_STATE', tabId: this.tabId });
    if (res.type === 'STATE') {
      this.set({ tab: res.state, native: res.native, loading: false });
    } else {
      this.set({ loading: false });
    }

    this.port = chrome.runtime.connect({ name: POPUP_PORT });
    this.port.postMessage({ type: 'WATCH', tabId: this.tabId });
    this.port.onMessage.addListener((msg: PushMessage) => this.onPush(msg));
  }

  private onPush(msg: PushMessage): void {
    if (msg.type === 'STATE_UPDATED') {
      if (msg.state.tabId === this.tabId) this.set({ tab: msg.state });
    } else if (msg.type === 'HISTORY_UPDATED') {
      this.historyListeners.forEach((cb) => cb());
    } else if (msg.type === 'NATIVE_STATUS') {
      this.set({ native: msg.native });
    } else if (msg.type === 'JOB_UPDATED' && this.state.tab) {
      const jobs = this.state.tab.jobs.filter((j) => j.id !== msg.job.id);
      jobs.push(msg.job);
      this.set({ tab: { ...this.state.tab, jobs } });
    }
  }

  request(req: UiRequest): Promise<UiResponse> {
    return chrome.runtime.sendMessage(req) as Promise<UiResponse>;
  }

  rescan(): void {
    if (this.tabId != null) void this.request({ type: 'RESCAN', tabId: this.tabId });
  }

  getTabId(): number | null {
    return this.tabId;
  }
}

export const popupStore = new PopupStore();
