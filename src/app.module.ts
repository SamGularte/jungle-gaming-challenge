import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { HealthModule } from './modules/health/health.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { WageringModule } from './modules/wagering/wagering.module';
import config from './shared/database/mikro-orm.config';

@Module({
  imports: [
    MikroOrmModule.forRoot(config),
    HealthModule,
    WalletModule,
    WageringModule,
  ],
})
export class AppModule {}
