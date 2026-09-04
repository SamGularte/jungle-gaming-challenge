import { Module } from '@nestjs/common';
import { HealthController } from './presentation/controllers/health.controller';
import { MetricsController } from './presentation/controllers/metrics.controller';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [HealthController, MetricsController],
})
export class HealthModule {}
