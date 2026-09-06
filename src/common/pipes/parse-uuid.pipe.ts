import { HttpStatus, Injectable, PipeTransform } from '@nestjs/common';
import { ErrorCode } from '../constants/error-codes';
import { AppHttpException } from '../errors/app-http.exception';

/** Canonical UUID: 8-4-4-4-12 hex. Postgres `uuid`, not a Mongo ObjectId. */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ParseUuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (typeof value !== 'string' || !UUID.test(value)) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.INVALID_UUID,
        'Invalid UUID',
      );
    }
    return value.toLowerCase();
  }
}
