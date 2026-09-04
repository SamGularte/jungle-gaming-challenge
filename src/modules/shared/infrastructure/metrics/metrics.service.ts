import { Injectable, Logger } from '@nestjs/common';

interface MetricEntry {
  name: string;
  value: number;
  tags: Record<string, string>;
  timestamp: Date;
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private readonly counters = new Map<string, number>();
  private readonly histograms = new Map<string, number[]>();

  private counterKey(name: string, tags?: Record<string, string>): string {
    const tagStr = tags ? Object.entries(tags).sort().map(([k, v]) => `${k}=${v}`).join(',') : '';
    return `${name}${tagStr ? '{' + tagStr + '}' : ''}`;
  }

  increment(name: string, tags?: Record<string, string>, delta: number = 1): void {
    const key = this.counterKey(name, tags);
    this.counters.set(key, (this.counters.get(key) || 0) + delta);
  }

  recordHistogram(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.counterKey(name, tags);
    const values = this.histograms.get(key) || [];
    values.push(value);
    this.histograms.set(key, values);
  }

  transactionProcessed(kind: string, status: string, providerId: string): void {
    this.increment('wager_transactions_total', { kind, status, provider_id: providerId });
    this.increment('wager_transactions_by_status', { status });
  }

  duplicateDetected(idempotencyKey: string): void {
    this.increment('wager_duplicates_total');
  }

  retryAttempt(consumerName: string): void {
    this.increment('sqs_retry_total', { consumer: consumerName });
  }

  messageSentToDlq(reason: string): void {
    this.increment('sqs_dlq_total', { reason });
  }

  lockConflict(walletId: string): void {
    this.increment('wallet_lock_conflicts_total', { wallet_id: walletId });
  }

  outboxPublished(eventType: string): void {
    this.increment('outbox_published_total', { event_type: eventType });
  }

  outboxFailed(eventType: string): void {
    this.increment('outbox_failed_total', { event_type: eventType });
  }

  outboxLag(attempts: number): void {
    this.recordHistogram('outbox_lag_attempts', attempts);
  }

  processingLatencyMs(kind: string, latencyMs: number): void {
    this.recordHistogram('processing_latency_ms', latencyMs, { kind });
  }

  walletCreated(providerId?: string): void {
    this.increment('wallets_created_total', providerId ? { provider_id: providerId } : undefined);
  }

  healthCheck(component: string, status: 'ok' | 'degraded' | 'down'): void {
    this.increment('health_check_total', { component, status });
  }

  getCounter(name: string, tags?: Record<string, string>): number {
    return this.counters.get(this.counterKey(name, tags)) || 0;
  }

  getHistogramPercentiles(name: string, tags?: Record<string, string>): { p50: number; p95: number; p99: number; count: number } {
    const key = this.counterKey(name, tags);
    const values = (this.histograms.get(key) || []).sort((a, b) => a - b);
    if (values.length === 0) return { p50: 0, p95: 0, p99: 0, count: 0 };

    return {
      p50: values[Math.floor(values.length * 0.5)],
      p95: values[Math.floor(values.length * 0.95)],
      p99: values[Math.floor(values.length * 0.99)],
      count: values.length,
    };
  }

  getAll(): Record<string, unknown> {
    const counters: Record<string, number> = {};
    for (const [key, value] of this.counters) {
      counters[key] = value;
    }
    return { counters };
  }
}
