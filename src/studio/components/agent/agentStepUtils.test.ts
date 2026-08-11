import { describe, expect, it } from "vitest";
import { buildAgentTurns } from "./agentStepUtils";

describe("buildAgentTurns optimistic send", () => {
  it("does not blank the previous turn while the new user row is still syncing", () => {
    const turns = buildAgentTurns({
      messages: [
        {
          _id: "u1" as any,
          role: "user",
          content: "first",
          createdAt: 1,
        },
        {
          _id: "a1" as any,
          role: "assistant",
          content: "reply one with steps",
          createdAt: 2,
        },
      ],
      toolCalls: [
        {
          _id: "t1" as any,
          runId: "r1" as any,
          toolName: "studio_generate_image",
          argsJson: "{}",
          status: "completed",
          startedAt: 1,
          finishedAt: 2,
        },
      ],
      runs: [
        {
          _id: "r1" as any,
          status: "completed",
          createdAt: 1,
        } as any,
      ],
      approvals: [],
      busy: true,
      pendingUserText: "second message",
      pendingAttachments: [],
    });

    expect(turns).toHaveLength(2);
    expect(turns[0].userText).toBe("first");
    expect(turns[0].assistantText).toBe("reply one with steps");
    expect(turns[0].isLive).toBe(false);
    expect(turns[0].steps.length).toBeGreaterThan(0);
    expect(turns[1].id).toBe("pending-user");
    expect(turns[1].userText).toBe("second message");
    expect(turns[1].isLive).toBe(true);
  });

  it("keeps a pending bubble when repeating the same text as the prior turn", () => {
    const turns = buildAgentTurns({
      messages: [
        {
          _id: "u1" as any,
          role: "user",
          content: "ok",
          createdAt: 1,
        },
        {
          _id: "a1" as any,
          role: "assistant",
          content: "done",
          createdAt: 2,
        },
      ],
      toolCalls: [],
      runs: [{ _id: "r1" as any, status: "completed", createdAt: 1 } as any],
      approvals: [],
      busy: true,
      pendingUserText: "ok",
    });

    expect(turns).toHaveLength(2);
    expect(turns[0].assistantText).toBe("done");
    expect(turns[1].id).toBe("pending-user");
    expect(turns[1].userText).toBe("ok");
  });
});
