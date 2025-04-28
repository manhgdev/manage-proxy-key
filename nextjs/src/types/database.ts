export interface DatabaseRow {
  id: string;
  key: string;
  url: string;
  expirationDate: string;
  isActive: number;
  proxyData: string | null;
  rotationInterval: number;
  createdAt: string;
  lastRotatedAt: string;
}

export interface SettingsRow {
  key: string;
  value: string;
} 