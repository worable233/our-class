import { Request, Response, NextFunction } from 'express'
import { AppError } from '../lib/errors.js'
import { fail } from '../lib/response.js'
import { logger } from '../lib/logger.js'

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    fail(res, err.statusCode, err.code, err.message, err.details)
    return
  }

  logger.error({ err }, 'Unhandled error')
  fail(res, 500, 'INTERNAL_ERROR', '服务器内部错误')
}
