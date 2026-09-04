import { MikroORM } from '@mikro-orm/postgresql';
import { WalletRepository } from '../../../wallet/infrastructure/persistence/repositories/wallet.repository';
import { LedgerRepository } from '../../../wallet/infrastructure/persistence/repositories/ledger.repository';
import { WagerTransactionRepository } from '../../../wagering/infrastructure/persistence/repositories/wager-transaction.repository';
import { OutboxRepository } from '../../../shared/infrastructure/persistence/repositories/outbox.repository';
import { InboxRepository } from '../../../shared/infrastructure/persistence/repositories/inbox.repository';
import { TransactionService } from '../../../wagering/application/services/transaction.service';
import { Wallet } from '../../../wallet/domain/aggregates/wallet';
import { Money } from '../../../wallet/domain/value-objects/money';
import config from '../../../../shared/database/mikro-orm.config';

export async function setupTestDb() {
  const orm = await MikroORM.init({
    ...config,
    allowGlobalContext: true,
  });
  await orm.schema.drop();
  await orm.schema.create();
  return orm;
}

export function createRepositories(orm: MikroORM) {
  const em = orm.em.fork();
  return {
    walletRepository: new WalletRepository(em),
    ledgerRepository: new LedgerRepository(em),
    transactionRepository: new WagerTransactionRepository(em),
    outboxRepository: new OutboxRepository(em),
    inboxRepository: new InboxRepository(em),
  };
}

export function createTransactionService(orm: MikroORM) {
  const { walletRepository, ledgerRepository, transactionRepository, outboxRepository } =
    createRepositories(orm);
  return new TransactionService(
    transactionRepository,
    walletRepository,
    ledgerRepository,
    outboxRepository,
  );
}

export async function createTestWallet(
  orm: MikroORM,
  playerId: string = crypto.randomUUID(),
  initialBalance: string = '1000.00',
) {
  const em = orm.em.fork();
  const walletRepository = new WalletRepository(em);
  const wallet = Wallet.open({
    id: crypto.randomUUID(),
    playerId,
    initialBalance: Money.from({ amount: initialBalance, currency: 'BRL' }),
  });
  await walletRepository.save(wallet);
  return wallet;
}

export async function cleanupTestDb(orm: MikroORM) {
  const em = orm.em.fork();
  await em.execute('DELETE FROM outbox_messages');
  await em.execute('DELETE FROM inbox_messages');
  await em.execute('DELETE FROM wager_transactions');
  await em.execute('DELETE FROM ledger_entries');
  await em.execute('DELETE FROM wallets');
}
