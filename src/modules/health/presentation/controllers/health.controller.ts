import { Controller, Get, Inject } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';

@Controller('health')
export class HealthController {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  @Get('live')
  liveness() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async readiness() {
    try {
      await this.em.execute('SELECT 1');
      return {
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch {
      return {
        status: 'down',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
      };
    }
  }
}
