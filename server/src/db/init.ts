import Database from 'better-sqlite3'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { runMigrations } from './migrate.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, '..', '..', 'data.db')

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
  }
  return db
}
