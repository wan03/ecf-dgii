import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware — runs on every request before the route handler.
 *
 * Responsibilities:
 *  1. Refresh the Supabase session cookie so it never silently expires.
 *  2. Redirect unauthenticated visitors to /login for page requests.
 *  3. Return 401 JSON for unauthenticated API requests.
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write cookies onto both the request and the response so that
          // server components further down the chain can read the refreshed
          // session.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() validates the token with the Supabase Auth server on every
  // request — never trust the local session cookie alone.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Allow the login page and its form-action itself through without auth.
  if (pathname.startsWith('/login')) {
    // If already authenticated, bounce to dashboard.
    if (user) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return supabaseResponse;
  }

  // Protect API routes: return 401 JSON so client-side fetch() can handle it.
  if (pathname.startsWith('/api/')) {
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return supabaseResponse;
  }

  // All other routes: redirect to login if not authenticated.
  if (!user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static  (static files)
     * - _next/image   (image optimisation)
     * - favicon.ico   (browser tab icon)
     * - *.svg / *.png / *.jpg … (public static assets)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
