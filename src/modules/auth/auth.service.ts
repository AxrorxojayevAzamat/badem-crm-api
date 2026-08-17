import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { Role } from '../../common/enums/role.enum';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { LoginDto, RegisterDto, TokensDto } from './dto/auth.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<TokensDto> {
    // Self-registration always lands on the lowest role; only an ADMIN can
    // promote afterwards via PATCH /users/:id.
    const user = await this.usersService.create({ ...dto, role: Role.EMPLOYEE });
    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<TokensDto> {
    const user = await this.usersService.findByEmailWithSecrets(dto.email);
    if (!user) throw new UnauthorizedException('Invalid email or password');

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    const tokens = await this.issueTokens(user);
    await this.usersService.markLoggedIn(user.id);
    return tokens;
  }

  /** Rotates the pair: the presented refresh token is invalidated. */
  async refresh(userId: string, refreshToken: string): Promise<TokensDto> {
    const user = await this.usersService.findByIdWithRefreshToken(userId);
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Session expired, please log in again');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    if (!this.tokenMatches(refreshToken, user.refreshTokenHash)) {
      // Token reuse or an old token: drop the session entirely.
      await this.usersService.setRefreshTokenHash(user.id, null);
      throw new UnauthorizedException('Refresh token is no longer valid');
    }

    return this.issueTokens(user);
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.setRefreshTokenHash(userId, null);
  }

  me(userId: string): Promise<User> {
    return this.usersService.findOne(userId);
  }

  private async issueTokens(user: Pick<User, 'id' | 'email' | 'role'>): Promise<TokensDto> {
    const basePayload = { sub: user.id, email: user.email, role: user.role };

    // '15m' / '7d' style strings, typed the way jsonwebtoken expects them.
    const accessExpiresIn = this.config.getOrThrow<string>(
      'JWT_ACCESS_EXPIRES_IN',
    ) as JwtSignOptions['expiresIn'];
    const refreshExpiresIn = this.config.getOrThrow<string>(
      'JWT_REFRESH_EXPIRES_IN',
    ) as JwtSignOptions['expiresIn'];

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync({ ...basePayload, type: 'access' } as JwtPayload, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: accessExpiresIn,
      }),
      // `jti` makes every refresh token unique. Without it, two tokens minted
      // in the same second are byte-identical (iat/exp only have second
      // resolution), and rotation would not actually invalidate the old one.
      this.jwtService.signAsync(
        { ...basePayload, type: 'refresh', jti: randomUUID() } as JwtPayload,
        {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: refreshExpiresIn,
        },
      ),
    ]);

    await this.usersService.setRefreshTokenHash(
      user.id,
      this.hashToken(refreshToken),
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.decodeExpiresIn(accessToken),
    };
  }

  /**
   * Refresh tokens are hashed with SHA-256, not bcrypt: bcrypt only reads the
   * first 72 bytes of its input, and two JWTs issued for the same user are
   * byte-identical that far in (header + start of the `sub` claim). Hashing
   * them with bcrypt would make every old refresh token of that user keep
   * matching the stored hash, so rotation would never invalidate anything.
   * A signed JWT is already high-entropy, so a fast digest is the right tool.
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private tokenMatches(token: string, storedHash: string): boolean {
    const provided = Buffer.from(this.hashToken(token), 'hex');
    const stored = Buffer.from(storedHash, 'hex');
    if (provided.length !== stored.length) return false;
    return timingSafeEqual(provided, stored);
  }

  /** Seconds left on the freshly minted access token, for the client. */
  private decodeExpiresIn(token: string): number {
    const decoded = this.jwtService.decode(token) as { exp?: number } | null;
    if (!decoded?.exp) return 0;
    return Math.max(decoded.exp - Math.floor(Date.now() / 1000), 0);
  }
}
