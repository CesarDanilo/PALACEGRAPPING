import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, refreshSession, session } from '@/lib/api/client';
import type { LoginResponse, Membership, Profile } from '@/lib/api/types';

type Status = 'loading' | 'anonymous' | 'authenticated';

interface AdminSessionValue {
  status: Status;
  profile: Profile | null;
  membership: Membership | null;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  selectTenant(tenantId: string): void;
  can(permission: string): boolean;
}

const Ctx = createContext<AdminSessionValue | null>(null);

function pickMembership(profile: Profile, preferred: string | null): Membership | null {
  return profile.memberships.find((m) => m.tenant.id === preferred) ?? profile.memberships[0] ?? null;
}

/**
 * Sessão do painel. A autorização real acontece na API a cada requisição;
 * aqui só decidimos o que mostrar.
 */
export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);

  const adopt = useCallback((p: Profile) => {
    const m = pickMembership(p, session.rememberedTenant());
    session.selectTenant(m?.tenant.id ?? null);
    setProfile(p);
    setMembership(m);
    setStatus('authenticated');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!(await refreshSession())) {
        if (!cancelled) setStatus('anonymous');
        return;
      }
      try {
        const p = await api<Profile>('/auth/me', { admin: true });
        if (!cancelled) adopt(p);
      } catch {
        if (!cancelled) setStatus('anonymous');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adopt]);

  useEffect(
    () =>
      session.subscribe(() => {
        if (!session.token) {
          setStatus('anonymous');
          setProfile(null);
          setMembership(null);
        }
      }),
    [],
  );

  const value = useMemo<AdminSessionValue>(
    () => ({
      status,
      profile,
      membership,
      async login(email, password) {
        const res = await api<LoginResponse>('/auth/login', { method: 'POST', body: { email, password } });
        session.set(res.accessToken);
        adopt(res);
      },
      async logout() {
        await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
        session.set(null);
        queryClient.clear();
      },
      selectTenant(tenantId) {
        if (!profile) return;
        const m = profile.memberships.find((x) => x.tenant.id === tenantId) ?? null;
        session.selectTenant(m?.tenant.id ?? null);
        setMembership(m);
        queryClient.removeQueries({ queryKey: ['admin'] });
      },
      can(permission) {
        return membership?.permissions.includes(permission) ?? false;
      },
    }),
    [status, profile, membership, adopt, queryClient],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminSession(): AdminSessionValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('useAdminSession fora de AdminSessionProvider');
  return value;
}
