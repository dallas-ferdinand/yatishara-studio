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

crons.interval(
  "auto-accept marketplace delivered jobs",
  { hours: 1 },
  internal.marketplace.autoAcceptDeliveredJobs,
);

// Billing day: 1st of the month at 00:00 AST. Charges the full monthly rate for each storage snapshot.
crons.monthly(
  "charge monthly storage",
  { day: 1, hourUTC: 4, minuteUTC: 0 },
  internal.storageBilling.chargeMonthly,
  {},
);

crons.daily(
  "purge expired trash from storage",
  { hourUTC: 5, minuteUTC: 0 },
  internal.storageBilling.purgeExpiredTrash,
);

crons.daily(
  "reconcile storage totals",
  { hourUTC: 5, minuteUTC: 30 },
  internal.storageBilling.reconcileStorageTotals,
  {},
);

crons.daily(
  "enforce unpaid storage asset listing policy",
  { hourUTC: 6, minuteUTC: 0 },
  internal.assetStore.enforceUnpaidStorageListingPolicy,
  {},
);

export default crons;
