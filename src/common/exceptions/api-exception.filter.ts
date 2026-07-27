import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface PostgreSqlErrorLike {
  code?: string;
  constraint?: string;
}

interface HttpExceptionBody {
  statusCode?: number;
  message?: string | string[];
  error?: string;
  details?: unknown;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request & { requestId?: string }>();
    const response = context.getResponse<Response>();

    const isHttpException = exception instanceof HttpException;
    const postgresError = exception as PostgreSqlErrorLike;
    let status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Internal server error';
    let error = HttpStatus[status] ?? 'Error';
    let details: unknown;

    if (isHttpException) {
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else {
        const body = exceptionResponse as HttpExceptionBody;
        message = body.message ?? exception.message;
        error = body.error ?? error;
        details = body.details;
      }
    } else {
      if (postgresError.code === '23505') {
        status = HttpStatus.CONFLICT;
        error = 'Database conflict';
        message = 'A unique business record already exists.';
        details = postgresError.constraint
          ? { constraint: postgresError.constraint }
          : undefined;
      } else if (postgresError.code === '23514') {
        status = HttpStatus.UNPROCESSABLE_ENTITY;
        error = 'Database constraint violation';
        message = 'The requested write violated a financial or data-integrity rule.';
        details = postgresError.constraint
          ? { constraint: postgresError.constraint }
          : undefined;
      } else if (['55P03', '57014'].includes(postgresError.code ?? '')) {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        error = 'Database temporarily unavailable';
        message = 'The database could not complete the request in time. Retry with the same idempotency key.';
      }

      const stack = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(
        `Unhandled error for ${request.method} ${request.originalUrl}`,
        stack,
      );
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      ...(details === undefined ? {} : { details }),
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
      requestId: request.requestId ?? response.getHeader('x-request-id'),
    });
  }
}
