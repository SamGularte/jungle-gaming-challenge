import { Migration } from '@mikro-orm/migrations';

export class Migration20250602000000 extends Migration {
  async up(): Promise<void> {
    // Update kind CHECK constraint to include REVERSAL (for backwards compat)
    this.addSql(`
      ALTER TABLE wager_transactions DROP CONSTRAINT IF EXISTS kind_check;
    `);

    this.addSql(`
      ALTER TABLE wager_transactions
      ADD CONSTRAINT kind_check CHECK (kind IN ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK', 'REVERSAL'));
    `);

    // Add retryCount column
    this.addSql(`
      ALTER TABLE wager_transactions ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
    `);

    // Add ledger arithmetic constraint:
    // DEBIT: balance_before - amount = balance_after
    // CREDIT: balance_before + amount = balance_after
    this.addSql(`
      ALTER TABLE ledger_entries
      ADD CONSTRAINT ledger_arithmetic_check CHECK (
        (direction = 'DEBIT' AND balance_before - amount = balance_after) OR
        (direction = 'CREDIT' AND balance_before + amount = balance_after)
      );
    `);

    // Add index for retry processing
    this.addSql(`
      CREATE INDEX idx_wager_transactions_retry_count ON wager_transactions(retry_count);
    `);
  }

  async down(): Promise<void> {
    this.addSql('DROP INDEX IF EXISTS idx_wager_transactions_retry_count;');
    this.addSql('ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_arithmetic_check;');
    this.addSql('ALTER TABLE wager_transactions DROP COLUMN IF EXISTS retry_count;');
    this.addSql('ALTER TABLE wager_transactions DROP CONSTRAINT IF EXISTS kind_check;');
    this.addSql(`
      ALTER TABLE wager_transactions
      ADD CONSTRAINT kind_check CHECK (kind IN ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK'));
    `);
  }
}
