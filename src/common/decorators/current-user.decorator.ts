import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '../../modules/users/entities/user.entity';

/**
 * Injects the authenticated user (or one of its fields):
 *   @CurrentUser() user: User
 *   @CurrentUser('id') userId: string
 */
export const CurrentUser = createParamDecorator(
  (data: keyof User | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: User }>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
