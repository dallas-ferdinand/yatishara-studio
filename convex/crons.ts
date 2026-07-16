import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "reconcile paywise pending payments",
  { minutes: 2 },
  internal.paywiseActions.reconcilePendingPayments,
);

crons.interval(
  "reclaim stale generation executions",
  { minutes: 3 },
  internal.generation.reclaimStaleJobExecutions,
);

export default crons;
