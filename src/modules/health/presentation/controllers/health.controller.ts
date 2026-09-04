import { Controller, Get, Inject } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { SQSClient, GetQueueUrlCommand } from '@aws-sdk/client-sqs';
import { MetricsService } from '../../../shared/infrastructure/metrics/metrics.service';

@Controller('health')
export class HealthController {
  private readonly sqsClient: SQSClient;

  constructor(
    @Inject(EntityManager) private readonly em: EntityManager,
    private readonly metrics: MetricsService,
  ) {
    this.sqsClient = new SQSClient({
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.AWS_ENDPOINT || 'http://localhost:4566',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
      },
    });
  }

  @Get('live')
  liveness() {
    this.metrics.healthCheck('liveness', 'ok');
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async readiness() {
    const result: Record<string, string> = { timestamp: new Date().toISOString() };

    try {
      await this.em.execute('SELECT 1');
      result.database = 'connected';
    } catch {
      result.database = 'disconnected';
    }

    try {
      await this.sqsClient.send(new GetQueueUrlCommand({
        QueueName: 'wager-transactions.fifo',
      }));
      result.sqs = 'connected';
    } catch {
      result.sqs = 'disconnected';
    }

    const allOk = result.database === 'connected' && result.sqs === 'connected';
    result.status = allOk ? 'ok' : 'degraded';
    this.metrics.healthCheck('readiness', allOk ? 'ok' : 'degraded');

    return result;
  }
}
