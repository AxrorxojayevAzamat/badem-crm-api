import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CreateSourceDto } from './dto/create-source.dto';
import { QuerySourceDto, QuerySourceHistoryDto } from './dto/query-source.dto';
import { AdjustSourceDto, RestockSourceDto } from './dto/stock.dto';
import { UpdateSourceDto } from './dto/update-source.dto';
import { SourcesService } from './sources.service';

@ApiTags('sources')
@ApiBearerAuth()
@Controller('sources')
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Create a source (raw material) for a supplier' })
  create(@Body() dto: CreateSourceDto, @CurrentUser('id') userId: string) {
    return this.sourcesService.create(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'List sources (filter by supplier / low stock)' })
  findAll(@Query() query: QuerySourceDto) {
    return this.sourcesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.sourcesService.findOne(id);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Stock movement history of one source' })
  history(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QuerySourceHistoryDto,
  ) {
    return this.sourcesService.findHistory(id, query);
  }

  @Post(':id/restock')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Add stock (purchase from the supplier)' })
  restock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RestockSourceDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.sourcesService.restock(id, dto, userId);
  }

  @Post(':id/adjust')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Correct stock to an absolute value' })
  adjust(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustSourceDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.sourcesService.adjust(id, dto, userId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Update source details (not the stock level)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSourceDto) {
    return this.sourcesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.sourcesService.remove(id);
  }
}
