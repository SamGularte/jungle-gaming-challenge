import { Migration } from '@mikro-orm/migrations';

export class Migration20250603000000 extends Migration {
  async up(): Promise<void> {
    // 1. Add prevent_ledger_delete trigger
    this.addSql(`
      CREATE OR REPLACE FUNCTION prevent_ledger_delete()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'Ledger entries are immutable and cannot be deleted';
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);

    this.addSql(`
      CREATE TRIGGER trg_prevent_ledger_delete
      BEFORE DELETE ON ledger_entries
      FOR EACH ROW
      EXECUTE FUNCTION prevent_ledger_delete();
    `);

    // 2. Add UNIQUE(wallet_id, transaction_id) to ledger_entries
    this.addSql(`
      ALTER TABLE ledger_entries
      ADD CONSTRAINT uq_ledger_wallet_transaction UNIQUE (wallet_id, transaction_id);
    `);

    // 3. Add amount >= 0 CHECK constraints
    this.addSql(`
      ALTER TABLE ledger_entries
      ADD CONSTRAINT ledger_amount_non_negative CHECK (amount >= 0);
    `);

    this.addSql(`
      ALTER TABLE wager_transactions
      ADD CONSTRAINT wager_amount_non_negative CHECK (amount >= 0);
    `);

    // 4. Remove 'REVERSAL' from kind CHECK (not in domain model)
    this.addSql(`
      ALTER TABLE wager_transactions DROP CONSTRAINT IF EXISTS kind_check;
    `);

    this.addSql(`
      ALTER TABLE wager_transactions
      ADD CONSTRAINT kind_check CHECK (kind IN ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK'));
    `);

    // 5. Remove hardcoded currency CHECK — allow any 3-char ISO-4217
    this.addSql(`
      ALTER TABLE wallets DROP CONSTRAINT IF EXISTS wallets_currency_check;
    `);
    this.addSql(`
      ALTER TABLE wallets
      ADD CONSTRAINT wallets_currency_check CHECK (length(currency) = 3);
    `);

    this.addSql(`
      ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_currency_check;
    `);
    this.addSql(`
      ALTER TABLE ledger_entries
      ADD CONSTRAINT ledger_entries_currency_check CHECK (length(currency) = 3);
    `);

    this.addSql(`
      ALTER TABLE wager_transactions DROP CONSTRAINT IF EXISTS wager_transactions_currency_check;
    `);
    this.addSql(`
      ALTER TABLE wager_transactions
      ADD CONSTRAINT wager_transactions_currency_check CHECK (length(currency) = 3);
    `);

    // 6. Add composite index for reference lookups
    this.addSql(`
      CREATE INDEX idx_wager_transactions_provider_external
      ON wager_transactions(provider_id, external_transaction_id);
    `);

    // 7. Add index for PENDING_REFERENCE processing with backoff
    this.addSql(`
      CREATE INDEX idx_wager_transactions_pending_reference
      ON wager_transactions(status, retry_count, created_at)
      WHERE status = 'PENDING_REFERENCE';
    `);

    // 8. Add TTL column for PENDING_REFERENCE
    this.addSql(`
      ALTER TABLE wager_transactions
      ADD COLUMN pending_reference_expires_at TIMESTAMP;
    `);
  }

  async down(): Promise<void> {
    this.addSql('ALTER TABLE wager_transactions DROP COLUMN IF EXISTS pending_reference_expires_at;');
    this.addSql('DROP INDEX IF EXISTS idx_wager_transactions_pending_reference;');
    this.addSql('DROP INDEX IF EXISTS idx_wager_transactions_provider_external;');
    this.addSql('ALTER TABLE wager_transactions DROP CONSTRAINT IF EXISTS wager_transactions_currency_check;');
    this.addSql(`
      ALTER TABLE wager_transactions
      ADD CONSTRAINT wager_transactions_currency_check CHECK (currency IN ('BRL', 'USD', 'EUR'));
    `);
    this.addSql('ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_currency_check;');
    this.addSql(`
      ALTER TABLE ledger_entries
      ADD CONSTRAINT ledger_entries_currency_check CHECK (currency IN ('BRL', 'USD', 'EUR'));
    `);
    this.addSql('ALTER TABLE wallets DROP CONSTRAINT IF EXISTS wallets_currency_check;');
    this.addSql(`
      ALTER TABLE wallets
      ADD CONSTRAINT wallets_currency_check CHECK (currency IN ('BRL', 'USD', 'EUR'));
    `);
    this.addSql('ALTER TABLE wager_transactions DROP CONSTRAINT IF EXISTS kind_check;');
    this.addSql(`
      ALTER TABLE wager_transactions
      ADD CONSTRAINT kind_check CHECK (kind IN ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK', 'REVERSAL'));
    `);
    this.addSql('ALTER TABLE wager_transactions DROP CONSTRAINT IF EXISTS wager_amount_non_negative;');
    this.addSql('ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_amount_non_negative;');
    this.addSql('ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS uq_ledger_wallet_transaction;');
    this.addSql('DROP TRIGGER IF EXISTS trg_prevent_ledger_delete ON ledger_entries;');
    this.addSql('DROP FUNCTION IF EXISTS prevent_ledger_delete;');
  }
}
