import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { RequestMeta } from '../admin/constants';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { LockEvidenceDto } from './evidence.dto';
import { EvidenceUploadInterceptor } from './evidence-upload.interceptor';
import { EvidenceService } from './evidence.service';

const meta = (req: Request): RequestMeta => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

/**
 * Evidence vault. The filer, the lawyers on the case, the case's judge and admins can read and download;
 * only the filer and the lawyers upload. Anyone else gets 404. Role checks live in the service.
 */
@ApiTags('evidence')
@ApiCookieAuth()
@ApiBearerAuth()
@Controller('cases')
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  @Get(':id/vault')
  vault(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.evidence.vault(user, id);
  }

  /** "Submit Exhibit Entry to Vault": multipart with `files`, `category` and `description`. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(EvidenceUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @HttpCode(HttpStatus.CREATED)
  @Post(':id/evidence')
  upload(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: Request,
  ) {
    return this.evidence.upload(user, id, body, files ?? [], meta(req));
  }

  @Patch(':id/evidence/:eid')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Param('eid', ParseIdPipe) eid: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    return this.evidence.updateDescription(user, id, eid, body, meta(req));
  }

  @Delete(':id/evidence/:eid')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Param('eid', ParseIdPipe) eid: string,
    @Req() req: Request,
  ) {
    return this.evidence.remove(user, id, eid, meta(req));
  }

  @Get(':id/evidence/:eid/download')
  download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Param('eid', ParseIdPipe) eid: string,
    @Req() req: Request,
  ) {
    return this.evidence.download(user, id, eid, meta(req));
  }

  @Get(':id/pleadings/:docId/download')
  pleading(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Param('docId', ParseIdPipe) docId: string,
    @Req() req: Request,
  ) {
    return this.evidence.downloadPleading(user, id, docId, meta(req));
  }
}

/** "Lock evidence by order of the bench": only the judge the case is allocated to. */
@ApiTags('evidence')
@ApiCookieAuth()
@ApiBearerAuth()
@Roles('JUDGE')
@Controller('judge/cases')
export class JudgeEvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  @HttpCode(HttpStatus.OK)
  @Post(':id/evidence/lock')
  lock(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: LockEvidenceDto,
    @Req() req: Request,
  ) {
    return this.evidence.lock(user, id, dto, meta(req));
  }
}
