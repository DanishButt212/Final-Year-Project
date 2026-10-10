import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthUser } from '../common/decorators';
import { EvidenceService } from './evidence.service';

/**
 * Runs before the upload interceptor on POST /cases/:id/evidence: only a party of an allocated, undecided case
 * may upload. Anyone else is refused (404/403/409) before any file is streamed to the temp folder.
 */
@Injectable()
export class EvidenceUploadGuard implements CanActivate {
  constructor(private readonly evidence: EvidenceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user: AuthUser }>();
    await this.evidence.assertCanUpload(req.user, String(req.params.id));
    return true;
  }
}
