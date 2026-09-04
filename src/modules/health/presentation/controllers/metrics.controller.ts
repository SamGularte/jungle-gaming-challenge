import { Controller, Get } from '@nestjs/common';
import { MetricsService } from '../../../shared/infrastructure/metrics/metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  getMetrics() {
    return this.metrics.getAll();
  }
}
