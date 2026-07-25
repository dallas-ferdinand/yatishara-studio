# Admin ops — backlog & tracking

Living checklist for the Studio **admin workspace**. Update checkboxes as slices ship.
Design chrome still follows [`docs/DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md).

## Operator jobs (day-to-day)

1. Confirm / troubleshoot **top-ups** (PayWise + older bank-transfer receipts)
2. **Manual credit** grants / deductions after payment glitches
3. Review **seller KYC** applications (approve / reject)
4. **Pay sellers** (owed → paid) with enough bank detail to actually send money
5. Intervene in marketplace **jobs / escrow** (stuck, refund)
6. Rare: seed pricing / presets (launch tools)

## Current surface map

| Tab | UI | Backend |
|---|---|---|
| Payments | [`StudioShell.tsx`](../src/studio/components/StudioShell.tsx) `AdminWorkspacePane` + `AdminPaymentSidebar` | `billing.adminListPayments`, `adminReviewPayment`, `paywiseActions.adminRefreshPaywisePayment` |
| Customers | same file — search, detail sidebar, credit adjust | `users.adminListCustomers`, `billing.adminAdjustCredits` |
| Marketplace | [`AdminMarketplacePane.tsx`](../src/studio/components/AdminMarketplacePane.tsx) sellers + jobs + payouts | `adminListJobs`, `adminRefundDeliveredJob`, `adminApproveSeller`, `adminMarkPayoutPaid`, KYC signed URLs |
| Tools | Setup seeds + read-only pricing cards (demoted from primary tabs) | `stylePresets.adminSeedDefaults`, thumbnail action, `billing.adminSeedLaunchPricing`; `billing.adminSetPricing` **unused** |

Entry: header Gauge → always opens `admin:payments` (admin / super_admin only). Old `admin:setup` / `admin:pricing` deep links normalize to Tools.

## Canonical payment status labels (admin)

| Status key | Admin label |
|---|---|
| `pending` | Pending |
| `needs_review` | Needs review |
| `receipt_uploaded` | Receipt uploaded *(display only — not a review action)* |
| `receipt_received` | Receipt received |
| `payment_completed` | Paid |
| `checkout_failed` | Failed |
| `cancelled` | Cancelled |
| `rejected` | Rejected |

Method labels (admin): **PayWise** · **Bank transfer** (not “Legacy bank”).

## Backend available without UI (yet)

- `billing.adminAdjustCredits` — grant/deduct credits + reason
- `billing.adminSetPricing` — edit credit/content pricing
- `generation.adminGetJobDebug` — job debug

---

## Backlog

### P0 — Labels + broken status option

Cheap language cleanup; fixes toast when operators pick an invalid review status.

- [x] Remove `receipt_uploaded` as a **review action** (backend only allows `receipt_received` \| `payment_completed` \| `rejected`); keep as display when current
- [x] Align filter / pills / metric cards: Pending · Paid · Failed · Cancelled · Rejected · All
- [x] Soft-pedal “Legacy” in admin payment UI (Bank transfer / Subscription / Top up; optional bank hint)
- [x] Admin table status = **Pending** for PayWise pending (not “Awaiting card payment”)
- [x] Document check-off

**Done when:** No invalid status in the bank review select; admin copy matches the glossary above.

### P1 — Customers: search, detail, credit adjust

#1 support gap. API: `billing.adminAdjustCredits`.

- [x] Customer search (email / phone / name)
- [x] Detail pane: balance, reserved, recent payments, subscription if any
- [x] Adjust credits (+/−) with required reason
- [x] Link out to related payment rows (opens Payments tab + payment sidebar)

**Done when:** Support can fix a balance without Convex CLI / `internalSetCreditsByPhone`.

### P2 — Marketplace Jobs + refund

Escrow ops blocked today. API: `marketplace.adminRefundDeliveredJob`.

- [x] Admin jobs list (status, buyer, seller, amount, age) via `adminListJobs`
- [x] Filter by job status
- [x] Refund action with required reason (inline form, not `window.prompt`)
- [x] Deep-link from payout row → job (offer title link; highlights Jobs row)

**Done when:** Operator can find a stuck/delivered job and refund without knowing a Convex id.

### P3 — Payouts + seller reject language

- [x] Sellers self-serve a payout bank account in **Settings → Payouts**
      (`marketplaceSellers.payout*`, `getMyPayoutAccount` / `saveMyPayoutAccount`;
      tab only appears for users with a seller record)
- [x] Payout rows show **who to pay + bank details** (`Pay to` column, click the
      account number to copy; warns when a seller has no details yet)
- [x] Seller still-pending: **Reject** (not Suspend); capture required reason
      (`adminApproveSeller` decision `reject` → status `rejected` + `rejectionReason`)
- [x] Approved sellers keep **Suspend** for enforcement (optional note)
- [x] Replace `window.prompt` for mark-paid / reject with inline confirm field

**Done when:** Operator can pay from the payouts table and reject an application with a reason.

### P4 — Tab reshape

- [x] Main nav: Payments · Customers · Marketplace · Tools
      (Jobs stay under Marketplace)
- [x] Demote Setup + Pricing into **Tools**
- [x] Entry still lands on Payments

**Done when:** Launch seeds are not two of five primary tabs.

### P5 — Polish / reporting

- [ ] Metric cards sum TTD (not only row counts)
- [ ] Credit ledger view on customer detail
- [ ] Offer moderation (pause bad listing)
- [ ] Audit log viewer
- [ ] Raise list caps / pagination (payments 200, customers 100 today)

---

## Priority ladder

```
P0 labels_fix → P1 credits → P2 jobs → P3 payouts/KYC → P4 tabs → P5 polish
```

Next: start **P5** (totals, ledger, offer moderation, audit, pagination).
