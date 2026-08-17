import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';

/**
 * Changing `quantity`, `sourceUsage` or `sourceId` re-settles the stock:
 * the old consumption is returned and the new one is taken again.
 */
export class UpdateProductDto extends PartialType(CreateProductDto) {}
