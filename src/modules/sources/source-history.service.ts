import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  PaginatedResult,
  paginated,
} from '../../common/dto/pagination.dto';
import { SourceHistoryAction } from '../../common/enums/source-history-action.enum';
import { QuerySourceHistoryDto } from './dto/query-source.dto';
import { SourceHistory } from './entities/source-history.entity';

export interface RecordHistoryParams {
  sourceId: string;
  action: SourceHistoryAction;
  quantityBefore: number;
  quantityAfter: number;
  productId?: string | null;
  userId?: string | null;
  note?: string | null;
}

@Injectable()
export class SourceHistoryService {
  constructor(
    @InjectRepository(SourceHistory)
    private readonly historyRepository: Repository<SourceHistory>,
  ) {}

  /**
   * Writes one ledger row. Takes the caller's EntityManager so the entry is
   * committed in the same transaction as the stock change it describes.
   */
  record(
    manager: EntityManager,
    params: RecordHistoryParams,
  ): Promise<SourceHistory> {
    const entry = manager.create(SourceHistory, {
      sourceId: params.sourceId,
      action: params.action,
      quantityBefore: params.quantityBefore,
      quantityChange: Number(
        (params.quantityAfter - params.quantityBefore).toFixed(3),
      ),
      quantityAfter: params.quantityAfter,
      productId: params.productId ?? null,
      userId: params.userId ?? null,
      note: params.note ?? null,
    });
    return manager.save(entry);
  }

  async findAll(
    query: QuerySourceHistoryDto,
  ): Promise<PaginatedResult<SourceHistory>> {
    const { page, limit, sourceId, productId, action, from, to } = query;

    const qb = this.historyRepository
      .createQueryBuilder('history')
      .leftJoinAndSelect('history.source', 'source')
      .leftJoinAndSelect('history.product', 'product')
      .leftJoinAndSelect('history.user', 'user')
      .orderBy('history.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (sourceId) qb.andWhere('history.sourceId = :sourceId', { sourceId });
    if (productId) qb.andWhere('history.productId = :productId', { productId });
    if (action) qb.andWhere('history.action = :action', { action });
    if (from) qb.andWhere('history.createdAt >= :from', { from: new Date(from) });
    if (to) qb.andWhere('history.createdAt <= :to', { to: new Date(to) });

    const [data, total] = await qb.getManyAndCount();
    return paginated(data, total, query);
  }
}
