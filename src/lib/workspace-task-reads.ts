import { supabase } from "@/lib/supabase-external";

export type WorkspaceRead = {
  task_id: string | null;
  assignment_id: string | null;
  read_at: string;
};
export type WorkspaceTaskKind = "task" | "assignment";

export function taskReadTime(rows: WorkspaceRead[], kind: WorkspaceTaskKind, id: string) {
  return rows.find((row) => (kind === "task" ? row.task_id : row.assignment_id) === id)?.read_at ?? null;
}

export async function fetchWorkspaceReads(memberId: string): Promise<WorkspaceRead[]> {
  const { data, error } = await supabase.from("workspace_task_reads")
    .select("task_id,assignment_id,read_at").eq("member_id", memberId);
  if (error) throw error;
  return data ?? [];
}

export async function confirmWorkspaceRead(kind: WorkspaceTaskKind, id: string) {
  const { data, error } = await supabase.rpc("acknowledge_workspace_task", { p_kind: kind, p_id: id });
  if (error) throw error;
  return data;
}