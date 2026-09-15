import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import {
  isYmd,
  ymdInclusiveDayCount,
} from '../check-ins/utils/tenant-day.util';
import { DASHBOARD_MAX_RANGE_DAYS } from './constants/dashboard.constants';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { DashboardRepository } from './repository/dashboard.repository';

@Injectable()
export class DashboardService {
  constructor(private readonly dashboardRepository: DashboardRepository) {}

  summary(actor: AuthenticatedUser, query: DashboardQueryDto) {
    return this.dashboardRepository.summary(
      actor.tenantId,
      this.resolveRange(query),
    );
  }

  private resolveRange(query: DashboardQueryDto): {
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
    if (ymdInclusiveDayCount(from, to) > DASHBOARD_MAX_RANGE_DAYS) {
      throw this.invalidRange();
    }
    return { from, to };
  }

  private invalidRange(): AppHttpException {
    return new AppHttpException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.DATE_RANGE_INVALID,
      `from and to must be valid YYYY-MM-DD dates, from <= to, and at most ${DASHBOARD_MAX_RANGE_DAYS} days`,
    );
  }
}
