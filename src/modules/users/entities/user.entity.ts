import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { Column, Entity, Index, OneToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Role } from '../../../common/enums/role.enum';
import { Employee } from '../../employees/entities/employee.entity';

@Entity('users')
export class User extends BaseEntity {
  @ApiProperty({ example: 'admin@badem.local' })
  @Index({ unique: true })
  @Column({ unique: true })
  email: string;

  @ApiProperty({ example: 'Azamat Axrorxojayev' })
  @Column()
  fullName: string;

  /** Never selected by default — services ask for it explicitly when needed. */
  @ApiHideProperty()
  @Exclude()
  @Column({ select: false })
  passwordHash: string;

  /** bcrypt hash of the currently issued refresh token (null = logged out). */
  @ApiHideProperty()
  @Exclude()
  @Column({ type: 'varchar', nullable: true, select: false })
  refreshTokenHash: string | null;

  @ApiProperty({ enum: Role })
  @Column({ type: 'enum', enum: Role, default: Role.EMPLOYEE })
  role: Role;

  @ApiProperty()
  @Column({ default: true })
  isActive: boolean;

  @ApiProperty({ required: false })
  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  /** Optional staff record for this login. */
  @OneToOne(() => Employee, (employee) => employee.user)
  employee: Employee | null;
}
