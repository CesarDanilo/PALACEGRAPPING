import { randomUUID } from 'node:crypto';
import { permissionsOf } from '../../domain/access/permissions.js';
import { unauthenticated } from '../../shared/errors.js';
import { randomToken, sha256 } from '../../shared/crypto.js';
import type { UnitOfWork } from '../ports/repositories.js';
import type { AccessTokenService, Clock, PasswordHasher } from '../ports/services.js';

export interface SessionMeta {
  userAgent: string | null;
  ip: string | null;
}

export interface IssuedSession {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

// Hash calculado uma vez para equalizar o tempo de resposta quando o e-mail não existe.
let dummyHash: Promise<string> | null = null;

export class AuthService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly hasher: PasswordHasher,
    private readonly tokens: AccessTokenService,
    private readonly clock: Clock,
    private readonly refreshTtlDays: number,
  ) {}

  async login(email: string, password: string, meta: SessionMeta) {
    const { users } = this.uow.repos;
    const user = await users.findByEmail(email.trim().toLowerCase());
    if (!user || !user.isActive) {
      dummyHash ??= this.hasher.hash('timing-equalizer');
      await this.hasher.verify(await dummyHash, password);
      throw unauthenticated('E-mail ou senha inválidos');
    }
    const ok = await this.hasher.verify(user.passwordHash, password);
    if (!ok) throw unauthenticated('E-mail ou senha inválidos');

    await users.markLogin(user.id, this.clock.now());
    const session = await this.issue(user.id, user.email, randomUUID(), meta);
    return { session, profile: await this.profile(user.id) };
  }

  /** Rotação de refresh token. Reuso de um token já rotacionado revoga toda a família. */
  async refresh(refreshToken: string, meta: SessionMeta) {
    const now = this.clock.now();
    const { refreshTokens, users } = this.uow.repos;
    const record = await refreshTokens.findByHash(sha256(refreshToken));
    if (!record) throw unauthenticated('Sessão inválida');
    if (record.revokedAt || record.expiresAt <= now) throw unauthenticated('Sessão expirada');
    if (record.rotatedAt) {
      await refreshTokens.revokeFamily(record.familyId, now);
      throw unauthenticated('Sessão reutilizada; faça login novamente');
    }
    const claimed = await refreshTokens.markRotated(record.id, now);
    if (!claimed) {
      await refreshTokens.revokeFamily(record.familyId, now);
      throw unauthenticated('Sessão reutilizada; faça login novamente');
    }
    const user = await users.findById(record.userId);
    if (!user || !user.isActive) throw unauthenticated('Usuário inativo');
    return this.issue(user.id, user.email, record.familyId, meta);
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    const record = await this.uow.repos.refreshTokens.findByHash(sha256(refreshToken));
    if (record) await this.uow.repos.refreshTokens.revokeFamily(record.familyId, this.clock.now());
  }

  async profile(userId: string) {
    const user = await this.uow.repos.users.findById(userId);
    if (!user || !user.isActive) throw unauthenticated('Usuário inativo');
    const memberships = await this.uow.repos.tenants.listMemberships(userId);
    return {
      user: { id: user.id, email: user.email, name: user.name, isPlatformAdmin: user.isPlatformAdmin },
      memberships: memberships
        .filter((m) => m.tenant.status === 'ACTIVE')
        .map((m) => ({
          tenant: { id: m.tenant.id, slug: m.tenant.slug, name: m.tenant.name },
          role: m.role,
          permissions: permissionsOf(m.role),
        })),
    };
  }

  private async issue(userId: string, email: string, familyId: string, meta: SessionMeta): Promise<IssuedSession> {
    const { token, expiresIn } = await this.tokens.sign({ sub: userId, email });
    const refreshToken = randomToken();
    const refreshExpiresAt = new Date(this.clock.now().getTime() + this.refreshTtlDays * 86_400_000);
    await this.uow.repos.refreshTokens.create({
      userId,
      tokenHash: sha256(refreshToken),
      familyId,
      expiresAt: refreshExpiresAt,
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
      ip: meta.ip,
    });
    return { accessToken: token, expiresIn, refreshToken, refreshExpiresAt };
  }
}
