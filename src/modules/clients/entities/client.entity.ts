import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Product } from '../../products/entities/product.entity';

@Entity('clients')
export class Client extends BaseEntity {
  @ApiProperty({ example: 'Korzinka Supermarket' })
  @Column()
  name: string;

  @ApiPropertyOptional({ example: '+998901112233' })
  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @ApiPropertyOptional({ example: 'orders@korzinka.uz' })
  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @ApiPropertyOptional()
  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  @ApiPropertyOptional({ description: 'Company the contact belongs to' })
  @Column({ type: 'varchar', nullable: true })
  company: string | null;

  @ApiProperty()
  @Column({ default: true })
  isActive: boolean;

  /** Every product is produced for exactly one client. */
  @OneToMany(() => Product, (product) => product.client)
  products: Product[];
}
