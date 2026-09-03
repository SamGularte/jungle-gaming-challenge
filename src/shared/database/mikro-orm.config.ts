import { defineConfig } from '@mikro-orm/postgresql';
import { WalletEntitySchema } from '../../modules/wallet/infrastructure/persistence/mikro-orm/entities/wallet.entity';
import { LedgerEntryEntitySchema } from '../../modules/wallet/infrastructure/persistence/mikro-orm/entities/ledger-entry.entity';
import { WagerTransactionEntitySchema } from '../../modules/wagering/infrastructure/persistence/mikro-orm/entities/wager-transaction.entity';
import { InboxMessageEntitySchema } from '../../modules/shared/infrastructure/persistence/mikro-orm/entities/inbox-message.entity';
import { OutboxMessageEntitySchema } from '../../modules/shared/infrastructure/persistence/mikro-orm/entities/outbox-message.entity';

export default defineConfig({
  clientUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jungle_gaming',
  entities: [
    WalletEntitySchema,
    LedgerEntryEntitySchema,
    WagerTransactionEntitySchema,
    InboxMessageEntitySchema,
    OutboxMessageEntitySchema,
  ],
  migrations: {
    path: './src/shared/database/migrations',
    pathTs: './src/shared/database/migrations',
  },
  debug: process.env.NODE_ENV !== 'production',
});
