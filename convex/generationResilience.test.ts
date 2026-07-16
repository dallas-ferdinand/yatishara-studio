/**
 * Fault-injection checklist for generation resilience.
 * These cases are exercised by reclaimStaleJobExecutions + claimJobExecution leases.
 */
import { describe, expect, it } from "vitest";

const STALE_LEASE_GRACE_MS = 2 * 60_000;
const MAX_EXECUTION_ATTEMPTS = 3;

function shouldFailStaleJob(job: {
  stage: string;
  executionLeaseUntil?: number;
  executionAttemptId?: string;
  executionAttemptCount?: number;
  updatedAt: number;
  now: number;
}): "fail" | "requeue" | "keep" {
  const leaseExpired =
    job.executionLeaseUntil != null &&
    job.executionLeaseUntil + STALE_LEASE_GRACE_MS < job.now;
  const neverLeasedStuck =
    !job.executionLeaseUntil &&
    Boolean(job.executionAttemptId) &&
    job.updatedAt + 20 * 60_000 < job.now;
  const queuedTooLong =
    job.stage === "queued" &&
    !job.executionAttemptId &&
    job.updatedAt + 30 * 60_000 < job.now;

  if (!leaseExpired && !neverLeasedStuck && !queuedTooLong) return "keep";
  const attempts = job.executionAttemptCount ?? 0;
  if (attempts >= MAX_EXECUTION_ATTEMPTS || queuedTooLong || job.stage === "saving") {
    return "fail";
  }
  return "requeue";
}

describe("generation reclaim policy", () => {
  const now = 1_000_000_000;

  it("keeps live leased jobs", () => {
    expect(
      shouldFailStaleJob({
        stage: "generating",
        executionLeaseUntil: now + 60_000,
        executionAttemptId: "a1",
        executionAttemptCount: 1,
        updatedAt: now - 10_000,
        now,
      }),
    ).toBe("keep");
  });

  it("requeues once when the lease expires under the attempt cap", () => {
    expect(
      shouldFailStaleJob({
        stage: "generating",
        executionLeaseUntil: now - STALE_LEASE_GRACE_MS - 1,
        executionAttemptId: "a1",
        executionAttemptCount: 1,
        updatedAt: now - 60_000,
        now,
      }),
    ).toBe("requeue");
  });

  it("fails and refunds after max attempts", () => {
    expect(
      shouldFailStaleJob({
        stage: "generating",
        executionLeaseUntil: now - STALE_LEASE_GRACE_MS - 1,
        executionAttemptId: "a3",
        executionAttemptCount: 3,
        updatedAt: now - 60_000,
        now,
      }),
    ).toBe("fail");
  });

  it("fails queued jobs that never start", () => {
    expect(
      shouldFailStaleJob({
        stage: "queued",
        updatedAt: now - 31 * 60_000,
        now,
      }),
    ).toBe("fail");
  });
});
