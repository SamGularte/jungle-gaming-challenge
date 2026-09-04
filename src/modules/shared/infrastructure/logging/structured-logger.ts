import { randomUUID } from 'crypto';

export interface LogContext {
  correlationId?: string;
  messageId?: string;
  transactionId?: string;
  walletId?: string;
  playerId?: string;
  providerId?: string;
  [key: string]: unknown;
}

interface JsonLogEntry {
  level: string;
  message: string;
  timestamp: string;
  context?: string;
  correlationId?: string;
  messageId?: string;
  transactionId?: string;
  walletId?: string;
  playerId?: string;
  providerId?: string;
  [key: string]: unknown;
}

function outputJson(level: string, message: string, context?: string, ctx?: LogContext): void {
  const entry: JsonLogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
  };

  if (context) entry.context = context;
  if (ctx) {
    if (ctx.correlationId) entry.correlationId = ctx.correlationId;
    if (ctx.messageId) entry.messageId = ctx.messageId;
    if (ctx.transactionId) entry.transactionId = ctx.transactionId;
    if (ctx.walletId) entry.walletId = ctx.walletId;
    if (ctx.playerId) entry.playerId = ctx.playerId;
    if (ctx.providerId) entry.providerId = ctx.providerId;
    for (const [key, value] of Object.entries(ctx)) {
      if (!['correlationId', 'messageId', 'transactionId', 'walletId', 'playerId', 'providerId'].includes(key)) {
        entry[key] = value;
      }
    }
  }

  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export class StructuredLogger {
  constructor(private readonly context: string) {}

  log(message: string, ctx?: LogContext): void {
    outputJson('info', message, this.context, ctx);
  }

  warn(message: string, ctx?: LogContext): void {
    outputJson('warn', message, this.context, ctx);
  }

  error(message: string, ctx?: LogContext): void {
    outputJson('error', message, this.context, ctx);
  }

  debug(message: string, ctx?: LogContext): void {
    outputJson('debug', message, this.context, ctx);
  }

  static generateCorrelationId(): string {
    return randomUUID();
  }
}
