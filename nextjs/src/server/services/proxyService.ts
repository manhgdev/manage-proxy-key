import { dbService } from '@server/database';
import { KeyResponse, ProxyData } from '@/types/api';

const PROXY_API_URL = 'https://proxyxoay.org/api/get.php?key=';

class ProxyService {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private isAutoRunning: boolean;
  private nextRunTimes: Map<string, number> = new Map();
  private isProcessing: Map<string, boolean> = new Map();

  constructor() {
    this.isAutoRunning = dbService.getAutoRunStatus();
    if (this.isAutoRunning) {
      this.initializeTimers();
    }
  }

  private log(key: KeyResponse | null, message: string, data?: any) {
    const now = new Date().toISOString();
    const keyInfo = key ? `Key ${key.key}: ` : '';
    console.log(`[${now}] ${keyInfo}${message}`, data ? JSON.stringify(data, null, 2) : '');
  }

  private async initializeTimers() {
    if (!this.isAutoRunning) return;
    
    // Clear existing timers
    this.timers.forEach((_, keyId) => this.stopTimer(keyId));
    this.timers.clear();
    this.nextRunTimes.clear();
    this.isProcessing.clear();
    
    // Start new timers
    const keys = dbService.getKeys();
    keys.forEach(key => {
      if (key.isActive) {
        this.startTimer(key);
      }
    });
  }

  private async fetchProxyData(key: KeyResponse): Promise<void> {
    if (!this.isAutoRunning) {
      this.log(key, 'Auto run is disabled, stopping fetch immediately');
      this.stopTimer(key.id);
      return;
    }

    const now = Date.now();
    const nextRun = this.nextRunTimes.get(key.id);

    // Kiểm tra thời gian chạy
    if (nextRun && now < nextRun) {
      this.log(key, `Skipping fetch, next run at ${new Date(nextRun).toISOString()}`);
      return;
    }

    // Kiểm tra xem có đang xử lý không
    if (this.isProcessing.get(key.id)) {
      this.log(key, 'Already processing, skipping this run');
      return;
    }

    // Đánh dấu đang xử lý
    this.isProcessing.set(key.id, true);
    this.log(key, 'Starting fetch');
    const startTime = Date.now();

    try {
      // Kiểm tra lại auto run trước khi fetch
      if (!this.isAutoRunning) {
        this.log(key, 'Auto run disabled during fetch, stopping immediately');
        this.stopTimer(key.id);
        return;
      }

      const response = await fetch(PROXY_API_URL + key.key);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      // Kiểm tra lại auto run trước khi xử lý response
      if (!this.isAutoRunning) {
        this.log(key, 'Auto run disabled during response processing, stopping immediately');
        this.stopTimer(key.id);
        return;
      }
      
      const data = await response.json() as ProxyData;
      
      // Cập nhật key với dữ liệu mới
      const updatedKey: KeyResponse = {
        ...key,
        proxyData: data,
        lastRotatedAt: new Date().toISOString()
      };
      dbService.updateKey(updatedKey);

      // Chỉ cập nhật thời gian chạy tiếp theo sau khi hoàn thành thành công
      const nextRunTime = now + (key.rotationInterval * 1000);
      this.nextRunTimes.set(key.id, nextRunTime);

      this.log(key, 'Fetch completed', {
        fetchTime: `${Date.now() - startTime}ms`,
        nextRun: new Date(nextRunTime).toISOString(),
        rotationInterval: key.rotationInterval
      });
    } catch (error) {
      console.error(`Error fetching proxy data for key ${key.id}:`, error);
      this.log(key, 'Fetch failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        fetchTime: `${Date.now() - startTime}ms`
      });
    } finally {
      this.isProcessing.set(key.id, false);
    }
  }

  private startTimer(key: KeyResponse) {
    if (!this.isAutoRunning) {
      this.log(key, 'Auto run is disabled, stopping timer immediately');
      this.stopTimer(key.id);
      return;
    }
    
    // Stop existing timer if any
    this.stopTimer(key.id);
    
    // Set thời gian chạy tiếp theo dựa trên thời điểm hiện tại
    const now = Date.now();
    const nextRunTime = now + (key.rotationInterval * 1000);
    this.nextRunTimes.set(key.id, nextRunTime);
    
    this.log(key, 'Timer started', {
      nextRun: new Date(nextRunTime).toISOString(),
      rotationInterval: key.rotationInterval
    });
    
    // Start new timer với interval ngắn hơn để kiểm tra chính xác thời điểm
    const timer = setInterval(async () => {
      if (!this.isAutoRunning) {
        this.log(key, 'Auto run disabled, stopping timer immediately');
        this.stopTimer(key.id);
        return;
      }

      const currentTime = Date.now();
      const nextRun = this.nextRunTimes.get(key.id);
      
      // Chỉ chạy khi đã đến thời điểm và không đang xử lý
      if (nextRun && currentTime >= nextRun && !this.isProcessing.get(key.id)) {
        await this.fetchProxyData(key);
      }
    }, 1000); // Kiểm tra mỗi giây
    
    this.timers.set(key.id, timer);
  }

  private stopTimer(keyId: string) {
    const timer = this.timers.get(keyId);
    if (timer) {
      this.log(null, `Stopping timer for key ${keyId} immediately`);
      clearInterval(timer);
      this.timers.delete(keyId);
      this.nextRunTimes.delete(keyId);
      this.isProcessing.delete(keyId);
    }
  }

  public startKey(key: KeyResponse) {
    if (this.isAutoRunning) {
      this.startTimer(key);
    }
  }

  public stopKey(keyId: string) {
    this.log(null, `Stopping key ${keyId}`);
    this.stopTimer(keyId);
    this.nextRunTimes.delete(keyId);
    this.isProcessing.delete(keyId);
  }

  public updateKey(key: KeyResponse) {
    this.log(key, `Updating key, isActive: ${key.isActive}, isAutoRunning: ${this.isAutoRunning}`);
    if (key.isActive && this.isAutoRunning) {
      this.startTimer(key);
    } else {
      this.stopKey(key.id);
    }
  }

  public toggleAutoRun() {
    const oldStatus = this.isAutoRunning;
    this.isAutoRunning = !this.isAutoRunning;
    dbService.setAutoRunStatus(this.isAutoRunning);
    
    this.log(null, `Auto run status changed: ${oldStatus} -> ${this.isAutoRunning}`);
    
    if (this.isAutoRunning) {
      this.log(null, 'Initializing timers for all active keys');
      this.initializeTimers();
    } else {
      this.log(null, 'Stopping all timers and cleaning up data immediately');
      // Dừng tất cả các timer và xóa dữ liệu ngay lập tức
      this.timers.forEach((timer, keyId) => {
        this.log(null, `Stopping timer for key ${keyId} immediately`);
        clearInterval(timer);
        this.timers.delete(keyId);
        this.nextRunTimes.delete(keyId);
        this.isProcessing.delete(keyId);
      });
      this.timers.clear();
      this.nextRunTimes.clear();
      this.isProcessing.clear();
      this.log(null, 'All timers stopped and data cleaned up');
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