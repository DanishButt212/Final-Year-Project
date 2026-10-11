import { Module } from '@nestjs/common';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

/** Role-scoped dashboard chart data. */
@Module({ controllers: [InsightsController], providers: [InsightsService] })
export class InsightsModule {}
