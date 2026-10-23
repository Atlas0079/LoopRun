import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { emptyState } from './game.mjs';

export class Store {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive:true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; CREATE TABLE IF NOT EXISTS game_state (id INTEGER PRIMARY KEY CHECK (id=1), payload TEXT NOT NULL);');
    this.readStatement = this.db.prepare('SELECT payload FROM game_state WHERE id=1');
    this.writeStatement = this.db.prepare('INSERT INTO game_state(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload');
    if (!this.readStatement.get()) this.writeStatement.run(JSON.stringify(emptyState()));
    this.read();
  }
  read() {
    const state = JSON.parse(this.readStatement.get().payload);
    if (state.version !== 5) throw new Error('数据库版本不匹配。请使用当前 50 米网格的数据库。');
    return state;
  }
  change(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const state = this.read();
      const result = fn(state);
      this.writeStatement.run(JSON.stringify(state));
      this.db.exec('COMMIT');
      return result;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}
