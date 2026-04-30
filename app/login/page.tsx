import { Suspense } from 'react';
import LoginForm from './login-form';

/**
 * Server component wrapper — required so that the <LoginForm> client
 * component's useSearchParams() call is enclosed in a <Suspense>
 * boundary, which prevents a build-time prerender error.
 */
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
