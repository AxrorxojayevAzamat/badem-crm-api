import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Validates the refresh token itself (used only by POST /auth/refresh). */
@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {}
