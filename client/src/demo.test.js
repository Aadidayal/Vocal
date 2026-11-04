import { describe, expect, it } from "vitest";
import { parseCommand } from "./pages/DemoPage.jsx";

describe("isolated demo local command parser", () => {
  it("parses create and priority", () => expect(parseCommand("Add a high priority task to prepare the demo tomorrow", [])).toMatchObject({ action: "CREATE_TASK", priority: "HIGH" }));
  it("parses listing and task lifecycle by exact title", () => {
    const tasks = [{ title: "Send the project update" }];
    expect(parseCommand("Show my tasks", tasks).action).toBe("LIST_TASKS");
    expect(parseCommand("Mark the project update complete", tasks)).toMatchObject({ action: "COMPLETE_TASK", target: "send the project update" });
    expect(parseCommand("Reopen the project update", tasks).action).toBe("REOPEN_TASK");
  });
  it("does not guess ambiguous or unsupported commands", () => {
    expect(parseCommand("complete it", [{ title: "One" }, { title: "Two" }])).toBeNull();
    expect(parseCommand("write a poem", [])).toBeNull();
  });
});
