import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { entities } from './entities';

export const buildTypeOrmOptions = (
  config: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: config.get<string>('DB_HOST', 'localhost'),
  port: Number(config.get<string>('DB_PORT', '5432')),
  username: config.get<string>('DB_USERNAME', 'postgres'),
  password: config.get<string>('DB_PASSWORD', 'postgres'),
  database: config.get<string>('DB_NAME', 'badem'),
  // gen_random_uuid() instead of uuid-ossp: it is core Postgres since 13.
  uuidExtension: 'pgcrypto',
  // Connection pool size. Lower it (to 1) when the database accepts only one
  // connection at a time; requests then queue instead of failing.
  extra: { max: Number(config.get<string>('DB_POOL_MAX', '10')) },
  entities,
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  // Dev convenience: builds the schema from the entities on boot.
  synchronize: config.get<string>('DB_SYNCHRONIZE', 'false') === 'true',
  logging: config.get<string>('DB_LOGGING', 'false') === 'true',
  ssl: config.get('DB_SSL') === 'true' ? { rejectUnauthorized: false } : false,
});
