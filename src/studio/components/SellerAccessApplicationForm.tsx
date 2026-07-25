"use client";

import { useAction, useMutation } from "convex/react";
import {
  ArrowLeft,
  ArrowRight,
  BookUser,
  Building2,
  CarFront,
  Check,
  ClipboardCheck,
  FileBadge,
  HandCoins,
  Hash,
  Home,
  IdCard,
  Loader2,
  type LucideIcon,
  MapPin,
  Phone,
  Receipt,
  ScrollText,
  Upload,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { IconField } from "./MarketplaceIconField";
import "./marketplace-offers-pane.css";

type EntityType = "freelancer" | "business";
type BusinessType = "sole_trader" | "limited_company" | "partnership" | "other";
type PhotoIdKind = "national_id" | "passport" | "drivers_permit";
type IdentityDocKind = PhotoIdKind | "birth_certificate";

type DocSlot = {
  file: File | null;
  displayName: string | null;
  bunnyPath: string | null;
  uploading: boolean;
};

const emptyDoc = (): DocSlot => ({
  file: null,
  displayName: null,
  bunnyPath: null,
  uploading: false,
});

type AddressParts = {
  street: string;
  area: string;
  town: string;
};

const emptyAddress = (): AddressParts => ({ street: "", area: "", town: "" });

const DRAFT_KEY = "yatishara.sellerAccess.draft.v3";
const DRAFT_VERSION = 3 as const;

type PersistedDoc = { bunnyPath: string; name: string };

type SellerDraft = {
  v: typeof DRAFT_VERSION;
  stepIndex: number;
  entityType: EntityType;
  businessName: string;
  legalName: string;
  phone: string;
  homeAddress: AddressParts;
  idKind1: IdentityDocKind | null;
  idKind2: IdentityDocKind | null;
  businessType: BusinessType;
  businessRegistrationNumber: string;
  birNumber: string;
  bizAddress: AddressParts;
  docs: {
    idDoc1?: PersistedDoc;
    idDoc1Back?: PersistedDoc;
    idDoc2?: PersistedDoc;
    idDoc2Back?: PersistedDoc;
    proofAddress?: PersistedDoc;
    bizReg?: PersistedDoc;
    bizAddressProof?: PersistedDoc;
  };
};

function isTwoSided(kind: IdentityDocKind): boolean {
  return kind === "national_id" || kind === "drivers_permit";
}

function formatAddress(parts: AddressParts): string {
  return [parts.street.trim(), parts.area.trim(), parts.town.trim()].filter(Boolean).join(", ");
}

function docFromPersisted(doc?: PersistedDoc): DocSlot {
  if (!doc?.bunnyPath) return emptyDoc();
  return {
    file: null,
    displayName: doc.name || "Uploaded",
    bunnyPath: doc.bunnyPath,
    uploading: false,
  };
}

function persistDoc(slot: DocSlot): PersistedDoc | undefined {
  if (!slot.bunnyPath) return undefined;
  return {
    bunnyPath: slot.bunnyPath,
    name: slot.file?.name || slot.displayName || "Uploaded",
  };
}

function readDraft(): SellerDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SellerDraft;
    if (parsed?.v !== DRAFT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearDraft() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

function draftHasProgress(draft: SellerDraft | null): boolean {
  if (!draft) return false;
  if (draft.stepIndex > 0) return true;
  if (draft.legalName.trim() || draft.phone.trim() || draft.businessName.trim()) return true;
  if (draft.homeAddress.street.trim() || draft.homeAddress.town.trim()) return true;
  if (draft.idKind1 || draft.idKind2) return true;
  if (Object.values(draft.docs).some(Boolean)) return true;
  return false;
}

function isPlausibleTtPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return false;
  if (digits.startsWith("1868") && digits.length >= 11) return true;
  if (digits.startsWith("868") && digits.length >= 10) return true;
  if (digits.length === 7) return true;
  return digits.length >= 10;
}

type FieldKey =
  | "legalName"
  | "phone"
  | "homeStreet"
  | "homeTown"
  | "idKind1"
  | "idDoc1"
  | "idDoc1Back"
  | "idKind2"
  | "idDoc2"
  | "idDoc2Back"
  | "proofAddress"
  | "bizStreet"
  | "bizTown"
  | "bizReg"
  | "bizAddressProof"
  | "identity";

type FieldErrors = Partial<Record<FieldKey, string>>;

function FieldError({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <p className="marketplace-field-error" role="alert">
      {error}
    </p>
  );
}

/** Icon-leading field where the placeholder doubles as the label. */
function Field({
  icon,
  error,
  ...inputProps
}: {
  icon: LucideIcon;
  error?: string | null;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`marketplace-field-wrap${error ? " is-error" : ""}`}>
      <IconField icon={icon} aria-invalid={error ? true : undefined} {...inputProps} />
      <FieldError error={error} />
    </div>
  );
}

