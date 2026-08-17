import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Not, Repository } from 'typeorm';
import {
  PaginatedResult,
  PaginationDto,
  paginated,
} from '../../common/dto/pagination.dto';
import { UsersService } from '../users/users.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { Employee } from './entities/employee.entity';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeesRepository: Repository<Employee>,
    private readonly usersService: UsersService,
  ) {}

  async create(dto: CreateEmployeeDto): Promise<Employee> {
    if (dto.userId) await this.assertUserIsFree(dto.userId);

    const employee = this.employeesRepository.create({
      ...dto,
      userId: dto.userId ?? null,
    });
    const saved = await this.employeesRepository.save(employee);
    return this.findOne(saved.id);
  }

  async findAll(query: PaginationDto): Promise<PaginatedResult<Employee>> {
    const { page, limit, search } = query;
    const [data, total] = await this.employeesRepository.findAndCount({
      where: search
        ? [
            { fullName: ILike(`%${search}%`) },
            { position: ILike(`%${search}%`) },
            { phone: ILike(`%${search}%`) },
          ]
        : {},
      relations: { user: true },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return paginated(data, total, query);
  }

  async findOne(id: string): Promise<Employee> {
    const employee = await this.employeesRepository.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!employee) throw new NotFoundException(`Employee ${id} not found`);
    return employee;
  }

  async update(id: string, dto: UpdateEmployeeDto): Promise<Employee> {
    const employee = await this.findOne(id);

    if (dto.userId !== undefined && dto.userId !== employee.userId && dto.userId) {
      await this.assertUserIsFree(dto.userId, id);
    }

    // Column-level update: `employee` carries its loaded `user` relation,
    // which would win over a changed userId on save().
    await this.employeesRepository.update(id, {
      fullName: dto.fullName ?? employee.fullName,
      position: dto.position ?? employee.position,
      phone: dto.phone !== undefined ? dto.phone : employee.phone,
      address: dto.address !== undefined ? dto.address : employee.address,
      salary: dto.salary ?? employee.salary,
      hiredAt: dto.hiredAt !== undefined ? dto.hiredAt : employee.hiredAt,
      isActive: dto.isActive ?? employee.isActive,
      userId: dto.userId !== undefined ? dto.userId : employee.userId,
    });
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const employee = await this.findOne(id);
    await this.employeesRepository.softRemove(employee);
  }

  /** A login account may back at most one employee record. */
  private async assertUserIsFree(userId: string, exceptEmployeeId?: string) {
    await this.usersService.findOne(userId); // 404s if the user is unknown

    const taken = await this.employeesRepository.existsBy({
      userId,
      ...(exceptEmployeeId ? { id: Not(exceptEmployeeId) } : {}),
    });
    if (taken) {
      throw new ConflictException(
        `User ${userId} is already linked to another employee`,
      );
    }
  }
}
