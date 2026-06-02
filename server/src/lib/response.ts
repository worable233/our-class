import { Response } from 'express'

export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

interface SuccessBody<T> {
  success: true
  data: T
  meta?: PaginationMeta
}

interface ErrorBody {
  success: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export function ok<T>(res: Response, data: T, meta?: PaginationMeta) {
  const body: SuccessBody<T> = { success: true, data }
  if (meta) body.meta = meta
  res.json(body)
}

export function fail(res: Response, status: number, code: string, message: string, details?: unknown) {
  const body: ErrorBody = { success: false, error: { code, message, details } }
  res.status(status).json(body)
}
