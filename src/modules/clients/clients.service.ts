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
import { Product } from '../products/entities/product.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Client } from './entities/client.entity';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientsRepository: Repository<Client>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
  ) {}

  create(dto: CreateClientDto): Promise<Client> {
    return this.clientsRepository.save(this.clientsRepository.create(dto));
  }

  async findAll(query: PaginationDto): Promise<PaginatedResult<Client>> {
    const { page, limit, search } = query;
    const [data, total] = await this.clientsRepository.findAndCount({
      where: search
        ? [
            { name: ILike(`%${search}%`) },
            { phone: ILike(`%${search}%`) },
            { email: ILike(`%${search}%`) },
            { company: ILike(`%${search}%`) },
          ]
        : {},
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return paginated(data, total, query);
  }

  async findOne(id: string): Promise<Client> {
    const client = await this.clientsRepository.findOne({
      where: { id },
      relations: { products: true },
    });
    if (!client) throw new NotFoundException(`Client ${id} not found`);
    return client;
  }

  async update(id: string, dto: UpdateClientDto): Promise<Client> {
    const client = await this.findOne(id);
    Object.assign(client, dto);
    await this.clientsRepository.save(client);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const client = await this.findOne(id);
    const productCount = await this.productsRepository.countBy({
      clientId: id,
    });
    if (productCount > 0) {
      throw new ConflictException(
        `Client still has ${productCount} product(s); delete or reassign them first`,
      );
    }
    await this.clientsRepository.softRemove(client);
  }
}
