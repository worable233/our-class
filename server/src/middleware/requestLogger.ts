import { Request, Response, NextFunction } from 'express'
import { logger } from '../lib/logger.js'
import { getDb } from '../db/init.js'

// 延迟准备 statement，避免数据库未初始化时报错
let insertLog: any = null

function getInsertStmt() {
  if (!insertLog) {
    try {
      const db = getDb()
      insertLog = db.prepare(`
        INSERT INTO traffic_logs (method, path, status_code, user_agent, referer, upload_bytes, download_bytes, is_attack, is_intercepted)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)
      `)
    } catch { return null }
  }
  return insertLog
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now()
  const uploadBytes = parseInt(req.headers['content-length'] || '0', 10) || 0

  res.on('finish', () => {
    const duration = Date.now() - start
    logger.info({
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
    })

    // 记录到数据库（异步，不阻塞响应）
    try {
      const stmt = getInsertStmt()
      if (stmt) {
        stmt.run(
          req.method,
          req.originalUrl,
          res.statusCode,
          (req.headers['user-agent'] || '').slice(0, 500),
          (req.headers['referer'] || '').slice(0, 500),
          uploadBytes,
          0, // download_bytes 在 res.finish 时难以准确获取，暂记 0
        )
      }
    } catch {}
  })
  next()
}
