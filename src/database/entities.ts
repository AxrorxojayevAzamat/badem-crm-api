import { Client } from '../modules/clients/entities/client.entity';
import { Employee } from '../modules/employees/entities/employee.entity';
import { Product } from '../modules/products/entities/product.entity';
import { SourceHistory } from '../modules/sources/entities/source-history.entity';
import { Source } from '../modules/sources/entities/source.entity';
import { Supplier } from '../modules/suppliers/entities/supplier.entity';
import { User } from '../modules/users/entities/user.entity';

/** Single list used by both the Nest app and the TypeORM CLI. */
export const entities = [
  User,
  Employee,
  Supplier,
  Source,
  SourceHistory,
  Client,
  Product,
];
