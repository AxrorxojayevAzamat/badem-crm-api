import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SourceHistoryAction } from '../../../common/enums/source-history-action.enum';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';
import { Product } from '../../products/entities/product.entity';
import { User } from '../../users/entities/user.entity';
import { Source } from './source.entity';

/**
 * Append-only ledger of stock movements. One row per change of
 * `sources.quantity` — nothing here is ever updated or deleted.
 */
@Entity('source_histories')
export class SourceHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ type: () => Source })
  @ManyToOne(() => Source, (source) => source.histories, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sourceId' })
  source: Source;

  @ApiProperty()
  @Index()
  @Column({ type: 'uuid' })
  sourceId: string;

  @ApiProperty({ enum: SourceHistoryAction })
  @Column({ type: 'enum', enum: SourceHistoryAction })
  action: SourceHistoryAction;

  @ApiProperty({ description: 'Stock before the movement' })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 3,
    transformer: numericTransformer,
  })
  quantityBefore: number;

  @ApiProperty({ description: 'Signed delta: negative when stock went down' })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 3,
    transformer: numericTransformer,
  })
  quantityChange: number;

  @ApiProperty({ description: 'Stock after the movement' })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 3,
    transformer: numericTransformer,
  })
  quantityAfter: number;

  /** Product that caused the movement, when there was one. */
  @ApiPropertyOptional({ type: () => Product })
  @ManyToOne(() => Product, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'productId' })
  product: Product | null;

  @ApiPropertyOptional()
  @Index()
  @Column({ type: 'uuid', nullable: true })
  productId: string | null;

  /** Who triggered it. */
  @ApiPropertyOptional({ type: () => User })
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @ApiPropertyOptional()
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @ApiPropertyOptional()
  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  @ApiProperty()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
