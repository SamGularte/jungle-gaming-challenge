import { Controller, Get } from '@nestjs/common';
import { MikroORM } from '@mikro-orm/postgresql';

@Controller('health')
export class HealthController {
  constructor(private readonly orm: MikroORM) {}

  @Get('live')
  liveness() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async readiness() {
    try {
      const isConnected = await this.orm.isConnected();
      return {
        status: isConnected ? 'ok' : 'down',
        database: isConnected ? 'connected' : 'disconnected',
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
