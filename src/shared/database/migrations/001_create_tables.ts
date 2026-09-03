import { Migration } from '@mikro-orm/migrations';

export class Migration20250601000000 extends Migration {
  async up(): Promise<void> {
    // ============================================
    // 1. TABELA: wallets
    // ============================================
    this.addSql(`
      CREATE TABLE wallets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        player_id UUID NOT NULL,
        currency VARCHAR(3) NOT NULL,
        balance DECIMAL(20,2) NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (player_id, currency),
        CHECK (balance >= 0),
        CHECK (version >= 1),
        CHECK (currency IN ('BRL', 'USD', 'EUR'))
      );
    `);

    // ============================================
    // 2. TABELA: ledger_entries
    // ============================================
    this.addSql(`
      CREATE TABLE ledger_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
        transaction_id UUID NOT NULL,
        direction VARCHAR(10) NOT NULL,
        amount DECIMAL(20,2) NOT NULL,
        currency VARCHAR(3) NOT NULL,
        balance_before DECIMAL(20,2) NOT NULL,
        balance_after DECIMAL(20,2) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CHECK (direction IN ('DEBIT', 'CREDIT')),
        CHECK (currency IN ('BRL', 'USD', 'EUR'))
      );
    `);

    // ============================================
    // 3. TABELA: wager_transactions
    // ============================================
    this.addSql(`
      CREATE TABLE wager_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id VARCHAR(255) NOT NULL,
        external_transaction_id VARCHAR(255) NOT NULL,
        idempotency_key VARCHAR(255) NOT NULL UNIQUE,
        payload_hash VARCHAR(64) NOT NULL,
        wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
        player_id UUID NOT NULL,
        round_id VARCHAR(255) NOT NULL,
        game_id VARCHAR(255) NOT NULL,
        kind VARCHAR(20) NOT NULL,
        amount DECIMAL(20,2) NOT NULL,
        currency VARCHAR(3) NOT NULL,
        reference_external_transaction_id VARCHAR(255),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        status VARCHAR(20) NOT NULL,
        reference_transaction_id UUID,
        failure_code VARCHAR(255),
        processed_at TIMESTAMP,
        UNIQUE (provider_id, external_transaction_id),
        CHECK (kind IN ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK')),
        CHECK (status IN ('PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED')),
        CHECK (currency IN ('BRL', 'USD', 'EUR'))
      );
    `);

    // ============================================
    // 4. TABELA: inbox_messages
    // ============================================
    this.addSql(`
      CREATE TABLE inbox_messages (
        message_id VARCHAR(255) NOT NULL,
        consumer_name VARCHAR(255) NOT NULL,
        payload_hash VARCHAR(64) NOT NULL,
        received_at TIMESTAMP NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMP,
        PRIMARY KEY (consumer_name, message_id),
        CHECK (payload_hash ~ '^[a-f0-9]{64}$')
      );
    `);

    // ============================================
    // 5. TABELA: outbox_messages
    // ============================================
    this.addSql(`
      CREATE TABLE outbox_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        aggregate_id UUID NOT NULL,
        event_type VARCHAR(255) NOT NULL,
        payload JSONB NOT NULL,
        occurred_at TIMESTAMP NOT NULL DEFAULT NOW(),
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMP,
        published_at TIMESTAMP,
        CHECK (attempts >= 0)
      );
    `);

    // ============================================
    // 6. ÍNDICES
    // ============================================
    this.addSql('CREATE INDEX idx_ledger_entries_wallet_id ON ledger_entries(wallet_id);');
    this.addSql('CREATE INDEX idx_ledger_entries_transaction_id ON ledger_entries(transaction_id);');
    this.addSql('CREATE INDEX idx_ledger_entries_created_at ON ledger_entries(created_at);');

    this.addSql('CREATE INDEX idx_wager_transactions_wallet_id ON wager_transactions(wallet_id);');
    this.addSql('CREATE INDEX idx_wager_transactions_player_id ON wager_transactions(player_id);');
    this.addSql('CREATE INDEX idx_wager_transactions_status ON wager_transactions(status);');
    this.addSql('CREATE INDEX idx_wager_transactions_created_at ON wager_transactions(created_at);');
    this.addSql('CREATE INDEX idx_wager_transactions_provider_id ON wager_transactions(provider_id);');
    this.addSql('CREATE INDEX idx_wager_transactions_external_transaction_id ON wager_transactions(external_transaction_id);');

    this.addSql('CREATE INDEX idx_inbox_messages_processed_at ON inbox_messages(processed_at);');
    this.addSql('CREATE INDEX idx_inbox_messages_consumer_name ON inbox_messages(consumer_name);');

    this.addSql('CREATE INDEX idx_outbox_messages_published_at ON outbox_messages(published_at);');
    this.addSql('CREATE INDEX idx_outbox_messages_next_attempt_at ON outbox_messages(next_attempt_at);');
    this.addSql('CREATE INDEX idx_outbox_messages_aggregate_id ON outbox_messages(aggregate_id);');
    this.addSql('CREATE INDEX idx_outbox_messages_event_type ON outbox_messages(event_type);');

    // ============================================
    // 7. TRIGGER: ledger imutável
    // ============================================
    this.addSql(`
      CREATE OR REPLACE FUNCTION prevent_ledger_update()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'Ledger entries are immutable and cannot be updated';
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);

    this.addSql(`
      CREATE TRIGGER trg_prevent_ledger_update
      BEFORE UPDATE ON ledger_entries
      FOR EACH ROW
      EXECUTE FUNCTION prevent_ledger_update();
    `);

    // ============================================
    // 8. TRIGGER: atualizar updated_at automaticamente
    // ============================================
    this.addSql(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    this.addSql(`
      CREATE TRIGGER trg_update_wallets_updated_at
      BEFORE UPDATE ON wallets
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
  }

  async down(): Promise<void> {
    this.addSql('DROP TRIGGER IF EXISTS trg_update_wallets_updated_at ON wallets;');
    this.addSql('DROP TRIGGER IF EXISTS trg_prevent_ledger_update ON ledger_entries;');
    this.addSql('DROP FUNCTION IF EXISTS update_updated_at_column;');
    this.addSql('DROP FUNCTION IF EXISTS prevent_ledger_update;');

    this.addSql('DROP TABLE IF EXISTS outbox_messages;');
    this.addSql('DROP TABLE IF EXISTS inbox_messages;');
    this.addSql('DROP TABLE IF EXISTS wager_transactions;');
    this.addSql('DROP TABLE IF EXISTS ledger_entries;');
    this.addSql('DROP TABLE IF EXISTS wallets;');
  }
}
