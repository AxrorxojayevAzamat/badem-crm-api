import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'Roasted almond 500g' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ example: 'ALM-500' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sku?: string;

  @ApiProperty({ example: 200, description: 'Units produced' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantity: number;

  @ApiPropertyOptional({
    example: 0.5,
    default: 1,
    description:
      'Source units consumed per produced unit. Stock taken = quantity * sourceUsage.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  sourceUsage?: number;

  @ApiPropertyOptional({ example: 65000, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiProperty({ description: 'Client this product is produced for' })
  @IsUUID()
  clientId: string;

  @ApiProperty({ description: 'Source (raw material) consumed by this product' })
  @IsUUID()
  sourceId: string;
}
