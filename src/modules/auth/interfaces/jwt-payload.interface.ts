import { Role } from '../../../common/enums/role.enum';

export interface JwtPayload {
  /** user id */
  sub: string;
  email: string;
  role: Role;
  type: 'access' | 'refresh';
  /** Unique id, set on refresh tokens so each issued token differs. */
  jti?: string;
}
