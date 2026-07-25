"use client";

import { useMutation, useQuery } from "convex/react";
import { Landmark, Loader2, PiggyBank, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { CursorSelect } from "@/desk/components/CursorSelect";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";

type AccountType = "chequing" | "savings";

const ACCOUNT_TYPES = [
  { value: "chequing", label: "Chequing", icon: <Landmark />, tone: "info" as const },
  { value: "savings", label: "Savings", icon: <PiggyBank />, tone: "info" as const },
];

export function SellerPayoutSettingsCard() {
  const payout = useQuery(api.marketplace.getMyPayoutAccount);
  const saveAccount = useMutation(api.marketplace.saveMyPayoutAccount);
  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("chequing");
  const [branch, setBranch] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState("");
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);

  const account = payout?.account ?? null;
  useEffect(() => {
    if (!account) return;
    setBankName(account.bankName ?? "");
    setAccountName(account.accountName ?? "");
    setAccountNumber(account.accountNumber);
    setAccountType(account.accountType ?? "chequing");
    setBranch(account.branch ?? "");
    setNote(account.note ?? "");
  }, [
    account?.bankName,
    account?.accountName,
    account?.accountNumber,
    account?.accountType,
    account?.branch,
    account?.note,
  ]);

  function touched() {
    setSaved("");
    setSaveError("");
  }

  const digits = accountNumber.replace(/\D/g, "");
  const canSave =
    Boolean(bankName.trim()) &&
    Boolean(accountName.trim()) &&
    digits.length >= 6 &&
    !busy;
  const buttonLabel = busy
    ? "Saving…"
    : saveError
      ? saveError
      : saved
        ? saved
        : account
          ? "Update payout account"
          : "Save payout account";

  async function submit() {
    setSaveError("");
    setSaved("");
    if (!bankName.trim()) {
      setSaveError("Enter your bank");
      return;
    }
    if (!accountName.trim()) {
      setSaveError("Enter the account holder name");
      return;
    }
    if (digits.length < 6) {
      setSaveError("Enter a valid account number");
      return;
    }
    setBusy(true);
    try {
      await saveAccount({
        bankName: bankName.trim(),
        accountName: accountName.trim(),
        accountNumber: digits,
        accountType,
        branch: branch.trim() || undefined,
        note: note.trim() || undefined,
      });
      setSaved("Saved");
    } catch (error) {
      setSaveError(friendlyConvexError(error, "Could not save payout account"));
    } finally {
      setBusy(false);
    }
  }

  if (payout === undefined) {
    return (
      <section className="cursor-settings-section studio-account-card">
        <p className="studio-settings-empty">Loading…</p>
      </section>
    );
  }

  if (payout === null) {
    return (
      <section className="cursor-settings-section studio-account-card">
        <div className="studio-payout-intro">
          <Wallet aria-hidden="true" />
          <div>
            <strong>No seller account yet</strong>
            <p>
              Apply as a seller on the Creative Network to sell services. Payout details
              live here once you do.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="studio-settings-stack">
      <section className="cursor-settings-section studio-account-card">
        <div className="studio-payout-intro">
          <Wallet aria-hidden="true" />
          <div>
            <strong>Where we send your earnings</strong>
            <p>
              Completed jobs are paid out by bank transfer in TTD. Keep these details
              current — we can only pay the account named here.
              {payout.sellerStatus === "pending"
                ? " Payouts start once your seller application is approved."
                : ""}
            </p>
          </div>
        </div>

        <div className="studio-account-fields studio-payout-fields">
          <label>
            <span>Bank</span>
            <input
              value={bankName}
              onChange={(event) => {
                setBankName(event.target.value);
                touched();
              }}
              placeholder="Republic Bank"
              autoComplete="off"
            />
          </label>
          <label>
            <span>Account holder name</span>
            <input
              value={accountName}
              onChange={(event) => {
                setAccountName(event.target.value);
                touched();
              }}
              placeholder="Name exactly as the bank has it"
              autoComplete="off"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span>Account number</span>
              <input
                value={accountNumber}
                onChange={(event) => {
                  setAccountNumber(event.target.value);
                  touched();
                }}
                placeholder="1234567890"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label>
              <span>Account type</span>
              <CursorSelect
                ariaLabel="Account type"
                variant="field"
                align="start"
                value={accountType}
                options={ACCOUNT_TYPES}
                onChange={(next) => {
                  setAccountType(next as AccountType);
                  touched();
                }}
              />
            </label>
          </div>
          <label>
            <span>Branch (optional)</span>
            <input
              value={branch}
              onChange={(event) => {
                setBranch(event.target.value);
                touched();
              }}
              placeholder="Port of Spain"
              autoComplete="off"
            />
          </label>
          <label>
            <span>Note for our finance team (optional)</span>
            <input
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                touched();
              }}
              placeholder="Anything we should know when sending money"
              autoComplete="off"
            />
          </label>
        </div>

        <div className="studio-account-actions">
          <button
            type="button"
            className={`studio-account-save${saveError ? " is-error" : ""}`}
            disabled={!canSave && !saveError}
            onClick={() => void submit()}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
            <span>{buttonLabel}</span>
          </button>
          {account?.updatedAt ? (
            <span className="studio-payout-updated">
              Updated {new Date(account.updatedAt).toLocaleDateString()}
            </span>
          ) : null}
        </div>
      </section>
    </div>
  );
}
