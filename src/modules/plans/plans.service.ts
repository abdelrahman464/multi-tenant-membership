import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreatePlanDto } from './dto/create-plan.dto';
import { ListPlansQueryDto } from './dto/list-plans-query.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { PlanKind } from './enums/plan-kind.enum';
import { PlansRepository } from './repository/plans.repository';
import { resolvePlanTerms } from './utils/day-pass-terms.util';

@Injectable()
export class PlansService {
  constructor(private readonly plansRepository: PlansRepository) {}

  list(actor: AuthenticatedUser, query: ListPlansQueryDto) {
    return this.plansRepository.findMany(actor.tenantId, query);
  }

  async getById(actor: AuthenticatedUser, id: string) {
    const plan = await this.plansRepository.findById(actor.tenantId, id);
    if (!plan) {
      throw new AppHttpException(
        HttpStatus.NOT_FOUND,
        ErrorCode.PLAN_NOT_FOUND,
        'Plan not found',
      );
    }
    return plan;
  }

  async create(actor: AuthenticatedUser, dto: CreatePlanDto) {
    const allBranches = dto.allBranches !== false;
    const branchIds = dto.branchIds ?? [];
    const terms = resolvePlanTerms({
      kind: dto.kind ?? PlanKind.MEMBERSHIP,
      durationDays: dto.durationDays,
      sessionCount: dto.sessionCount,
      maxVisitsPerDay: dto.maxVisitsPerDay,
    });

    this.assertBranchScope({
      allBranches,
      branchIds,
      switchingToSelected: !allBranches,
    });

    try {
      return await this.plansRepository.create(actor.tenantId, {
        name: dto.name,
        durationDays: terms.durationDays,
        sessionCount: terms.sessionCount,
        maxVisitsPerDay: terms.maxVisitsPerDay,
        price: dto.price,
        allBranches,
        kind: terms.kind,
        branchIds,
      });
    } catch (error) {
      if (this.plansRepository.isUniqueConflict(error)) {
        throw this.plansRepository.nameTakenError();
      }
      throw error;
    }
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdatePlanDto) {
    const existing = await this.plansRepository.findById(actor.tenantId, id);
    if (!existing) {
      throw new AppHttpException(
        HttpStatus.NOT_FOUND,
        ErrorCode.PLAN_NOT_FOUND,
        'Plan not found',
      );
    }

    const allBranches = dto.allBranches ?? existing.allBranches;
    const nextKind = dto.kind ?? existing.kind;
    const terms =
      nextKind === PlanKind.DAY_PASS
        ? resolvePlanTerms({
            kind: PlanKind.DAY_PASS,
            durationDays: dto.durationDays,
            sessionCount: dto.sessionCount,
            maxVisitsPerDay: dto.maxVisitsPerDay ?? existing.maxVisitsPerDay,
          })
        : null;

    this.assertBranchScope({
      allBranches,
      branchIds: dto.branchIds,
      switchingToSelected: dto.allBranches === false && existing.allBranches,
    });

    try {
      return await this.plansRepository.update(actor.tenantId, id, {
        name: dto.name,
        durationDays: terms?.durationDays ?? dto.durationDays,
        sessionCount: terms ? terms.sessionCount : dto.sessionCount,
        maxVisitsPerDay: terms?.maxVisitsPerDay ?? dto.maxVisitsPerDay,
        price: dto.price,
        allBranches: dto.allBranches,
        kind: dto.kind,
        branchIds: dto.branchIds,
        status: dto.status,
      });
    } catch (error) {
      if (this.plansRepository.isUniqueConflict(error)) {
        throw this.plansRepository.nameTakenError();
      }
      throw error;
    }
  }

  /**
   * Home branch (member) is not this. This is where the plan can be used.
   * allBranches true = every location; false = the listed set only.
   */
  private assertBranchScope(args: {
    allBranches: boolean;
    branchIds?: string[];
    switchingToSelected: boolean;
  }): void {
    if (args.allBranches) {
      if (args.branchIds?.length) {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.BRANCH_NOT_ALLOWED,
          'All-locations plans must not list selected branches',
        );
      }
      return;
    }

    if (
      (args.switchingToSelected && !args.branchIds?.length) ||
      (args.branchIds && args.branchIds.length === 0)
    ) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.PLAN_BRANCHES_REQUIRED,
        'Selected-location plans must list at least one branch',
      );
    }
  }
}
