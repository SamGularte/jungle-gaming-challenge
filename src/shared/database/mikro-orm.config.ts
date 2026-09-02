import { defineConfig } from '@mikro-orm/postgresql';
import { TsMorphMetadataProvider } from '@mikro-orm/reflection';

export default defineConfig({
  metadataProvider: TsMorphMetadataProvider,
  clientUrl: `postgresql://${process.env.DATABASE_USER}:${process.env.DATABASE_PASSWORD}@${process.env.DATABASE_HOST}:${process.env.DATABASE_PORT}/${process.env.DATABASE_NAME}`,
  entities: ['./src/**/*.entity.ts'],
  entitiesTs: ['./src/**/*.entity.ts'],
  migrations: {
    path: './src/shared/database/migrations',
    pathTs: './src/shared/database/migrations',
    glob: '!(*.d).ts',
  },
});
