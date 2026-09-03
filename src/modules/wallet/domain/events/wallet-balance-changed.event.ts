import { randomUUID } from 'crypto';
import { IntegrationEvent } from '../../../shared/domain/events/integration-event';

export interface WalletBalanceChangedData {
  walletId: string;
  transactionId: string;
  direction: 'DEBIT' | 'CREDIT';
  money: { amount: string; currency: string };
  balanceBefore: { amount: string; currency: string };
  balanceAfter: { amount: string; currency: string };
  walletVersion: number;
}

export class WalletBalanceChangedEvent extends IntegrationEvent<WalletBalanceChangedData> {
  readonly eventType = 'WalletBalanceChanged';
  readonly version = 1;

  private constructor(props: {
    eventId: string;
    aggregateId: string;
    correlationId: string;
    causationId?: string;
    occurredAt: Date;
    data: WalletBalanceChangedData;
  }) {
    super(props);
  }

  static from(props: {
    walletId: string;
    transactionId: string;
    direction: 'DEBIT' | 'CREDIT';
    money: { amount: string; currency: string };
    balanceBefore: { amount: string; currency: string };
    balanceAfter: { amount: string; currency: string };
    walletVersion: number;
    correlationId: string;
    causationId?: string;
  }): WalletBalanceChangedEvent {
    return new WalletBalanceChangedEvent({
      eventId: randomUUID(),
      aggregateId: props.walletId,
      correlationId: props.correlationId,
      causationId: props.causationId,
      occurredAt: new Date(),
      data: {
        walletId: props.walletId,
        transactionId: props.transactionId,
        direction: props.direction,
        money: props.money,
        balanceBefore: props.balanceBefore,
        balanceAfter: props.balanceAfter,
        walletVersion: props.walletVersion,
      },
    });
  }
}