function AddressFields({
  value,
  onChange,
  streetAutoComplete = "address-line1",
  townAutoComplete = "address-level2",
  streetError,
  townError,
  streetName = "homeStreet",
  townName = "homeTown",
  label = "Address",
}: {
  value: AddressParts;
  onChange: (next: AddressParts) => void;
  streetAutoComplete?: string;
  townAutoComplete?: string;
  streetError?: string | null;
  townError?: string | null;
  streetName?: string;
  townName?: string;
  label?: string;
}) {
  return (
    <div className="marketplace-profile-fields" role="group" aria-label={label}>
      <Field
        icon={Home}
        name={streetName}
        value={value.street}
        onChange={(e) => onChange({ ...value, street: e.target.value })}
        placeholder="Street / house no."
        aria-label="Street or house number"
        autoComplete={streetAutoComplete}
        error={streetError}
      />
      <div className="marketplace-optional-row">
        <Field
          icon={MapPin}
          value={value.area}
          onChange={(e) => onChange({ ...value, area: e.target.value })}
          placeholder="Area (optional)"
          aria-label="Area (optional)"
          autoComplete="address-level3"
        />
        <Field
          icon={Building2}
          name={townName}
          value={value.town}
          onChange={(e) => onChange({ ...value, town: e.target.value })}
          placeholder="Town / city"
          aria-label="Town or city"
          autoComplete={townAutoComplete}
          error={townError}
        />
      </div>
    </div>
  );
}

type ChoiceOption<T extends string> = {
  value: T;
  label: string;
  hint: string;
  icon: LucideIcon;
};

function ChoiceCards<T extends string>({
  label,
  value,
  options,
  columns = 2,
  onChange,
  error,
}: {
  label: string;
  value: T | null;
  options: ChoiceOption<T>[];
  columns?: 2 | 3 | 4;
  onChange: (next: T) => void;
  error?: string | null;
}) {
  return (
    <div
      className={`marketplace-choice-field${error ? " is-error" : ""}`}
      role="radiogroup"
      aria-label={label}
      aria-invalid={error ? true : undefined}
    >
      <span className="marketplace-choice-field-label">{label}</span>
      <div className={`marketplace-choice-grid is-${columns}${options.length === 1 ? " is-one" : ""}`}>
        {options.map((option) => {
          const Icon = option.icon;
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              className={`marketplace-choice-card${active ? " is-active" : ""}`}
              onClick={() => onChange(option.value)}
            >
              <span className="marketplace-choice-card-icon" aria-hidden="true">
                <Icon />
                {active ? <Check className="marketplace-choice-card-check" /> : null}
              </span>
              <strong>{option.label}</strong>
              <span>{option.hint}</span>
            </button>
          );
        })}
      </div>
      <FieldError error={error} />
    </div>
  );
}

type StepId = "type" | "profile" | "identity" | "address" | "business" | "review";

const IDENTITY_DOC_OPTIONS: ChoiceOption<IdentityDocKind>[] = [
  { value: "national_id", label: "National ID", hint: "ID card", icon: IdCard },
  { value: "passport", label: "Passport", hint: "Photo page", icon: BookUser },
  { value: "drivers_permit", label: "Permit", hint: "Driver’s permit", icon: CarFront },
  { value: "birth_certificate", label: "Birth cert", hint: "Official certificate", icon: ScrollText },
];

const BUSINESS_TYPE_OPTIONS: ChoiceOption<BusinessType>[] = [
  { value: "sole_trader", label: "Sole trader", hint: "Just you", icon: UserRound },
  { value: "limited_company", label: "Limited", hint: "Ltd / Inc", icon: Building2 },
  { value: "partnership", label: "Partnership", hint: "Two or more", icon: HandCoins },
  { value: "other", label: "Other", hint: "Something else", icon: FileBadge },
];

const IDENTITY_DOC_LABELS: Record<IdentityDocKind, string> = {
  national_id: "National ID",
  passport: "Passport",
  drivers_permit: "Driver’s Permit",
  birth_certificate: "Birth certificate",
};

const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  sole_trader: "Sole trader",
  limited_company: "Limited company",
  partnership: "Partnership",
  other: "Other",
};

function identityUploadMeta(
  kind: IdentityDocKind,
  side: "front" | "back" = "front",
): {
  title: string;
  tip: string;
  ariaLabel: string;
  docKind: string;
} {
  const back = side === "back";
  switch (kind) {
    case "passport":
      return {
        title: "Passport",
        tip: "Photo page — clear and readable",
        ariaLabel: "Upload passport",
        docKind: "passport",
      };
    case "drivers_permit":
      return {
        title: back ? "Permit — back" : "Permit — front",
        tip: back
          ? "Back of permit — address and signature side"
          : "Front of permit — photo side",
        ariaLabel: back ? "Upload back of driver’s permit" : "Upload front of driver’s permit",
        docKind: back ? "drivers-permit-back" : "drivers-permit",
      };
    case "birth_certificate":
      return {
        title: "Birth certificate",
        tip: "Official certificate — full page",
        ariaLabel: "Upload birth certificate",
        docKind: "birth-certificate",
      };
    default:
      return {
        title: back ? "National ID — back" : "National ID — front",
        tip: back ? "Back of ID — barcode side" : "Front of ID — photo side",
        ariaLabel: back ? "Upload back of national ID" : "Upload front of national ID",
        docKind: back ? "national-id-back" : "national-id",
      };
  }
}

