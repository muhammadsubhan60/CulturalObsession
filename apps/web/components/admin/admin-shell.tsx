'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { LogOut, Menu, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
  SidebarNav,
  SidebarSection,
  SidebarToggle,
  useSidebar,
} from '@/components/ui/sidebar';
import { authClient } from '@/lib/auth-client';
import type { StaffUser } from '@/lib/staff-session';
import { activeHref, ADMIN_NAV } from './nav';

const COLLAPSE_KEY = 'admin.sidebar.collapsed';

function BrandMark() {
  const { collapsed } = useSidebar();
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary font-serif text-sm font-bold text-primary-foreground">
        CO
      </span>
      {!collapsed && (
        <span className="font-serif text-[14px] font-bold leading-[1.15] text-primary">
          Cultural
          <br />
          Obsession
        </span>
      )}
    </div>
  );
}

function UserFooter({ user }: { user: StaffUser }) {
  const { collapsed } = useSidebar();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  async function signOut() {
    setPending(true);
    await authClient.signOut().catch(() => undefined);
    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <>
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-primary"
      >
        {initials}
      </span>
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium leading-tight">{user.name}</div>
          <div className="truncate text-xs capitalize leading-tight text-muted-foreground">{user.role}</div>
        </div>
      )}
      <Button
        variant="ghost"
        size="icon"
        className={collapsed ? 'hidden' : 'size-9 text-muted-foreground'}
        onClick={signOut}
        disabled={pending}
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut />
      </Button>
    </>
  );
}

function NavContent({ user, onNavigate }: { user: StaffUser; onNavigate?: () => void }) {
  const pathname = usePathname();
  const current = activeHref(pathname);
  return (
    <SidebarNav>
      {ADMIN_NAV.map((section) => (
        <SidebarSection key={section.label} label={section.label}>
          {section.items
            .filter((item) => !item.ownerOnly || user.role === 'owner')
            .map(({ href, label, icon: Icon }) => (
              <SidebarItem key={href} href={href} icon={<Icon />} active={current === href} onNavigate={onNavigate}>
                {label}
              </SidebarItem>
            ))}
        </SidebarSection>
      ))}
    </SidebarNav>
  );
}

export function AdminShell({ user, children }: { user: StaffUser; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      // Storage unavailable (private mode): keep the expanded default.
    }
  }, []);

  const onCollapsedChange = React.useCallback((next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
    } catch {
      // Ignore: the preference is a convenience only.
    }
  }, []);

  return (
    <div className="flex h-svh overflow-hidden">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      <Sidebar
        collapsible
        collapsed={collapsed}
        onCollapsedChange={onCollapsedChange}
        aria-label="Admin navigation"
        className="hidden border-r md:flex"
      >
        <SidebarHeader>
          <BrandMark />
          <SidebarToggle className={collapsed ? '' : 'ml-auto'} />
        </SidebarHeader>
        <NavContent user={user} />
        <SidebarFooter>
          <UserFooter user={user} />
        </SidebarFooter>
      </Sidebar>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4 md:hidden">
          <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
            <Dialog.Trigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open navigation">
                <Menu />
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-primary/30 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
              <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col bg-card shadow-xl outline-none">
                <Dialog.Title className="sr-only">Admin navigation</Dialog.Title>
                <Dialog.Description className="sr-only">Pages of the store admin</Dialog.Description>
                <Sidebar aria-label="Admin navigation" width={280} className="w-full">
                  <SidebarHeader>
                    <BrandMark />
                    <Dialog.Close asChild>
                      <Button variant="ghost" size="icon" className="ml-auto" aria-label="Close navigation">
                        <X />
                      </Button>
                    </Dialog.Close>
                  </SidebarHeader>
                  <NavContent user={user} onNavigate={() => setDrawerOpen(false)} />
                  <SidebarFooter>
                    <UserFooter user={user} />
                  </SidebarFooter>
                </Sidebar>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <span className="truncate font-serif text-base font-bold text-primary">Cultural Obsession</span>
        </header>

        <main id="admin-main" className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
