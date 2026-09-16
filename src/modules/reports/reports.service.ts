import { HttpStatus, Injectable, StreamableFile } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import {
  isYmd,
  ymdInclusiveDayCount,
} from '../check-ins/utils/tenant-day.util';
import {
  SUBSCRIPTION_CSV_HEADERS,
  CHECKIN_CSV_HEADERS,
  MEMBER_CSV_HEADERS,
  PAYMENT_CSV_HEADERS,
  REPORT_MAX_RANGE_DAYS,
} from './constants/report.constants';
import { ExportCheckInsQueryDto } from './dto/export-check-ins-query.dto';
import { ExportDateRangeQueryDto } from './dto/export-date-range-query.dto';
import { ExportMembersQueryDto } from './dto/export-members-query.dto';
import { ExportPaymentsQueryDto } from './dto/export-payments-query.dto';
import { ExportSubscriptionsQueryDto } from './dto/export-subscriptions-query.dto';
import {
  checkInCsvRow,
  memberCsvRow,
  paymentCsvRow,
  subscriptionCsvRow,
} from './mappers/report.mapper';
import { ReportsRepository } from './repository/reports.repository';
import { csvFilename, csvContentDisposition, toCsv } from './utils/csv.util';

@Injectable()
export class ReportsService {
  constructor(private readonly reportsRepository: ReportsRepository) {}

  async members(actor: AuthenticatedUser, query: ExportMembersQueryDto) {
    const { rows, from, to } = await this.reportsRepository.findMembers(
      actor.tenantId,
      query,
    );
    return this.csvFile(
      'members',
      from,
      to,
      toCsv(MEMBER_CSV_HEADERS, rows.map(memberCsvRow)),
    );
  }

  async payments(actor: AuthenticatedUser, query: ExportPaymentsQueryDto) {
    const { rows, paid, from, to } = await this.reportsRepository.findPayments(
      actor.tenantId,
      query,
      this.resolveRange(query),
    );
    return this.csvFile(
      'payments',
      from,
      to,
      toCsv(
        PAYMENT_CSV_HEADERS,
        rows.map((row) =>
          paymentCsvRow(row, paid.get(row.subscriptionId) ?? 0),
        ),
      ),
    );
  }

  async checkIns(actor: AuthenticatedUser, query: ExportCheckInsQueryDto) {
    const { rows, from, to } = await this.reportsRepository.findCheckIns(
      actor.tenantId,
      query,
      this.resolveRange(query),
    );
    return this.csvFile(
      'check-ins',
      from,
      to,
      toCsv(CHECKIN_CSV_HEADERS, rows.map(checkInCsvRow)),
    );
  }

  async subscriptions(
    actor: AuthenticatedUser,
    query: ExportSubscriptionsQueryDto,
  ) {
    const { rows, paid, from, to } =
      await this.reportsRepository.findSubscriptions(actor.tenantId, query);
    return this.csvFile(
      'subscriptions',
      from,
      to,
      toCsv(
        SUBSCRIPTION_CSV_HEADERS,
        rows.map((row) => subscriptionCsvRow(row, paid.get(row.id) ?? 0)),
      ),
    );
  }

  private resolveRange(query: ExportDateRangeQueryDto): {
    from?: string;
    to?: string;
  } {
    if (!query.from && !query.to) {
      return {};
    }

    const from = query.from ?? query.to;
    const to = query.to ?? query.from;
    if (!from || !to || !isYmd(from) || !isYmd(to) || from > to) {
      throw this.invalidRange();
    }
    if (ymdInclusiveDayCount(from, to) > REPORT_MAX_RANGE_DAYS) {
      throw this.invalidRange();
    }
    return { from, to };
  }

  private invalidRange(): AppHttpException {
    return new AppHttpException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.DATE_RANGE_INVALID,
      `from and to must be valid YYYY-MM-DD dates, from <= to, and at most ${REPORT_MAX_RANGE_DAYS} days`,
    );
  }

  private csvFile(
    kind: string,
    from: string,
    to: string,
    body: string,
  ): { filename: string; file: StreamableFile } {
    const filename = csvFilename(kind, from, to);
    return {
      filename,
      file: new StreamableFile(Buffer.from(body, 'utf8'), {
        type: 'text/csv; charset=utf-8',
        disposition: csvContentDisposition(filename),
      }),
    };
  }
}
