import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../constants/error-codes';

export class AppHttpException extends HttpException {
  constructor(status: HttpStatus, code: ErrorCode, message: string) {
    super(
      {
        statusCode: status,
        error: HttpStatus[status],
        code,
        message,
      },
      status,
    );
  }
}
