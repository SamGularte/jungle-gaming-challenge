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
