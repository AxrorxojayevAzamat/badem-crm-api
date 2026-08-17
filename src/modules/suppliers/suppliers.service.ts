import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import {
  PaginatedResult,
  PaginationDto,
  paginated,
} from '../../common/dto/pagination.dto';
import { Source } from '../sources/entities/source.entity';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { Supplier } from './entities/supplier.entity';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly suppliersRepository: Repository<Supplier>,
    @InjectRepository(Source)
    private readonly sourcesRepository: Repository<Source>,
  ) {}

  create(dto: CreateSupplierDto): Promise<Supplier> {
    return this.suppliersRepository.save(this.suppliersRepository.create(dto));
  }

  async findAll(query: PaginationDto): Promise<PaginatedResult<Supplier>> {
    const { page, limit, search } = query;
    const [data, total] = await this.suppliersRepository.findAndCount({
      where: search
        ? [
            { name: ILike(`%${search}%`) },
            { phone: ILike(`%${search}%`) },
            { email: ILike(`%${search}%`) },
          ]
        : {},
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return paginated(data, total, query);
  }

  async findOne(id: string): Promise<Supplier> {
    const supplier = await this.suppliersRepository.findOne({
      where: { id },
      relations: { sources: true },
    });
    if (!supplier) throw new NotFoundException(`Supplier ${id} not found`);
    return supplier;
  }

  async update(id: string, dto: UpdateSupplierDto): Promise<Supplier> {
    const supplier = await this.findOne(id);
    Object.assign(supplier, dto);
    await this.suppliersRepository.save(supplier);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const supplier = await this.findOne(id);
    const sourceCount = await this.sourcesRepository.countBy({
      supplierId: id,
    });
    if (sourceCount > 0) {
      throw new ConflictException(
        `Supplier still has ${sourceCount} source(s); delete or reassign them first`,
      );
    }
    await this.suppliersRepository.softRemove(supplier);
  }
}
