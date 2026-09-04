# Jungle Gaming Challenge

## Stack

- Bun
- TypeScript
- NestJS
- PostgreSQL
- MikroORM
- AWS SQS
- LocalStack
- Docker

## Prerequisites

- [Bun](https://bun.sh/) installed
- [Docker](https://www.docker.com/) installed

## Development

1. Start the infrastructure (PostgreSQL + LocalStack):

```bash
docker compose up -d
```

2. Create your `.env` file from the example:

```bash
cp .env.example .env
```

3. Install dependencies:

```bash
bun install
```

4. Run database migrations:

```bash
bun run migration:up
```

5. Start the dev server:

```bash
bun run start:dev
```

The server runs at http://localhost:3000.

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | /health/live | Liveness probe |
| GET | /health/ready | Readiness (checks DB) |
| POST | /wallets | Create wallet |
| GET | /wallets/:walletId | Get wallet |
| GET | /wallets/:walletId/ledger | Ledger entries (supports ?limit=&cursor=) |
| POST | /wallets/:walletId/reconciliation | Reconcile balance vs ledger |
| POST | /wagering/transactions | Submit transaction (requires `Idempotency-Key` header) |
| GET | /wagering/transactions/:transactionId | Get transaction by ID |
| GET | /providers/:providerId/wagering/transactions/:externalTransactionId | Get transaction by provider + external ID |

## Test Scenarios

### Scenario 1 — Health Check

```
GET http://localhost:3000/health/live
GET http://localhost:3000/health/ready
```

### Scenario 2 — Create Wallet

```
POST http://localhost:3000/wallets
Content-Type: application/json
```
```json
{
  "playerId": "550e8400-e29b-41d4-a716-446655440000",
  "initialBalance": {
    "amount": "100.00",
    "currency": "BRL"
  }
}
```

Response 201:
```json
{
  "id": "uuid-da-wallet",
  "playerId": "550e8400-e29b-41d4-a716-446655440000",
  "currency": "BRL",
  "balance": { "amount": "100.00", "currency": "BRL" },
  "version": 1,
  "createdAt": "2026-09-04T16:02:51.311Z",
  "updatedAt": "2026-09-04T16:02:51.311Z"
}
```

> **Note:** `playerId` must be a valid UUID.

### Scenario 3 — Get Wallet

```
GET http://localhost:3000/wallets/{walletId}
```

### Scenario 4 — Submit a BET

```
POST http://localhost:3000/wagering/transactions
Content-Type: application/json
Idempotency-Key: bet-001
```
```json
{
  "providerId": "provider-a",
  "externalTransactionId": "ext-bet-001",
  "playerId": "550e8400-e29b-41d4-a716-446655440000",
  "walletId": "{walletId}",
  "roundId": "round-1",
  "gameId": "game-1",
  "kind": "BET",
  "money": {
    "amount": "25.00",
    "currency": "BRL"
  }
}
```

Response 200:
```json
{
  "transactionId": "uuid-da-transacao",
  "status": "PROCESSED",
  "balance": { "amount": "75.00", "currency": "BRL" },
  "idempotentReplay": false
}
```

### Scenario 5 — Idempotency

Send the same request from Scenario 4 again (same `Idempotency-Key` + `externalTransactionId`):

Response 200:
```json
{
  "transactionId": "uuid-da-transacao",
  "status": "PROCESSED",
  "balance": { "amount": "75.00", "currency": "BRL" },
  "idempotentReplay": true
}
```

Balance does not change — transaction was not reprocessed.

### Scenario 6 — Insufficient Balance

Create a wallet with R$10, then try a BET of R$50:

```
POST http://localhost:3000/wallets
Content-Type: application/json
```
```json
{
  "playerId": "660e8400-e29b-41d4-a716-446655440001",
  "initialBalance": { "amount": "10.00", "currency": "BRL" }
}
```

```
POST http://localhost:3000/wagering/transactions
Content-Type: application/json
Idempotency-Key: bet-pobre
```
```json
{
  "providerId": "provider-a",
  "externalTransactionId": "ext-bet-pobre",
  "playerId": "660e8400-e29b-41d4-a716-446655440001",
  "walletId": "{walletId2}",
  "roundId": "round-1",
  "gameId": "game-1",
  "kind": "BET",
  "money": { "amount": "50.00", "currency": "BRL" }
}
```

Response:
```json
{
  "transactionId": "uuid",
  "status": "REJECTED",
  "failureCode": "INSUFFICIENT_BALANCE"
}
```

### Scenario 7 — WIN (Credit)

```
POST http://localhost:3000/wagering/transactions
Content-Type: application/json
Idempotency-Key: win-001
```
```json
{
  "providerId": "provider-a",
  "externalTransactionId": "ext-win-001",
  "playerId": "550e8400-e29b-41d4-a716-446655440000",
  "walletId": "{walletId}",
  "roundId": "round-1",
  "gameId": "game-1",
  "kind": "WIN",
  "money": { "amount": "50.00", "currency": "BRL" }
}
```

Balance goes from R$75 to R$125.

### Scenario 8 — REFUND with Reference (PENDING_REFERENCE)

If the referenced BET does not exist yet, status becomes `PENDING_REFERENCE`:

```
POST http://localhost:3000/wagering/transactions
Content-Type: application/json
Idempotency-Key: refund-001
```
```json
{
  "providerId": "provider-a",
  "externalTransactionId": "ext-refund-001",
  "playerId": "550e8400-e29b-41d4-a716-446655440000",
  "walletId": "{walletId}",
  "roundId": "round-1",
  "gameId": "game-1",
  "kind": "REFUND",
  "money": { "amount": "25.00", "currency": "BRL" },
  "referenceExternalTransactionId": "ext-bet-999"
}
```

Response:
```json
{
  "transactionId": "uuid",
  "status": "PENDING_REFERENCE"
}
```

### Scenario 9 — REFUND with Valid Reference

If the referenced BET exists and is PROCESSED, the REFUND is credited:

```
POST http://localhost:3000/wagering/transactions
Content-Type: application/json
Idempotency-Key: refund-002
```
```json
{
  "providerId": "provider-a",
  "externalTransactionId": "ext-refund-002",
  "playerId": "550e8400-e29b-41d4-a716-446655440000",
  "walletId": "{walletId}",
  "roundId": "round-1",
  "gameId": "game-1",
  "kind": "REFUND",
  "money": { "amount": "25.00", "currency": "BRL" },
  "referenceExternalTransactionId": "ext-bet-001"
}
```

### Scenario 10 — Ledger

```
GET http://localhost:3000/wallets/{walletId}/ledger?limit=50
```

Returns all DEBIT/CREDIT entries with `balanceBefore` and `balanceAfter`.

### Scenario 11 — Reconciliation

```
POST http://localhost:3000/wallets/{walletId}/reconciliation
```

Response:
```json
{
  "walletId": "uuid",
  "storedBalance": { "amount": "150.00", "currency": "BRL" },
  "calculatedBalance": { "amount": "150.00", "currency": "BRL" },
  "difference": { "amount": "0.00", "currency": "BRL" },
  "consistent": true,
  "checkedEntries": 4
}
```

### Scenario 12 — Currency Mismatch

Wallet is BRL, send transaction with USD:

```
POST http://localhost:3000/wagering/transactions
Content-Type: application/json
Idempotency-Key: currency-mismatch
```
```json
{
  "providerId": "provider-a",
  "externalTransactionId": "ext-currency-mismatch",
  "playerId": "550e8400-e29b-41d4-a716-446655440000",
  "walletId": "{walletId}",
  "roundId": "round-1",
  "gameId": "game-1",
  "kind": "BET",
  "money": { "amount": "25.00", "currency": "USD" }
}
```

Response 409:
```json
{
  "message": "Currency mismatch",
  "error": "Conflict",
  "statusCode": 409
}
```

### Scenario 13 — Player Mismatch

Wallet belongs to player A, send transaction with player B:

```
POST http://localhost:3000/wagering/transactions
Content-Type: application/json
Idempotency-Key: player-mismatch
```
```json
{
  "providerId": "provider-a",
  "externalTransactionId": "ext-player-mismatch",
  "playerId": "990e8400-e29b-41d4-a716-446655440004",
  "walletId": "{walletId}",
  "roundId": "round-1",
  "gameId": "game-1",
  "kind": "BET",
  "money": { "amount": "10.00", "currency": "BRL" }
}
```

Response 409:
```json
{
  "message": "Player does not own this wallet",
  "error": "Conflict",
  "statusCode": 409
}
```

### Scenario 14 — Get Transaction by Provider

```
GET http://localhost:3000/providers/provider-a/wagering/transactions/ext-bet-001
```

### Scenario 15 — Get Transaction by ID

```
GET http://localhost:3000/wagering/transactions/{transactionId}
```
