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

crons.interval(
  "reclaim stale media proxy jobs",
  { minutes: 5 },
  internal.assetsInternal.reclaimStaleMediaProxyJobs,
);

export default crons;
