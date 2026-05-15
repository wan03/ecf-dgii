import { createSupabaseServerClient } from '@/lib/supabase/server';
import AuthenticatedShell from '@/components/AuthenticatedShell';

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <AuthenticatedShell userEmail={user?.email ?? null}>
      {children}
    </AuthenticatedShell>
  );
}
