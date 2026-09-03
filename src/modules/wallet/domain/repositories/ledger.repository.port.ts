import { WalletLedgerEntry } from '../aggregates/wallet-ledger-entry';

/**
 * LedgerRepositoryPort - Interface do repositório de Ledger
 *
 * Define as operações que o repositório deve suportar.
 * Esta interface está no DOMÍNIO, a implementação está na INFRAESTRUTURA.
 *
 * DECISÕES DE DESIGN:
 * 1. O ledger é IMUTÁVEL - apenas inserção, nunca atualização
 * 2. O domínio NÃO conhece MikroORM
 * 3. Os métodos usam objetos de domínio (WalletLedgerEntry)
 */
export interface LedgerRepositoryPort {
  /**
   * Salva uma entrada de ledger (insere)
   *
   * O ledger é imutável - nunca atualiza entradas existentes
   *
   * @param entry - Objeto de domínio WalletLedgerEntry
   * @throws Error se a entrada não puder ser salva
   */
  save(entry: WalletLedgerEntry): Promise<void>;

  /**
   * Salva múltiplas entradas de ledger (insere)
   *
   * Usado para operações em lote
   *
   * @param entries - Array de objetos de domínio
   */
  saveMany(entries: WalletLedgerEntry[]): Promise<void>;

  /**
   * Busca entradas de ledger por walletId
   *
   * @param walletId - UUID da wallet
   * @param limit - Limite de resultados (padrão: 50)
   * @param cursor - Cursor para paginação (opcional)
   * @returns Array de entradas
   */
  findByWalletId(
    walletId: string,
    limit?: number,
    cursor?: string,
  ): Promise<{ entries: WalletLedgerEntry[]; nextCursor?: string }>;

  /**
   * Busca uma entrada por transactionId
   *
   * @param transactionId - UUID da transação
   * @returns Entrada ou null
   */
  findByTransactionId(transactionId: string): Promise<WalletLedgerEntry | null>;

  /**
   * Busca a última entrada de uma wallet
   *
   * Útil para verificar o saldo atual via ledger
   *
   * @param walletId - UUID da wallet
   * @returns Última entrada ou null
   */
  findLastByWalletId(walletId: string): Promise<WalletLedgerEntry | null>;

  /**
   * Reconciliação: recalcula saldo a partir do ledger
   *
   * @param walletId - UUID da wallet
   * @returns Saldo calculado
   */
  calculateBalance(walletId: string): Promise<{ amount: string; currency: string }>;

  /**
   * Conta quantas entradas existem para uma wallet
   *
   * @param walletId - UUID da wallet
   * @returns Número de entradas
   */
  countByWalletId(walletId: string): Promise<number>;
}
