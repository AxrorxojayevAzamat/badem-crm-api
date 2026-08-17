import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class RestockSourceDto {
  @ApiProperty({ example: 500, description: 'How much stock to add' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantity: number;

  @ApiPropertyOptional({ example: 'Invoice #4471 from the supplier' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

export class AdjustSourceDto {
  @ApiProperty({
    example: 980.5,
    description: 'New absolute stock after a physical count',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  quantity: number;

  @ApiPropertyOptional({ example: 'Monthly inventory count' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
