import { getProxyService } from './services/proxyService';

declare global {
  var isProxyServiceInitialized: boolean;
}

// Global error handlers - prevent all crashes
if (process.env.NODE_ENV === 'production') {
  process.on('uncaughtException', (error) => {
    console.error('[UNCAUGHT]', error);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[UNHANDLED]', reason);
  });
}

// Initialize once
if (!global.isProxyServiceInitialized && process.env.NODE_ENV === 'production') {
  global.isProxyServiceInitialized = true;
  
  setTimeout(async () => {
    try {
      await getProxyService();
    } catch (error) {
      console.error('[INIT ERROR]', error);
    }
  }, 1000);
} 