import { randomUUID } from 'crypto';
import { IntegrationEvent } from '../../../shared/domain/events/integration-event';

export interface WagerTransactionPendingReferenceData {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: string;
  money: { amount: string; currency: string };
  referenceExternalTransactionId: string;
}

export class WagerTransactionPendingReferenceEvent extends IntegrationEvent<WagerTransactionPendingReferenceData> {
  readonly eventType = 'WagerTransactionPendingReference';
  readonly version = 1;

  private constructor(props: {
    eventId: string;
    aggregateId: string;
    correlationId: string;
    causationId?: string;
    occurredAt: Date;
    data: WagerTransactionPendingReferenceData;
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
    referenceExternalTransactionId: string;
    correlationId: string;
    causationId?: string;
  }): WagerTransactionPendingReferenceEvent {
    return new WagerTransactionPendingReferenceEvent({
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
        referenceExternalTransactionId: props.referenceExternalTransactionId,
      },
    });
  }
}
