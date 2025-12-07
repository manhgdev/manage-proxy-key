import { getProxyService } from './services/proxyService';

// Sử dụng global variable để đảm bảo chỉ khởi tạo một lần
declare global {
  var isProxyServiceInitialized: boolean;
}

// Global error handlers to prevent app crashes
if (process.env.NODE_ENV === 'production') {
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Don't exit, keep running
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit, keep running
  });
}

// Chỉ khởi tạo một lần sau khi khởi động
if (!global.isProxyServiceInitialized && process.env.NODE_ENV === 'production') {
  global.isProxyServiceInitialized = true;
  
  // Đợi một chút để đảm bảo ứng dụng đã khởi động hoàn toàn
  setTimeout(async () => {
    try {
      await getProxyService();
    } catch (error) {
      console.error('Failed to initialize ProxyService:', error);
    }
  }, 1000);
} 