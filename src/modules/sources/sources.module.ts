import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/entities/product.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { SourceHistory } from './entities/source-history.entity';
import { Source } from './entities/source.entity';
import { SourceHistoryController } from './source-history.controller';
import { SourceHistoryService } from './source-history.service';
import { SourcesController } from './sources.controller';
import { SourcesService } from './sources.service';

@Module({
  imports: [TypeOrmModule.forFeature([Source, SourceHistory, Supplier, Product])],
  controllers: [SourcesController, SourceHistoryController],
  providers: [SourcesService, SourceHistoryService],
  exports: [SourcesService, SourceHistoryService],
})
export class SourcesModule {}
