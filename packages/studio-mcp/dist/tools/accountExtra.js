import { z } from "zod";
import { jsonResult, studioFetch } from "../client.js";
function registerAccountExtraTools(server) {
  server.tool(
    "studio_list_payments",
    "List recent top-up / payment history for this account (up to 50). Requires read scope.",
    {},
    async () => jsonResult(await studioFetch("/account/payments"))
  );
  server.tool(
    "studio_get_payment",
    "Get one payment by id (includes receipt URL when available). Requires read scope.",
    { paymentId: z.string() },
    async ({ paymentId }) => jsonResult(await studioFetch(`/account/payments/${encodeURIComponent(paymentId)}`))
  );
  server.tool(
    "studio_list_credit_transactions",
    "Paginated credit ledger (spends, grants, refunds, storage charges). Pass continueCursor as cursor for the next page. Requires read scope.",
    {
      numItems: z.number().optional(),
      cursor: z.string().nullable().optional()
    },
    async ({ numItems, cursor }) => {
      const params = new URLSearchParams();
      if (numItems != null) params.set("numItems", String(numItems));
      if (cursor != null && cursor !== "") params.set("cursor", cursor);
      const query = params.toString() ? `?${params}` : "";
      return jsonResult(await studioFetch(`/account/credits${query}`));
    }
  );
  server.tool(
    "studio_list_subscription_plans",
    "List enabled subscription plans (catalog). Requires read scope.",
    {},
    async () => jsonResult(await studioFetch("/account/plans"))
  );
  server.tool(
    "studio_get_pricing",
    "Credit unit price and sample generation credit costs. Requires read scope.",
    {},
    async () => jsonResult(await studioFetch("/account/pricing"))
  );
  server.tool(
    "studio_get_storage",
    "Storage usage, projected monthly charge (TTD), outstanding balance, and upload-block status. Requires read scope.",
    {},
    async () => jsonResult(await studioFetch("/account/storage"))
  );
  server.tool(
    "studio_get_subscription",
    "Credit balance plus active subscription summary (plan name, period, included credits). Requires read scope. Prefer studio_credit_balance for balance-only.",
    {},
    async () => jsonResult(await studioFetch("/account/subscription"))
  );
  server.tool(
    "studio_list_notifications",
    "List in-app notifications (generation completed/failed, payment status). Requires social scope.",
    {},
    async () => jsonResult(await studioFetch("/notifications"))
  );
  server.tool(
    "studio_mark_notification_read",
    "Mark a single notification as read. Requires social scope.",
    { notificationId: z.string() },
    async ({ notificationId }) => jsonResult(
      await studioFetch(`/notifications/${encodeURIComponent(notificationId)}/read`, {
        method: "POST",
        body: JSON.stringify({})
      })
    )
  );
  server.tool(
    "studio_start_checkout",
    "Start a Wam checkout for credit top-up or an Academy course (returns checkoutUrl). Real money \u2014 confirm amount with the user first. Requires generate scope. Need phone + email + first/last name on the Studio account.",
    {
      amountCents: z.number().describe("Charge in cents (TTD)"),
      creditsRequested: z.number().optional(),
      academyCourseId: z.string().optional().describe("Unlock this course after payment"),
      reference: z.string().optional(),
      clientRequestId: z.string().optional().describe("Idempotency key; auto-generated if omitted"),
      compact: z.boolean().optional()
    },
    async (args) => jsonResult(
      await studioFetch("/account/checkout", {
        method: "POST",
        body: JSON.stringify({
          amountCents: args.amountCents,
          creditsRequested: args.creditsRequested,
          academyCourseId: args.academyCourseId,
          reference: args.reference,
          clientRequestId: args.clientRequestId
        })
      }),
      args.compact
    )
  );
}
export {
  registerAccountExtraTools
};
