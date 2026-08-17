import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QuerySourceHistoryDto } from './dto/query-source.dto';
import { SourceHistoryService } from './source-history.service';

@ApiTags('source-history')
@ApiBearerAuth()
@Controller('source-history')
export class SourceHistoryController {
  constructor(private readonly historyService: SourceHistoryService) {}

  @Get()
  @ApiOperation({
    summary: 'Stock ledger across all sources',
    description:
      'Filter by source, product, action or date range. Read-only: entries are ' +
      'written automatically by restock/adjust and by product production.',
  })
  findAll(@Query() query: QuerySourceHistoryDto) {
    return this.historyService.findAll(query);
  }
}
