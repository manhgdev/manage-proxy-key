import Database from 'better-sqlite3';
import { SCHEMA } from '@server/database/schema';
import { KeyResponse } from '@/types/api';
import { DatabaseRow, SettingsRow } from '@/types/database';

const db = new Database('proxy_keys.db');

// Initialize database
try {
  Object.values(SCHEMA).forEach(schema => db.exec(schema));
} catch (error) {
  console.error('Error initializing database:', error);
}

export const dbService = {
  getKeys: (): KeyResponse[] => {
    try {
      const stmt = db.prepare('SELECT * FROM proxy_keys');
      const rows = stmt.all() as DatabaseRow[];
      return rows.map(row => ({
        id: row.id,
        key: row.key,
        url: row.url,
        expirationDate: row.expirationDate,
        isActive: Boolean(row.isActive),
        createdAt: row.createdAt,
        lastRotatedAt: row.lastRotatedAt,
        rotationInterval: row.rotationInterval || 60,
        proxyData: row.proxyData ? JSON.parse(row.proxyData) : null
      }));
    } catch (error) {
      console.error('Error getting keys:', error);
      return [];
    }
  },

  addKey: (key: KeyResponse): void => {
    const stmt = db.prepare(`
      INSERT INTO proxy_keys (
        id, key, url, expirationDate, isActive, createdAt, 
        lastRotatedAt, rotationInterval, proxyData
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      key.id,
      key.key,
      key.url,
      key.expirationDate,
      key.isActive ? 1 : 0,
      key.createdAt,
      key.lastRotatedAt,
      key.rotationInterval || 60,
      key.proxyData ? JSON.stringify(key.proxyData) : null
    );
  },

  getKeyById(id: string): KeyResponse | null {
    const keys = this.getKeys(); // giả sử getKeys trả về list tất cả keys
    return keys.find(key => key.id === id) || null;
  },

  updateKey: (key: KeyResponse): void => {
    const stmt = db.prepare(`
      UPDATE proxy_keys
      SET 
        key = ?, 
        url = ?, 
        expirationDate = ?, 
        isActive = ?, 
        proxyData = ?, 
        rotationInterval = ?,
        lastRotatedAt = ?
      WHERE id = ?
    `);
    stmt.run(
      key.key,
      key.url,
      key.expirationDate,
      key.isActive ? 1 : 0,
      key.proxyData ? JSON.stringify(key.proxyData) : null,
      key.rotationInterval || 60,
      key.lastRotatedAt,
      key.id
    );
  },

  deleteKey: (id: string): void => {
    const stmt = db.prepare('DELETE FROM proxy_keys WHERE id = ?');
    stmt.run(id);
  },

  toggleKey: (id: string): void => {
    const stmt = db.prepare(`
      UPDATE proxy_keys
      SET isActive = CASE WHEN isActive = 1 THEN 0 ELSE 1 END
      WHERE id = ?
    `);
    stmt.run(id);
  },

  getAutoRunStatus: (): boolean => {
    try {
      const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
      const result = stmt.get('isAutoRunning') as SettingsRow | undefined;
      return result ? result.value === 'true' : true;
    } catch (error) {
      console.error('Error getting auto run status:', error);
      return true;
    }
  },

  setAutoRunStatus: (status: boolean): void => {
    try {
      const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
      stmt.run('isAutoRunning', status.toString());
    } catch (error) {
      console.error('Error setting auto run status:', error);
    }
  }
}; 