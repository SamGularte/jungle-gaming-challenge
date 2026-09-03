import { Controller, Post, Get, Body, Param, Headers, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { TransactionService } from '../../application/services/transaction.service';

@Controller('wagering/transactions')
export class WageringController {
  constructor(private readonly transactionService: TransactionService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async submit(
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: {
      providerId: string;
      externalTransactionId: string;
      playerId: string;
      walletId: string;
      roundId: string;
      gameId: string;
      kind: string;
      money: { amount: string; currency: string };
      referenceExternalTransactionId?: string;
    },
  ) {
    if (!idempotencyKey) {
      throw new Error('Idempotency-Key header is required');
    }

    return this.transactionService.process({
      ...body,
      idempotencyKey,
    });
  }

  @Get(':transactionId')
  async findOne(@Param('transactionId', ParseUUIDPipe) transactionId: string) {
    const transaction = await this.transactionService.findById(transactionId);
    return transaction.toJSON();
  }
}

@Controller('providers/:providerId/wagering/transactions')
export class ProviderTransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Get(':externalTransactionId')
  async findByExternalId(
    @Param('providerId') providerId: string,
    @Param('externalTransactionId') externalTransactionId: string,
  ) {
    const transaction = await this.transactionService.findByProviderAndExternalId(
      providerId,
      externalTransactionId,
    );
    return transaction.toJSON();
  }
}
