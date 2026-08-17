import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { ILike, Repository } from 'typeorm';
import {
  PaginatedResult,
  PaginationDto,
  paginated,
} from '../../common/dto/pagination.dto';
import { Role } from '../../common/enums/role.enum';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

export const BCRYPT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const email = dto.email.toLowerCase().trim();
    if (await this.usersRepository.existsBy({ email })) {
      throw new ConflictException(`User with email ${email} already exists`);
    }

    const user = this.usersRepository.create({
      email,
      fullName: dto.fullName,
      passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
      role: dto.role ?? Role.EMPLOYEE,
      isActive: dto.isActive ?? true,
    });

    const saved = await this.usersRepository.save(user);
    return this.findOne(saved.id);
  }

  async findAll(query: PaginationDto): Promise<PaginatedResult<User>> {
    const { page, limit, search } = query;
    const where = search
      ? [{ fullName: ILike(`%${search}%`) }, { email: ILike(`%${search}%`) }]
      : {};

    const [data, total] = await this.usersRepository.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return paginated(data, total, query);
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: { employee: true },
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  /** Includes passwordHash — for login only. */
  findByEmailWithSecrets(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email: email.toLowerCase().trim() },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        passwordHash: true,
      },
    });
  }

  /** Includes refreshTokenHash — for the refresh-token rotation check. */
  findByIdWithRefreshToken(id: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        refreshTokenHash: true,
      },
    });
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    if (dto.email && dto.email.toLowerCase().trim() !== user.email) {
      const email = dto.email.toLowerCase().trim();
      if (await this.usersRepository.existsBy({ email })) {
        throw new ConflictException(`User with email ${email} already exists`);
      }
      user.email = email;
    }

    if (dto.fullName !== undefined) user.fullName = dto.fullName;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
      // Force re-login everywhere when the password changes.
      user.refreshTokenHash = null;
    }

    await this.usersRepository.save(user);
    return this.findOne(id);
  }

  async changePassword(id: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.usersRepository.findOne({
      where: { id },
      select: { id: true, passwordHash: true },
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);

    const matches = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!matches) throw new BadRequestException('Current password is wrong');

    await this.usersRepository.update(id, {
      passwordHash: await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS),
      refreshTokenHash: null,
    });
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.usersRepository.softRemove(user);
  }

  async setRefreshTokenHash(id: string, hash: string | null): Promise<void> {
    await this.usersRepository.update(id, { refreshTokenHash: hash });
  }

  async markLoggedIn(id: string): Promise<void> {
    await this.usersRepository.update(id, { lastLoginAt: new Date() });
  }
}
