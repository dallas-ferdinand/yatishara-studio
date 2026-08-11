"use client";

import { useMemo, useState } from "react";
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

export function AgentQuestionStep({ question, onAnswer }: AgentQuestionStepProps) {
  const items = useMemo(
    () => parseQuestions(question.questionsJson),
    [question.questionsJson],
  );
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>({});
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState("");
  const [busy, setBusy] = useState(false);

  const isPending = question.status === "pending";
  const current = items[index];
  const progress = items.length ? `${index + 1} / ${items.length}` : "";

  if (!items.length) return null;

  async function choose(option?: AgentQuestionOption, custom?: string) {
    if (!current || !isPending || busy) return;
    const nextDraft: AnswerDraft = {
      questionId: current.id,
      optionId: option?.id,
      optionLabel: option?.label,
      customText: custom?.trim() || undefined,
    };
    const merged = { ...drafts, [current.id]: nextDraft };
    setDrafts(merged);
    setCustomOpen(false);
    setCustomText("");

    if (index < items.length - 1) {
      setIndex(index + 1);
      return;
    }

    setBusy(true);
    try {
      const answers = items.map((item) => merged[item.id]).filter(Boolean);
      await onAnswer(question._id, answers);
    } finally {
      setBusy(false);
    }
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

  return (
    <div className="studio-agent-ask-card" role="listitem">
      <div className="studio-agent-ask-head">
        <p className="studio-agent-ask-kicker">Quick question</p>
        <p className="studio-agent-ask-progress">{progress}</p>
      </div>
      {question.intro && index === 0 ? (
        <p className="studio-agent-ask-intro">{question.intro}</p>
      ) : null}
      <p className="studio-agent-ask-prompt">{current.prompt}</p>
      <div className="studio-agent-ask-options">
        {current.options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className="studio-agent-ask-option"
            disabled={busy}
            onClick={() => void choose(opt)}
          >
            {opt.label}
          </button>
        ))}
        {current.allowCustom !== false ? (
          customOpen ? (
            <div className="studio-agent-ask-custom">
              <input
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Your answer"
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customText.trim()) {
                    e.preventDefault();
                    void choose(undefined, customText);
                  }
                }}
              />
              <button
                type="button"
                className="studio-agent-ask-option is-primary"
                disabled={busy || !customText.trim()}
                onClick={() => void choose(undefined, customText)}
              >
                {index < items.length - 1 ? "Next" : "Continue"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="studio-agent-ask-option is-muted"
              disabled={busy}
              onClick={() => setCustomOpen(true)}
            >
              Something else…
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}
