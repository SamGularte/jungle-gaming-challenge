import { randomUUID } from 'crypto';
import { IntegrationEvent } from '../../../shared/domain/events/integration-event';

export interface WagerTransactionProcessedData {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: string;
  money: { amount: string; currency: string };
  status: string;
  balanceAfter?: { amount: string; currency: string };
}

export class WagerTransactionProcessedEvent extends IntegrationEvent<WagerTransactionProcessedData> {
  readonly eventType = 'WagerTransactionProcessed';
  readonly version = 1;

  private constructor(props: {
    eventId: string;
    aggregateId: string;
    correlationId: string;
    causationId?: string;
    occurredAt: Date;
    data: WagerTransactionProcessedData;
  }) {
    super(props);
  }

  static from(props: {
    transactionId: string;
    providerId: string;
    externalTransactionId: string;
    walletId: string;
    playerId: string;
    roundId: string;
    gameId: string;
    kind: string;
    money: { amount: string; currency: string };
    status: string;
    balanceAfter?: { amount: string; currency: string };
    correlationId: string;
    causationId?: string;
  }): WagerTransactionProcessedEvent {
    return new WagerTransactionProcessedEvent({
      eventId: randomUUID(),
      aggregateId: props.transactionId,
      correlationId: props.correlationId,
      causationId: props.causationId,
      occurredAt: new Date(),
      data: {
        transactionId: props.transactionId,
        providerId: props.providerId,
        externalTransactionId: props.externalTransactionId,
        walletId: props.walletId,
        playerId: props.playerId,
        roundId: props.roundId,
        gameId: props.gameId,
        kind: props.kind,
        money: props.money,
        status: props.status,
        balanceAfter: props.balanceAfter,
      },
    });
  }
}
