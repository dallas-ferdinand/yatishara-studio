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
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState("");
  const [busy, setBusy] = useState(false);
  const customRef = useRef<HTMLInputElement | null>(null);

  const isPending = question.status === "pending";
  const current = items[index];
  const currentDraft = current ? drafts[current.id] : undefined;
  const allAnswered =
    items.length > 0 && items.every((item) => draftFilled(drafts[item.id]));

  useEffect(() => {
    if (!current) return;
    const draft = drafts[current.id];
    if (draft?.customText && !draft.optionId) {
      setCustomMode(true);
      setCustomText(draft.customText);
      return;
    }
    setCustomMode(false);
    setCustomText("");
    // Only re-sync when changing question — not while typing a new custom answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, current?.id]);

  useEffect(() => {
    if (customMode) customRef.current?.focus();
  }, [customMode, index]);

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
    setCustomMode(false);
    setCustomText("");
    await applyAnswer({
      questionId: current!.id,
      optionId: option.id,
      optionLabel: option.label,
    });
  }

  function openCustom() {
    if (!current || busy) return;
    setCustomMode(true);
    setCustomText(currentDraft?.customText || "");
  }

  async function commitCustom(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !current) return;
    await applyAnswer({
      questionId: current.id,
      customText: trimmed,
      optionLabel: trimmed,
    });
  }

  async function handleNext() {
    if (!current || busy) return;
    if (customMode && customText.trim()) {
      const wasAnswered = draftFilled(drafts[current.id]);
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
        // Explicit Next: always move forward once answered
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

  const canNext =
    draftFilled(currentDraft) ||
    (customMode && Boolean(customText.trim()));
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

      <p className="studio-agent-ask-prompt">{current.prompt}</p>

      <div className="studio-agent-ask-options">
        {current.options.map((opt) => {
          const selected =
            currentDraft?.optionId === opt.id && !currentDraft?.customText;
          return (
            <button
              key={opt.id}
              type="button"
              className={`studio-agent-ask-option${selected ? " is-selected" : ""}`}
              disabled={busy}
              onClick={() => void chooseOption(opt)}
            >
              {opt.label}
            </button>
          );
        })}
        {current.allowCustom !== false ? (
          customMode ? (
            <div className="studio-agent-ask-custom is-open">
              <input
                ref={customRef}
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Type your answer…"
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customText.trim()) {
                    e.preventDefault();
                    void commitCustom(customText);
                  }
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              className={`studio-agent-ask-option is-muted${currentDraft?.customText ? " is-selected" : ""}`}
              disabled={busy}
              onClick={openCustom}
            >
              {currentDraft?.customText
                ? currentDraft.customText
                : "Something else…"}
            </button>
          )
        ) : null}
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
