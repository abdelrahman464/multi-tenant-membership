import { HttpStatus, Injectable } from '@nestjs/common';
import { COUNTRY_DEFAULTS } from './constants/country.defaults';
import { ErrorCode } from '../../common/constants/error-codes';
import { CountryCode } from './enums/country-code.enum';
import { TenantStatus } from './enums/tenant-status.enum';
import { AppHttpException } from '../../common/errors/app-http.exception';
import { generateUniqueSlug } from '../../common/utils/slug.util';
import { CreateBranchDto } from './dto/create-branch.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { ListBranchesQueryDto } from './dto/list-branches-query.dto';
import { ListTenantsQueryDto } from './dto/list-tenants-query.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import { HashService } from '../../common/security/hash.service';
import { TenantsRepository } from './repository/tenants.repository';

@Injectable()
export class TenantsService {
  constructor(
    private readonly tenantsRepository: TenantsRepository,
    private readonly hashService: HashService,
  ) {}

  async create(dto: CreateTenantDto) {
    const name = dto.name.trim();
    const slug = await generateUniqueSlug({
      title: dto.slug?.trim() || name,
      findExisting: (base) => this.tenantsRepository.findSlugsLike(base),
    });
    const branchName = dto.firstBranch.name.trim();
    const { timezone, currency } = COUNTRY_DEFAULTS[CountryCode.EG];

    try {
      return await this.tenantsRepository.createWithFirstBranch({
        name,
        slug,
        firstBranch: { name: branchName },
        firstOwner: {
          name: dto.firstOwner.name.trim(),
          email: dto.firstOwner.email,
          password: await this.hashService.hash(dto.firstOwner.password),
        },
        timezone,
        currency,
      });
    } catch (error) {
      if (this.tenantsRepository.isUniqueConflict(error)) {
        throw this.tenantsRepository.slugTakenError();
      }
      throw error;
    }
  }

  list(query: ListTenantsQueryDto) {
    return this.tenantsRepository.findAll(query);
  }

  async getById(id: string) {
    const tenant = await this.tenantsRepository.findById(id);
    if (!tenant) {
      throw new AppHttpException(
        HttpStatus.NOT_FOUND,
        ErrorCode.TENANT_NOT_FOUND,
        'Tenant not found',
      );
    }
    return tenant;
  }

  async suspend(id: string) {
    const tenant = await this.getById(id);
    if (tenant.status === TenantStatus.SUSPENDED) {
      throw new AppHttpException(
        HttpStatus.CONFLICT,
        ErrorCode.TENANT_ALREADY_SUSPENDED,
        'Tenant is already suspended',
      );
    }
    return this.tenantsRepository.updateStatus(id, TenantStatus.SUSPENDED);
  }

  async reactivate(id: string) {
    const tenant = await this.getById(id);
    if (tenant.status === TenantStatus.ACTIVE) {
      throw new AppHttpException(
        HttpStatus.CONFLICT,
        ErrorCode.TENANT_NOT_SUSPENDED,
        'Tenant is not suspended',
      );
    }
    return this.tenantsRepository.updateStatus(id, TenantStatus.ACTIVE);
  }

  async update(id: string, dto: UpdateTenantDto) {
    await this.getById(id);

    const data: { name?: string; slug?: string } = {};
    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }
    if (dto.slug !== undefined) {
      data.slug = await generateUniqueSlug({
        title: dto.slug.trim(),
        findExisting: (base) => this.tenantsRepository.findSlugsLike(base, id),
      });
    }

    if (!data.name && !data.slug) {
      return this.getById(id);
    }

    try {
      return await this.tenantsRepository.update(id, data);
    } catch (error) {
      if (this.tenantsRepository.isUniqueConflict(error)) {
        throw this.tenantsRepository.slugTakenError();
      }
      throw error;
    }
  }

  async remove(id: string) {
    await this.getById(id);
    await this.tenantsRepository.delete(id);
  }

  getSettings(tenantId: string) {
    return this.tenantsRepository.findSettings(tenantId);
  }

  async updateSettings(tenantId: string, dto: UpdateTenantSettingsDto) {
    const current = await this.tenantsRepository.findSettings(tenantId);
    const graceEnabled = dto.graceEnabled ?? current.graceEnabled;
    const graceDays = dto.graceDays ?? current.graceDays;
    if (graceEnabled && graceDays < 1) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.GRACE_DAYS_REQUIRED,
        'Grace days must be at least 1 when grace is enabled',
      );
    }
    const freezeEnabled = dto.freezeEnabled ?? current.freezeEnabled;
    const maxFreezeDays = dto.maxFreezeDays ?? current.maxFreezeDays;
    const maxFreezeDaysPerYear =
      dto.maxFreezeDaysPerYear ?? current.maxFreezeDaysPerYear;
    if (freezeEnabled && maxFreezeDays < 1) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.MAX_FREEZE_DAYS_REQUIRED,
        'Max freeze days must be at least 1 when freeze is enabled',
      );
    }
    if (freezeEnabled && maxFreezeDaysPerYear < 1) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.MAX_FREEZE_DAYS_PER_YEAR_REQUIRED,
        'Max freeze days per year must be at least 1 when freeze is enabled',
      );
    }
    return this.tenantsRepository.updateSettings(tenantId, dto);
  }

  listBranches(tenantId: string, query: ListBranchesQueryDto) {
    return this.tenantsRepository.findBranchesByTenant(tenantId, query);
  }

  async addBranch(tenantId: string, dto: CreateBranchDto) {
    await this.getById(tenantId);
    try {
      return await this.tenantsRepository.addBranch(tenantId, {
        name: dto.name.trim(),
      });
    } catch (error) {
      if (this.tenantsRepository.isUniqueConflict(error)) {
        throw this.tenantsRepository.branchNameTakenError();
      }
      throw error;
    }
  }
}
