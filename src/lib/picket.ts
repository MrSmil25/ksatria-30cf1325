import { supabase } from "@/lib/supabase-external";
import { resolveDocUrl, uploadDocument } from "@/lib/fund-requests";

export type PicketTask = {
  id: string;
  title: string;
  description: string | null;
  week_start: string;
  deadline: string;
  quota: number;
  created_by: string | null;
};
export type PicketSignup = {
  id: string;
  task_id: string;
  member_id: string;
  status: "Diambil" | "Dikumpulkan" | "Disetujui" | "Ditolak";
  before_url: string | null;
  after_url: string | null;
  note: string | null;
  submitted_at: string | null;
  review_note: string | null;
};
export type PicketFine = {
  id: string;
  member_id: string;
  week_start: string;
  amount: number;
  reason: string | null;
  status: "Didenda" | "Dibatalkan";
  created_at: string;
};

/** Senin dari minggu tanggal tertentu, format YYYY-MM-DD (waktu lokal). */
export function weekStartOf(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return toISODate(x);
}
export function toISODate(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
export function shiftWeek(week: string, delta: number) {
  const [y = 1970, m = 1, d = 1] = week.split("-").map(Number);
  return toISODate(new Date(y, m - 1, d + delta * 7));
}

export async function fetchIsPicketManager(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_picket_manager");
  if (error) throw error;
  return Boolean(data);
}

export async function fetchPicketManagers(): Promise<string[]> {
  const { data, error } = await supabase.from("picket_managers").select("user_id");
  if (error) throw error;
  return (data ?? []).map((r) => r.user_id);
}
export async function addPicketManager(userId: string, addedBy: string) {
  const { error } = await supabase
    .from("picket_managers")
    .insert({ user_id: userId, added_by: addedBy });
  if (error) throw error;
}
export async function removePicketManager(userId: string) {
  const { error } = await supabase.from("picket_managers").delete().eq("user_id", userId);
  if (error) throw error;
}

export async function fetchPicketWeek(week: string) {
  const { data: tasks, error } = await supabase
    .from("picket_tasks")
    .select("*")
    .eq("week_start", week)
    .order("deadline");
  if (error) throw error;
  const ids = (tasks ?? []).map((t) => t.id);
  let signups: PicketSignup[] = [];
  if (ids.length) {
    const { data, error: e2 } = await supabase
      .from("picket_signups")
      .select("*")
      .in("task_id", ids)
      .order("created_at");
    if (e2) throw e2;
    signups = (data ?? []) as PicketSignup[];
  }
  return { tasks: (tasks ?? []) as PicketTask[], signups };
}

export async function createPicketTask(input: {
  title: string;
  description: string | null;
  week_start: string;
  deadline: string;
  quota: number;
}) {
  const { error } = await supabase.from("picket_tasks").insert(input);
  if (error) throw error;
}
export async function deletePicketTask(id: string) {
  const { error } = await supabase.from("picket_tasks").delete().eq("id", id);
  if (error) throw error;
}

export async function takePicket(taskId: string, memberId: string) {
  const { error } = await supabase
    .from("picket_signups")
    .insert({ task_id: taskId, member_id: memberId });
  if (error) throw error;
}
export async function cancelPicket(signupId: string) {
  const { error } = await supabase.from("picket_signups").delete().eq("id", signupId);
  if (error) throw error;
}
export async function submitPicketProof(
  signupId: string,
  before: File,
  after: File,
  note: string | null,
) {
  const [beforePath, afterPath] = await Promise.all([
    uploadDocument(before, "picket"),
    uploadDocument(after, "picket"),
  ]);
  const { error } = await supabase
    .from("picket_signups")
    .update({
      before_url: beforePath,
      after_url: afterPath,
      note,
      status: "Dikumpulkan",
      submitted_at: new Date().toISOString(),
    })
    .eq("id", signupId);
  if (error) throw error;
}
export async function reviewPicket(
  signupId: string,
  reviewerId: string,
  status: "Disetujui" | "Ditolak",
  note: string | null,
) {
  const { error } = await supabase
    .from("picket_signups")
    .update({
      status,
      review_note: note,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", signupId);
  if (error) throw error;
}

export async function fetchPicketFines(week: string): Promise<PicketFine[]> {
  const { data, error } = await supabase
    .from("picket_fines")
    .select("*")
    .eq("week_start", week)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PicketFine[];
}
export async function givePicketFine(member: string, week: string, amount: number, reason: string) {
  const { error } = await supabase.rpc("give_picket_fine", {
    p_member: member,
    p_week: week,
    p_amount: amount,
    p_reason: reason,
  });
  if (error) throw error;
}
export async function cancelPicketFine(fineId: string) {
  const { error } = await supabase.rpc("cancel_picket_fine", { p_fine: fineId });
  if (error) throw error;
}

export async function openPicketProof(path: string | null) {
  const url = await resolveDocUrl(path);
  if (url) window.open(url, "_blank", "noopener");
}