function resolveIdentityForSubmit(
  kind1: IdentityDocKind,
  doc1: DocSlot,
  doc1Back: DocSlot,
  kind2: IdentityDocKind,
  doc2: DocSlot,
  doc2Back: DocSlot,
):
  | {
      identityDoc1Kind: IdentityDocKind;
      identityDoc1BunnyPath: string;
      identityDoc1BackBunnyPath?: string;
      identityDoc2Kind: IdentityDocKind;
      identityDoc2BunnyPath: string;
      identityDoc2BackBunnyPath?: string;
    }
  | string {
  if (kind1 === kind2) return "Pick two different document types.";
  if (!doc1.bunnyPath || !doc2.bunnyPath) return "Upload both identity documents.";
  if (isTwoSided(kind1) && !doc1Back.bunnyPath) {
    return `Upload the back of your ${IDENTITY_DOC_LABELS[kind1]}.`;
  }
  if (isTwoSided(kind2) && !doc2Back.bunnyPath) {
    return `Upload the back of your ${IDENTITY_DOC_LABELS[kind2]}.`;
  }
  return {
    identityDoc1Kind: kind1,
    identityDoc1BunnyPath: doc1.bunnyPath,
    identityDoc1BackBunnyPath: doc1Back.bunnyPath ?? undefined,
    identityDoc2Kind: kind2,
    identityDoc2BunnyPath: doc2.bunnyPath,
    identityDoc2BackBunnyPath: doc2Back.bunnyPath ?? undefined,
  };
}

async function stageSellerDoc(
  generateUrl: () => Promise<string>,
  file: File,
): Promise<Id<"_storage">> {
  const uploadUrl = await generateUrl();
  const result = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!result.ok) {
    throw new Error("Upload failed");
  }
  const json = (await result.json()) as { storageId: Id<"_storage"> };
  if (!json.storageId) throw new Error("Upload did not return a storage id");
  return json.storageId;
}

/** Whole tile is the file input — icon, title, hint, then the picked file name. */
function DocUploadCard({
  title,
  tip,
  ariaLabel,
  slot,
  onPick,
  error,
}: {
  title: string;
  tip: string;
  ariaLabel: string;
  slot: DocSlot;
  onPick: (file: File | null) => void;
  error?: string | null;
}) {
  const ready = Boolean(slot.bunnyPath);
  const statusLabel = slot.uploading
    ? "Uploading…"
    : ready
      ? slot.file?.name || slot.displayName || "Uploaded"
      : "PDF or photo";
  return (
    <div className={`marketplace-doc-card-wrap${error ? " is-error" : ""}`}>
      <label
        className={`marketplace-doc-card${ready ? " is-ready" : ""}${slot.uploading ? " is-uploading" : ""}`}
      >
        <span className="marketplace-doc-card-glyph" aria-hidden="true">
          {slot.uploading ? <Loader2 className="animate-spin" /> : ready ? <Check /> : <Upload />}
        </span>
        <span className="marketplace-doc-card-title">{title}</span>
        <span className="marketplace-doc-card-tip">{tip}</span>
        <span className="marketplace-doc-card-status">{statusLabel}</span>
        <input
          type="file"
          accept="image/*,application/pdf"
          className="marketplace-file-input-hidden"
          disabled={slot.uploading}
          aria-label={ariaLabel}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </label>
      {ready && !slot.uploading ? (
        <button type="button" className="marketplace-doc-card-clear" onClick={() => onPick(null)}>
          Remove
        </button>
      ) : null}
      <FieldError error={error} />
    </div>
  );
}

function ReviewRow({
  icon: Icon,
  label,
  value,
  onJump,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  onJump?: () => void;
}) {
  return (
    <div className="marketplace-review-row">
      <dt>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </dt>
      <dd>
        <span>{value || "—"}</span>
        {onJump ? (
          <button type="button" className="marketplace-review-edit" onClick={onJump}>
            Edit
          </button>
        ) : null}
      </dd>
    </div>
  );
}

type SellerAccessApplicationFormProps = {
  busy: boolean;
  setBusy: (busy: boolean) => void;
};

