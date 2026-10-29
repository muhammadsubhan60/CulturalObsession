/**
 * Railway cron entrypoint. Each run executes the scheduled jobs and exits.
 * Jobs (reservation expiry, courier polling, pg_dump → S3) are added in later phases.
 */
const jobs: Array<{ name: string; run: () => Promise<void> }> = [];

for (const job of jobs) {
  await job.run();
  console.log(`job ${job.name} done`);
}
console.log(`worker run complete (${jobs.length} jobs)`);

export {};
