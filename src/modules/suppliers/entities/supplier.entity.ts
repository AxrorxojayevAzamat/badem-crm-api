import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Source } from '../../sources/entities/source.entity';

@Entity('suppliers')
export class Supplier extends BaseEntity {
  @ApiProperty({ example: 'Almond Import LLC' })
  @Column()
  name: string;

  @ApiPropertyOptional({ example: '+998712000000' })
  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @ApiPropertyOptional({ example: 'sales@almond-import.uz' })
  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @ApiPropertyOptional()
  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  @ApiPropertyOptional({ description: 'Company / tax number' })
  @Column({ type: 'varchar', nullable: true })
  taxNumber: string | null;

  @ApiProperty()
  @Column({ default: true })
  isActive: boolean;

  /** Every source (raw material) is bought from exactly one supplier. */
  @OneToMany(() => Source, (source) => source.supplier)
  sources: Source[];
}