export function SellerAccessApplicationForm({
  busy,
  setBusy,
}: SellerAccessApplicationFormProps) {
  const prepareUpload = useMutation(api.marketplace.prepareSellerDocUpload);
  const commitUpload = useAction(api.marketplaceActions.commitSellerDocUpload);
  const requestSeller = useMutation(api.marketplace.requestSellerAccess);

  const initialDraft = useMemo(() => readDraft(), []);

  const [stepIndex, setStepIndex] = useState(() => initialDraft?.stepIndex ?? 0);
  const [entityType, setEntityType] = useState<EntityType>(
    () => initialDraft?.entityType ?? "freelancer",
  );
  const [businessName, setBusinessName] = useState(() => initialDraft?.businessName ?? "");
  const [legalName, setLegalName] = useState(() => initialDraft?.legalName ?? "");
  const [phone, setPhone] = useState(() => initialDraft?.phone ?? "");
  const [homeAddress, setHomeAddress] = useState<AddressParts>(
    () => initialDraft?.homeAddress ?? emptyAddress(),
  );
  const [idKind1, setIdKind1] = useState<IdentityDocKind | null>(
    () => initialDraft?.idKind1 ?? null,
  );
  const [idKind2, setIdKind2] = useState<IdentityDocKind | null>(
    () => initialDraft?.idKind2 ?? null,
  );
  const [businessType, setBusinessType] = useState<BusinessType>(
    () => initialDraft?.businessType ?? "sole_trader",
  );
  const [businessRegistrationNumber, setBusinessRegistrationNumber] = useState(
    () => initialDraft?.businessRegistrationNumber ?? "",
  );
  const [birNumber, setBirNumber] = useState(() => initialDraft?.birNumber ?? "");
  const [bizAddress, setBizAddress] = useState<AddressParts>(
    () => initialDraft?.bizAddress ?? emptyAddress(),
  );

  const [idDoc1, setIdDoc1] = useState<DocSlot>(() =>
    docFromPersisted(initialDraft?.docs?.idDoc1),
  );
  const [idDoc1Back, setIdDoc1Back] = useState<DocSlot>(() =>
    docFromPersisted(initialDraft?.docs?.idDoc1Back),
  );
  const [idDoc2, setIdDoc2] = useState<DocSlot>(() =>
    docFromPersisted(initialDraft?.docs?.idDoc2),
  );
  const [idDoc2Back, setIdDoc2Back] = useState<DocSlot>(() =>
    docFromPersisted(initialDraft?.docs?.idDoc2Back),
  );
  const [proofAddress, setProofAddress] = useState<DocSlot>(() =>
    docFromPersisted(initialDraft?.docs?.proofAddress),
  );
  const [bizReg, setBizReg] = useState<DocSlot>(() =>
    docFromPersisted(initialDraft?.docs?.bizReg),
  );
  const [bizAddressProof, setBizAddressProof] = useState<DocSlot>(() =>
    docFromPersisted(initialDraft?.docs?.bizAddressProof),
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showDraftCue, setShowDraftCue] = useState(() => draftHasProgress(initialDraft));
  const stepsTrackRef = useRef<HTMLOListElement | null>(null);
  const draftReadyRef = useRef(false);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const steps = useMemo(() => {
    const base: {
      id: StepId;
      label: string;
      title: string;
      blurb: string;
      icon: LucideIcon;
    }[] = [
      {
        id: "type",
        label: "Type",
        title: "Who’s selling?",
        blurb: "Pick one — takes about 5 minutes.",
        icon: HandCoins,
      },
      {
        id: "profile",
        label: "You",
        title: "Your details",
        blurb: "Same as on your ID.",
        icon: Phone,
      },
      {
        id: "identity",
        label: "ID",
        title: "Your ID",
        blurb: "Any two different IDs. Cards need front and back.",
        icon: IdCard,
      },
      {
        id: "address",
        label: "Home",
        title: "Home address proof",
        blurb: "Bill from last 3 months — not a phone bill.",
        icon: Home,
      },
    ];
    if (entityType === "business") {
      base.push({
        id: "business",
        label: "Biz",
        title: "Business papers",
        blurb: "Registration + business address.",
        icon: Building2,
      });
    }
    base.push({
      id: "review",
      label: "Done",
      title: "Ready to submit?",
      blurb: "We’ll review, then you can sell.",
      icon: ClipboardCheck,
    });
    return base;
  }, [entityType]);

  const step = steps[Math.min(stepIndex, steps.length - 1)]!;
  const StepIcon = step.icon;
  const isLast = step.id === "review";
  const isFirst = stepIndex === 0;

  useEffect(() => {
    const track = stepsTrackRef.current;
    if (!track) return;
    const current = track.querySelector<HTMLElement>("li.is-current .marketplace-apply-step");
    current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [stepIndex, steps.length]);

  useEffect(() => {
    setStepIndex((i) => Math.min(i, steps.length - 1));
  }, [steps.length]);

  useEffect(() => {
    if (!draftReadyRef.current) {
      draftReadyRef.current = true;
      return;
    }
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      const draft: SellerDraft = {
        v: DRAFT_VERSION,
        stepIndex,
        entityType,
        businessName,
        legalName,
        phone,
        homeAddress,
        idKind1,
        idKind2,
        businessType,
        businessRegistrationNumber,
        birNumber,
        bizAddress,
        docs: {
          idDoc1: persistDoc(idDoc1),
          idDoc1Back: persistDoc(idDoc1Back),
          idDoc2: persistDoc(idDoc2),
          idDoc2Back: persistDoc(idDoc2Back),
          proofAddress: persistDoc(proofAddress),
          bizReg: persistDoc(bizReg),
          bizAddressProof: persistDoc(bizAddressProof),
        },
      };
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        /* quota / private mode */
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    stepIndex,
    entityType,
    businessName,
    legalName,
    phone,
    homeAddress,
    idKind1,
    idKind2,
    businessType,
    businessRegistrationNumber,
    birNumber,
    bizAddress,
    idDoc1,
    idDoc1Back,
    idDoc2,
    idDoc2Back,
    proofAddress,
    bizReg,
    bizAddressProof,
  ]);

  const uploading =
    idDoc1.uploading ||
    idDoc1Back.uploading ||
    idDoc2.uploading ||
    idDoc2Back.uploading ||
    proofAddress.uploading ||
    bizReg.uploading ||
    bizAddressProof.uploading;

  const idDoc1Complete =
    Boolean(idDoc1.bunnyPath) &&
    (!idKind1 || !isTwoSided(idKind1) || Boolean(idDoc1Back.bunnyPath));

  function clearFieldError(key: FieldKey) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function resetIdentity() {
    setIdKind1(null);
    setIdDoc1(emptyDoc());
    setIdDoc1Back(emptyDoc());
    setIdKind2(null);
    setIdDoc2(emptyDoc());
    setIdDoc2Back(emptyDoc());
    clearFieldError("idDoc1");
    clearFieldError("idDoc1Back");
    clearFieldError("idDoc2");
    clearFieldError("idDoc2Back");
    clearFieldError("identity");
  }

  async function handleDocPick(
    file: File | null,
    docKind: string,
    setSlot: (slot: DocSlot) => void,
  ) {
    if (!file) {
      setSlot(emptyDoc());
      return;
    }
    setSlot({ file, displayName: file.name, bunnyPath: null, uploading: true });
    try {
      const storageId = await stageSellerDoc(() => prepareUpload({}), file);
      const { bunnyPath } = await commitUpload({
        storageId,
        filename: file.name,
        docKind,
        mimeType: file.type || "application/octet-stream",
        byteSize: file.size,
      });
      setSlot({ file, displayName: file.name, bunnyPath, uploading: false });
    } catch (error) {
      setSlot(emptyDoc());
      toast.error(friendlyConvexError(error, "Could not upload document."));
    }
  }

  function focusFirstError(errors: FieldErrors) {
    const order: FieldKey[] = [
      "legalName",
      "phone",
      "homeStreet",
      "homeTown",
      "idKind1",
      "idDoc1",
      "idDoc1Back",
      "idKind2",
      "idDoc2",
      "idDoc2Back",
      "identity",
      "proofAddress",
      "bizStreet",
      "bizTown",
      "bizReg",
      "bizAddressProof",
    ];
    const first = order.find((key) => errors[key]);
    if (!first) return;
    window.requestAnimationFrame(() => {
      const root = stageRef.current;
      if (!root) return;
      const named = root.querySelector<HTMLElement>(`[name="${first}"]`);
      if (named) {
        named.focus();
        named.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      const invalid = root.querySelector<HTMLElement>('[aria-invalid="true"]');
      invalid?.focus?.();
      invalid?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function validateStep(id: StepId): FieldErrors {
    const errors: FieldErrors = {};
    switch (id) {
      case "type":
        break;
      case "profile":
        if (!legalName.trim()) errors.legalName = "Enter your legal name as on ID.";
        if (!phone.trim()) errors.phone = "Enter a Trinidad & Tobago phone number.";
        else if (!isPlausibleTtPhone(phone)) {
          errors.phone = "Use a TT number (+1 868 or 7-digit local).";
        }
        if (!homeAddress.street.trim()) errors.homeStreet = "Enter your street / house number.";
        if (!homeAddress.town.trim()) errors.homeTown = "Enter your town or city.";
        break;
      case "identity": {
        if (!idKind1) errors.idKind1 = "Choose your first ID document type.";
        if (!idDoc1.bunnyPath) errors.idDoc1 = "Upload your first ID document.";
        if (idKind1 && isTwoSided(idKind1) && !idDoc1Back.bunnyPath) {
          errors.idDoc1Back = "Upload the back of this document.";
        }
        if (!idKind2) errors.idKind2 = "Choose your second ID document type.";
        if (!idDoc2.bunnyPath) errors.idDoc2 = "Upload your second ID document.";
        if (idKind2 && isTwoSided(idKind2) && !idDoc2Back.bunnyPath) {
          errors.idDoc2Back = "Upload the back of this document.";
        }
        if (idKind1 && idKind2 && idKind1 === idKind2) {
          errors.identity = "Pick two different document types.";
        } else if (idKind1 && idKind2 && idDoc1.bunnyPath && idDoc2.bunnyPath) {
          const mapped = resolveIdentityForSubmit(
            idKind1,
            idDoc1,
            idDoc1Back,
            idKind2,
            idDoc2,
            idDoc2Back,
          );
          if (typeof mapped === "string") errors.identity = mapped;
        }
        break;
      }
      case "address":
        if (!proofAddress.bunnyPath) errors.proofAddress = "Upload proof of home address.";
        break;
      case "business":
        if (!bizAddress.street.trim()) errors.bizStreet = "Enter the business street / house number.";
        if (!bizAddress.town.trim()) errors.bizTown = "Enter the business town or city.";
        if (!bizReg.bunnyPath) errors.bizReg = "Upload business registration.";
        if (!bizAddressProof.bunnyPath) {
          errors.bizAddressProof = "Upload proof of business address.";
        }
        break;
      default:
        break;
    }
    return errors;
  }

  function goNext() {
    const errors = validateStep(step.id);
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      focusFirstError(errors);
      return;
    }
    setFieldErrors({});
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  function goBack() {
    setFieldErrors({});
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  function jumpToStep(id: StepId) {
    const idx = steps.findIndex((s) => s.id === id);
    if (idx >= 0) {
      setFieldErrors({});
      setStepIndex(idx);
    }
  }

  function handleClearDraft() {
    clearDraft();
    setShowDraftCue(false);
    setStepIndex(0);
    setEntityType("freelancer");
    setBusinessName("");
    setLegalName("");
    setPhone("");
    setHomeAddress(emptyAddress());
    setIdKind1(null);
    setIdKind2(null);
    setBusinessType("sole_trader");
    setBusinessRegistrationNumber("");
    setBirNumber("");
    setBizAddress(emptyAddress());
    setIdDoc1(emptyDoc());
    setIdDoc1Back(emptyDoc());
    setIdDoc2(emptyDoc());
    setIdDoc2Back(emptyDoc());
    setProofAddress(emptyDoc());
    setBizReg(emptyDoc());
    setBizAddressProof(emptyDoc());
    setFieldErrors({});
    toast.success("Draft cleared");
  }

  async function handleSubmit() {
    for (const s of steps) {
      if (s.id === "review") continue;
      const errors = validateStep(s.id);
      if (Object.keys(errors).length) {
        setFieldErrors(errors);
        setStepIndex(steps.findIndex((x) => x.id === s.id));
        focusFirstError(errors);
        return;
      }
    }
    setBusy(true);
    try {
      const identity = resolveIdentityForSubmit(
        idKind1!,
        idDoc1,
        idDoc1Back,
        idKind2!,
        idDoc2,
        idDoc2Back,
      );
      if (typeof identity === "string") {
        toast.error(identity);
        setBusy(false);
        return;
      }
      await requestSeller({
        entityType,
        businessName: businessName.trim() || legalName.trim(),
        legalName: legalName.trim(),
        phone: phone.trim(),
        residentialAddress: formatAddress(homeAddress),
        identityDoc1Kind: identity.identityDoc1Kind,
        identityDoc1BunnyPath: identity.identityDoc1BunnyPath,
        identityDoc1BackBunnyPath: identity.identityDoc1BackBunnyPath,
        identityDoc2Kind: identity.identityDoc2Kind,
        identityDoc2BunnyPath: identity.identityDoc2BunnyPath,
        identityDoc2BackBunnyPath: identity.identityDoc2BackBunnyPath,
        proofOfResidentialAddressBunnyPath: proofAddress.bunnyPath!,
        ...(entityType === "business"
          ? {
              businessType,
              businessRegistrationNumber: businessRegistrationNumber.trim() || undefined,
              birNumber: birNumber.trim() || undefined,
              businessAddress: formatAddress(bizAddress),
              businessRegistrationBunnyPath: bizReg.bunnyPath!,
              proofOfBusinessAddressBunnyPath: bizAddressProof.bunnyPath!,
            }
          : {}),
      });
      clearDraft();
      setShowDraftCue(false);
      toast.success("Seller request submitted");
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not request seller access."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="marketplace-apply-pane">
      <header className="marketplace-apply-head">
        <ol ref={stepsTrackRef} className="marketplace-apply-steps" aria-label="Application steps">
          {steps.map((s, i) => {
            const done = i < stepIndex;
            const current = i === stepIndex;
            return (
              <li key={s.id} className={current ? "is-current" : done ? "is-done" : undefined}>
                <button
                  type="button"
                  className="marketplace-apply-step"
                  disabled={i > stepIndex}
                  aria-current={current ? "step" : undefined}
                  onClick={() => {
                    if (i < stepIndex) {
                      setFieldErrors({});
                      setStepIndex(i);
                    }
                  }}
                >
                  {done ? (
                    <Check aria-hidden="true" />
                  ) : (
                    <span className="marketplace-apply-step-dot" aria-hidden="true" />
                  )}
                  {s.label}
                </button>
              </li>
            );
          })}
        </ol>
      </header>

      <div className="marketplace-apply-body">
        <div className="marketplace-apply-stage" key={step.id} ref={stageRef}>
          <div className="marketplace-apply-intro">
            <StepIcon className="marketplace-apply-intro-icon" aria-hidden="true" />
            <h2>{step.title}</h2>
            <p>{step.blurb}</p>
          </div>

          <div className="marketplace-apply-options">
            {step.id === "type" ? (
              <div
                className="marketplace-entity-visuals"
                role="radiogroup"
                aria-label="Account type"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={entityType === "freelancer"}
                  className={entityType === "freelancer" ? "is-active" : ""}
                  onClick={() => setEntityType("freelancer")}
                >
                  <UserRound className="marketplace-entity-visual-icon" aria-hidden="true" />
                  <strong>Freelancer</strong>
                  <span>Just you</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={entityType === "business"}
                  className={entityType === "business" ? "is-active" : ""}
                  onClick={() => setEntityType("business")}
                >
                  <Building2 className="marketplace-entity-visual-icon" aria-hidden="true" />
                  <strong>Business</strong>
                  <span>Company / shop</span>
                </button>
              </div>
            ) : null}

            {step.id === "profile" ? (
              <div className="marketplace-profile-fields">
                <Field
                  icon={UserRound}
                  name="legalName"
                  value={legalName}
                  onChange={(e) => {
                    setLegalName(e.target.value);
                    clearFieldError("legalName");
                  }}
                  placeholder="Legal name (as on your ID)"
                  aria-label="Legal name (as on your ID)"
                  autoComplete="name"
                  autoFocus
                  error={fieldErrors.legalName}
                />
                <Field
                  icon={FileBadge}
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder={
                    entityType === "business" ? "Trading name" : "Display name (on offers)"
                  }
                  aria-label={entityType === "business" ? "Trading name" : "Display name"}
                />
                <Field
                  icon={Phone}
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    clearFieldError("phone");
                  }}
                  placeholder="Phone (+1 868 …)"
                  aria-label="Phone"
                  autoComplete="tel"
                  error={fieldErrors.phone}
                />
                <AddressFields
                  value={homeAddress}
                  onChange={(next) => {
                    setHomeAddress(next);
                    clearFieldError("homeStreet");
                    clearFieldError("homeTown");
                  }}
                  label="Home address"
                  streetError={fieldErrors.homeStreet}
                  townError={fieldErrors.homeTown}
                />
              </div>
            ) : null}

            {step.id === "identity" ? (
              <div className="marketplace-identity-flow">
                <FieldError error={fieldErrors.identity} />
                {!idKind1 ? (
                  <ChoiceCards
                    label="First document"
                    value={null}
                    options={IDENTITY_DOC_OPTIONS}
                    error={fieldErrors.idKind1}
                    onChange={(kind) => {
                      setIdKind1(kind);
                      setIdDoc1(emptyDoc());
                      clearFieldError("idKind1");
                      clearFieldError("identity");
                    }}
                  />
                ) : !idDoc1Complete ? (
                  <>
                    <div className="marketplace-identity-picked">
                      <span>{IDENTITY_DOC_LABELS[idKind1]}</span>
                      {isTwoSided(idKind1) ? (
                        <span className="marketplace-identity-sides">Front and back</span>
                      ) : null}
                      <button
                        type="button"
                        className="marketplace-identity-change"
                        onClick={resetIdentity}
                      >
                        Change
                      </button>
                    </div>
                    <div
                      className={`marketplace-doc-grid${
                        isTwoSided(idKind1) ? "" : " marketplace-doc-grid-single"
                      }`}
                    >
                      <DocUploadCard
                        {...identityUploadMeta(idKind1, "front")}
                        slot={idDoc1}
                        error={fieldErrors.idDoc1}
                        onPick={(file) => {
                          clearFieldError("idDoc1");
                          void handleDocPick(
                            file,
                            identityUploadMeta(idKind1, "front").docKind,
                            setIdDoc1,
                          );
                        }}
                      />
                      {isTwoSided(idKind1) ? (
                        <DocUploadCard
                          {...identityUploadMeta(idKind1, "back")}
                          slot={idDoc1Back}
                          error={fieldErrors.idDoc1Back}
                          onPick={(file) => {
                            clearFieldError("idDoc1Back");
                            void handleDocPick(
                              file,
                              identityUploadMeta(idKind1, "back").docKind,
                              setIdDoc1Back,
                            );
                          }}
                        />
                      ) : null}
                    </div>
                  </>
                ) : !idKind2 ? (
                  <>
                    <div className="marketplace-identity-done">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      {IDENTITY_DOC_LABELS[idKind1]} uploaded
                      <button
                        type="button"
                        className="marketplace-identity-change"
                        onClick={resetIdentity}
                      >
                        Change
                      </button>
                    </div>
                    <ChoiceCards
                      label="Second document"
                      value={null}
                      options={IDENTITY_DOC_OPTIONS.filter((o) => o.value !== idKind1)}
                      error={fieldErrors.idKind2}
                      onChange={(kind) => {
                        setIdKind2(kind);
                        setIdDoc2(emptyDoc());
                        clearFieldError("idKind2");
                        clearFieldError("identity");
                      }}
                    />
                  </>
                ) : (
                  <>
                    <div className="marketplace-identity-done">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      {IDENTITY_DOC_LABELS[idKind1]} uploaded
                    </div>
                    <div className="marketplace-identity-picked">
                      <span>{IDENTITY_DOC_LABELS[idKind2]}</span>
                      {isTwoSided(idKind2) ? (
                        <span className="marketplace-identity-sides">Front and back</span>
                      ) : null}
                      <button
                        type="button"
                        className="marketplace-identity-change"
                        onClick={() => {
                          setIdKind2(null);
                          setIdDoc2(emptyDoc());
                          setIdDoc2Back(emptyDoc());
                          clearFieldError("idDoc2");
                          clearFieldError("idDoc2Back");
                        }}
                      >
                        Change
                      </button>
                    </div>
                    <div
                      className={`marketplace-doc-grid${
                        isTwoSided(idKind2) ? "" : " marketplace-doc-grid-single"
                      }`}
                    >
                      <DocUploadCard
                        {...identityUploadMeta(idKind2, "front")}
                        slot={idDoc2}
                        error={fieldErrors.idDoc2}
                        onPick={(file) => {
                          clearFieldError("idDoc2");
                          void handleDocPick(
                            file,
                            identityUploadMeta(idKind2, "front").docKind,
                            setIdDoc2,
                          );
                        }}
                      />
                      {isTwoSided(idKind2) ? (
                        <DocUploadCard
                          {...identityUploadMeta(idKind2, "back")}
                          slot={idDoc2Back}
                          error={fieldErrors.idDoc2Back}
                          onPick={(file) => {
                            clearFieldError("idDoc2Back");
                            void handleDocPick(
                              file,
                              identityUploadMeta(idKind2, "back").docKind,
                              setIdDoc2Back,
                            );
                          }}
                        />
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {step.id === "address" ? (
              <div className="marketplace-doc-grid marketplace-doc-grid-single">
                <DocUploadCard
                  title="Utility / bank / tax"
                  tip="Last 3 months · not mobile bill"
                  ariaLabel="Upload proof of home address"
                  slot={proofAddress}
                  error={fieldErrors.proofAddress}
                  onPick={(file) => {
                    clearFieldError("proofAddress");
                    void handleDocPick(file, "residential-address", setProofAddress);
                  }}
                />
              </div>
            ) : null}

            {step.id === "business" ? (
              <>
                <ChoiceCards
                  label="Business type"
                  value={businessType}
                  options={BUSINESS_TYPE_OPTIONS}
                  onChange={setBusinessType}
                />
                <AddressFields
                  value={bizAddress}
                  onChange={(next) => {
                    setBizAddress(next);
                    clearFieldError("bizStreet");
                    clearFieldError("bizTown");
                  }}
                  label="Business address"
                  streetAutoComplete="off"
                  townAutoComplete="off"
                  streetName="bizStreet"
                  townName="bizTown"
                  streetError={fieldErrors.bizStreet}
                  townError={fieldErrors.bizTown}
                />
                <div className="marketplace-optional-row">
                  <Field
                    icon={Hash}
                    value={businessRegistrationNumber}
                    onChange={(e) => setBusinessRegistrationNumber(e.target.value)}
                    placeholder="Reg. # (optional)"
                    aria-label="Registration number (optional)"
                  />
                  <Field
                    icon={Receipt}
                    value={birNumber}
                    onChange={(e) => setBirNumber(e.target.value)}
                    placeholder="BIR (optional)"
                    aria-label="BIR number (optional)"
                  />
                </div>
                <div className="marketplace-doc-grid">
                  <DocUploadCard
                    title="Registration"
                    tip="Certificate of incorporation"
                    ariaLabel="Upload business registration"
                    slot={bizReg}
                    error={fieldErrors.bizReg}
                    onPick={(file) => {
                      clearFieldError("bizReg");
                      void handleDocPick(file, "business-registration", setBizReg);
                    }}
                  />
                  <DocUploadCard
                    title="Biz address proof"
                    tip="Bill or lease in business name"
                    ariaLabel="Upload proof of business address"
                    slot={bizAddressProof}
                    error={fieldErrors.bizAddressProof}
                    onPick={(file) => {
                      clearFieldError("bizAddressProof");
                      void handleDocPick(file, "business-address", setBizAddressProof);
                    }}
                  />
                </div>
              </>
            ) : null}

            {step.id === "review" ? (
              <div className="marketplace-review-stack">
                <ul className="marketplace-review-checklist" aria-label="Checklist">
                  {steps
                    .filter((s) => s.id !== "review")
                    .map((s) => {
                      const ok = Object.keys(validateStep(s.id)).length === 0;
                      return (
                        <li key={s.id} className={ok ? "is-ok" : "is-missing"}>
                          <button type="button" onClick={() => jumpToStep(s.id)}>
                            <span>
                              {ok ? (
                                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                              ) : (
                                <s.icon className="h-3.5 w-3.5" aria-hidden="true" />
                              )}
                              {s.title}
                            </span>
                            <span>{ok ? "Edit" : "Fix"}</span>
                          </button>
                        </li>
                      );
                    })}
                </ul>
                <dl className="marketplace-review-list">
                  <ReviewRow
                    icon={HandCoins}
                    label="Selling as"
                    value={entityType === "business" ? "Business" : "Freelancer"}
                    onJump={() => jumpToStep("type")}
                  />
                  <ReviewRow
                    icon={UserRound}
                    label="Legal name"
                    value={legalName.trim()}
                    onJump={() => jumpToStep("profile")}
                  />
                  <ReviewRow
                    icon={FileBadge}
                    label={entityType === "business" ? "Trading name" : "Display name"}
                    value={businessName.trim() || legalName.trim()}
                    onJump={() => jumpToStep("profile")}
                  />
                  <ReviewRow
                    icon={Phone}
                    label="Phone"
                    value={phone.trim()}
                    onJump={() => jumpToStep("profile")}
                  />
                  <ReviewRow
                    icon={Home}
                    label="Home"
                    value={formatAddress(homeAddress)}
                    onJump={() => jumpToStep("profile")}
                  />
                  <ReviewRow
                    icon={IdCard}
                    label="IDs"
                    value={
                      [idKind1, idKind2]
                        .filter((k): k is IdentityDocKind => Boolean(k))
                        .map((k) => IDENTITY_DOC_LABELS[k])
                        .join(" · ") || "—"
                    }
                    onJump={() => jumpToStep("identity")}
                  />
                  <ReviewRow
                    icon={Check}
                    label="Files"
                    value={`${[idDoc1, idDoc1Back, idDoc2, idDoc2Back, proofAddress, bizReg, bizAddressProof].filter((d) => d.bunnyPath).length} uploaded`}
                    onJump={() => jumpToStep("address")}
                  />
                  {entityType === "business" ? (
                    <>
                      <ReviewRow
                        icon={Building2}
                        label="Business"
                        value={BUSINESS_TYPE_LABELS[businessType]}
                        onJump={() => jumpToStep("business")}
                      />
                      <ReviewRow
                        icon={MapPin}
                        label="Biz address"
                        value={formatAddress(bizAddress)}
                        onJump={() => jumpToStep("business")}
                      />
                    </>
                  ) : null}
                </dl>
              </div>
            ) : null}

            <div className="marketplace-apply-nav">
              {!isFirst ? (
                <button type="button" disabled={busy || uploading} onClick={goBack}>
                  <ArrowLeft aria-hidden="true" />
                  Back
                </button>
              ) : null}
              {isLast ? (
                <button
                  type="button"
                  className="is-primary"
                  disabled={busy || uploading}
                  onClick={() => void handleSubmit()}
                >
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  Submit
                </button>
              ) : (
                <button
                  type="button"
                  className="is-primary"
                  disabled={busy || uploading}
                  onClick={goNext}
                >
                  {uploading ? <Loader2 className="animate-spin" /> : null}
                  Continue
                  {!uploading ? <ArrowRight aria-hidden="true" /> : null}
                </button>
              )}
            </div>
          </div>

          {showDraftCue ? (
            <div className="marketplace-draft-cue">
              <p>Draft restored — continue where you left off.</p>
              <div className="marketplace-draft-cue-actions">
                <button type="button" onClick={() => setShowDraftCue(false)}>
                  Continue
                </button>
                <button type="button" onClick={handleClearDraft}>
                  Clear draft
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
