export interface ProxyKey {
  id: string;
  key: string;
  url: string;
  expirationDate: string;
  isActive: boolean;
  createdAt: string;
  lastRotatedAt: string;
  rotationInterval: number;
  proxyData?: {
    status: number;
    message: string;
    proxyhttp: string;
    proxysocks5: string;
    "Nha Mang": string;
    "Vi Tri": string;
    "Token expiration date": string;
  };
} 