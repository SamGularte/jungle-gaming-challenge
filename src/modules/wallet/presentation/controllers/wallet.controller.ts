import { Controller, Post, Get, Body, Param, Query, ParseUUIDPipe, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { WalletService } from '../../application/services/wallet.service';

@Controller('wallets')
export class WalletController {
  private readonly logger = new Logger(WalletController.name);

  constructor(private readonly walletService: WalletService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: { playerId: string; initialBalance: { amount: string; currency: string } }) {
    this.logger.log(`POST /wallets - playerId: ${body.playerId}`);
    const wallet = await this.walletService.create(body.playerId, body.initialBalance);
    return wallet.toJSON();
  }

  @Get(':walletId')
  async findOne(@Param('walletId', ParseUUIDPipe) walletId: string) {
    this.logger.log(`GET /wallets/${walletId}`);
    const wallet = await this.walletService.findById(walletId);
    return wallet.toJSON();
  }

  @Get(':walletId/ledger')
  async getLedger(
    @Param('walletId', ParseUUIDPipe) walletId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    this.logger.log(`GET /wallets/${walletId}/ledger - limit: ${limit}, cursor: ${cursor}`);
    const parsedLimit = limit ? Math.min(parseInt(limit) || 50, 50) : 50;
    const result = await this.walletService.getLedger(
      walletId,
      parsedLimit,
      cursor,
    );
    return {
      entries: result.entries.map((e) => ({
        id: e.id,
        walletId: e.walletId,
        transactionId: e.transactionId,
        direction: e.direction,
        amount: e.money.toAmountString(),
        currency: e.money.currency,
        balanceBefore: e.balanceBefore.toAmountString(),
        balanceAfter: e.balanceAfter.toAmountString(),
        createdAt: e.createdAt.toISOString(),
      })),
      nextCursor: result.nextCursor,
    };
  }

  @Post(':walletId/reconciliation')
  @HttpCode(HttpStatus.OK)
  async reconcile(
    @Param('walletId', ParseUUIDPipe) walletId: string,
    @Body() body?: {
      storedBalance?: { amount: string; currency: string };
      calculatedBalance?: { amount: string; currency: string };
    },
  ) {
    this.logger.log(`POST /wallets/${walletId}/reconciliation`);
    return this.walletService.reconcile(walletId, body);
  }
}
