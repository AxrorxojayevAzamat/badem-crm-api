import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Skips the globally registered JwtAuthGuard for this route. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
