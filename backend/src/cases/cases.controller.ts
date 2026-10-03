import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { ParseIdPipe } from '../common/parse-id.pipe';
import { CasesService, RequestMeta } from './cases.service';
import { ListCasesQueryDto } from './dto/create-case.dto';
import { PdfUploadInterceptor } from './pdf-upload.interceptor';

/** Uploads are limited per client (UPLOAD_THROTTLE_LIMIT per minute, default 20). */
const uploadThrottle = () => ({
  default: { limit: () => Number(process.env.UPLOAD_THROTTLE_LIMIT ?? 20), ttl: () => 60_000 },
});

const meta = (req: Request): RequestMeta => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

const multipartSchema = {
  type: 'object',
  properties: {
    data: {
      type: 'string',
      description:
        'JSON: { caseType, title?, reliefSought, petitioners: [{name, cnic?, address?, phone?}], respondents: [...] }',
    },
    files: { type: 'array', items: { type: 'string', format: 'binary' }, maxItems: 10 },
  },
  required: ['data'],
};

@ApiTags('cases')
@ApiCookieAuth()
@ApiBearerAuth()
@Roles('LITIGANT', 'LAWYER')
@Controller('cases')
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  /** UC-2.1 / UC-2.2: submit a new case with 0..10 PDF pleadings. Generates the UCN. */
  @Throttle(uploadThrottle())
  @UseInterceptors(PdfUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: multipartSchema })
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: Request,
  ) {
    return this.cases.create(user, body, files ?? [], meta(req));
  }

  /** Dashboard numbers: total, pending assignment, five most recent cases. */
  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.cases.summary(user);
  }

  /** UC-2.3: the caller's own case portfolio (paginated, searchable, filterable by status). */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListCasesQueryDto) {
    return this.cases.list(user, query);
  }

  /** Case details with parties, documents and lifecycle events. 404 if it is not the caller's. */
  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: string) {
    return this.cases.detail(user, id);
  }

  /** UC-2.2: attach more PDFs to an active case. Documents are locked once attached. */
  @Throttle(uploadThrottle())
  @UseInterceptors(PdfUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { files: multipartSchema.properties.files } } })
  @HttpCode(HttpStatus.CREATED)
  @Post(':id/documents')
  addDocuments(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: Request,
  ) {
    return this.cases.addDocuments(user, id, files ?? [], meta(req));
  }

  /** Streams the original PDF as an attachment. There is deliberately no update or delete route. */
  @Get(':id/documents/:docId/download')
  download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Param('docId', ParseIdPipe) docId: string,
    @Req() req: Request,
  ) {
    return this.cases.download(user, id, docId, meta(req));
  }
}
