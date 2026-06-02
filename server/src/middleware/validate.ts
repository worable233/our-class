import { Request, Response, NextFunction } from 'express'
import { ZodSchema } from 'zod'
import { fail } from '../lib/response.js'

export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source])
    if (!result.success) {
      const details = result.error.issues.map(e => ({
        path: e.path.join('.'),
        message: e.message,
      }))
      fail(res, 400, 'VALIDATION_ERROR', '请求参数错误', details)
      return
    }
    if (source === 'body') req.body = result.data
    next()
  }
}
