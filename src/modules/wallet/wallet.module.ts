import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { WalletController } from './presentation/controllers/wallet.controller';
import { WalletService } from './application/services/wallet.service';
import { WalletRepository } from './infrastructure/persistence/repositories/wallet.repository';
import { LedgerRepository } from './infrastructure/persistence/repositories/ledger.repository';
import { WalletEntity } from './infrastructure/persistence/mikro-orm/entities/wallet.entity';
import { LedgerEntryEntity } from './infrastructure/persistence/mikro-orm/entities/ledger-entry.entity';
import { WagerTransactionEntity } from '../wagering/infrastructure/persistence/mikro-orm/entities/wager-transaction.entity';
import { OutboxMessageEntity } from '../shared/infrastructure/persistence/mikro-orm/entities/outbox-message.entity';

@Module({
  imports: [
    MikroOrmModule.forFeature([
      WalletEntity,
      LedgerEntryEntity,
      WagerTransactionEntity,
      OutboxMessageEntity,
    ]),
  ],
  controllers: [WalletController],
  providers: [WalletService, WalletRepository, LedgerRepository],
  exports: [WalletService, WalletRepository, LedgerRepository],
})
export class WalletModule {}
