import { dbService } from '@server/database';
import { KeyResponse, ProxyData } from '@/types/api';

// Default fallback if a key doesn't have a custom URL saved
const DEFAULT_PROXY_API_URL = 'https://proxyxoay.org/api/get.php?key=';

export class ProxyService {
  private timers: Map<string, NodeJS.Timeout> = new Map();
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
      console.error('Failed to initialize:', error);
      throw error;
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
      let updatedKey: KeyResponse;
  const requestUrl = this.buildRequestUrl(key);
  const response = await fetch(requestUrl);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json() as ProxyData;

      if (data?.status === 102 || data?.error == "Key không tồn tại") {
        updatedKey = {
          ...key,
          isActive: false,
          proxyData: data,
          lastRotatedAt: new Date().toISOString()
        };
        await dbService.updateKey(updatedKey);
        this.stopKey(updatedKey.id);
        this.log(key, 'Deactivated due to status 102');
        return Date.now() - startTime;
      }

      if (data.status === 101 || data?.error == "too_many_requests") {
        updatedKey = {
          ...key,
          proxyData: key.proxyData
            ? { ...key.proxyData, message: data.message, status: data.status }
            : data
        };
      } else {
        const updatedProxyData = { ...data };
        updatedKey = {
          ...key,
          proxyData: updatedProxyData,
          lastRotatedAt: new Date().toISOString()
        };
      }

      await dbService.updateKey(updatedKey);

      const fetchTime = Date.now() - startTime;
      this.log(key, '🚀 Fetch completed: ' + `${fetchTime}ms`);
      return fetchTime;

    } catch (error) {
      console.error(`Error fetching proxy data for key ${key.id}:`, error);
      this.log(key, 'Fetch failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        fetchTime: `${Date.now() - startTime}ms`
      });
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
      this.timers.delete(dataKey.id);

      if (!this.isAutoRunning || this.processing.get(dataKey.id)) {
        this.log(dataKey, 'Timer aborted or already processing');
        return;
      }

      this.processing.set(dataKey.id, true);

      try {
        if (!dataKey || !dataKey.isActive) {
          this.log(dataKey, 'Key not found or inactive, stopping timer');
          this.stopKey(dataKey.id);
          return;
        }

        const fetchTime = await this.fetchProxyData(dataKey);
        const intervalMs = dataKey.rotationInterval * 1000;
        let nextDelay = intervalMs + fetchTime;

        this.log(dataKey, '🔄 Timer scheduled nextRun: ' + `${(nextDelay / 1000).toFixed(1)}s`);
        this.startTimerWithDelay(dataKey, nextDelay);
      } catch (error) {
        console.error(`Error in timer for key ${dataKey.id}:`, error);
      } finally {
        this.processing.delete(dataKey.id);
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