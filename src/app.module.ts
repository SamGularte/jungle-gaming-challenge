import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { HealthModule } from './modules/health/health.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { WageringModule } from './modules/wagering/wagering.module';
import { SharedModule } from './modules/shared/shared.module';
import { OutboxPublisherWorker } from './workers/outbox-publisher.worker';
import { SqsConsumerWorker } from './workers/sqs-consumer.worker';
import { PendingReferenceWorker } from './workers/pending-reference.worker';
import config from './shared/database/mikro-orm.config';

@Module({
  imports: [
    MikroOrmModule.forRoot(config),
    HealthModule,
    WalletModule,
    WageringModule,
    SharedModule,
  ],
  providers: [OutboxPublisherWorker, SqsConsumerWorker, PendingReferenceWorker],
})
export class AppModule {}
