'use client';

/**
 * App sidebar adapted from the 21st.dev "Sidebar" by wensity: collapsible icon rail,
 * sections, badges, user footer and an animated active pill. Trimmed to the variants
 * the admin uses and rendering Next.js <Link> for client-side navigation.
 */

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import * as React from 'react';
import { cn } from '@/lib/utils';

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

type SidebarContextValue = { collapsed: boolean; collapsible: boolean; toggleCollapsed: () => void; navId: string };
const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useSidebarContext() {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error('Sidebar compound components must be used within <Sidebar>');
  return ctx;
}

export function useSidebar() {
  const { collapsed, toggleCollapsed } = useSidebarContext();
  return { collapsed, toggleCollapsed };
}

export interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  /** Shows the collapse toggle; the mobile drawer renders a non-collapsible sidebar. */
  collapsible?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  width?: number;
  collapsedWidth?: number;
}

export function Sidebar({
  collapsible = false,
  collapsed: collapsedProp = false,
  onCollapsedChange,
  width = 264,
  collapsedWidth = 64,
  className,
  style,
  children,
  'aria-label': ariaLabel = 'Sidebar',
  ...props
}: SidebarProps) {
  const reactId = React.useId();
  const reduceMotion = useReducedMotion();
  const collapsed = collapsible && collapsedProp;
  const ctx = React.useMemo<SidebarContextValue>(
    () => ({
      collapsed,
      collapsible,
      toggleCollapsed: () => onCollapsedChange?.(!collapsed),
      navId: `sidebar-${reactId}`,
    }),
    [collapsed, collapsible, onCollapsedChange, reactId],
  );

  return (
    <SidebarContext.Provider value={ctx}>
      <nav
        aria-label={ariaLabel}
        data-collapsed={collapsed ? 'true' : 'false'}
        style={{
          ...style,
          width: collapsed ? collapsedWidth : width,
          transition: reduceMotion ? 'none' : 'width 240ms cubic-bezier(0.23,1,0.32,1)',
        }}
        className={cn('relative isolate flex h-full shrink-0 flex-col overflow-hidden bg-card text-foreground', className)}
        {...props}
      >
        {children}
      </nav>
    </SidebarContext.Provider>
  );
}

function FadingLabel({ show, className, children }: { show: boolean; className?: string; children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.12, ease: EASE_OUT }}
          className={className}
        >
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

export function SidebarHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  const { collapsed } = useSidebarContext();
  return (
    <div
      className={cn(
        'flex shrink-0 items-center',
        collapsed ? 'h-16 flex-col justify-center gap-2' : 'h-16 gap-2.5 px-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SidebarNav({ className, children }: { className?: string; children: React.ReactNode }) {
  const { navId } = useSidebarContext();
  return (
    <div id={navId} className={cn('sidebar-nav min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain py-2', className)}>
      {children}
    </div>
  );
}

export function SidebarSection({ label, children }: { label?: string; children: React.ReactNode }) {
  const { collapsed } = useSidebarContext();
  return (
    <div role="group" aria-label={label} className="py-1">
      {label && (
        <div className="flex h-7 items-end px-4 pb-1.5">
          <FadingLabel
            show={!collapsed}
            className="whitespace-nowrap text-[11px] font-semibold uppercase leading-none tracking-[0.08em] text-muted-foreground"
          >
            {label}
          </FadingLabel>
        </div>
      )}
      <div className="flex flex-col gap-px px-2">{children}</div>
    </div>
  );
}

export interface SidebarItemProps {
  href: string;
  icon: React.ReactNode;
  active?: boolean;
  badge?: React.ReactNode;
  onNavigate?: () => void;
  children: string;
}

export function SidebarItem({ href, icon, active = false, badge, onNavigate, children }: SidebarItemProps) {
  const { collapsed, navId } = useSidebarContext();
  const reduceMotion = useReducedMotion();
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? children : undefined}
      aria-label={collapsed ? children : undefined}
      className={cn(
        'group relative flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-medium outline-none select-none whitespace-nowrap',
        'transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card',
        active ? 'text-primary' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      {active &&
        (reduceMotion ? (
          <span aria-hidden className="pointer-events-none absolute inset-0 rounded-md bg-muted" />
        ) : (
          <motion.span
            aria-hidden
            layoutId={`${navId}-active-pill`}
            transition={{ type: 'spring', stiffness: 520, damping: 42 }}
            className="pointer-events-none absolute inset-0 rounded-md bg-muted"
          />
        ))}
      <span aria-hidden className="relative z-10 flex size-5 shrink-0 items-center justify-center [&_svg]:size-[18px]">
        {icon}
      </span>
      <FadingLabel show={!collapsed} className="relative z-10 min-w-0 flex-1 truncate">
        {children}
      </FadingLabel>
      {badge ? (
        <FadingLabel show={!collapsed} className="relative z-10 flex shrink-0 items-center">
          {badge}
        </FadingLabel>
      ) : null}
    </Link>
  );
}

export function SidebarFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  const { collapsed } = useSidebarContext();
  return (
    <div className={cn('flex shrink-0 items-center border-t py-3', collapsed ? 'justify-center' : 'gap-2.5 px-4', className)}>
      {children}
    </div>
  );
}

export function SidebarToggle({ className }: { className?: string }) {
  const { collapsed, collapsible, toggleCollapsed } = useSidebarContext();
  if (!collapsible) return null;
  return (
    <button
      type="button"
      onClick={toggleCollapsed}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      aria-expanded={!collapsed}
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none',
        'transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
    </button>
  );
}
