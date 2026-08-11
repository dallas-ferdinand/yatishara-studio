"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Id } from "../../../../convex/_generated/dataModel";

export type AgentQuestionOption = { id: string; label: string };
export type AgentQuestionItem = {
  id: string;
  prompt: string;
  options: AgentQuestionOption[];
  allowCustom?: boolean;
};

export type AgentQuestionRow = {
  _id: Id<"agentQuestions">;
  threadId: Id<"agentThreads">;
  intro?: string;
  questionsJson: string;
  answersJson?: string;
  status: "pending" | "answered" | "cancelled";
};

type AnswerDraft = {
  questionId: string;
  optionId?: string;
  optionLabel?: string;
  customText?: string;
};

type AgentQuestionStepProps = {
  question: AgentQuestionRow;
  onAnswer: (
    questionId: Id<"agentQuestions">,
    answers: AnswerDraft[],
  ) => Promise<void> | void;
};

function parseQuestions(raw: string): AgentQuestionItem[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const id = String(row.id || "").trim();
        const prompt = String(row.prompt || "").trim();
        const options = Array.isArray(row.options)
          ? row.options
              .map((opt: unknown, index: number) => {
                if (typeof opt === "string") {
                  return { id: `o${index + 1}`, label: opt };
                }
                if (!opt || typeof opt !== "object") return null;
                const o = opt as Record<string, unknown>;
                const oid = String(o.id || `o${index + 1}`);
                const label = String(o.label || "").trim();
                return label ? { id: oid, label } : null;
              })
              .filter(Boolean)
          : [];
        if (!id || !prompt) return null;
        return {
          id,
          prompt,
          options: options as AgentQuestionOption[],
          allowCustom: row.allowCustom !== false,
        };
      })
      .filter(Boolean) as AgentQuestionItem[];
  } catch {
    return [];
  }
}

function shortTitle(prompt: string, index: number) {
  const cleaned = prompt
    .replace(/\?+$/g, "")
    .replace(/^(what|which|how|where|when|who)\s+/i, "")
    .trim();
  if (!cleaned) return `Q${index + 1}`;
  if (cleaned.length <= 18) return cleaned;
  return `${cleaned.slice(0, 16)}…`;
}

function optionLetter(index: number) {
  if (index < 0) return "";
  if (index < 26) return String.fromCharCode(65 + index);
  return String(index + 1);
}

function draftFilled(draft?: AnswerDraft) {
  if (!draft) return false;
  return Boolean(draft.optionId || draft.customText?.trim());
}

