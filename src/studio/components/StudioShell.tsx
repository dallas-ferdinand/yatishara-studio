"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Bell,
  Box,
  ChevronDown,
  CircleDollarSign,
  Clapperboard,
  Copy,
  FileText,
  Film,
  Folder,
  Image as ImageIcon,
  MapPin,
  Moon,
  Plus,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  User,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

export function StudioShell() {
  const { signOut } = useAuthActions();
  const ensureDefaults = useMutation(api.users.ensureStudioDefaults);
  const createFolder = useMutation(api.folders.create);
  const createThread = useMutation(api.generation.createThread);
  const createDocument = useMutation(api.documents.create);
  const reserveUpload = useMutation(api.assets.reserveUpload);
  const completeUpload = useMutation(api.assets.completeUpload);
  const updateAsset = useMutation(api.assets.update);
  const duplicateAsset = useMutation(api.assets.duplicate);
  const trashAsset = useMutation(api.assets.moveToTrash);
  const createElement = useMutation(api.elements.create);
  const adminSeedStylePresets = useMutation(api.stylePresets.adminSeedDefaults);
  const adminSetPricing = useMutation(api.billing.adminSetPricing);
  const adminUpsertBankAccount = useMutation(api.billing.adminUpsertBankAccount);
  const adminReviewPayment = useMutation(api.billing.adminReviewPayment);
  const adminAdjustCredits = useMutation(api.billing.adminAdjustCredits);
  const submitBankPayment = useMutation(api.billing.submitBankPayment);
  const reserveReceiptUpload = useMutation(api.billing.reserveReceiptUpload);
  const completeReceiptUpload = useMutation(api.billing.completeReceiptUpload);
  const savePushSubscription = useMutation(api.notifications.savePushSubscription);
  const runFlow = useAction(api.generationActions.runFlow);
  const [mode, setMode] = useState<"image" | "video">("image");
  const [imageTier, setImageTier] = useState<"low" | "medium" | "high">("medium");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [resolution, setResolution] = useState("1024x1024");
  const [durationSeconds, setDurationSeconds] = useState("5");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [theme, setTheme] = useState<"dark" | "emerald">("dark");
  const [prompt, setPrompt] = useState("");
  const [flowError, setFlowError] = useState("");
  const [flowPending, setFlowPending] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("100");
  const [paymentCredits, setPaymentCredits] = useState("100");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentPending, setPaymentPending] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<Array<Id<"assets">>>([]);
  const [elementName, setElementName] = useState("");
  const [elementType, setElementType] = useState<"character" | "prop" | "location">("character");
  const [entitlementNow] = useState(() => Date.now());
  const [pushStatus, setPushStatus] = useState("");
  const [bankForm, setBankForm] = useState({
    label: "Primary TT bank account",
    bankName: "",
    accountName: "",
    accountNumber: "",
    accountType: "chequing" as "chequing" | "savings",
  });
  const [pricingForm, setPricingForm] = useState({
    creditPriceCents: "100",
    imageLowCredits: "2",
    imageMediumCredits: "5",
    imageHighCredits: "9",
    videoCredits: "35",
  });
  const [adminStatus, setAdminStatus] = useState("");
  const [creditAdjustForm, setCreditAdjustForm] = useState({
    userId: "",
    amount: "0",
    reason: "",
  });
  const folders = useQuery(api.folders.list, {});
  const currentUser = useQuery(api.users.current, {});
  const billingAccount = useQuery(api.billing.currentAccount, {});
  const pricing = useQuery(api.billing.getPricing, {});
  const bankAccounts = useQuery(api.billing.listBankAccounts, {});
  const payments = useQuery(api.billing.listMyPayments, {});
  const adminPayments = useQuery(
    api.billing.adminListPayments,
    isAdminRole(currentUser?.role) ? {} : "skip",
  );
  const elements = useQuery(api.elements.list, {});
  const [activeFolderId, setActiveFolderId] = useState<Id<"folders"> | null>(null);
  const activeFolder =
    folders?.find((folder: Doc<"folders">) => folder._id === activeFolderId) ??
    folders?.[0];
  const [activeThreadId, setActiveThreadId] = useState<Id<"generationThreads"> | null>(null);
  const threads = useQuery(api.generation.listThreads, {});
  const events = useQuery(
    api.generation.listEvents,
    activeThreadId ? { threadId: activeThreadId } : "skip",
  );
  const assets = useQuery(
    api.assets.listByFolder,
    activeFolder ? { folderId: activeFolder._id } : "skip",
  );
  const documents = useQuery(
    api.documents.listByFolder,
    activeFolder ? { folderId: activeFolder._id } : "skip",
  );
  const currentTier = mode === "image" ? imageTier : "pro_video";
  const entitlement = useQuery(api.generation.canGenerate, {
    tier: currentTier,
    now: entitlementNow,
  });
  const presets = useQuery(api.stylePresets.listEnabled, {
    kind: modeKindFromState(mode),
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const cost = useMemo(() => (mode === "image" ? "Low 2 / Med 5 / High 9 credits" : "Pro Video 35 credits"), [mode]);
  const selectedPreset = presets?.[0];

  useEffect(() => {
    void ensureDefaults().then((defaults) => {
      setActiveFolderId((current) => current ?? defaults.rootFolderId);
    });
  }, [ensureDefaults]);

  useEffect(() => {
    if (!activeFolderId && folders?.[0]) {
      setActiveFolderId(folders[0]._id);
    }
  }, [activeFolderId, folders]);

  useEffect(() => {
    if (!activeThreadId && threads?.[0]) {
      setActiveThreadId(threads[0]._id);
    }
  }, [activeThreadId, threads]);

  useEffect(() => {
    const account = bankAccounts?.[0];
    if (!account) return;
    setBankForm({
      label: account.label,
      bankName: account.bankName,
      accountName: account.accountName,
      accountNumber: account.accountNumber,
      accountType: account.accountType,
    });
  }, [bankAccounts]);

  useEffect(() => {
    if (!pricing) return;
    setPricingForm({
      creditPriceCents: String(pricing.creditPriceCents),
      imageLowCredits: String(pricing.imageLowCredits),
      imageMediumCredits: String(pricing.imageMediumCredits),
      imageHighCredits: String(pricing.imageHighCredits),
      videoCredits: String(pricing.videoCredits),
    });
  }, [pricing]);

  async function handleCreateFolder() {
    const name = window.prompt("Folder name");
    if (!name?.trim()) {
      return;
    }
    const folderId = await createFolder({
      name: name.trim(),
      icon: "Folder",
      color: "#22c55e",
    });
    setActiveFolderId(folderId);
  }

  async function handleCreateDocument() {
    if (!activeFolder) return;
    const title = window.prompt("Script/document title");
    if (!title?.trim()) return;
    await createDocument({
      folderId: activeFolder._id,
      title: title.trim(),
      contentMarkdown: "",
    });
  }

  async function uploadFiles(files: FileList | File[]) {
    if (!activeFolder) {
      return;
    }
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const reserved = await reserveUpload({
          folderId: activeFolder._id,
          name: file.name,
          kind: kindFromMime(file.type),
          mimeType: file.type || "application/octet-stream",
        });
        const res = await fetch(reserved.putUrl, {
          method: "PUT",
          headers: {
            AccessKey: reserved.storageAccessKey,
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });
        if (!res.ok) {
          throw new Error(`Upload failed (${res.status})`);
        }
        await completeUpload({
          assetId: reserved.assetId,
          byteSize: file.size,
        });
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleRunFlow() {
    if (!activeFolder || !selectedPreset || !prompt.trim()) {
      return;
    }
    setFlowError("");
    setFlowPending(true);
    try {
      const threadId =
        activeThreadId ??
        (await createThread({
          folderId: activeFolder._id,
          title: prompt.trim().slice(0, 64),
        }));
      setActiveThreadId(threadId);
      await runFlow({
        threadId,
        mode,
        tier: currentTier,
        stylePresetId: selectedPreset._id,
        userPrompt: prompt.trim(),
        audioEnabled: mode === "video" ? audioEnabled : undefined,
        aspectRatio,
        resolution,
        durationSeconds: mode === "video" ? Number(durationSeconds) : undefined,
      });
      setPrompt("");
    } catch (error) {
      setFlowError(error instanceof Error ? error.message : "Generation failed");
    } finally {
      setFlowPending(false);
    }
  }

  async function handleBankPayment(file: File | null) {
    const bankAccount = bankAccounts?.[0];
    if (!bankAccount || !file) {
      setPaymentError("Add a receipt and make sure a bank account is configured.");
      return;
    }
    setPaymentError("");
    setPaymentPending(true);
    try {
      const amountCents = Math.round(Number(paymentAmount) * 100);
      const creditsRequested = Math.max(0, Math.round(Number(paymentCredits)));
      const paymentId = await submitBankPayment({
        bankAccountId: bankAccount._id,
        amountCents,
        creditsRequested,
        reference: paymentReference || undefined,
      });
      const receipt = await reserveReceiptUpload({
        paymentId,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
      });
      const res = await fetch(receipt.putUrl, {
        method: "PUT",
        headers: {
          AccessKey: receipt.storageAccessKey,
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });
      if (!res.ok) {
        throw new Error(`Receipt upload failed (${res.status})`);
      }
      await completeReceiptUpload({ paymentId, byteSize: file.size });
      setPaymentReference("");
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "Payment submission failed");
    } finally {
      setPaymentPending(false);
    }
  }

  function toggleAssetSelection(assetId: Id<"assets">) {
    setSelectedAssetIds((current) =>
      current.includes(assetId)
        ? current.filter((id) => id !== assetId)
        : [...current, assetId],
    );
  }

  async function handleCreateElement() {
    if (!elementName.trim()) {
      return;
    }
    await createElement({
      type: elementType,
      name: elementName.trim(),
      folderId: activeFolder?._id,
      sourceAssetIds: selectedAssetIds,
    });
    setElementName("");
    setSelectedAssetIds([]);
  }

  async function handleSaveBankAccount() {
    setAdminStatus("");
    const existing = bankAccounts?.[0];
    await adminUpsertBankAccount({
      bankAccountId: existing?._id,
      label: bankForm.label,
      bankName: bankForm.bankName,
      accountName: bankForm.accountName,
      accountNumber: bankForm.accountNumber,
      accountType: bankForm.accountType,
      enabled: true,
    });
    setAdminStatus("Bank account saved.");
  }

  async function handleSeedStylePresets() {
    setAdminStatus("");
    const created = await adminSeedStylePresets({});
    setAdminStatus(`Style presets ready (${created} created).`);
  }

  async function handleSavePricing() {
    setAdminStatus("");
    await adminSetPricing({
      creditPriceCents: Number(pricingForm.creditPriceCents),
      imageLowCredits: Number(pricingForm.imageLowCredits),
      imageMediumCredits: Number(pricingForm.imageMediumCredits),
      imageHighCredits: Number(pricingForm.imageHighCredits),
      videoCredits: Number(pricingForm.videoCredits),
    });
    setAdminStatus("Pricing saved.");
  }

  async function handleReviewPayment(
    paymentId: Id<"payments">,
    status: "receipt_received" | "payment_completed" | "rejected",
  ) {
    setAdminStatus("");
    await adminReviewPayment({ paymentId, status });
    setAdminStatus(`Payment marked ${status}.`);
  }

  async function handleAdjustCredits() {
    setAdminStatus("");
    await adminAdjustCredits({
      userId: creditAdjustForm.userId as Id<"users">,
      amount: Number(creditAdjustForm.amount),
      reason: creditAdjustForm.reason || "Admin adjustment",
    });
    setAdminStatus("Credits adjusted.");
  }

  function insertElementReference(name: string) {
    setPrompt((current) => `${current}${current ? " " : ""}@${name}`);
  }

  async function handleRenameAsset(asset: Doc<"assets">) {
    const name = window.prompt("Rename asset", asset.name);
    if (!name?.trim()) return;
    await updateAsset({ assetId: asset._id, name: name.trim() });
  }

  async function handleDuplicateAsset(asset: Doc<"assets">) {
    await duplicateAsset({ assetId: asset._id });
  }

  async function handleTrashAsset(asset: Doc<"assets">) {
    await trashAsset({ assetId: asset._id });
  }

  async function enablePushNotifications() {
    setPushStatus("");
    const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
    if (!publicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushStatus("Push is not configured in this browser.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setPushStatus("Notifications not allowed.");
      return;
    }
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }));
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
      setPushStatus("Push subscription missing browser keys.");
      return;
    }
    await savePushSubscription({
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      userAgent: navigator.userAgent,
    });
    setPushStatus("Push enabled.");
  }

  return (
    <main
      className={`flex h-dvh flex-col overflow-hidden text-white ${
        theme === "emerald" ? "bg-[#08130f]" : "bg-[#111217]"
      }`}
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 bg-[#151720]/95 px-3">
        <div className="flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded-lg bg-emerald-400 text-black">
            <Sparkles size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">Yatishara Studio</p>
            <p className="mt-1 text-[11px] text-white/45">Studio workspace · Image + Video flows</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {pushStatus ? <span className="text-xs text-white/45">{pushStatus}</span> : null}
          <button
            className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
            type="button"
            onClick={() => setTheme((value) => (value === "dark" ? "emerald" : "dark"))}
          >
            {theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <button
            className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
            type="button"
            onClick={() => void enablePushNotifications()}
          >
            <Bell size={16} />
          </button>
          <button
            className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
            type="button"
            onClick={() => setAdminOpen((open) => !open)}
          >
            <Settings size={16} />
          </button>
          <button
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10 hover:text-white"
            type="button"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] max-md:grid-cols-1">
        <aside className="flex min-h-0 flex-col border-r border-white/10 bg-[#13151d] max-md:hidden">
          <div className="border-b border-white/10 p-3">
            <button
              className="flex w-full items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2 text-left text-sm transition hover:bg-white/[0.07]"
              type="button"
              onClick={() => void handleCreateFolder()}
            >
              <span className="flex items-center gap-2">
                <Folder size={16} className="text-emerald-300" />
                Folders
              </span>
              <Plus size={15} className="text-white/50" />
            </button>
          </div>
          <nav className="min-h-0 flex-1 overflow-auto p-2">
            {(folders ?? []).map((folder: Doc<"folders">) => {
              return (
                <button
                  key={folder._id}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${
                    activeFolder?._id === folder._id ? "bg-emerald-400/12 text-emerald-100" : "text-white/62 hover:bg-white/[0.05] hover:text-white"
                  }`}
                  type="button"
                  onClick={() => setActiveFolderId(folder._id)}
                >
                  <Folder size={16} />
                  <span className="truncate">{folder.name}</span>
                </button>
              );
            })}
          </nav>
          <div className="border-t border-white/10 p-3">
            <button
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs text-white/60 transition hover:bg-white/[0.05]"
              type="button"
              onClick={() => setPaymentOpen((open) => !open)}
            >
              <CircleDollarSign size={15} />
              Credits: {billingAccount?.creditBalance ?? 0}
            </button>
          </div>
        </aside>

        <section className="flex min-w-0 flex-col">
          <div className="flex h-10 shrink-0 items-center gap-1 border-b border-white/10 bg-[#151720] px-2">
            <Tab active icon={<Sparkles size={14} />} label="Generation" />
            <Tab icon={<ImageIcon size={14} />} label="Image preview" />
            <Tab icon={<Film size={14} />} label="Video preview" />
            <button className="ml-auto rounded-lg p-1.5 text-white/45 hover:bg-white/10 hover:text-white" type="button">
              <Plus size={15} />
            </button>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] max-xl:grid-cols-1">
            <div
              className="min-h-0 overflow-auto p-5"
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                void uploadFiles(event.dataTransfer.files);
              }}
            >
              <div className="mx-auto max-w-4xl space-y-3">
                <div className="rounded-2xl border border-dashed border-emerald-300/25 bg-emerald-300/[0.04] p-4">
                  <p className="text-sm font-medium text-emerald-100">
                    {activeFolder ? `Active folder: ${activeFolder.name}` : "Loading folder..."}
                  </p>
                  <p className="mt-1 text-xs text-white/45">
                    Drag images, videos, audio, or markdown files here. This tab keeps saving to its linked folder.
                  </p>
                  <input
                    ref={fileInputRef}
                    className="hidden"
                    type="file"
                    multiple
                    onChange={(event) => {
                      if (event.currentTarget.files) {
                        void uploadFiles(event.currentTarget.files);
                      }
                      event.currentTarget.value = "";
                    }}
                  />
                  <button
                    className="mt-3 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/10"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? "Uploading..." : "Upload files"}
                  </button>
                  <button
                    className="ml-2 mt-3 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/10"
                    type="button"
                    onClick={() => void handleCreateDocument()}
                  >
                    New script/doc
                  </button>
                </div>
                {(events ?? []).length > 0 ? (
                  events?.map((event) => (
                    <article key={event._id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
                        {event.kind === "prompt"
                          ? "Prompt"
                          : event.kind === "result"
                            ? "Result"
                            : event.kind === "folder_switched"
                              ? "Folder switched"
                              : event.stage ?? "Stage"}
                      </p>
                      <p className="mt-2 text-sm text-white/70">
                        {event.prompt ??
                          (event.stage ? `Flow stage: ${event.stage}` : "Generated media saved to folder.")}
                      </p>
                    </article>
                  ))
                ) : (
                  <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
                      Ready
                    </p>
                    <p className="mt-2 text-sm text-white/70">
                      Create a generation. History will show prompt, stages, folder switches, and results here.
                    </p>
                  </article>
                )}
                <div className="grid gap-3 md:grid-cols-2">
                  <ResultCard icon={<ImageIcon size={18} />} title="Generated image output" />
                  <ResultCard icon={<Film size={18} />} title="Generated video output" />
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
                    Folder assets
                  </p>
                  <div className="mt-3 grid gap-2">
                    {(assets ?? []).map((asset: Doc<"assets">) => (
                      <div
                        key={asset._id}
                        className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-sm text-white/70"
                      >
                        <input
                          checked={selectedAssetIds.includes(asset._id)}
                          className="accent-emerald-400"
                          type="checkbox"
                          onChange={() => toggleAssetSelection(asset._id)}
                        />
                        {asset.kind === "video" ? <Film size={15} /> : <ImageIcon size={15} />}
                        <span className="truncate">{asset.name}</span>
                        <span className="ml-auto text-xs text-white/35">{asset.kind}</span>
                        <AssetAction label="Rename" onClick={() => void handleRenameAsset(asset)} />
                        <AssetAction
                          label={<Copy size={12} />}
                          onClick={() => void handleDuplicateAsset(asset)}
                        />
                        <AssetAction
                          label={<Trash2 size={12} />}
                          onClick={() => void handleTrashAsset(asset)}
                        />
                      </div>
                    ))}
                    {assets?.length === 0 ? (
                      <p className="text-sm text-white/35">No assets yet.</p>
                    ) : null}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
                    Scripts / documents
                  </p>
                  <div className="mt-3 grid gap-2">
                    {(documents ?? []).map((doc: Doc<"documents">) => (
                      <button
                        key={doc._id}
                        className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-left text-sm text-white/70"
                        type="button"
                        onClick={() => setPrompt((current) => `${current}${current ? " " : ""}@${doc.title}`)}
                      >
                        <FileText size={15} />
                        <span className="truncate">{doc.title}</span>
                      </button>
                    ))}
                    {documents?.length === 0 ? (
                      <p className="text-sm text-white/35">No scripts yet.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <aside className="border-l border-white/10 bg-[#13151d] p-4 max-xl:hidden">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">Elements</p>
              <ElementsPanel
                elementName={elementName}
                setElementName={setElementName}
                elementType={elementType}
                setElementType={setElementType}
                selectedCount={selectedAssetIds.length}
                elements={elements ?? []}
                onCreate={() => void handleCreateElement()}
                onInsert={insertElementReference}
              />
              {paymentOpen ? (
                <PaymentPanel
                  amount={paymentAmount}
                  setAmount={setPaymentAmount}
                  credits={paymentCredits}
                  setCredits={setPaymentCredits}
                  reference={paymentReference}
                  setReference={setPaymentReference}
                  bankAccount={bankAccounts?.[0]}
                  payments={payments ?? []}
                  pending={paymentPending}
                  error={paymentError}
                  onSubmit={(file) => void handleBankPayment(file)}
                />
              ) : null}
              {adminOpen && isAdminRole(currentUser?.role) ? (
                <AdminBankPanel
                  bankForm={bankForm}
                  setBankForm={setBankForm}
                  pricingForm={pricingForm}
                  setPricingForm={setPricingForm}
                  creditAdjustForm={creditAdjustForm}
                  setCreditAdjustForm={setCreditAdjustForm}
                  payments={adminPayments ?? []}
                  status={adminStatus}
                  onSave={() => void handleSaveBankAccount()}
                  onSavePricing={() => void handleSavePricing()}
                  onSeedStyles={() => void handleSeedStylePresets()}
                  onReviewPayment={(paymentId, status) =>
                    void handleReviewPayment(paymentId, status)
                  }
                  onAdjustCredits={() => void handleAdjustCredits()}
                />
              ) : null}
            </aside>
          </div>

          <form className="shrink-0 border-t border-white/10 bg-[#151720]/95 p-3">
            <div className="mx-auto max-w-5xl rounded-2xl border border-white/10 bg-[#101116] p-3">
              <textarea
                className="min-h-20 w-full resize-none bg-transparent text-sm text-white outline-none placeholder:text-white/35"
                placeholder="Describe image or video. Drag images, videos, audio, scripts, or elements here..."
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Segmented value={mode} setValue={setMode} />
                <button className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70" type="button">
                  {selectedPreset?.name ?? "No presets"} <ChevronDown size={12} className="ml-1 inline" />
                </button>
                {mode === "image" ? (
                  <select
                    className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white"
                    value={imageTier}
                    onChange={(event) => setImageTier(event.target.value as "low" | "medium" | "high")}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                ) : (
                  <span className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70">
                    Pro Video
                  </span>
                )}
                <select
                  className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white"
                  value={aspectRatio}
                  onChange={(event) => setAspectRatio(event.target.value)}
                >
                  <option value="16:9">16:9</option>
                  <option value="9:16">9:16</option>
                  <option value="1:1">1:1</option>
                </select>
                <select
                  className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white"
                  value={resolution}
                  onChange={(event) => setResolution(event.target.value)}
                >
                  <option value={mode === "image" ? "1024x1024" : "1080p"}>
                    {mode === "image" ? "1024x1024" : "1080p"}
                  </option>
                  <option value={mode === "image" ? "1536x864" : "720p"}>
                    {mode === "image" ? "1536x864" : "720p"}
                  </option>
                </select>
                {mode === "video" ? (
                  <>
                    <input
                      className="w-16 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-xs text-white"
                      value={durationSeconds}
                      onChange={(event) => setDurationSeconds(event.target.value)}
                    />
                    <label className="flex items-center gap-1 text-xs text-white/60">
                      <input
                        checked={audioEnabled}
                        type="checkbox"
                        onChange={(event) => setAudioEnabled(event.target.checked)}
                      />
                      Audio
                    </label>
                  </>
                ) : null}
                <span className="text-xs text-white/40">{cost}</span>
                {flowError ? <span className="text-xs text-red-300">{flowError}</span> : null}
                {!entitlement?.canGenerate && entitlement?.reason ? (
                  <span className="text-xs text-amber-200">{entitlement.reason}</span>
                ) : null}
                <button
                  className="ml-auto rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  disabled={
                    flowPending ||
                    !prompt.trim() ||
                    !selectedPreset ||
                    entitlement?.canGenerate === false
                  }
                  onClick={() => void handleRunFlow()}
                >
                  {flowPending ? "Running..." : "Run flow"}
                </button>
              </div>
            </div>
          </form>
        </section>
      </section>
    </main>
  );
}

function kindFromMime(mimeType: string): "image" | "video" | "audio" | "document" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }
  return outputArray.buffer;
}

function modeKindFromState(mode: "image" | "video"): "image" | "video" {
  return mode;
}

function Tab({ active, icon, label }: { active?: boolean; icon: ReactNode; label: string }) {
  return (
    <button
      className={`flex h-8 items-center gap-2 rounded-lg px-3 text-xs transition ${
        active ? "bg-white/10 text-white" : "text-white/45 hover:bg-white/[0.06] hover:text-white"
      }`}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

function ResultCard({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <article className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-center text-white/45">
      <div>
        <div className="mx-auto mb-2 grid size-10 place-items-center rounded-xl bg-white/[0.06]">{icon}</div>
        <p className="text-sm">{title}</p>
      </div>
    </article>
  );
}

function AssetAction({
  label,
  onClick,
}: {
  label: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-white/55 hover:bg-white/10"
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function ElementsPanel({
  elementName,
  setElementName,
  elementType,
  setElementType,
  selectedCount,
  elements,
  onCreate,
  onInsert,
}: {
  elementName: string;
  setElementName: (value: string) => void;
  elementType: "character" | "prop" | "location";
  setElementType: (value: "character" | "prop" | "location") => void;
  selectedCount: number;
  elements: Array<Doc<"elements">>;
  onCreate: () => void;
  onInsert: (name: string) => void;
}) {
  return (
    <div className="mt-3 space-y-3">
      <div className="grid gap-2">
        <select
          className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white outline-none"
          value={elementType}
          onChange={(event) =>
            setElementType(event.target.value as "character" | "prop" | "location")
          }
        >
          <option value="character">Character</option>
          <option value="prop">Prop</option>
          <option value="location">Location</option>
        </select>
        <input
          className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs outline-none"
          value={elementName}
          onChange={(event) => setElementName(event.target.value)}
          placeholder="Element name"
        />
        <button
          className="rounded-xl bg-emerald-400 px-3 py-2 text-xs font-semibold text-black disabled:opacity-50"
          type="button"
          disabled={!elementName.trim()}
          onClick={onCreate}
        >
          Create from {selectedCount} selected asset{selectedCount === 1 ? "" : "s"}
        </button>
      </div>
      <div className="grid gap-2">
        {elements.map((element) => (
          <button
            key={element._id}
            className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-left text-sm text-white/65 hover:bg-white/[0.07] hover:text-white"
            type="button"
            onClick={() => onInsert(element.name)}
          >
            {iconForElement(element.type)}
            <span className="min-w-0 flex-1 truncate">{element.name}</span>
            <span className="text-[10px] uppercase tracking-[0.16em] text-white/35">
              {element.type}
            </span>
          </button>
        ))}
        {elements.length === 0 ? (
          <p className="rounded-xl bg-white/[0.03] px-3 py-2 text-xs text-white/35">
            Select folder assets, then create reusable elements.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function iconForElement(type: "character" | "prop" | "location" | "doc") {
  if (type === "character") return <User size={15} />;
  if (type === "prop") return <Box size={15} />;
  if (type === "location") return <MapPin size={15} />;
  return <Clapperboard size={15} />;
}

function Segmented({
  value,
  setValue,
}: {
  value: "image" | "video";
  setValue: (value: "image" | "video") => void;
}) {
  return (
    <span className="rounded-xl border border-white/10 bg-white/[0.03] p-1">
      {(["image", "video"] as const).map((item) => (
        <button
          key={item}
          className={`rounded-lg px-3 py-1.5 text-xs capitalize transition ${
            value === item ? "bg-emerald-400 text-black" : "text-white/55 hover:text-white"
          }`}
          type="button"
          onClick={() => setValue(item)}
        >
          {item}
        </button>
      ))}
    </span>
  );
}

function PaymentPanel({
  amount,
  setAmount,
  credits,
  setCredits,
  reference,
  setReference,
  bankAccount,
  payments,
  pending,
  error,
  onSubmit,
}: {
  amount: string;
  setAmount: (value: string) => void;
  credits: string;
  setCredits: (value: string) => void;
  reference: string;
  setReference: (value: string) => void;
  bankAccount:
    | {
        bankName: string;
        accountName: string;
        accountNumber: string;
        accountType: "chequing" | "savings";
      }
    | undefined;
  payments: Array<{
    _id: Id<"payments">;
    status: "receipt_uploaded" | "receipt_received" | "payment_completed" | "rejected";
    amountCents: number;
  }>;
  pending: boolean;
  error: string;
  onSubmit: (file: File | null) => void;
}) {
  const receiptInputRef = useRef<HTMLInputElement | null>(null);
  const [receipt, setReceipt] = useState<File | null>(null);

  return (
    <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
        Bank top-up
      </p>
      {bankAccount ? (
        <div className="mt-3 space-y-2 text-xs text-white/65">
          <CopyLine label="Bank" value={bankAccount.bankName} />
          <CopyLine label="Name" value={bankAccount.accountName} />
          <CopyLine label="Number" value={bankAccount.accountNumber} />
          <CopyLine label="Type" value={bankAccount.accountType} />
        </div>
      ) : (
        <p className="mt-3 text-xs text-amber-200">No bank account configured yet.</p>
      )}
      <div className="mt-3 grid gap-2">
        <input
          className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs outline-none"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="Amount TTD"
        />
        <input
          className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs outline-none"
          value={credits}
          onChange={(event) => setCredits(event.target.value)}
          placeholder="Credits requested"
        />
        <input
          className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs outline-none"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="Transfer reference"
        />
        <input
          ref={receiptInputRef}
          className="hidden"
          type="file"
          accept="image/*,application/pdf"
          onChange={(event) => setReceipt(event.currentTarget.files?.[0] ?? null)}
        />
        <button
          className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/10"
          type="button"
          onClick={() => receiptInputRef.current?.click()}
        >
          {receipt ? receipt.name : "Choose receipt"}
        </button>
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
        <button
          className="rounded-xl bg-emerald-400 px-3 py-2 text-xs font-semibold text-black disabled:opacity-50"
          type="button"
          disabled={pending || !bankAccount || !receipt}
          onClick={() => onSubmit(receipt)}
        >
          {pending ? "Submitting..." : "Submit receipt"}
        </button>
      </div>
      <div className="mt-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
          Payment history
        </p>
        {payments.slice(0, 4).map((payment) => (
          <div key={payment._id} className="rounded-xl bg-black/20 px-3 py-2 text-xs text-white/60">
            TTD {(payment.amountCents / 100).toFixed(2)} · {payment.status}
          </div>
        ))}
      </div>
    </section>
  );
}

function AdminBankPanel({
  bankForm,
  setBankForm,
  pricingForm,
  setPricingForm,
  creditAdjustForm,
  setCreditAdjustForm,
  payments,
  status,
  onSave,
  onSavePricing,
  onSeedStyles,
  onReviewPayment,
  onAdjustCredits,
}: {
  bankForm: {
    label: string;
    bankName: string;
    accountName: string;
    accountNumber: string;
    accountType: "chequing" | "savings";
  };
  setBankForm: (value: {
    label: string;
    bankName: string;
    accountName: string;
    accountNumber: string;
    accountType: "chequing" | "savings";
  }) => void;
  pricingForm: {
    creditPriceCents: string;
    imageLowCredits: string;
    imageMediumCredits: string;
    imageHighCredits: string;
    videoCredits: string;
  };
  setPricingForm: (value: {
    creditPriceCents: string;
    imageLowCredits: string;
    imageMediumCredits: string;
    imageHighCredits: string;
    videoCredits: string;
  }) => void;
  creditAdjustForm: {
    userId: string;
    amount: string;
    reason: string;
  };
  setCreditAdjustForm: (value: {
    userId: string;
    amount: string;
    reason: string;
  }) => void;
  payments: Array<{
    _id: Id<"payments">;
    userId: Id<"users">;
    status: "receipt_uploaded" | "receipt_received" | "payment_completed" | "rejected";
    amountCents: number;
    creditsGranted?: number;
  }>;
  status: string;
  onSave: () => void;
  onSavePricing: () => void;
  onSeedStyles: () => void;
  onReviewPayment: (
    paymentId: Id<"payments">,
    status: "receipt_received" | "payment_completed" | "rejected",
  ) => void;
  onAdjustCredits: () => void;
}) {
  return (
    <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
        Admin bank settings
      </p>
      <div className="mt-3 grid gap-2">
        <AdminInput
          label="Label"
          value={bankForm.label}
          onChange={(label) => setBankForm({ ...bankForm, label })}
        />
        <AdminInput
          label="Bank"
          value={bankForm.bankName}
          onChange={(bankName) => setBankForm({ ...bankForm, bankName })}
        />
        <AdminInput
          label="Name"
          value={bankForm.accountName}
          onChange={(accountName) => setBankForm({ ...bankForm, accountName })}
        />
        <AdminInput
          label="Number"
          value={bankForm.accountNumber}
          onChange={(accountNumber) => setBankForm({ ...bankForm, accountNumber })}
        />
        <select
          className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white outline-none"
          value={bankForm.accountType}
          onChange={(event) =>
            setBankForm({
              ...bankForm,
              accountType: event.target.value as "chequing" | "savings",
            })
          }
        >
          <option value="chequing">Chequing</option>
          <option value="savings">Savings</option>
        </select>
        {status ? <p className="text-xs text-emerald-200">{status}</p> : null}
        <button
          className="rounded-xl bg-emerald-400 px-3 py-2 text-xs font-semibold text-black"
          type="button"
          onClick={onSave}
        >
          Save bank account
        </button>
        <p className="pt-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
          Pricing
        </p>
        <AdminInput
          label="Credit price cents"
          value={pricingForm.creditPriceCents}
          onChange={(creditPriceCents) => setPricingForm({ ...pricingForm, creditPriceCents })}
        />
        <AdminInput
          label="Low image credits"
          value={pricingForm.imageLowCredits}
          onChange={(imageLowCredits) => setPricingForm({ ...pricingForm, imageLowCredits })}
        />
        <AdminInput
          label="Medium image credits"
          value={pricingForm.imageMediumCredits}
          onChange={(imageMediumCredits) =>
            setPricingForm({ ...pricingForm, imageMediumCredits })
          }
        />
        <AdminInput
          label="High image credits"
          value={pricingForm.imageHighCredits}
          onChange={(imageHighCredits) => setPricingForm({ ...pricingForm, imageHighCredits })}
        />
        <AdminInput
          label="Video credits"
          value={pricingForm.videoCredits}
          onChange={(videoCredits) => setPricingForm({ ...pricingForm, videoCredits })}
        />
        <button
          className="rounded-xl bg-emerald-400 px-3 py-2 text-xs font-semibold text-black"
          type="button"
          onClick={onSavePricing}
        >
          Save pricing
        </button>
        <button
          className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/10"
          type="button"
          onClick={onSeedStyles}
        >
          Seed style presets
        </button>
        <p className="pt-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
          Payments
        </p>
        {payments.slice(0, 5).map((payment) => (
          <div key={payment._id} className="rounded-xl bg-black/20 p-2 text-xs text-white/60">
            <div className="flex items-center justify-between gap-2">
              <span>TTD {(payment.amountCents / 100).toFixed(2)}</span>
              <span>{payment.status}</span>
            </div>
            <p className="mt-1 truncate text-white/35">User: {payment.userId}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              <AdminActionButton onClick={() => onReviewPayment(payment._id, "receipt_received")}>
                Received
              </AdminActionButton>
              <AdminActionButton onClick={() => onReviewPayment(payment._id, "payment_completed")}>
                Approve
              </AdminActionButton>
              <AdminActionButton onClick={() => onReviewPayment(payment._id, "rejected")}>
                Reject
              </AdminActionButton>
            </div>
          </div>
        ))}
        {payments.length === 0 ? (
          <p className="rounded-xl bg-black/20 px-3 py-2 text-xs text-white/35">
            No payment receipts yet.
          </p>
        ) : null}
        <p className="pt-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
          Credit adjustment
        </p>
        <AdminInput
          label="User ID"
          value={creditAdjustForm.userId}
          onChange={(userId) => setCreditAdjustForm({ ...creditAdjustForm, userId })}
        />
        <AdminInput
          label="Amount"
          value={creditAdjustForm.amount}
          onChange={(amount) => setCreditAdjustForm({ ...creditAdjustForm, amount })}
        />
        <AdminInput
          label="Reason"
          value={creditAdjustForm.reason}
          onChange={(reason) => setCreditAdjustForm({ ...creditAdjustForm, reason })}
        />
        <button
          className="rounded-xl bg-emerald-400 px-3 py-2 text-xs font-semibold text-black"
          type="button"
          onClick={onAdjustCredits}
        >
          Adjust credits
        </button>
      </div>
    </section>
  );
}

function AdminActionButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-white/60 hover:bg-white/10"
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function AdminInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs outline-none"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={label}
    />
  );
}

function CopyLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2">
      <span className="w-14 text-white/35">{label}</span>
      <span className="min-w-0 flex-1 truncate">{value}</span>
      <button
        className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-white/55 hover:bg-white/10"
        type="button"
        onClick={() => void navigator.clipboard.writeText(value)}
      >
        Copy
      </button>
    </div>
  );
}

function isAdminRole(role: "user" | "admin" | "super_admin" | undefined) {
  return role === "admin" || role === "super_admin";
}
