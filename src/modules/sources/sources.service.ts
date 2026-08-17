import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  PaginatedResult,
  paginated,
} from '../../common/dto/pagination.dto';
import { SourceHistoryAction } from '../../common/enums/source-history-action.enum';
import { Product } from '../products/entities/product.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { CreateSourceDto } from './dto/create-source.dto';
import { QuerySourceDto, QuerySourceHistoryDto } from './dto/query-source.dto';
import { AdjustSourceDto, RestockSourceDto } from './dto/stock.dto';
import { UpdateSourceDto } from './dto/update-source.dto';
import { Source } from './entities/source.entity';
import { SourceHistory } from './entities/source-history.entity';
import { SourceHistoryService } from './source-history.service';

export interface StockChangeParams {
  sourceId: string;
  /** Signed: negative consumes stock, positive gives it back. */
  delta: number;
  action: SourceHistoryAction;
  productId?: string | null;
  userId?: string | null;
  note?: string | null;
}

@Injectable()
export class SourcesService {
  constructor(
    @InjectRepository(Source)
    private readonly sourcesRepository: Repository<Source>,
    @InjectRepository(Supplier)
    private readonly suppliersRepository: Repository<Supplier>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    private readonly historyService: SourceHistoryService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateSourceDto, userId?: string): Promise<Source> {
    await this.assertSupplierExists(dto.supplierId);
    const openingStock = dto.quantity ?? 0;

    const saved = await this.dataSource.transaction(async (manager) => {
      const source = manager.create(Source, {
        ...dto,
        quantity: openingStock,
      });
      const created = await manager.save(source);

      if (openingStock > 0) {
        await this.historyService.record(manager, {
          sourceId: created.id,
          action: SourceHistoryAction.RESTOCK,
          quantityBefore: 0,
          quantityAfter: openingStock,
          userId,
          note: 'Opening stock',
        });
      }
      return created;
    });

    return this.findOne(saved.id);
  }

  async findAll(query: QuerySourceDto): Promise<PaginatedResult<Source>> {
    const { page, limit, search, supplierId, lowStock, isActive } = query;

    const qb = this.sourcesRepository
      .createQueryBuilder('source')
      .leftJoinAndSelect('source.supplier', 'supplier')
      .orderBy('source.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (search) {
      qb.andWhere('source.name ILIKE :search', { search: `%${search}%` });
    }
    if (supplierId) {
      qb.andWhere('source.supplierId = :supplierId', { supplierId });
    }
    if (isActive !== undefined) {
      qb.andWhere('source.isActive = :isActive', { isActive });
    }
    if (lowStock) {
      qb.andWhere('source.quantity <= source."minQuantity"');
    }

    const [data, total] = await qb.getManyAndCount();
    return paginated(data, total, query);
  }

  async findOne(id: string): Promise<Source> {
    const source = await this.sourcesRepository.findOne({
      where: { id },
      relations: { supplier: true },
    });
    if (!source) throw new NotFoundException(`Source ${id} not found`);
    return source;
  }

  async update(id: string, dto: UpdateSourceDto): Promise<Source> {
    const source = await this.findOne(id);
    if (dto.supplierId && dto.supplierId !== source.supplierId) {
      await this.assertSupplierExists(dto.supplierId);
    }

    // Column-level update: `source` carries its loaded `supplier` relation,
    // which would win over a changed supplierId on save().
    await this.sourcesRepository.update(id, {
      name: dto.name ?? source.name,
      unit: dto.unit ?? source.unit,
      minQuantity: dto.minQuantity ?? source.minQuantity,
      pricePerUnit: dto.pricePerUnit ?? source.pricePerUnit,
      description:
        dto.description !== undefined ? dto.description : source.description,
      supplierId: dto.supplierId ?? source.supplierId,
      isActive: dto.isActive ?? source.isActive,
    });
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const source = await this.findOne(id);
    const productCount = await this.productsRepository.countBy({
      sourceId: id,
    });
    if (productCount > 0) {
      throw new ConflictException(
        `Source is used by ${productCount} product(s) and cannot be deleted`,
      );
    }
    await this.sourcesRepository.softRemove(source);
  }

  /** Manual purchase / stock-in. */
  async restock(
    id: string,
    dto: RestockSourceDto,
    userId?: string,
  ): Promise<Source> {
    await this.dataSource.transaction((manager) =>
      this.applyStockChange(manager, {
        sourceId: id,
        delta: dto.quantity,
        action: SourceHistoryAction.RESTOCK,
        userId,
        note: dto.note,
      }),
    );
    return this.findOne(id);
  }

  /** Corrects stock to an absolute value (physical count, spoilage, ...). */
  async adjust(
    id: string,
    dto: AdjustSourceDto,
    userId?: string,
  ): Promise<Source> {
    await this.dataSource.transaction(async (manager) => {
      const current = await this.lockSource(manager, id);
      const delta = dto.quantity - current.quantity;
      if (delta === 0) return current;

      return this.applyStockChange(
        manager,
        {
          sourceId: id,
          delta,
          action: SourceHistoryAction.ADJUSTMENT,
          userId,
          note: dto.note,
        },
        current,
      );
    });
    return this.findOne(id);
  }

  findHistory(
    sourceId: string,
    query: QuerySourceHistoryDto,
  ): Promise<PaginatedResult<SourceHistory>> {
    return this.historyService.findAll({ ...query, sourceId });
  }

  /**
   * The single place where `sources.quantity` ever changes.
   *
   * Locks the row FOR UPDATE so two concurrent productions can't both read the
   * same stock and oversell it, refuses to go negative, and always writes the
   * matching history row inside the caller's transaction.
   */
  async applyStockChange(
    manager: EntityManager,
    params: StockChangeParams,
    preloaded?: Source,
  ): Promise<Source> {
    const source = preloaded ?? (await this.lockSource(manager, params.sourceId));

    const before = Number(source.quantity);
    const after = Number((before + params.delta).toFixed(3));

    if (after < 0) {
      throw new ConflictException(
        `Not enough stock of "${source.name}": available ${before} ${source.unit}, ` +
          `required ${Math.abs(params.delta)} ${source.unit}`,
      );
    }

    source.quantity = after;
    const updated = await manager.save(source);

    await this.historyService.record(manager, {
      sourceId: source.id,
      action: params.action,
      quantityBefore: before,
      quantityAfter: after,
      productId: params.productId,
      userId: params.userId,
      note: params.note,
    });

    return updated;
  }

  /** Row-level lock; must run inside a transaction. */
  async lockSource(manager: EntityManager, id: string): Promise<Source> {
    const source = await manager.findOne(Source, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!source) throw new NotFoundException(`Source ${id} not found`);
    if (!source.isActive) {
      throw new BadRequestException(
        `Source "${source.name}" is archived and cannot be used`,
      );
    }
    return source;
  }

  private async assertSupplierExists(supplierId: string): Promise<void> {
    const exists = await this.suppliersRepository.existsBy({ id: supplierId });
    if (!exists) {
      throw new NotFoundException(`Supplier ${supplierId} not found`);
    }
  }
}
