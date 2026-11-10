// Ambient declarations for the Violentmonkey/Greasemonkey sandbox API.
// Nothing here is emitted -- this file only teaches the editor about globals
// that exist at runtime because src/header.txt grants them.

declare function GM_getValue<T = any>(key: string, defaultValue?: T): T;
declare function GM_setValue(key: string, value: any): void;
declare function GM_deleteValue(key: string): void;
declare function GM_listValues(): string[];
declare function GM_xmlhttpRequest(details: {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  data?: string;
  timeout?: number;
  responseType?: string;
  onload?: (response: { status: number; statusText: string; responseText: string; response: any; finalUrl: string }) => void;
  onerror?: (response: { error: string }) => void;
  ontimeout?: () => void;
  onabort?: () => void;
}): { abort(): void };

declare const GM_info: {
  script: {
    name: string;
    version: string;
    description: string;
    author: string;
    [key: string]: any;
  };
  scriptHandler: string;
  version: string;
};

declare const unsafeWindow: Window & typeof globalThis;
