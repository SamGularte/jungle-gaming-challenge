import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { WageringController, ProviderTransactionController } from './presentation/controllers/wagering.controller';
import { TransactionService } from './application/services/transaction.service';
import { WagerTransactionRepository } from './infrastructure/persistence/repositories/wager-transaction.repository';
import { WagerTransactionEntity } from './infrastructure/persistence/mikro-orm/entities/wager-transaction.entity';
import { WalletModule } from '../wallet/wallet.module';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [
    MikroOrmModule.forFeature([WagerTransactionEntity]),
    WalletModule,
    SharedModule,
  ],
  controllers: [WageringController, ProviderTransactionController],
  providers: [TransactionService, WagerTransactionRepository],
  exports: [TransactionService],
})
export class WageringModule {}
