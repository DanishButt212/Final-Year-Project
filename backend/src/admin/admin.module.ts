import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { AdminAuditController, AdminAuditService } from './admin-audit.service';
import { AdminCasesService } from './admin-cases.service';
import { AdminCourtsService } from './admin-courts.service';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminLawyersService } from './admin-lawyers.service';
import { AdminUsersService } from './admin-users.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [CasesModule],
  controllers: [AdminController, AdminAuditController],
  providers: [
    AdminDashboardService,
    AdminUsersService,
    AdminLawyersService,
    AdminCourtsService,
    AdminCasesService,
    AdminAuditService,
  ],
})
export class AdminModule {}
