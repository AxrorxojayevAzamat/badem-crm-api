import * as bcrypt from 'bcrypt';
import { Role } from '../common/enums/role.enum';
import { Client } from '../modules/clients/entities/client.entity';
import { Source } from '../modules/sources/entities/source.entity';
import { Supplier } from '../modules/suppliers/entities/supplier.entity';
import { User } from '../modules/users/entities/user.entity';
import dataSource from './data-source';

/**
 * Creates the first admin account plus one demo supplier/source/client so the
 * production flow can be tried immediately. Safe to re-run.
 */
async function seed() {
  await dataSource.initialize();

  // In dev the schema comes from the entities, so seeding works on a fresh DB
  // without starting the app first.
  if (process.env.DB_SYNCHRONIZE === 'true') {
    await dataSource.synchronize();
  }

  const users = dataSource.getRepository(User);
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@badem.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';

  let admin = await users.findOne({ where: { email } });
  if (admin) {
    console.log(`Admin ${email} already exists, skipping.`);
  } else {
    admin = await users.save(
      users.create({
        email,
        fullName: 'Badem Admin',
        passwordHash: await bcrypt.hash(password, 10),
        role: Role.ADMIN,
        isActive: true,
      }),
    );
    console.log(`Created admin ${email} with password: ${password}`);
  }

  const suppliers = dataSource.getRepository(Supplier);
  const sources = dataSource.getRepository(Source);
  const clients = dataSource.getRepository(Client);

  if ((await suppliers.count()) === 0) {
    const supplier = await suppliers.save(
      suppliers.create({
        name: 'Almond Import LLC',
        phone: '+998712000000',
        email: 'sales@almond-import.uz',
      }),
    );
    const source = await sources.save(
      sources.create({
        name: 'Raw almond',
        unit: 'kg',
        quantity: 1000,
        minQuantity: 100,
        pricePerUnit: 45000,
        supplierId: supplier.id,
      }),
    );
    const client = await clients.save(
      clients.create({
        name: 'Korzinka Supermarket',
        phone: '+998901112233',
        company: 'Korzinka LLC',
      }),
    );
    console.log('Demo data:');
    console.log(`  supplierId = ${supplier.id}`);
    console.log(`  sourceId   = ${source.id} (1000 kg in stock)`);
    console.log(`  clientId   = ${client.id}`);
  }

  await dataSource.destroy();
}

seed().catch(async (error) => {
  console.error('Seed failed:', error);
  if (dataSource.isInitialized) await dataSource.destroy();
  process.exit(1);
});
