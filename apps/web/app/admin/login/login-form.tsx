'use client';

/**
 * Staff sign-in, adapted from the 21st.dev "Login Card" (Hirael login-01, MIT).
 * Social providers, sign-up and remember-me were removed: staff accounts are created by an owner.
 */

import { ArrowRight, CircleAlert, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ENTER = 'animate-[admin-enter_400ms_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none';

type Errors = Partial<Record<'email' | 'password' | 'code' | 'form', string>>;

/** Maps an auth failure to a message that never reveals which part was wrong or leaks server detail. */
function messageFor(status: number | undefined, retryAfter: number | null): string {
  if (status === 429) {
    return retryAfter ? `Too many attempts. Try again in ${formatWait(retryAfter)}.` : 'Too many attempts. Try again later.';
  }
  if (status === 401 || status === 400) return "That email and password don't match.";
  if (status === 403) return 'This account cannot sign in. Ask the store owner.';
  return 'Something went wrong, please try again.';
}

function formatWait(seconds: number) {
  return seconds >= 60 ? `${Math.ceil(seconds / 60)} min` : `${seconds}s`;
}

function useCountdown() {
  const [until, setUntil] = React.useState<number | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!until) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [until]);
  const remaining = until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
  return { remaining, start: (seconds: number) => { setNow(Date.now()); setUntil(Date.now() + seconds * 1000); } };
}

function PasswordInput(props: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input type={visible ? 'text' : 'password'} className="pr-11" {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [step, setStep] = React.useState<'password' | 'totp'>('password');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  const [errors, setErrors] = React.useState<Errors>({});
  const [pending, setPending] = React.useState(false);
  const cooldown = useCountdown();
  const blocked = cooldown.remaining > 0;

  function fail(status: number | undefined, retryAfterHeader: string | null) {
    const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : null;
    if (status === 429 && retryAfter) cooldown.start(retryAfter);
    setErrors({ form: messageFor(status, retryAfter) });
  }

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Errors = {};
    if (!email.trim()) next.email = 'Enter your staff email.';
    else if (!EMAIL_PATTERN.test(email.trim())) next.email = "That doesn't look like a valid email.";
    if (!password) next.password = 'Enter your password.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setPending(true);
    let retryAfter: string | null = null;
    const { data, error } = await authClient.signIn.email(
      { email: email.trim(), password },
      { onError: (ctx) => { retryAfter = ctx.response.headers.get('Retry-After'); } },
    );
    setPending(false);
    if (error) return fail(error.status, retryAfter);
    if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) {
      setStep('totp');
      return;
    }
    router.replace('/admin');
    router.refresh();
  }

  async function onTotpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setErrors({ code: 'Enter the 6-digit code from your authenticator app.' });
      return;
    }
    setErrors({});
    setPending(true);
    let retryAfter: string | null = null;
    const { error } = await authClient.twoFactor.verifyTotp(
      { code },
      { onError: (ctx) => { retryAfter = ctx.response.headers.get('Retry-After'); } },
    );
    setPending(false);
    if (error) {
      if (error.status === 401 || error.status === 400) setErrors({ code: "That code didn't work. Check the time on your phone and try again." });
      else fail(error.status, retryAfter);
      return;
    }
    router.replace('/admin');
    router.refresh();
  }

  return (
    <section className="relative isolate flex min-h-svh items-center justify-center bg-background px-4 py-12">
      <style>{'@keyframes admin-enter{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}'}</style>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
        style={{
          backgroundImage:
            'linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className={cn(ENTER, 'w-full max-w-sm rounded-lg border bg-card shadow-[6px_6px_0_0_var(--border)]')}>
        <div className="flex flex-col items-center gap-3 border-b px-6 pb-6 pt-8 text-center sm:px-8">
          <span className="flex size-11 items-center justify-center rounded-md bg-primary font-serif text-base font-bold text-primary-foreground">
            CO
          </span>
          <div>
            <h1 className="font-serif text-2xl font-bold text-primary">
              {step === 'password' ? 'Staff sign in' : 'Two-step verification'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {step === 'password' ? 'Cultural Obsession store admin' : 'Enter the code from your authenticator app.'}
            </p>
          </div>
        </div>

        <form noValidate className="flex flex-col gap-5 p-6 sm:p-8" onSubmit={step === 'password' ? onPasswordSubmit : onTotpSubmit}>
          {errors.form && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{blocked ? messageFor(429, cooldown.remaining) : errors.form}</span>
            </div>
          )}

          {step === 'password' ? (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={Boolean(errors.email) || undefined}
                  aria-describedby={errors.email ? 'login-email-error' : undefined}
                />
                {errors.email && (
                  <p id="login-email-error" className="text-sm text-destructive">
                    {errors.email}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="login-password">Password</Label>
                <PasswordInput
                  id="login-password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={Boolean(errors.password) || undefined}
                  aria-describedby={errors.password ? 'login-password-error' : 'login-password-help'}
                />
                {errors.password ? (
                  <p id="login-password-error" className="text-sm text-destructive">
                    {errors.password}
                  </p>
                ) : (
                  <p id="login-password-help" className="text-xs text-muted-foreground">
                    Forgot it? Ask the store owner to reset your password.
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="login-code">6-digit code</Label>
              <Input
                id="login-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                aria-invalid={Boolean(errors.code) || undefined}
                aria-describedby={errors.code ? 'login-code-error' : undefined}
                className="text-center font-mono text-lg tracking-[0.4em]"
              />
              {errors.code && (
                <p id="login-code-error" className="text-sm text-destructive">
                  {errors.code}
                </p>
              )}
            </div>
          )}

          <Button type="submit" size="lg" disabled={pending || blocked} className="group w-full">
            {pending ? (
              <>
                <Loader2 className="animate-spin" />
                {step === 'password' ? 'Signing in…' : 'Verifying…'}
              </>
            ) : (
              <>
                {step === 'password' ? 'Sign in' : 'Verify'}
                <ArrowRight className="transition-transform duration-150 group-hover:translate-x-0.5" />
              </>
            )}
          </Button>

          {step === 'totp' && (
            <Button
              type="button"
              variant="link"
              className="h-auto self-center p-0 text-sm"
              onClick={() => {
                setStep('password');
                setCode('');
                setErrors({});
              }}
            >
              Use a different account
            </Button>
          )}
        </form>
      </div>
    </section>
  );
}
