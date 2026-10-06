import { useQuery } from "@tanstack/react-query";
import {
  AlignLeft,
  Briefcase,
  Calendar,
  Clock,
  Flag,
  GitBranch,
  Link2,
  Lock,
  Network,
  Target,
  UserCheck,
  UserRound,
} from "lucide-react";
import { supabase } from "@/lib/supabase-external";
import {
  PRIORITY_CLASS,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  formatDateID,
} from "@/lib/workspace";
import { originChip, type OriginMaps } from "@/lib/task-origin";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { MyTask } from "@/lib/workspace";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as unknown as { from: (table: string) => any };

function isUrl(text: string) {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

function StatusPill({ task }: { task: MyTask }) {
  const cls =
    task.status === "Done"
      ? "bg-emerald-100 text-emerald-700"
      : task.status === "Blocked"
        ? "bg-red-100 text-red-700"
        : task.status === "In_Progress"
          ? "bg-blue-100 text-blue-700"
          : "bg-muted text-muted-foreground";
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", cls)}>
      {TASK_STATUS_LABEL[task.status] ?? task.status}
    </span>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" /> {title}
      </p>
      {children}
    </div>
  );
}

type RelatedNames = {
  keyResult: string | null;
  event: string | null;
  deal: string | null;
  blockedBy: string | null;
};

