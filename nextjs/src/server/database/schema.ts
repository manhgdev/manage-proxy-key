export const SCHEMA = {
  CREATE_PROXY_KEYS: `
    CREATE TABLE IF NOT EXISTS proxy_keys (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      url TEXT,
      expirationDate TEXT,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT NOT NULL,
      lastRotatedAt TEXT NOT NULL,
      rotationInterval INTEGER DEFAULT 60,
      proxyData TEXT
    )
  `,
  CREATE_SETTINGS: `
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `
}; 