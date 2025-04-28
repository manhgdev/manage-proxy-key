import { dbService } from '@server/database';
import { KeyResponse, ProxyData } from '@/types/api';

const PROXY_API_URL = 'https://proxyxoay.org/api/get.php?key=';

class ProxyService {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private isCancelled: Map<string, boolean> = new Map();
  private isFetching: Map<string, boolean> = new Map();
  private processing: Map<string, boolean> = new Map();
  private isAutoRunning: boolean;

  constructor() {
    this.isAutoRunning = false;
    this.initialize();
  }

  private async initialize() {
    try {
      this.isAutoRunning = await dbService.getAutoRunStatus();
      if (this.isAutoRunning) {
        await this.initializeTimers();
      }
    } catch (error) {
      console.error('Failed to initialize:', error);
    }
  }

  private log(key: KeyResponse | null, message: string, data?: any) {
    const now = new Date().toISOString();
    const keyInfo = key ? `Key ${key.key}` : '';
    const color = this.getLogColor(message);
    console.log(`[${keyInfo}] ${color}${message}\x1b[0m`, data ? JSON.stringify(data, null, 2) : '');
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
        if (key.isActive) {
          const freshKey = await dbService.getKeyById(key.id);
          if (!freshKey) continue;
          this.startTimer(freshKey);
        }
      }
    } catch (error) {
      console.error('Failed to initialize timers:', error);
    }
  }

  private async fetchProxyData(key: KeyResponse): Promise<number> {
    if (!this.isAutoRunning || this.isCancelled.get(key.id) || this.isFetching.get(key.id) || this.processing.get(key.id)) {
      this.log(key, 'Fetch aborted due to auto-run disabled, timer cancelled, fetch already in progress, or processing lock');
      return 0;
    }

    this.isFetching.set(key.id, true);
    this.processing.set(key.id, true);
    const startTime = Date.now();

    try {
      const response = await fetch(PROXY_API_URL + key.key);
      if (!this.isAutoRunning || this.isCancelled.get(key.id)) {
        this.log(key, 'Fetch aborted during fetch due to auto-run disabled');
        return 0;
      }

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json() as ProxyData;

      if (!this.isAutoRunning || this.isCancelled.get(key.id)) {
        this.log(key, 'Fetch aborted after fetch but before update');
        return 0;
      }

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
    } finally {
      this.isFetching.delete(key.id);
      this.processing.delete(key.id);
    }
  }

  private startTimer(key: KeyResponse) {
    if (this.processing.get(key.id)) {
      this.log(key, 'StartTimer skipped due to processing lock');
      return;
    }

    const delay = key.rotationInterval * 1000;
    this.startTimerWithDelay(key, delay);
  }

  private startTimerWithDelay(key: KeyResponse, delay: number) {
    if (!this.isAutoRunning) {
      this.stopTimer(key.id);
      return;
    }

    this.stopTimer(key.id);
    this.isCancelled.set(key.id, false);

    this.log(key, 'Timer scheduled nextRun: ' + `${(delay / 1000).toFixed(1)}s`);

    const timer = setTimeout(async () => {
      this.timers.delete(key.id);

      if (!this.isAutoRunning || this.isCancelled.get(key.id)) {
        this.log(key, 'Timer aborted before fetch');
        return;
      }

      try {
        const freshKey = await dbService.getKeyById(key.id);
        if (!freshKey || !freshKey.isActive) {
          this.log(key, 'Key not found or inactive, stopping timer');
          this.stopKey(key.id);
          return;
        }

        if (!this.isAutoRunning || this.isCancelled.get(key.id)) {
          this.log(key, 'AutoRun stopped during processing, abort fetch');
          return;
        }

        const fetchTime = await this.fetchProxyData(freshKey);

        const updatedKey = await dbService.getKeyById(key.id);
        if (updatedKey && updatedKey.isActive) {
          const nextDelay = updatedKey.rotationInterval * 1000 + fetchTime;
          this.startTimerWithDelay(updatedKey, nextDelay);
        }
      } catch (error) {
        console.error(`Error in timer for key ${key.id}:`, error);
      }
    }, delay);

    this.timers.set(key.id, timer);
  }

  private stopTimer(keyId: string) {
    const timer = this.timers.get(keyId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(keyId);
    }
    this.isCancelled.delete(keyId);
    this.isFetching.delete(keyId);
    this.processing.delete(keyId);
  }

  private stopAllTimers() {
    this.timers.forEach((timer, keyId) => {
      clearTimeout(timer);
      this.isCancelled.delete(keyId);
      this.isFetching.delete(keyId);
      this.processing.delete(keyId);
    });
    this.timers.clear();
  }

  public startKey(key: KeyResponse) {
    if (this.isAutoRunning) {
      this.startTimer(key);
    }
  }

  public stopKey(keyId: string) {
    this.log(null, `Stopping key ${keyId}`);
    this.stopTimer(keyId);
  }

  public async updateKey(key: KeyResponse) {
    this.stopKey(key.id);

    if (this.isAutoRunning) {
      const freshKey = await dbService.getKeyById(key.id);
      if (freshKey && freshKey.isActive) {
        this.startTimer(freshKey);
      }
    }
  }

  public async toggleAutoRun() {
    const oldStatus = this.isAutoRunning;
    this.isAutoRunning = !this.isAutoRunning;
    await dbService.setAutoRunStatus(this.isAutoRunning);

    this.log(null, `Auto run status changed: ${oldStatus} -> ${this.isAutoRunning}`);

    if (this.isAutoRunning) {
      await this.initializeTimers();
    } else {
      this.stopAllTimers();
      this.log(null, 'All timers stopped');
    }

    return this.isAutoRunning;
  }

  public getAutoRunStatus() {
    return this.isAutoRunning;
  }

  public async applyRotationInterval(key: KeyResponse) {
    if (!this.isAutoRunning) return;
    this.startTimer(key);
  }
}

export const proxyService = new ProxyService();
