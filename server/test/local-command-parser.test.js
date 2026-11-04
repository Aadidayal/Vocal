import { describe, expect, it } from "vitest";
import { parseLocalCommand } from "../services/local-command-parser.js";

describe("local command fallback", () => {
  it("treats remind-me phrasing as task creation without scheduling a reminder", () => {
    const result = parseLocalCommand("remind me to have lunch after breakfast", [], "Asia/Kolkata");
    expect(result).toMatchObject({ intent: "CREATE_TASK", task: { title: "Have lunch after breakfast", duePrecision: "NONE" } });
  });
});
