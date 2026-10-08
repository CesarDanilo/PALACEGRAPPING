import { hash, verify } from '@node-rs/argon2';
import { jwtVerify, SignJWT } from 'jose';
import type { AccessTokenClaims, AccessTokenService, Clock, PasswordHasher } from '../../application/ports/services.js';
import { unauthenticated } from '../../shared/errors.js';

/** Argon2id com parâmetros recomendados pela OWASP (m=19 MiB, t=2, p=1). */
export class Argon2PasswordHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return hash(plain, { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  }

  async verify(hashed: string, plain: string): Promise<boolean> {
    try {
      return await verify(hashed, plain);
    } catch {
      return false;
    }
  }
}

const ISSUER = 'commerce-api';
const AUDIENCE = 'commerce-admin';

/** JWT HS256 de curta duração. Não carrega tenant nem papel: eles são lidos do banco a cada requisição. */
export class JwtAccessTokenService implements AccessTokenService {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly ttlSeconds: number,
    private readonly clock: Clock,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  async sign(claims: AccessTokenClaims) {
    const now = Math.floor(this.clock.now().getTime() / 1000);
    const token = await new SignJWT({ email: claims.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + this.ttlSeconds)
      .sign(this.key);
    return { token, expiresIn: this.ttlSeconds };
  }

  async verify(token: string): Promise<AccessTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
        currentDate: this.clock.now(),
      });
      if (!payload.sub || typeof payload.email !== 'string') throw new Error('claims ausentes');
      return { sub: payload.sub, email: payload.email };
    } catch {
      throw unauthenticated('Token inválido ou expirado');
    }
  }
}

export const systemClock: Clock = { now: () => new Date() };
