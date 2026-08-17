import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import {
  PaginatedResult,
  paginated,
} from '../../common/dto/pagination.dto';
import { SourceHistoryAction } from '../../common/enums/source-history-action.enum';
import { Client } from '../clients/entities/client.entity';
import { SourcesService } from '../sources/sources.service';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './entities/product.entity';

/** Stock is stored with 3 decimals; keep arithmetic on the same grid. */
const round3 = (value: number): number => Number(value.toFixed(3));

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(Client)
    private readonly clientsRepository: Repository<Client>,
    private readonly sourcesService: SourcesService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Creating a product consumes its source: `quantity * sourceUsage` is taken
   * off the source stock and logged in the source history — all in one
   * transaction, so a failed deduction never leaves a phantom product behind.
   */
  async create(dto: CreateProductDto, userId?: string): Promise<Product> {
    await this.assertClientExists(dto.clientId);
    await this.assertSkuIsFree(dto.sku);

    const sourceUsage = dto.sourceUsage ?? 1;
    const totalSourceUsed = round3(dto.quantity * sourceUsage);

    const saved = await this.dataSource.transaction(async (manager) => {
      // Lock the stock row first so concurrent productions queue up here.
      const source = await this.sourcesService.lockSource(
        manager,
        dto.sourceId,
      );

      const product = await manager.save(
        manager.create(Product, {
          ...dto,
          sourceUsage,
          totalSourceUsed,
          price: dto.price ?? 0,
        }),
      );

      await this.sourcesService.applyStockChange(
        manager,
        {
          sourceId: source.id,
          delta: -totalSourceUsed,
          action: SourceHistoryAction.PRODUCTION,
          productId: product.id,
          userId,
          note: `Production of "${product.name}" (${dto.quantity} x ${sourceUsage})`,
        },
        source,
      );

      return product;
    });

    return this.findOne(saved.id);
  }

  async findAll(query: QueryProductDto): Promise<PaginatedResult<Product>> {
    const { page, limit, search, clientId, sourceId } = query;

    const qb = this.productsRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.client', 'client')
      .leftJoinAndSelect('product.source', 'source')
      .orderBy('product.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (search) {
      qb.andWhere('(product.name ILIKE :search OR product.sku ILIKE :search)', {
        search: `%${search}%`,
      });
    }
    if (clientId) qb.andWhere('product.clientId = :clientId', { clientId });
    if (sourceId) qb.andWhere('product.sourceId = :sourceId', { sourceId });

    const [data, total] = await qb.getManyAndCount();
    return paginated(data, total, query);
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.productsRepository.findOne({
      where: { id },
      relations: { client: true, source: true },
    });
    if (!product) throw new NotFoundException(`Product ${id} not found`);
    return product;
  }

  /**
   * Re-settles stock when the recipe changes: the previous consumption is
   * returned to the old source, then the new consumption is taken again.
   */
  async update(
    id: string,
    dto: UpdateProductDto,
    userId?: string,
  ): Promise<Product> {
    const existing = await this.findOne(id);

    if (dto.clientId && dto.clientId !== existing.clientId) {
      await this.assertClientExists(dto.clientId);
    }
    if (dto.sku !== undefined) await this.assertSkuIsFree(dto.sku, id);

    const quantity = dto.quantity ?? existing.quantity;
    const sourceUsage = dto.sourceUsage ?? existing.sourceUsage;
    const newSourceId = dto.sourceId ?? existing.sourceId;
    const newTotal = round3(quantity * sourceUsage);
    const oldTotal = existing.totalSourceUsed;

    await this.dataSource.transaction(async (manager) => {
      if (newSourceId !== existing.sourceId) {
        // Moved to another raw material: give everything back, take it anew.
        await this.sourcesService.applyStockChange(manager, {
          sourceId: existing.sourceId,
          delta: oldTotal,
          action: SourceHistoryAction.RETURN,
          productId: id,
          userId,
          note: `Product "${existing.name}" switched to another source`,
        });
        await this.sourcesService.applyStockChange(manager, {
          sourceId: newSourceId,
          delta: -newTotal,
          action: SourceHistoryAction.PRODUCTION,
          productId: id,
          userId,
          note: `Product "${existing.name}" switched to this source`,
        });
      } else if (newTotal !== oldTotal) {
        const delta = round3(oldTotal - newTotal);
        await this.sourcesService.applyStockChange(manager, {
          sourceId: existing.sourceId,
          delta,
          action:
            delta > 0
              ? SourceHistoryAction.RETURN
              : SourceHistoryAction.PRODUCTION,
          productId: id,
          userId,
          note: `Product "${existing.name}" consumption changed ${oldTotal} -> ${newTotal}`,
        });
      }

      // Column-level update on purpose: `existing` was loaded with its
      // `source`/`client` relations, and on save() TypeORM lets a loaded
      // relation object win over the FK column — which would silently keep
      // the product on its old source after the stock had already moved.
      await manager.update(Product, id, {
        name: dto.name ?? existing.name,
        sku: dto.sku !== undefined ? dto.sku : existing.sku,
        price: dto.price ?? existing.price,
        description:
          dto.description !== undefined ? dto.description : existing.description,
        clientId: dto.clientId ?? existing.clientId,
        sourceId: newSourceId,
        quantity,
        sourceUsage,
        totalSourceUsed: newTotal,
      });
    });

    return this.findOne(id);
  }

  /** Deleting a product returns the source it had consumed. */
  async remove(id: string, userId?: string): Promise<void> {
    const product = await this.findOne(id);

    await this.dataSource.transaction(async (manager) => {
      if (product.totalSourceUsed > 0) {
        await this.sourcesService.applyStockChange(manager, {
          sourceId: product.sourceId,
          delta: product.totalSourceUsed,
          action: SourceHistoryAction.RETURN,
          productId: product.id,
          userId,
          note: `Product "${product.name}" deleted`,
        });
      }
      await manager.softRemove(product);
    });
  }

  private async assertClientExists(clientId: string): Promise<void> {
    const exists = await this.clientsRepository.existsBy({ id: clientId });
    if (!exists) throw new NotFoundException(`Client ${clientId} not found`);
  }

  private async assertSkuIsFree(
    sku: string | undefined,
    exceptProductId?: string,
  ): Promise<void> {
    if (!sku) return;
    const taken = await this.productsRepository.existsBy({
      sku,
      ...(exceptProductId ? { id: Not(exceptProductId) } : {}),
    });
    if (taken) {
      throw new ConflictException(`Product with SKU ${sku} already exists`);
    }
  }
}
