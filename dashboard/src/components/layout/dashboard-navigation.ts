import { LayoutDashboard, Key, BookOpen, Package, BarChart3, CreditCard, Settings } from 'lucide-react';

export const dashboardRoutes = [
  { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Products', href: '/dashboard/products', icon: Package },
  { name: 'API Keys', href: '/dashboard/api-keys', icon: Key },
  { name: 'Documentation', href: '/docs', icon: BookOpen },
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { name: 'Plan & Billing', href: '/dashboard/plan-billing', icon: CreditCard },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
] as const;

// Privacy is a tab inside Settings, so Settings stays highlighted there.
export function routeActive(pathname: string, href: string) {
  if (href === '/dashboard/settings' && (pathname === '/dashboard/privacy' || pathname.startsWith('/dashboard/privacy/'))) return true;
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
}
