import Database from 'better-sqlite3';
import { SCHEMA } from '@server/database/schema';
import { KeyResponse } from '@/types/api';
import { DatabaseRow, SettingsRow } from '@/types/database';
import path from 'path';

const DB_PATH = process.env.NODE_ENV === 'production' 
  ? path.join(process.cwd(), '.next', 'proxy_keys.db')
  : 'proxy_keys.db';

let db: Database.Database;

try {
  db = new Database(DB_PATH);
  Object.values(SCHEMA).forEach(schema => db.exec(schema));
} catch (error) {
  console.error('Error initializing database:', error);
  process.exit(1);
}

export const dbService = {
  getKeys: async (): Promise<KeyResponse[]> => {
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
      throw error;
    }
  },

  addKey: async (key: KeyResponse): Promise<void> => {
    try {
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
    } catch (error) {
      console.error('Error adding key:', error);
      throw error;
    }
  },

  getKeyById: async (id: string): Promise<KeyResponse | null> => {
    try {
      const stmt = db.prepare('SELECT * FROM proxy_keys WHERE id = ?');
      const row = stmt.get(id) as DatabaseRow | undefined;
      if (!row) return null;

      return {
        id: row.id,
        key: row.key,
        url: row.url,
        expirationDate: row.expirationDate,
        isActive: Boolean(row.isActive),
        createdAt: row.createdAt,
        lastRotatedAt: row.lastRotatedAt,
        rotationInterval: row.rotationInterval || 60,
        proxyData: row.proxyData ? JSON.parse(row.proxyData) : null
      };
    } catch (error) {
      console.error('Error getting key by id:', error);
      throw error;
    }
  },

  updateKey: async (key: KeyResponse): Promise<void> => {
    try {
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
    } catch (error) {
      console.error('Error updating key:', error);
      throw error;
    }
  },

  deleteKey: async (id: string): Promise<void> => {
    try {
      const stmt = db.prepare('DELETE FROM proxy_keys WHERE id = ?');
      stmt.run(id);
    } catch (error) {
      console.error('Error deleting key:', error);
      throw error;
    }
  },

  toggleKey: async (id: string): Promise<void> => {
    try {
      const stmt = db.prepare(`
        UPDATE proxy_keys
        SET isActive = CASE WHEN isActive = 1 THEN 0 ELSE 1 END
        WHERE id = ?
      `);
      stmt.run(id);
    } catch (error) {
      console.error('Error toggling key:', error);
      throw error;
    }
  },

  getAutoRunStatus: async (): Promise<boolean> => {
    try {
      const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
      const result = stmt.get('isAutoRunning') as SettingsRow | undefined;
      return result ? result.value === 'true' : true;
    } catch (error) {
      console.error('Error getting auto run status:', error);
      throw error;
    }
  },

  setAutoRunStatus: async (status: boolean): Promise<void> => {
    try {
      const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
      stmt.run('isAutoRunning', status.toString());
    } catch (error) {
      console.error('Error setting auto run status:', error);
      throw error;
    }
  }
}; 