import { Wallet } from '../aggregates/wallet';

/**
 * WalletRepositoryPort - Interface do repositório de Wallet
 *
 * Define as operações que o repositório deve suportar.
 * Esta interface está no DOMÍNIO, a implementação está na INFRAESTRUTURA.
 *
 * DECISÕES DE DESIGN:
 * 1. O domínio NÃO conhece MikroORM
 * 2. Os métodos usam objetos de domínio (Wallet), não entidades
 * 3. findByIdForUpdate() para pessimistic locking
 * 4. Métodos específicos para regras de negócio
 */
export interface WalletRepositoryPort {
  /**
   * Salva uma wallet (cria ou atualiza)
   *
   * @param wallet - Objeto de domínio Wallet
   * @throws Error se a wallet não puder ser salva
   */
  save(wallet: Wallet): Promise<void>;

  /**
   * Busca uma wallet por ID
   *
   * @param id - UUID da wallet
   * @returns Wallet ou null se não encontrada
   */
  findById(id: string): Promise<Wallet | null>;

  /**
   * Busca uma wallet por playerId e currency
   *
   * @param playerId - UUID do jogador
   * @param currency - Moeda (ISO-4217)
   * @returns Wallet ou null se não encontrada
   */
  findByPlayerAndCurrency(playerId: string, currency: string): Promise<Wallet | null>;

  /**
   * Busca uma wallet com lock pessimista (SELECT FOR UPDATE)
   *
   * Usado em transações para prevenir race conditions
   *
   * @param id - UUID da wallet
   * @returns Wallet ou null se não encontrada
   */
  findByIdForUpdate(id: string): Promise<Wallet | null>;

  /**
   * Verifica se existe wallet para o player e moeda
   *
   * @param playerId - UUID do jogador
   * @param currency - Moeda (ISO-4217)
   * @returns true se existe, false caso contrário
   */
  exists(playerId: string, currency: string): Promise<boolean>;

  /**
   * Deleta uma wallet
   *
   * @param id - UUID da wallet
   */
  delete(id: string): Promise<void>;
}
