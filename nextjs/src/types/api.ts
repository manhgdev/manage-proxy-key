export interface ApiResponse<T = any> {
  success?: boolean;
  error?: string;
  data?: T;
}

export interface AutoRunResponse {
  isAutoRunning: boolean;
  message?: string;
  previousStatus?: boolean;
}

export interface ProxyData {
  status: number;
  message: string;
  proxyhttp: string;
  proxysocks5: string;
  "Nha Mang": string;
  "Vi Tri": string;
  "Token expiration date": string;
}

export interface KeyResponse {
  id: string;
  key: string;
  url: string;
  expirationDate: string;
  isActive: boolean;
  createdAt: string;
  lastRotatedAt: string;
  rotationInterval: number;
  proxyData?: ProxyData;
} 