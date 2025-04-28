export const SCHEMA = {
  proxy_keys: `
    CREATE TABLE IF NOT EXISTS proxy_keys (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      url TEXT NOT NULL,
      expirationDate TEXT,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT NOT NULL,
      lastRotatedAt TEXT NOT NULL,
      rotationInterval INTEGER DEFAULT 62,
      proxyData TEXT
    )
  `,
  settings: `
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `
}; 