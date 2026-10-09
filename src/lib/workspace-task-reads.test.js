import { describe, expect, test, mock } from "bun:test";

const rpc = mock(async () => ({ data: "2026-10-09T12:00:00Z", error: null as Error | null }));
mock.module("@/lib/supabase-external", () => ({ supabase: { rpc } }));
const { taskReadTime, confirmWorkspaceRead } = await import("./workspace-task-reads");

describe("workspace read confirmation", () => {
  test("an unconfirmed task stays unread even when another task is confirmed", () => {
    expect(taskReadTime([{ task_id: "other", assignment_id: null, read_at: "2026-10-09T12:00:00Z" }], "task", "received")).toBeNull();
  });
  test("confirmation is separate for board tasks and internal assignments", () => {
    const rows = [{ task_id: null, assignment_id: "received", read_at: "2026-10-09T12:00:00Z" }];
    expect(taskReadTime(rows, "task", "received")).toBeNull();
    expect(taskReadTime(rows, "assignment", "received")).toBe("2026-10-09T12:00:00Z");
  });
  test("explicit confirmation calls recipient-validated persistence", async () => {
    expect(await confirmWorkspaceRead("assignment", "received")).toBe("2026-10-09T12:00:00Z");
    expect(rpc).toHaveBeenCalledWith("acknowledge_workspace_task", { p_kind: "assignment", p_id: "received" });
  });
  test("failed persistence is not treated as a successful confirmation", async () => {
    rpc.mockResolvedValueOnce({ data: "", error: new Error("Tugas bukan untuk kamu") });
    await expect(confirmWorkspaceRead("task", "someone-elses-task")).rejects.toThrow("Tugas bukan untuk kamu");
  });
});