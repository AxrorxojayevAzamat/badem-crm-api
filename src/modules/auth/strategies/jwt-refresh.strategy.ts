import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

export interface RefreshRequestUser {
  userId: string;
  email: string;
  refreshToken: string;
}

/**
 * Only checks the signature/expiry of the refresh token and hands the raw
 * token to AuthService, which compares it against the stored hash.
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: JwtPayload): RefreshRequestUser {
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Refresh token required');
    }

    const refreshToken = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is missing');
    }

    return { userId: payload.sub, email: payload.email, refreshToken };
  }
}
