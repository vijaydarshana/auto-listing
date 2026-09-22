import type { CapturedField, Profile } from './types';

interface ChromeMessage {
type:
  | 'START_CAPTURE'
  | 'STOP_CAPTURE'
  | 'STOP_AUTOFILL'
  | 'APPLY_CAPTURE'
  | 'AUTOFILL'
  | 'CAPTURE_UPDATE'
  | 'CAPTURE_COMPLETE'
  | 'AUTOFILL_COMPLETE'
  | 'FORWARD_TO_PAGE';
  fields?: CapturedField[];
  profile?: Profile;
  selectedSize?: string;
  tabId?: number;
  payload?: ChromeMessage;
  successCount?: number;
  totalCount?: number;
  success?: boolean;
  response?: {
    success?: boolean;
    fields?: CapturedField[];
    error?: string;
  };
  error?: string;
}

interface ChromeMessageResponse {
  success?: boolean;
  error?: string;
  fields?: CapturedField[];
  response?: {
    success?: boolean;
    fields?: CapturedField[];
    error?: string;
  };
}

interface ChromeStorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

interface ChromeTab {
  id?: number;
  url?: string;
}

interface ChromeStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

declare global {
  type ExtensionMessage = ChromeMessage;
  type ExtensionResponse = ChromeMessageResponse;
  type ChromeStorageChange = {
    oldValue?: unknown;
    newValue?: unknown;
  };

  const chrome: {
    runtime: {
      onMessage: {
        addListener(
          listener: (
            message: ChromeMessage,
            sender: { id?: string; url?: string },
            sendResponse: (response?: unknown) => void,
          ) => boolean | void,
        ): void;
        removeListener(
          listener: (
            message: ChromeMessage,
            sender: { id?: string; url?: string },
            sendResponse: (response?: unknown) => void,
          ) => boolean | void,
        ): void;
      };
      onInstalled: { addListener(listener: () => void): void };
      sendMessage(message: ChromeMessage): Promise<ChromeMessageResponse>;
      lastError?: { message?: string };
    };
    storage: {
      local: ChromeStorageArea;
      onChanged: {
        addListener(
          listener: (changes: Record<string, ChromeStorageChange>, areaName: string) => void,
        ): void;
        removeListener(
          listener: (changes: Record<string, ChromeStorageChange>, areaName: string) => void,
        ): void;
      };
    };
    tabs: {
      query(options: { active: boolean; currentWindow: boolean }): Promise<ChromeTab[]>;
      sendMessage(tabId: number, message: ChromeMessage): Promise<ChromeMessageResponse>;
    };
    action: {
      onClicked: { addListener(listener: (tab: ChromeTab) => void | Promise<void>): void };
    };
    sidePanel: { open(options: { tabId: number }): Promise<void> };
  };
}

export {};
