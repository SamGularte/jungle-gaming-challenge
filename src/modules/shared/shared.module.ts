import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { OutboxRepository } from './infrastructure/persistence/repositories/outbox.repository';
import { InboxRepository } from './infrastructure/persistence/repositories/inbox.repository';
import { OutboxMessageEntity } from './infrastructure/persistence/mikro-orm/entities/outbox-message.entity';
import { InboxMessageEntity } from './infrastructure/persistence/mikro-orm/entities/inbox-message.entity';
import { OutboxPublisher } from './infrastructure/workers/outbox-publisher';
import { SqsConsumer } from './infrastructure/workers/sqs-consumer';
import { MetricsService } from './infrastructure/metrics/metrics.service';

@Module({
  imports: [MikroOrmModule.forFeature([OutboxMessageEntity, InboxMessageEntity])],
  providers: [OutboxRepository, InboxRepository, OutboxPublisher, SqsConsumer, MetricsService],
  exports: [OutboxRepository, InboxRepository, OutboxPublisher, SqsConsumer, MetricsService],
})
export class SharedModule {}
