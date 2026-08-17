import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, Index, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';
import { Product } from '../../products/entities/product.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';
import { SourceHistory } from './source-history.entity';

/** Raw material / stock item bought from a supplier and consumed by products. */
@Entity('sources')
export class Source extends BaseEntity {
  @ApiProperty({ example: 'Raw almond' })
  @Column()
  name: string;

  @ApiProperty({ example: 'kg', description: 'Unit of measure' })
  @Column({ default: 'kg' })
  unit: string;

  @ApiProperty({ example: 1250.5, description: 'Current stock on hand' })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 3,
    default: 0,
    transformer: numericTransformer,
  })
  quantity: number;

  @ApiProperty({ example: 100, description: 'Low-stock warning threshold' })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 3,
    default: 0,
    transformer: numericTransformer,
  })
  minQuantity: number;

  @ApiProperty({ example: 45000 })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  pricePerUnit: number;

  @ApiPropertyOptional()
  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @ApiProperty()
  @Column({ default: true })
  isActive: boolean;

  /** A source always belongs to the supplier it was bought from. */
  @ApiProperty({ type: () => Supplier })
  @ManyToOne(() => Supplier, (supplier) => supplier.sources, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'supplierId' })
  supplier: Supplier;

  @ApiProperty()
  @Index()
  @Column({ type: 'uuid' })
  supplierId: string;

  /** Full audit trail of every stock movement on this source. */
  @OneToMany(() => SourceHistory, (history) => history.source)
  histories: SourceHistory[];

  @OneToMany(() => Product, (product) => product.source)
  products: Product[];
}