export function TaskDetailDialog({
  task,
  maps,
  open,
  onOpenChange,
}: {
  task: MyTask | null;
  maps?: OriginMaps | undefined;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const enabled = open && !!task;

  const { data: names, isLoading } = useQuery({
    queryKey: ["task-detail-names", task?.id],
    queryFn: async (): Promise<RelatedNames> => {
      if (!task) {
        return { keyResult: null, event: null, deal: null, blockedBy: null };
      }
      const [kr, ev, deal, blocker] = await Promise.all([
        task.key_result_id
          ? db.from("key_results").select("title").eq("id", task.key_result_id).maybeSingle()
          : Promise.resolve({ data: null }),
        task.related_event_id
          ? db.from("events").select("name").eq("id", task.related_event_id).maybeSingle()
          : Promise.resolve({ data: null }),
        task.related_deal_id
          ? db.from("deals").select("name").eq("id", task.related_deal_id).maybeSingle()
          : Promise.resolve({ data: null }),
        task.blocked_by_person_id
          ? db
              .from("profiles")
              .select("full_name")
              .eq("id", task.blocked_by_person_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return {
        keyResult: kr?.data?.title ?? null,
        event: ev?.data?.name ?? null,
        deal: deal?.data?.name ?? null,
        blockedBy: blocker?.data?.full_name ?? null,
      };
    },
    enabled,
  });

  const overdue =
    task?.due_date && task.status !== "Done" && task.status !== "Cancelled"
      ? new Date(task.due_date) < new Date(new Date().setHours(0, 0, 0, 0))
      : false;
  const chip = task ? originChip(task, maps) : null;
  const creator = task?.created_by ? maps?.people[task.created_by] : undefined;
  const note = task?.origin_note?.trim() ?? "";
  const noteIsUrl = isUrl(note);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        {task ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-left leading-snug">{task.title}</DialogTitle>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <StatusPill task={task} />
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                    PRIORITY_CLASS[task.priority] ?? PRIORITY_CLASS["Medium"],
                  )}
                >
                  Prioritas {TASK_PRIORITY_LABEL[task.priority] ?? task.priority}
                </span>
                {task.is_private && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    <Lock className="size-3" /> Privat
                  </span>
                )}
              </div>
            </DialogHeader>

            <div className="grid gap-2 rounded-xl bg-muted/50 p-3 text-sm sm:grid-cols-2">
              <p className="flex items-center gap-1.5">
                <Calendar className="size-4 shrink-0 text-muted-foreground" />
                {task.due_date ? (
                  <span className={overdue ? "font-semibold text-red-600" : undefined}>
                    {overdue ? "Nunggak: " : "Tenggat: "}
                    {formatDateID(task.due_date)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Tanpa tenggat</span>
                )}
              </p>
              <p className="flex items-center gap-1.5">
                <Clock className="size-4 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {task.completed_at
                    ? `Selesai ${formatDateID(task.completed_at.slice(0, 10))}`
                    : task.created_at
                      ? `Dibuat ${formatDateID(task.created_at.slice(0, 10))}`
                      : "—"}
                </span>
              </p>
            </div>

            <Section icon={AlignLeft} title="Isi tugas">
              {task.description?.trim() ? (
                <p className="whitespace-pre-wrap rounded-xl border bg-card p-3 text-sm leading-relaxed">
                  {task.description}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Tidak ada deskripsi tambahan.</p>
              )}
            </Section>

            <Section icon={Network} title="Rantai komando">
              <div className="space-y-2 rounded-xl border bg-card p-3 text-sm">
                <p className="flex items-start gap-2">
                  {chip || creator ? (
                    <UserRound className="mt-0.5 size-4 shrink-0 text-primary" />
                  ) : (
                    <Flag className="mt-0.5 size-4 shrink-0 text-primary" />
                  )}
                  <span>
                    <span className="text-muted-foreground">Pemberi tugas: </span>
                    {creator ? (
                      <>
                        <span className="font-medium">{creator.full_name}</span>
                        {creator.role ? (
                          <span className="text-muted-foreground"> ({creator.role})</span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {chip && <span className="block text-xs text-muted-foreground">{chip.label}</span>}
                  </span>
                </p>
                <div className="ml-2 h-3 w-px bg-border" />
                <p className="flex items-start gap-2">
                  <UserCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>
                    <span className="text-muted-foreground">Pelaksana: </span>
                    <span className="font-medium">Anda</span>
                  </span>
                </p>
                {task.status === "Blocked" && (
                  <>
                    <div className="ml-2 h-3 w-px bg-border" />
                    <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                      Terhambat{names?.blockedBy ? ` (dilaporkan oleh ${names.blockedBy})` : ""}
                      {task.blocked_reason ? `: ${task.blocked_reason}` : ""}
                    </p>
                  </>
                )}
              </div>
            </Section>

            {(names?.keyResult || names?.event || names?.deal || noteIsUrl || note) && (
              <Section icon={GitBranch} title="Terkait & tautan">
                <div className="space-y-2 rounded-xl border bg-card p-3 text-sm">
                  {names?.keyResult && (
                    <p className="flex items-center gap-2">
                      <Target className="size-4 shrink-0 text-primary" />
                      <span>
                        <span className="text-muted-foreground">Key Result: </span>
                        {names.keyResult}
                      </span>
                    </p>
                  )}
                  {names?.event && (
                    <p className="flex items-center gap-2">
                      <Calendar className="size-4 shrink-0 text-primary" />
                      <span>
                        <span className="text-muted-foreground">Event: </span>
                        {names.event}
                      </span>
                    </p>
                  )}
                  {names?.deal && (
                    <p className="flex items-center gap-2">
                      <Briefcase className="size-4 shrink-0 text-primary" />
                      <span>
                        <span className="text-muted-foreground">Deal: </span>
                        {names.deal}
                      </span>
                    </p>
                  )}
                  {note &&
                    (noteIsUrl ? (
                      <a
                        href={note}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-full items-center gap-1.5 break-all font-medium text-primary hover:underline"
                      >
                        <Link2 className="size-4 shrink-0" />
                        {note}
                      </a>
                    ) : (
                      <p className="flex items-start gap-2">
                        <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span className="text-muted-foreground">{note}</span>
                      </p>
                    ))}
                  {!names?.keyResult && !names?.event && !names?.deal && !note && isLoading && (
                    <Skeleton className="h-4 w-40" />
                  )}
                </div>
              </Section>
            )}

            <Separator />
            <p className="text-center text-xs text-muted-foreground">
              Untuk memindahkan status task, tarik kartunya di papan atau lepaskan ke kolom lain.
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
