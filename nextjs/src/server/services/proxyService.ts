import { dbService } from '@server/database';
import { KeyResponse, ProxyData } from '@/types/api';

const PROXY_API_URL = 'https://proxyxoay.org/api/get.php?key=';

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

  private constructor() {
    this.isAutoRunning = false;
    this.isInitialized = false;
  }

  public static getInstance(): ProxyService {
    if (!ProxyService.instance) {
      ProxyService.instance = new ProxyService();
    }
    return ProxyService.instance;
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

  public async initialize() {
    if (this.isInitialized || ProxyService.isInitializing) return;
    
    ProxyService.isInitializing = true;
    try {
      const dbAutoRunStatus = await dbService.getAutoRunStatus();
      this.isAutoRunning = dbAutoRunStatus;
      ProxyService.isAutoRunEnabled = dbAutoRunStatus;

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
    } finally {
      ProxyService.isInitializing = false;
    }
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
      const response = await fetch(PROXY_API_URL + key.key);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json() as ProxyData;

      const updatedKey: KeyResponse = {
        ...key,
        proxyData: data,
        lastRotatedAt: new Date().toISOString()
      };

      await dbService.updateKey(updatedKey);

      const fetchTime = Date.now() - startTime;
      this.log(key, 'Fetch completed fetchTime: ' + `${fetchTime}ms`);
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

  private startTimer(key: KeyResponse) {
    if (this.processing.get(key.id)) {
      this.log(key, 'StartTimer skipped due to processing lock');
      return;
    }
    if (this.timers.has(key.id)) {
      this.log(key, 'Timer already exists, skipping start');
      return;
    }
    this.startTimerWithDelay(key, key.rotationInterval * 1000);
  }

  private startTimerWithDelay(key: KeyResponse, delay: number) {
    if (!this.isAutoRunning) {
      this.stopTimer(key.id);
      return;
    }

    this.stopTimer(key.id);

    this.log(key, 'Timer scheduled nextRun: ' + `${(delay / 1000).toFixed(1)}s`);

    const timer = setTimeout(async () => {
      this.timers.delete(key.id);

      if (!this.isAutoRunning || this.processing.get(key.id)) {
        this.log(key, 'Timer aborted or already processing');
        return;
      }

      this.processing.set(key.id, true);

      try {
        const freshKey = await dbService.getKeyById(key.id);
        if (!freshKey || !freshKey.isActive) {
          this.log(key, 'Key not found or inactive, stopping timer');
          this.stopKey(key.id);
          return;
        }

        const lastRotatedAt = new Date(freshKey.lastRotatedAt).getTime();
        const intervalMs = freshKey.rotationInterval * 1000;
        const fetchTime = await this.fetchProxyData(freshKey);
        let nextDelay = lastRotatedAt + intervalMs - Date.now() + fetchTime;
        if (nextDelay < 0) nextDelay = 0;
        this.startTimerWithDelay(freshKey, nextDelay);
      } catch (error) {
        console.error(`Error in timer for key ${key.id}:`, error);
      } finally {
        this.processing.delete(key.id);
      }
    }, delay);

    this.timers.set(key.id, timer);
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
    this.log(null, `Stopping key ${keyId}`);
    this.stopTimer(keyId);
  }

  public async updateKey(key: KeyResponse) {
    this.stopKey(key.id);
    if (!this.isAutoRunning) return;
    
    const freshKey = await dbService.getKeyById(key.id);
    if (freshKey?.isActive) {
      this.startTimer(freshKey);
    }
  }

  public async toggleAutoRun() {
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
        this.timers.clear();
        this.processing.clear();
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
    if (!this.isAutoRunning) return;
    this.startTimer(key);
  }
}

export const proxyService = ProxyService.getInstance();