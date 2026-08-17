import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { entities } from './entities';

dotenv.config();

/** Used by the TypeORM CLI (npm run migration:generate / migration:run). */
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'badem',
  uuidExtension: 'pgcrypto',
  entities,
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false,
});
