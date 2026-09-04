import {
  Controller, Post, Get, Body, Param, Headers, HttpCode, HttpStatus,
  ParseUUIDPipe, Logger, BadRequestException,
} from '@nestjs/common';
import { TransactionService } from '../../application/services/transaction.service';
import { WagerTransactionKind, WagerTransactionStatus } from '../../domain/aggregates/wager-transaction';
import { HttpException } from '@nestjs/common';

const VALID_KINDS: readonly string[] = Object.values(WagerTransactionKind).filter((k) => k !== 'OPENING');
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('wagering/transactions')
export class WageringController {
  private readonly logger = new Logger(WageringController.name);

  constructor(private readonly transactionService: TransactionService) {}

  @Post()
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
    if (!idempotencyKey || idempotencyKey.trim().length === 0) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    if (!body.providerId || !body.externalTransactionId || !body.playerId || !body.walletId ||
        !body.roundId || !body.gameId || !body.kind || !body.money) {
      throw new BadRequestException('Missing required fields');
    }

    if (!UUID_REGEX.test(body.playerId)) {
      throw new BadRequestException('playerId must be a valid UUID');
    }

    if (!UUID_REGEX.test(body.walletId)) {
      throw new BadRequestException('walletId must be a valid UUID');
    }

    if (!VALID_KINDS.includes(body.kind as WagerTransactionKind)) {
      throw new BadRequestException(`Invalid kind: ${body.kind}. Valid: ${VALID_KINDS.join(', ')}`);
    }

    if (!body.money.amount || !body.money.currency) {
      throw new BadRequestException('money.amount and money.currency are required');
    }

    const requiresRef = ['REFUND', 'ROLLBACK'].includes(body.kind);
    if (requiresRef && !body.referenceExternalTransactionId) {
      throw new BadRequestException(`${body.kind} requires referenceExternalTransactionId`);
    }

    this.logger.log(`POST /wagering/transactions - kind: ${body.kind} provider: ${body.providerId}`);

    const result = await this.transactionService.process({
      ...body,
      idempotencyKey,
    });

    if (result.status === WagerTransactionStatus.REJECTED) {
      throw new HttpException(
        { transactionId: result.transactionId, status: result.status, failureCode: result.failureCode },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    if (result.status === WagerTransactionStatus.PENDING_REFERENCE) {
      return { statusCode: HttpStatus.ACCEPTED, ...result };
    }

    return result;
  }

  @Get(':transactionId')
  async findOne(@Param('transactionId', ParseUUIDPipe) transactionId: string) {
    this.logger.log(`GET /wagering/transactions/${transactionId}`);
    const transaction = await this.transactionService.findById(transactionId);
    return transaction.toJSON();
  }
}

@Controller('providers/:providerId/wagering/transactions')
export class ProviderTransactionController {
  private readonly logger = new Logger(ProviderTransactionController.name);

  constructor(private readonly transactionService: TransactionService) {}

  @Get(':externalTransactionId')
  async findByExternalId(
    @Param('providerId') providerId: string,
    @Param('externalTransactionId') externalTransactionId: string,
  ) {
    this.logger.log(`GET /providers/${providerId}/wagering/transactions/${externalTransactionId}`);
    const transaction = await this.transactionService.findByProviderAndExternalId(
      providerId,
      externalTransactionId,
    );
    return transaction.toJSON();
  }
}
