import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateSourceDto } from './create-source.dto';

/**
 * `quantity` is intentionally not editable here — stock only moves through
 * /restock, /adjust or product production, so the history stays complete.
 */
export class UpdateSourceDto extends PartialType(
  OmitType(CreateSourceDto, ['quantity'] as const),
) {}
