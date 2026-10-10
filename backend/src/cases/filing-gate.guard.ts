import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthUser } from '../common/decorators';
import { CasesService } from './cases.service';

/**
 * Runs before the upload interceptor on POST /cases: registration must be open and a lawyer must be verified.
 * So a refused filer gets 403 before any file is received or the body is validated.
 */
@Injectable()
export class FilingGateGuard implements CanActivate {
  constructor(private readonly cases: CasesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest<Request & { user: AuthUser }>().user;
    await this.cases.assertCanFile(user);
    return true;
  }
}