export function AgentQuestionStep({ question, onAnswer }: AgentQuestionStepProps) {
  const items = useMemo(
    () => parseQuestions(question.questionsJson),
    [question.questionsJson],
  );
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>({});
  const [customText, setCustomText] = useState("");
  const [customFocused, setCustomFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const customRef = useRef<HTMLInputElement | null>(null);

  const isPending = question.status === "pending";
  const current = items[index];
  const currentDraft = current ? drafts[current.id] : undefined;
  const allAnswered =
    items.length > 0 && items.every((item) => draftFilled(drafts[item.id]));
  const customActive =
    customFocused ||
    Boolean(customText.trim()) ||
    Boolean(currentDraft?.customText && !currentDraft?.optionId);

  useEffect(() => {
    if (!current) return;
    const draft = drafts[current.id];
    if (draft?.customText && !draft.optionId) {
      setCustomText(draft.customText);
      return;
    }
    setCustomText("");
    setCustomFocused(false);
    // Only re-sync when changing question — not while typing a new custom answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, current?.id]);

  if (!items.length) return null;

  async function submitAll(merged: Record<string, AnswerDraft>) {
    setBusy(true);
    try {
      const answers = items.map((item) => merged[item.id]).filter(draftFilled);
      await onAnswer(question._id, answers);
    } finally {
      setBusy(false);
    }
  }

  function goTo(nextIndex: number) {
    if (nextIndex < 0 || nextIndex >= items.length || busy) return;
    setIndex(nextIndex);
  }

  async function applyAnswer(
    nextDraft: AnswerDraft,
    opts?: { autoAdvance?: boolean },
  ) {
    if (!current || !isPending || busy) return;
    const wasAnswered = draftFilled(drafts[current.id]);
    const merged = { ...drafts, [current.id]: nextDraft };
    setDrafts(merged);

    const shouldAuto =
      opts?.autoAdvance !== false && !wasAnswered && index < items.length - 1;
    if (shouldAuto) {
      setIndex(index + 1);
      return;
    }

    if (!wasAnswered && index === items.length - 1) {
      const complete = items.every((item) =>
        item.id === current.id ? true : draftFilled(merged[item.id]),
      );
      if (complete) await submitAll(merged);
    }
  }

  async function chooseOption(option: AgentQuestionOption) {
    setCustomText("");
    setCustomFocused(false);
    customRef.current?.blur();
    await applyAnswer({
      questionId: current!.id,
      optionId: option.id,
      optionLabel: option.label,
    });
  }

  async function commitCustom(text: string, opts?: { autoAdvance?: boolean }) {
    const trimmed = text.trim();
    if (!trimmed || !current) return;
    await applyAnswer(
      {
        questionId: current.id,
        customText: trimmed,
        optionLabel: trimmed,
      },
      opts,
    );
  }

  function onCustomChange(value: string) {
    setCustomText(value);
    if (!current) return;
    const trimmed = value.trim();
    if (!trimmed) {
      if (currentDraft?.customText && !currentDraft?.optionId) {
        const next = { ...drafts };
        delete next[current.id];
        setDrafts(next);
      }
      return;
    }
    setDrafts({
      ...drafts,
      [current.id]: {
        questionId: current.id,
        customText: trimmed,
        optionLabel: trimmed,
      },
    });
  }

  async function handleNext() {
    if (!current || busy) return;
    if (customText.trim()) {
      const merged = {
        ...drafts,
        [current.id]: {
          questionId: current.id,
          customText: customText.trim(),
          optionLabel: customText.trim(),
        },
      };
      setDrafts(merged);
      if (index < items.length - 1) {
        setIndex(index + 1);
        return;
      }
      if (items.every((item) => draftFilled(merged[item.id]))) {
        await submitAll(merged);
      }
      return;
    }
    if (!draftFilled(currentDraft)) return;
    if (index < items.length - 1) {
      setIndex(index + 1);
      return;
    }
    if (allAnswered) await submitAll(drafts);
  }

  if (!isPending) {
    let answers: AnswerDraft[] = [];
    try {
      answers = question.answersJson ? JSON.parse(question.answersJson) : [];
    } catch {
      answers = [];
    }
    return (
      <div className="studio-agent-ask-card is-done" role="listitem">
        <p className="studio-agent-ask-kicker">Answered</p>
        <ul className="studio-agent-ask-summary">
          {answers.map((ans) => (
            <li key={ans.questionId}>
              <span>{ans.optionLabel || ans.customText || "—"}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const canNext = draftFilled(currentDraft) || Boolean(customText.trim());
  const nextLabel =
    index >= items.length - 1 ? (allAnswered || canNext ? "Done" : "Done") : "Next";

  return (
    <div className="studio-agent-ask-card" role="listitem">
      {question.intro ? (
        <p className="studio-agent-ask-intro">{question.intro}</p>
      ) : null}

      <div className="studio-agent-ask-tabs" role="tablist" aria-label="Questions">
        {items.map((item, i) => {
          const answered = draftFilled(drafts[item.id]);
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              className={`studio-agent-ask-tab${i === index ? " is-active" : ""}${answered ? " is-answered" : ""}`}
              disabled={busy}
              title={item.prompt}
              onClick={() => goTo(i)}
            >
              {shortTitle(item.prompt, i)}
            </button>
          );
        })}
      </div>

      <div className="studio-agent-ask-body">
        <p className="studio-agent-ask-prompt">{current.prompt}</p>

        <div className="studio-agent-ask-options">
          {current.options.map((opt, optIndex) => {
            const selected =
              currentDraft?.optionId === opt.id && !currentDraft?.customText;
            const letter = optionLetter(optIndex);
            return (
              <button
                key={opt.id}
                type="button"
                className={`studio-agent-ask-option${selected ? " is-selected" : ""}`}
                disabled={busy}
                onClick={() => void chooseOption(opt)}
              >
                <span className="studio-agent-ask-option-letter" aria-hidden="true">
                  {letter}
                </span>
                <span className="studio-agent-ask-option-label">{opt.label}</span>
              </button>
            );
          })}
          {current.allowCustom !== false ? (
            <label
              className={`studio-agent-ask-option studio-agent-ask-custom is-muted${
                customActive ? " is-selected" : ""
              }`}
            >
              <span className="studio-agent-ask-option-letter" aria-hidden="true">
                {optionLetter(current.options.length)}
              </span>
              <input
                ref={customRef}
                value={customText}
                onChange={(e) => onCustomChange(e.target.value)}
                onFocus={() => setCustomFocused(true)}
                onBlur={() => setCustomFocused(false)}
                placeholder="Something else…"
                disabled={busy}
                aria-label="Something else"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customText.trim()) {
                    e.preventDefault();
                    void commitCustom(customText);
                  }
                }}
              />
            </label>
          ) : null}
        </div>
      </div>

      <div className="studio-agent-ask-nav">
        <button
          type="button"
          className="studio-agent-ask-nav-btn"
          disabled={busy || index <= 0}
          onClick={() => goTo(index - 1)}
        >
          <ChevronLeft size={14} strokeWidth={2.25} aria-hidden="true" />
          Back
        </button>
        <span className="studio-agent-ask-progress">
          {index + 1} / {items.length}
        </span>
        <button
          type="button"
          className="studio-agent-ask-nav-btn is-next"
          disabled={busy || !canNext}
          onClick={() => void handleNext()}
        >
          {nextLabel}
          {index < items.length - 1 ? (
            <ChevronRight size={14} strokeWidth={2.25} aria-hidden="true" />
          ) : null}
        </button>
      </div>
    </div>
  );
}
