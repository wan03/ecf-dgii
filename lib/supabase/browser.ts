import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client for auth operations in Client Components.
 * Creates a new instance on every call — call once and store in state/ref
 * if needed inside a component.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
