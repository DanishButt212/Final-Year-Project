import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { Request } from 'express';
import { fullName, RequestMeta } from '../admin/constants';
import { AuditAction, AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { Messages } from '../common/messages';
import { PageQueryDto, pageMeta } from '../common/pagination';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { Trim, TrimOrUndefined } from '../common/validators';
import { FeedbackCategory, FeedbackStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const FEEDBACK_SUBMITTED_MESSAGE = 'Feedback Submitted Successfully.';
export const FEEDBACK_UPDATED_MESSAGE = 'Feedback records parsed and updated.';
const HOURLY_LIMIT = 5;

const MESSAGE_RANGE = 'Enter your feedback in 10 to 2000 characters.';

export class SubmitFeedbackDto {
  @Trim()
  @IsNotEmpty({ message: MESSAGE_RANGE })
  @IsString()
  @MinLength(10, { message: MESSAGE_RANGE })
  @MaxLength(2000, { message: MESSAGE_RANGE })
  message: string;

  @IsEnum(FeedbackCategory, { message: 'Choose a feedback category.' })
  category: FeedbackCategory;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Rating must be from 1 to 5.' })
  @Max(5, { message: 'Rating must be from 1 to 5.' })
  rating?: number;
}

export class AdminFeedbackQueryDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(FeedbackStatus)
  status?: FeedbackStatus;

  @IsOptional()
  @IsEnum(FeedbackCategory)
  category?: FeedbackCategory;

  @TrimOrUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class UpdateFeedbackDto {
  @IsOptional()
  @IsEnum(FeedbackStatus)
  status?: FeedbackStatus;

  @IsOptional()
  @IsBoolean()
  forwardToMaintenance?: boolean;
}

const include = {
  user: { select: { firstName: true, lastName: true, role: true, email: true } },
  reviewer: { select: { firstName: true, lastName: true } },
} satisfies Prisma.FeedbackInclude;

type Row = Prisma.FeedbackGetPayload<{ include: typeof include }>;

const view = (f: Row) => ({
  id: f.id,
  message: f.message,
  category: f.category,
  rating: f.rating,
  status: f.status,
  forwardToMaintenance: f.forwardToMaintenance,
  createdAt: f.createdAt,
  reviewedAt: f.reviewedAt,
  reviewedBy: f.reviewer ? fullName(f.reviewer) : null,
  user: f.user ? { name: fullName(f.user), role: f.user.role, email: f.user.email } : null,
});

/** UC-5.4 Submit System Feedback and the admin "User Feedback Analysis & Quality Control". */
@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async submit(user: AuthUser, dto: SubmitFeedbackDto, meta: RequestMeta) {
    const recent = await this.prisma.feedback.count({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
    });
    if (recent >= HOURLY_LIMIT) {
      throw new HttpException(
        {
          code: 'TOO_MANY_REQUESTS',
          message: `You can send up to ${HOURLY_LIMIT} feedback messages per hour. Please try again later.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const f = await this.prisma.feedback.create({
      data: { userId: user.id, message: dto.message, category: dto.category, rating: dto.rating },
    });
    await this.audit.log({
      action: AuditAction.FEEDBACK_SUBMITTED,
      actorId: user.id,
      actorRole: user.role,
      entity: 'Feedback',
      entityId: f.id,
      metadata: { category: dto.category },
      ...meta,
    });
    return { message: FEEDBACK_SUBMITTED_MESSAGE };
  }

  async list(q: AdminFeedbackQueryDto) {
    const where: Prisma.FeedbackWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.search ? { message: { contains: q.search, mode: 'insensitive' } } : {}),
    };
    const [total, rows, byCategory, avg, byStatus] = await this.prisma.$transaction([
      this.prisma.feedback.count({ where }),
      this.prisma.feedback.findMany({
        where,
        include,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.feedback.groupBy({
        by: ['category'],
        _count: { _all: true },
        orderBy: { category: 'asc' },
      }),
      this.prisma.feedback.aggregate({ _avg: { rating: true }, _count: { rating: true } }),
      this.prisma.feedback.groupBy({
        by: ['status'],
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
    ]);
    return {
      data: rows.map(view),
      meta: pageMeta(q.page, q.limit, total),
      summary: {
        byCategory: Object.fromEntries(byCategory.map((c) => [c.category, c._count._all])),
        byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
        averageRating: avg._avg.rating === null ? null : Math.round(avg._avg.rating * 10) / 10,
        ratedCount: avg._count.rating,
      },
    };
  }

  async update(actor: AuthUser, id: string, dto: UpdateFeedbackDto, meta: RequestMeta) {
    if (dto.status === undefined && dto.forwardToMaintenance === undefined) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: Messages.INVALID_FIELDS,
        details: [
          { field: 'status', messages: ['Choose a status or tag the item for maintenance.'] },
        ],
      });
    }
    const existing = await this.prisma.feedback.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(Messages.NOT_FOUND);
    const f = await this.prisma.feedback.update({
      where: { id },
      data: {
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.forwardToMaintenance !== undefined
          ? { forwardToMaintenance: dto.forwardToMaintenance }
          : {}),
        reviewedById: actor.id,
        reviewedAt: new Date(),
      },
      include,
    });
    await this.audit.log({
      action: AuditAction.FEEDBACK_REVIEWED,
      actorId: actor.id,
      actorRole: actor.role,
      entity: 'Feedback',
      entityId: id,
      metadata: {
        from: existing.status,
        to: f.status,
        forwardToMaintenance: f.forwardToMaintenance,
      },
      ...meta,
    });
    return { message: FEEDBACK_UPDATED_MESSAGE, feedback: view(f) };
  }
}

const meta = (req: Request): RequestMeta => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

@ApiTags('feedback')
@ApiCookieAuth()
@ApiBearerAuth()
@Controller()
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Roles('LITIGANT', 'LAWYER')
  @HttpCode(HttpStatus.CREATED)
  @Post('feedback')
  submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitFeedbackDto, @Req() req: Request) {
    return this.feedback.submit(user, dto, meta(req));
  }

  @Roles('ADMIN')
  @Get('admin/feedback')
  list(@Query() q: AdminFeedbackQueryDto) {
    return this.feedback.list(q);
  }

  @Roles('ADMIN')
  @Patch('admin/feedback/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: UpdateFeedbackDto,
    @Req() req: Request,
  ) {
    return this.feedback.update(user, id, dto, meta(req));
  }
}

@Module({ controllers: [FeedbackController], providers: [FeedbackService] })
export class FeedbackModule {}
