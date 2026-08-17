import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';
import { Client } from '../../clients/entities/client.entity';
import { Source } from '../../sources/entities/source.entity';

@Entity('products')
export class Product extends BaseEntity {
  @ApiProperty({ example: 'Roasted almond 500g' })
  @Column()
  name: string;

  @ApiPropertyOptional({ example: 'ALM-500' })
  @Index({ unique: true, where: '"deletedAt" IS NULL' })
  @Column({ type: 'varchar', nullable: true })
  sku: string | null;

  @ApiProperty({ example: 200, description: 'How many units were produced' })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 3,
    transformer: numericTransformer,
  })
  quantity: number;

  @ApiProperty({
    example: 0.5,
    description: 'Source units consumed per produced unit',
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 3,
    default: 1,
    transformer: numericTransformer,
  })
  sourceUsage: number;

  @ApiProperty({
    example: 100,
    description: 'Total source consumed = quantity * sourceUsage',
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 3,
    transformer: numericTransformer,
  })
  totalSourceUsed: number;

  @ApiProperty({ example: 65000, description: 'Sale price per unit' })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  price: number;

  @ApiPropertyOptional()
  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  /** Every product is produced for one client. */
  @ApiProperty({ type: () => Client })
  @ManyToOne(() => Client, (client) => client.products, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'clientId' })
  client: Client;

  @ApiProperty()
  @Index()
  @Column({ type: 'uuid' })
  clientId: string;

  /** The raw material this product consumes. */
  @ApiProperty({ type: () => Source })
  @ManyToOne(() => Source, (source) => source.products, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'sourceId' })
  source: Source;

  @ApiProperty()
  @Index()
  @Column({ type: 'uuid' })
  sourceId: string;
}
