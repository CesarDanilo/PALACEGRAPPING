import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { useAdminSession } from '@/features/admin-auth/AdminSession';
import { adminApi, type Member } from '@/lib/api/admin';
import { ApiError } from '@/lib/api/client';
import { emailSchema, fullNameSchema, passwordSchema } from '@/lib/validation';
import { z } from '@/lib/zod';
import { Panel, errorMessage, useAdminMutation } from './common';
import styles from './admin.module.css';

const roleLabel: Record<Member['role'], string> = { OWNER: 'Proprietário', ADMIN: 'Administrador', OPERATOR: 'Operador' };
const roleHelp: Record<Member['role'], string> = {
  OWNER: 'Tudo, inclusive equipe e configurações.',
  ADMIN: 'Catálogo, pedidos, estoque, financeiro e configurações. Não gerencia a equipe.',
  OPERATOR: 'Pedidos, estoque e clientes. Não vê o financeiro nem altera o catálogo.',
};

const memberSchema = z
  .object({
    name: fullNameSchema,
    email: emailSchema,
    role: z.enum(['OWNER', 'ADMIN', 'OPERATOR']),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'As senhas não conferem' });
type MemberForm = z.infer<typeof memberSchema>;

/** Equipe da loja: cada pessoa entra no painel com o próprio e-mail e senha. */
export function TeamPanel({ members }: { members: Member[] }) {
  const { profile } = useAdminSession();
  const form = useForm<MemberForm>({ resolver: zodResolver(memberSchema), defaultValues: { name: '', email: '', role: 'OPERATOR', password: '', confirmPassword: '' } });
  const e = form.formState.errors;
  const role = form.watch('role');
  const add = useAdminMutation(
    (v: MemberForm) => adminApi.addMember({ name: v.name, email: v.email.trim().toLowerCase(), role: v.role, password: v.password }),
    () => form.reset(),
  );
  const changeRole = useAdminMutation((v: { userId: string; role: Member['role'] }) => adminApi.changeRole(v.userId, v.role));
  const remove = useAdminMutation((userId: string) => adminApi.removeMember(userId));
  const owners = members.filter((m) => m.role === 'OWNER').length;
  const error = changeRole.error ?? remove.error;

  return (
    <Panel title="Equipe">
      {error ? <Alert tone="danger">{errorMessage(error)}</Alert> : null}
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Pessoa</th>
              <th scope="col">Papel</th>
              <th scope="col">
                <span className="visually-hidden">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const isMe = m.userId === profile?.user.id;
              const lastOwner = m.role === 'OWNER' && owners <= 1;
              return (
                <tr key={m.userId}>
                  <td>
                    <strong>{m.name}</strong>
                    {isMe ? <span className={styles.muted}> (você)</span> : null}
                    <span className={styles.muted} style={{ display: 'block' }}>
                      {m.email}
                    </span>
                  </td>
                  <td>
                    <select
                      className={styles.inlineInput}
                      aria-label={`Papel de ${m.name}`}
                      value={m.role}
                      disabled={lastOwner || changeRole.isPending}
                      title={lastOwner ? 'A loja precisa de pelo menos um proprietário' : undefined}
                      onChange={(ev) => {
                        const next = ev.target.value as Member['role'];
                        if (window.confirm(`Mudar ${m.name} para ${roleLabel[next]}?`)) changeRole.mutate({ userId: m.userId, role: next });
                      }}
                    >
                      {(Object.keys(roleLabel) as Member['role'][]).map((r) => (
                        <option key={r} value={r}>
                          {roleLabel[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {!isMe && !lastOwner ? (
                      <button
                        type="button"
                        className={`${styles.linkButton} ${styles.dangerButton}`}
                        aria-label={`Remover ${m.name} da equipe`}
                        disabled={remove.isPending && remove.variables === m.userId}
                        onClick={() => {
                          if (window.confirm(`Remover ${m.name} da equipe? A pessoa perde o acesso ao painel desta loja.`)) remove.mutate(m.userId);
                        }}
                      >
                        Remover
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 className={styles.panelTitle} style={{ marginTop: 'var(--space-6)' }}>
        Adicionar pessoa
      </h3>
      {add.isSuccess ? <Alert tone="success">Pessoa adicionada. Ela já pode entrar no painel com o e-mail e a senha cadastrados.</Alert> : null}
      {add.isError && !(add.error instanceof ApiError && add.error.code === 'VALIDATION_ERROR' && !add.error.message) ? <Alert tone="danger">{errorMessage(add.error)}</Alert> : null}
      <form className={styles.formGrid} noValidate onSubmit={form.handleSubmit((v) => add.mutate(v))}>
        <div className={styles.field}>
          <label htmlFor="tm-name">Nome completo</label>
          <input id="tm-name" autoComplete="off" aria-invalid={e.name ? true : undefined} {...form.register('name')} />
          {e.name ? <p className={styles.fieldError}>{e.name.message}</p> : null}
        </div>
        <div className={styles.field}>
          <label htmlFor="tm-email">E-mail (login)</label>
          <input id="tm-email" type="email" inputMode="email" autoComplete="off" aria-invalid={e.email ? true : undefined} {...form.register('email')} />
          {e.email ? <p className={styles.fieldError}>{e.email.message}</p> : null}
        </div>
        <div className={`${styles.field} ${styles.span2}`}>
          <label htmlFor="tm-role">Papel</label>
          <select id="tm-role" {...form.register('role')}>
            <option value="OPERATOR">Operador</option>
            <option value="ADMIN">Administrador</option>
            <option value="OWNER">Proprietário</option>
          </select>
          <p className={styles.muted}>{roleHelp[role]}</p>
        </div>
        <div className={styles.field}>
          <label htmlFor="tm-pass">Senha inicial</label>
          <input id="tm-pass" type="password" autoComplete="new-password" aria-invalid={e.password ? true : undefined} {...form.register('password')} />
          {e.password ? <p className={styles.fieldError}>{e.password.message}</p> : <p className={styles.muted}>12 ou mais caracteres, com letras e números. A pessoa pode trocar depois.</p>}
        </div>
        <div className={styles.field}>
          <label htmlFor="tm-pass2">Confirme a senha</label>
          <input id="tm-pass2" type="password" autoComplete="new-password" aria-invalid={e.confirmPassword ? true : undefined} {...form.register('confirmPassword')} />
          {e.confirmPassword ? <p className={styles.fieldError}>{e.confirmPassword.message}</p> : null}
        </div>
        <p className={`${styles.muted} ${styles.span2}`}>Se o e-mail já tiver conta no sistema, a pessoa entra com a senha que já usa (a senha informada aqui é ignorada).</p>
        <div className={styles.span2}>
          <Button size="sm" type="submit" loading={add.isPending}>
            Adicionar à equipe
          </Button>
        </div>
      </form>
    </Panel>
  );
}
