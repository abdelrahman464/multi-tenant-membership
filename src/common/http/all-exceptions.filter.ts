import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Stable JSON error body for every HTTP failure.
 * Production never includes an internal exception message on 500s.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const message = this.httpMessage(exceptionResponse, exception.message);

      const code =
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'code' in exceptionResponse
          ? (exceptionResponse as { code: string }).code
          : undefined;

      response.status(status).json({
        statusCode: status,
        error: this.statusName(status),
        code,
        message,
        timestamp: new Date().toISOString(),
        path: request.url,
        ...(process.env.NODE_ENV === 'development' && {
          stack: exception.stack,
        }),
      });
      return;
    }

    this.logger.error(exception);
    const isProd = process.env.NODE_ENV === 'production';
    const stack = exception instanceof Error ? exception.stack : undefined;
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: isProd
        ? 'Internal server error'
        : this.unknownMessage(exception),
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(process.env.NODE_ENV === 'development' && {
        stack,
      }),
    });
  }

  private httpMessage(
    exceptionResponse: string | object,
    fallback: string,
  ): string | string[] {
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }
    if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in exceptionResponse
    ) {
      const { message } = exceptionResponse as { message: string | string[] };
      return message;
    }
    return fallback;
  }

  private statusName(status: number): string {
    return HttpStatus[status] ?? 'Error';
  }

  private unknownMessage(exception: unknown): string {
    if (exception instanceof Error) {
      return exception.message;
    }
    return 'Internal server error';
  }
}
