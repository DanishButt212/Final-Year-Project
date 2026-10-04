import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { AdminCasesService } from './admin-cases.service';
import { AdminCourtsService } from './admin-courts.service';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminLawyersService } from './admin-lawyers.service';
import { AdminUsersService } from './admin-users.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [CasesModule],
  controllers: [AdminController],
  providers: [
    AdminDashboardService,
    AdminUsersService,
    AdminLawyersService,
    AdminCourtsService,
    AdminCasesService,
  ],
})
export class AdminModule {}
