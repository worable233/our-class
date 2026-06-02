export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
    this.name = this.constructor.name
  }
}

export class NotFoundError extends AppError {
  constructor(message = '资源不存在') {
    super(404, 'NOT_FOUND', message)
  }
}

export class ValidationError extends AppError {
  constructor(message = '请求参数错误', details?: unknown) {
    super(400, 'VALIDATION_ERROR', message, details)
  }
}

export class AuthError extends AppError {
  constructor(message = '未登录或登录已过期') {
    super(401, 'AUTH_ERROR', message)
  }
}

export class ForbiddenError extends AppError {
  constructor(message = '权限不足') {
    super(403, 'FORBIDDEN', message)
  }
}
