import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import type Database from 'better-sqlite3'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const dir = join(__dirname, 'migrations')
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
  const applied = db.prepare('SELECT name FROM _migrations').all() as { name: string }[]
  const appliedSet = new Set(applied.map((r) => r.name))

  for (const file of files) {
    if (!appliedSet.has(file)) {
      const sql = readFileSync(join(dir, file), 'utf-8')
      try {
        db.exec(sql)
        console.log(`✅ Migration applied: ${file}`)
      } catch (err: any) {
        if (err.message?.includes('duplicate column name')) {
          console.warn(`⚠️  Skipped duplicate columns in: ${file} (${err.message})`)
        } else {
          throw err
        }
      }
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file)
    }
  }
}
