#!/bin/bash
set -e

echo "Creating SQS queues..."

awslocal sqs create-queue \
  --queue-name wager-transactions.fifo \
  --region us-east-1 \
  --attributes '{
    "FifoQueue": "true",
    "ContentBasedDeduplication": "false",
    "VisibilityTimeout": "30",
    "MessageRetentionPeriod": "86400",
    "RedrivePolicy": "{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:000000000000:wager-transactions-dlq.fifo\",\"maxReceiveCount\":\"5\"}"
  }'

awslocal sqs create-queue \
  --queue-name wager-transactions-dlq.fifo \
  --region us-east-1 \
  --attributes '{
    "FifoQueue": "true",
    "ContentBasedDeduplication": "false",
    "MessageRetentionPeriod": "1209600"
  }'

awslocal sqs create-queue \
  --queue-name wager-events.fifo \
  --region us-east-1 \
  --attributes '{
    "FifoQueue": "true",
    "ContentBasedDeduplication": "false",
    "VisibilityTimeout": "30",
    "MessageRetentionPeriod": "86400"
  }'

echo "SQS queues created successfully"
echo "Main queue URL:"
awslocal sqs get-queue-url --queue-name wager-transactions.fifo --region us-east-1
echo "DLQ URL:"
awslocal sqs get-queue-url --queue-name wager-transactions-dlq.fifo --region us-east-1
echo "Events queue URL:"
awslocal sqs get-queue-url --queue-name wager-events.fifo --region us-east-1
