import type { LucideIcon } from 'lucide-react';
import { PageHeader } from './page-header';

/** Placeholder for admin sections whose screens arrive in a later phase of docs/PLAN.md. */
export function Upcoming({ title, description, icon: Icon, phase }: { title: string; description: string; icon: LucideIcon; phase: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="px-4 py-10 md:px-8">
        <div className="mx-auto flex max-w-md flex-col items-center rounded-lg border border-dashed bg-card px-6 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-primary">
            <Icon className="size-6" aria-hidden />
          </span>
          <p className="mt-4 font-medium">Not built yet</p>
          <p className="mt-1 text-sm text-muted-foreground">This screen is scheduled for {phase}.</p>
        </div>
      </div>
    </>
  );
}
