import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';
import { User } from '../../users/entities/user.entity';

@Entity('employees')
export class Employee extends BaseEntity {
  @ApiProperty({ example: 'Dilshod Karimov' })
  @Column()
  fullName: string;

  @ApiProperty({ example: 'Warehouse manager' })
  @Column()
  position: string;

  @ApiPropertyOptional({ example: '+998901234567' })
  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @ApiPropertyOptional()
  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  @ApiPropertyOptional({ example: 5000000 })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  salary: number;

  @ApiPropertyOptional({ example: '2026-01-15' })
  @Column({ type: 'date', nullable: true })
  hiredAt: string | null;

  @ApiProperty()
  @Column({ default: true })
  isActive: boolean;

  /** Optional link to a login account. */
  @ApiPropertyOptional({ type: () => User })
  @OneToOne(() => User, (user) => user.employee, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @ApiPropertyOptional()
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;
}
