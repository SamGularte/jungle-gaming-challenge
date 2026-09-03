import { randomUUID } from 'crypto';
import { IntegrationEvent } from '../../../shared/domain/events/integration-event';

export interface WagerTransactionRejectedData {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: string;
  money: { amount: string; currency: string };
  failureCode: string;
  reason: string;
}

export class WagerTransactionRejectedEvent extends IntegrationEvent<WagerTransactionRejectedData> {
  readonly eventType = 'WagerTransactionRejected';
  readonly version = 1;

  private constructor(props: {
    eventId: string;
    aggregateId: string;
    correlationId: string;
    causationId?: string;
    occurredAt: Date;
    data: WagerTransactionRejectedData;
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
    failureCode: string;
    reason: string;
    correlationId: string;
    causationId?: string;
  }): WagerTransactionRejectedEvent {
    return new WagerTransactionRejectedEvent({
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
        failureCode: props.failureCode,
        reason: props.reason,
      },
    });
  }
}
