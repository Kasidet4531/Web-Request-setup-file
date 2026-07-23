import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from '../auth/auth.service';
import type {
  AuthenticatedRequest,
  AuthenticatedUserProfile,
} from '../auth/session.types';
import {
  ExcelExportService,
  type RequestExportFilters,
} from './excel_export.service';

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Controller('requests')
export class ExportController {
  constructor(
    private readonly excelExportService: ExcelExportService,
    private readonly authService: AuthService,
  ) {}

  @Get('export.xlsx')
  async exportRequests(
    @Query() query: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    const actor = await this.getAuthenticatedActor(request);

    if (actor.role !== 'admin') {
      throw new ForbiddenException('Only admins can export requests.');
    }

    const exportResult = await this.excelExportService.exportRequests(
      this.parseExportFilters(query),
    );

    response.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${exportResult.filename}"`,
    );

    response.end(exportResult.content);
  }

  private parseExportFilters(
    query: Record<string, unknown>,
  ): RequestExportFilters {
    const status = this.readOptionalScalar(query.status, 'status')?.trim();
    const requestDateFrom = this.readOptionalScalar(query.from, 'from')?.trim();
    const requestDateTo = this.readOptionalScalar(query.to, 'to')?.trim();

    this.validateOptionalCalendarDate(requestDateFrom, 'from');
    this.validateOptionalCalendarDate(requestDateTo, 'to');

    return {
      ...(status ? { status } : {}),
      ...(requestDateFrom ? { requestDateFrom } : {}),
      ...(requestDateTo ? { requestDateTo } : {}),
    };
  }

  private readOptionalScalar(value: unknown, name: string): string | undefined {
    if (typeof value === 'undefined') {
      return undefined;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException(`${name} must be a single value.`);
    }

    return value;
  }

  private validateOptionalCalendarDate(
    value: string | undefined,
    name: string,
  ): void {
    const normalizedValue = value?.trim();

    if (!normalizedValue) {
      return;
    }

    const parsedDate = new Date(`${normalizedValue}T00:00:00.000Z`);

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue) ||
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== normalizedValue
    ) {
      throw new BadRequestException(
        `${name} must be a valid ISO calendar date.`,
      );
    }
  }

  private async getAuthenticatedActor(
    request: AuthenticatedRequest,
  ): Promise<AuthenticatedUserProfile> {
    const userId = request.session.userId;

    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    const actor = await this.authService.getProfile(userId);

    if (!actor) {
      request.session.userId = undefined;
      throw new UnauthorizedException('Not authenticated');
    }

    return actor;
  }
}
