import { redirect } from 'next/navigation';
import { customerLoginEntryDestination } from '../../../../services/auth-navigation';

// Compatibility only: never render a second Customer authentication screen.
export default async function LoginPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') params.set(key, value);
  }
  redirect(customerLoginEntryDestination(params));
}
