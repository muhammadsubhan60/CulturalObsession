import { redirect } from 'next/navigation';
import { getStaffUser } from '@/lib/staff-session';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getStaffUser()) redirect('/admin');
  return <LoginForm />;
}
