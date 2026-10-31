import {
  Boxes,
  CreditCard,
  FolderTree,
  Gem,
  LayoutDashboard,
  type LucideIcon,
  ReceiptText,
  Settings,
  Truck,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';

export type NavItem = { href: string; label: string; icon: LucideIcon; ownerOnly?: boolean };
export type NavSection = { label: string; items: NavItem[] };

export const ADMIN_NAV: NavSection[] = [
  {
    label: 'Store',
    items: [
      { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/admin/orders', label: 'Orders', icon: ReceiptText },
      { href: '/admin/payments', label: 'Advance payments', icon: Wallet },
      { href: '/admin/products', label: 'Products', icon: Gem },
      { href: '/admin/categories', label: 'Collections', icon: FolderTree },
      { href: '/admin/inventory', label: 'Inventory', icon: Boxes },
      { href: '/admin/customers', label: 'Customers', icon: Users },
    ],
  },
  {
    label: 'Settings',
    items: [
      { href: '/admin/settings/payments', label: 'Payments & advance', icon: CreditCard },
      { href: '/admin/settings/couriers', label: 'Couriers', icon: Truck },
      { href: '/admin/settings/staff', label: 'Staff', icon: UserCog, ownerOnly: true },
      { href: '/admin/settings', label: 'Store settings', icon: Settings },
    ],
  },
];

/** Longest matching prefix wins, so /admin/settings/staff does not also light up /admin/settings. */
export function activeHref(pathname: string): string | undefined {
  const all = ADMIN_NAV.flatMap((s) => s.items.map((i) => i.href));
  return all
    .filter((href) => pathname === href || (href !== '/admin' && pathname.startsWith(`${href}/`)))
    .sort((a, b) => b.length - a.length)[0];
}
