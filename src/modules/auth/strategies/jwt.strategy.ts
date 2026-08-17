import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/users.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Access token required');
    }

    // Only a genuinely missing user is an auth failure. Swallowing every error
    // here would turn a database hiccup into a 401, which makes clients drop
    // their session and log the user out over a transient infrastructure blip.
    let user: User;
    try {
      user = await this.usersService.findOne(payload.sub);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new UnauthorizedException('User no longer exists');
      }
      throw error;
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }
    return user;
  }
}
