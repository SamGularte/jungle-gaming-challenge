import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();

  const port = process.env.APP_PORT || 3000;
  logger.log(`Starting application on port ${port}`);

  await app.listen(port);
  logger.log(`Application running on http://localhost:${port}`);
}
bootstrap();
