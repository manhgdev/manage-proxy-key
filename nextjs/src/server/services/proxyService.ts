import { dbService } from '@server/database';
import { KeyResponse, ProxyData } from '@/types/api';

// Declare process for Node.js environment
declare const process: { pid: number };

// Default fallback if a key doesn't have a custom URL saved
const DEFAULT_PROXY_API_URL = 'https://api.proxyxoay.org//api/key_xoay.php?key=';

export class ProxyService {
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private processing: Map<string, boolean> = new Map();
  private isAutoRunning: boolean;
  private isInitialized: boolean;
  private static instance: ProxyService | null = null;
  private isProcessingAutoRun: boolean = false;
  private static isAutoRunEnabled: boolean = false;
  private static isInitializing: boolean = false;
  private static currentProcessId: number | null = null;
  private static processLock: boolean = false;
  private static initializePromise: Promise<void> | null = null;

  private constructor() {
    this.isAutoRunning = false;
    this.isInitialized = false;
  }

  public static async getInstance(): Promise<ProxyService> {
    if (!ProxyService.instance) {
      if (!ProxyService.isInitializing) {
        ProxyService.isInitializing = true;
        ProxyService.instance = new ProxyService();
        ProxyService.initializePromise = ProxyService.instance.initialize();
        await ProxyService.initializePromise;
        ProxyService.isInitializing = false;
      } else {
        // Đợi cho đến khi instance được khởi tạo xong
        while (!ProxyService.instance) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }
    return ProxyService.instance;
  }

  private async initialize() {
    if (this.isInitialized) return;
    
    try {
      await this._getAutoRunStatus();

      if (this.isAutoRunning) {
        if (ProxyService.currentProcessId && ProxyService.currentProcessId !== process.pid) {
          this.isAutoRunning = false;
          ProxyService.isAutoRunEnabled = false;
          await dbService.setAutoRunStatus(false);
        } else {
          ProxyService.currentProcessId = process.pid;
          await this.initializeTimers();
        }
      }
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize ProxyService:', error instanceof Error ? error.message : String(error));
      // Don't crash, mark as initialized anyway
      this.isInitialized = true;
    }
  }

  private async ensureInitialized() {
    if (!this.isInitialized && ProxyService.initializePromise) {
      await ProxyService.initializePromise;
    }
  }

  public async _getAutoRunStatus() {
    const dbAutoRunStatus = await dbService.getAutoRunStatus();
    this.isAutoRunning = dbAutoRunStatus;
    ProxyService.isAutoRunEnabled = dbAutoRunStatus;
  }

  private async acquireProcessLock(): Promise<boolean> {
    if (ProxyService.processLock) {
      return false;
    }
    ProxyService.processLock = true;
    return true;
  }

  private releaseProcessLock() {
    ProxyService.processLock = false;
  }

  private log(key: KeyResponse | null, message: string, data?: any) {
    const now = new Date().toTimeString().split(' ')[0];
    const keyInfo = key ? `Key ${key.key}` : '';
    const color = this.getLogColor(message);
    console.log(`[${now}] ${keyInfo}] ${color}${message}\x1b[0m`, data ? JSON.stringify(data, null, 2) : '');
  }

  private getLogColor(message: string): string {
    if (message.includes('Fetch completed')) return '\x1b[32m';
    if (message.includes('Fetch failed')) return '\x1b[31m';
    if (message.includes('Timer scheduled')) return '\x1b[36m';
    if (message.includes('Timer aborted')) return '\x1b[33m';
    if (message.includes('Starting fetch')) return '\x1b[35m';
    return '\x1b[37m';
  }

  private async initializeTimers() {
    if (!this.isAutoRunning) return;
    
    this.stopAllTimers();

    try {
      const keys = await dbService.getKeys();
      for (const key of keys) {
        if (key.isActive && !this.timers.has(key.id)) {
          this.startTimer(key);
        }
      }
    } catch (error) {
      console.error('Failed to initialize timers:', error);
    }
  }

  private async fetchProxyData(key: KeyResponse): Promise<number> {
    const startTime = Date.now();

    try {
      const requestUrl = this.buildRequestUrl(key);
      this.log(key, `🔄 Starting fetch: ${requestUrl}`);
      
      let response: Response | null = null;
      try {
        response = await fetch(requestUrl, { 
          signal: AbortSignal.timeout(30000)
        });
      } catch {
        this.log(key, `❌ Fetch failed: Network error`);
        return 0;
      }
      
      if (!response || !response.ok) {
        this.log(key, `❌ Fetch failed: HTTP ${response?.status || 'no response'}`);
        return 0;
      }

      // Check content-type to avoid parsing binary data
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json') && !contentType.includes('text/')) {
        this.log(key, `❌ Invalid content-type: ${contentType.slice(0, 50)}`);
        return 0;
      }

      let responseText = '';
      try {
        responseText = await response.text();
      } catch {
        this.log(key, '❌ Failed to read response');
        return 0;
      }

      if (!responseText) {
        this.log(key, '❌ Empty response');
        return 0;
      }

      // Check if response looks like JSON before parsing
      const trimmed = responseText.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        this.log(key, `❌ Response is not JSON`);
        return 0;
      }

      // Limit response size to prevent stack overflow
      if (responseText.length > 100000) {
        this.log(key, `❌ Response too large: ${responseText.length} bytes`);
        return 0;
      }
      
      let data: ProxyData;
      try {
        data = JSON.parse(responseText);
      } catch {
        this.log(key, `❌ Invalid JSON response`);
        return 0;
      }

      // Handle deactivation
      if (data?.error == "invalid_key" || data?.status === 102 || data?.message === "Key không tồn tại") {
        this.log(key, `⚠️ Key deactivated: ${data.message || data.error}`);
        await dbService.updateKey({
          ...key,
          isActive: false,
          proxyData: data,
          lastRotatedAt: new Date().toISOString()
        });
        this.stopKey(key.id);
        return Date.now() - startTime;
      }

      // Update proxy data
      await dbService.updateKey({
        ...key,
        proxyData: data.status === 101 || data?.error === "too_many_requests"
          ? { 
              ...data,
              ...key.proxyData, 
              message: data.message, 
              status: data.status 
            }
          : data,
        lastRotatedAt: data.status !== 101 ? new Date().toISOString() : key.lastRotatedAt
      });

      // Log successful fetch
      const fetchTime = Date.now() - startTime;
      if (data.status === 101 || data?.error === "too_many_requests") {
        this.log(key, `⏳ Too many requests, waiting... (${fetchTime}ms)`);
      } else {
        const proxyInfo = data.proxyhttp || data.proxysocks5 || 'N/A';
        this.log(key, `✅ Fetch completed: ${proxyInfo} (${fetchTime}ms)`);
      }

      return fetchTime;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.log(key, `❌ Error: ${msg.slice(0, 100)}`);
      return 0;
    }
  }

  // Build the request URL using the key's custom base URL when available.
  // Supports patterns:
  // - URL contains {KEY} or {key} -> will be replaced by the actual key (url-encoded)
  // - URL without placeholder -> will add/override query param `key=<value>`
  // - Missing/invalid URL -> fallback to DEFAULT_PROXY_API_URL
  private buildRequestUrl(key: KeyResponse): string {
    const base = (key.url && key.url.trim().length > 0) ? key.url.trim() : DEFAULT_PROXY_API_URL;

    // Replace placeholder if provided
    if (base.includes('{KEY}') || base.includes('{key}')) {
      return base.replaceAll('{KEY}', encodeURIComponent(key.key)).replaceAll('{key}', encodeURIComponent(key.key));
    }

    // Try to manipulate via URL API to avoid duplicate params
    try {
      const urlObj = new URL(base);
      urlObj.searchParams.set('key', key.key);
      return urlObj.toString();
    } catch {
      // Fallback for non-standard base; simply concatenate
      const joiner = base.includes('?') ? (base.endsWith('&') || base.endsWith('?') ? '' : (base.endsWith('=') ? '' : '&')) : '?';
      const maybeEq = base.endsWith('=') ? '' : 'key=';
      return `${base}${joiner}${maybeEq}${encodeURIComponent(key.key)}`;
    }
  }

  private async startTimer(dataKey: KeyResponse) {
    if (this.processing.get(dataKey.id)) {
      this.log(dataKey, 'StartTimer skipped due to processing lock');
      return;
    }
    if (this.timers.has(dataKey.id)) {
      this.log(dataKey, 'Timer already exists, skipping start');
      return;
    }

    if (!dataKey || !dataKey.isActive) {
      this.log(dataKey, 'Key not found or inactive, stopping timer');
      this.stopKey(dataKey.id);
      return;
    }
    
    const lastRotatedAt = new Date(dataKey.lastRotatedAt).getTime();
    const intervalMs = dataKey.rotationInterval * 1000;
    const now = Date.now();
    
    let nextDelay = intervalMs - (now - lastRotatedAt);
    // If no proxy data yet, fetch immediately on first run
    if (!dataKey.proxyData) {
      nextDelay = 0;
    }
    if (nextDelay < 0) nextDelay = 0;

    this.startTimerWithDelay(dataKey, nextDelay);
  }

  private startTimerWithDelay(dataKey: KeyResponse, delay: number) {
    if (!this.isAutoRunning) {
      this.stopTimer(dataKey.id);
      return;
    }

    this.stopTimer(dataKey.id);
    
    const timer = setTimeout(async () => {
      try {
        this.timers.delete(dataKey.id);
        if (!this.isAutoRunning || this.processing.get(dataKey.id)) return;

        this.processing.set(dataKey.id, true);

        try {
          if (!dataKey?.isActive) {
            this.stopKey(dataKey.id);
            return;
          }

          const fetchTime = await this.fetchProxyData(dataKey);
          const nextDelay = dataKey.rotationInterval * 1000 + fetchTime;
          this.startTimerWithDelay(dataKey, nextDelay);
        } finally {
          this.processing.delete(dataKey.id);
        }
      } catch (error) {
        console.error('[TIMER ERROR]', error instanceof Error ? error.message : String(error));
      }
    }, delay);

    this.timers.set(dataKey.id, timer);
  }

  private stopTimer(keyId: string) {
    const timer = this.timers.get(keyId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(keyId);
      this.processing.delete(keyId);
    }
  }

  private stopAllTimers() {
    this.timers.forEach((timer, keyId) => {
      clearTimeout(timer);
      this.processing.delete(keyId);
    });
    this.timers.clear();
    this.processing.clear();
  }

  public startKey(key: KeyResponse) {
    if (!this.isAutoRunning) return;
    if (this.processing.get(key.id)) return;
    if (this.timers.has(key.id)) return;
    this.startTimer(key);
  }

  public stopKey(keyId: string) {
    this.log(null, `🛑 Stopping key ${keyId}`);
    const timer = this.timers.get(keyId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(keyId);
    }
    this.processing.delete(keyId);
  }

  public async freshTimerKey(key: KeyResponse) {
    await this.ensureInitialized();
    this.stopKey(key.id);
    if (!this.isAutoRunning) return;
    
    const freshKey = await dbService.getKeyById(key.id);
    if (freshKey?.isActive) {
      this.startTimer(freshKey);
    }
  }

  public async toggleAutoRun() {
    await this.ensureInitialized();
    if (!await this.acquireProcessLock()) {
      this.log(null, 'Another process is already running');
      return this.isAutoRunning;
    }

    try {
      const oldStatus = this.isAutoRunning;
      
      if (!oldStatus) {
        if (ProxyService.currentProcessId && ProxyService.currentProcessId !== process.pid) {
          this.log(null, `Another process (${ProxyService.currentProcessId}) is already running`);
          return false;
        }
        ProxyService.currentProcessId = process.pid;
      }

      this.isAutoRunning = !oldStatus;
      ProxyService.isAutoRunEnabled = this.isAutoRunning;
      await dbService.setAutoRunStatus(this.isAutoRunning);

      this.log(null, `Auto run status changed: ${oldStatus} -> ${this.isAutoRunning}`);

      if (this.isAutoRunning) {
        await this.initializeTimers();
      } else {
        this.stopAllTimers();
        this.isInitialized = false;
        ProxyService.currentProcessId = null;
        this.log(null, 'All timers and processes stopped completely');
      }

      return this.isAutoRunning;
    } finally {
      this.releaseProcessLock();
    }
  }

  public getAutoRunStatus() {
    return this.isAutoRunning;
  }

  public static getGlobalAutoRunStatus() {
    return ProxyService.isAutoRunEnabled;
  }

  public static getCurrentProcessId() {
    return ProxyService.currentProcessId;
  }

  public async applyRotationInterval(key: KeyResponse) {
    await this.ensureInitialized();
    if (!this.isAutoRunning) return;
    this.startTimer(key);
  }
}

// Initialize singleton instance
let proxyServiceInstance: ProxyService | null = null;
export const getProxyService = async () => {
  if (!proxyServiceInstance) {
    proxyServiceInstance = await ProxyService.getInstance();
  }
  return proxyServiceInstance;
};