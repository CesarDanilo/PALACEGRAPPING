import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { z } from '@/lib/zod';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { useAdminSession } from '@/features/admin-auth/AdminSession';
import { ApiError } from '@/lib/api/client';
import styles from './admin.module.css';

const schema = z.object({
  email: z.email('Informe um e-mail válido'),
  password: z.string().min(1, 'Informe a senha'),
});
type Values = z.infer<typeof schema>;

export function LoginPage() {
  const { status, login } = useAdminSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  const fromState = (location.state as { from?: string } | null)?.from;
  const target = fromState?.startsWith('/admin') && fromState !== '/admin/login' ? fromState : '/admin';
  if (status === 'authenticated') return <Navigate to={target} replace />;

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await login(values.email, values.password);
      navigate(target, { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível entrar agora.');
    }
  });

  return (
    <main className={styles.loginPage}>
      <form className={styles.loginCard} onSubmit={onSubmit} noValidate aria-labelledby="login-title">
        <p className={styles.loginBrand}>
          PALACE <span>ADMIN</span>
        </p>
        <h1 id="login-title" className={styles.loginTitle}>
          Entrar no painel
        </h1>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <TextField label="E-mail" type="email" autoComplete="username" error={formState.errors.email?.message} {...register('email')} />
        <TextField label="Senha" type="password" autoComplete="current-password" error={formState.errors.password?.message} {...register('password')} />
        <Button type="submit" block loading={formState.isSubmitting}>
          Entrar
        </Button>
      </form>
    </main>
  );
}
