import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, CheckCircle2, ChevronDown, ChevronUp, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDivisions, useProfiles, type Profile } from "@/hooks/useProfile";
import { uploadSubmissionFile } from "@/lib/assignments";
import {
  assignmentProgress,
  cancelByMember,
  cancelByMemberWithoutSubmission,
  fetchEscalationsFor,
  fetchInternalAssignmentsForMe,
  fetchMyInternalSubmissions,
  submitInternalWork,
  type InternalAssignment,
  type InternalSubmission,
} from "@/lib/internal-assignments";
import { ReceivedTaskCard } from "./ReceivedTaskCard";
import { HistoryTaskRow } from "./HistoryTaskRow";
import { CancelReasonDialog } from "./CancelReasonDialog";

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
      <p className="text-sm text-muted-foreground">Gagal memuat data tugas.</p>
      <Button className="mt-3" variant="outline" size="sm" onClick={onRetry}>
        Coba lagi
      </Button>
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  count,
  hint,
}: {
  icon: React.ElementType;
  title: string;
  count: number;
  hint?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight">
          {title} <span className="text-muted-foreground">({count})</span>
        </h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

const timeOf = (value?: string | null) => {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
};

/** Tenggat paling cepat dulu; tugas tanpa tenggat paling akhir. */
function byUrgency(a: InternalAssignment, b: InternalAssignment) {
  const da = timeOf(a?.due_date) ?? Number.POSITIVE_INFINITY;
  const db = timeOf(b?.due_date) ?? Number.POSITIVE_INFINITY;
  if (da !== db) return da - db;
  return (timeOf(b?.created_at) ?? 0) - (timeOf(a?.created_at) ?? 0);
}

/** Yang paling baru selesai/dibatalkan paling atas. */
function byLatest(
  a: InternalAssignment,
  b: InternalAssignment,
  submissionOf: (id: string) => InternalSubmission | undefined,
  mode: "done" | "cancelled",
) {
  const stampOf = (a: InternalAssignment) => {
    const s = submissionOf(a.id);
    if (mode === "done") {
      return timeOf(s?.finalized_at) ?? timeOf(s?.submitted_at) ?? timeOf(a?.due_date) ?? 0;
    }
    return (
      timeOf(a?.cancelled_at) ??
      timeOf(s?.member_cancelled_at) ??
      timeOf(s?.submitted_at) ??
      timeOf(a?.created_at) ??
      0
    );
  };
  return stampOf(b) - stampOf(a);
}

export function AssignedToMeTab({ me }: { me: Profile | null | undefined }) {
  const queryClient = useQueryClient();
  const { data: profiles = [] } = useProfiles();
  const { data: divisions = [] } = useDivisions();
  const [cancelTarget, setCancelTarget] = useState<{
    assignmentId: string;
    submissionId: string | null;
  } | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);

  const assignmentsQuery = useQuery({
    queryKey: ["internal-assignments-for-me", me?.id, me?.division],
    queryFn: () =>
      fetchInternalAssignmentsForMe({ id: me?.id as string, division: me?.division ?? null }),
    enabled: !!me?.id,
    refetchInterval: 45_000,
  });

  const submissionsQuery = useQuery({
    queryKey: ["internal-my-submissions", me?.id],
    queryFn: () => fetchMyInternalSubmissions(me?.id as string),
    enabled: !!me?.id,
  });

  const assignments = useMemo(
    () => (assignmentsQuery.data ?? []) as InternalAssignment[],
    [assignmentsQuery.data],
  );
  const submissions = useMemo(
    () => (submissionsQuery.data ?? []) as InternalSubmission[],
    [submissionsQuery.data],
  );

  const submissionByAssignment = useMemo(() => {
    const map = new Map<string, InternalSubmission>();
    (submissions ?? []).forEach((s) => {
      if (s?.assignment_id) map.set(s.assignment_id, s);
    });
    return map;
  }, [submissions]);

  const relevantSubmissionIds = useMemo(
    () =>
      (assignments ?? [])
        .map((a) => submissionByAssignment.get(a.id)?.id)
        .filter((v): v is string => !!v),
    [assignments, submissionByAssignment],
  );

  const { data: escalations = [] } = useQuery({
    queryKey: ["internal-escalations", relevantSubmissionIds.join(",")],
    queryFn: () => fetchEscalationsFor(relevantSubmissionIds),
    enabled: relevantSubmissionIds.length > 0,
  });

  const divisionNameOf = (code?: string | null) =>
    (divisions ?? []).find((d) => d?.code === code)?.name ?? code ?? "-";

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["internal-assignments-for-me"] });
    queryClient.invalidateQueries({ queryKey: ["internal-my-submissions"] });
    queryClient.invalidateQueries({ queryKey: ["internal-escalations"] });
  }

  const submitMutation = useMutation({
    mutationFn: async (vars: {
      assignmentId: string;
      content: string | null;
      file: File | null;
    }) => {
      let fileUrl: string | null = null;
      if (vars.file) fileUrl = await uploadSubmissionFile(vars.file, me?.id as string);
      await submitInternalWork({
        assignmentId: vars.assignmentId,
        memberId: me?.id as string,
        content: vars.content,
        fileUrl,
      });
    },
    onSuccess: () => {
      toast.success("Pekerjaan berhasil dikumpulkan.");
      refresh();
    },
    onError: (e: Error) => toast.error(e?.message || "Gagal mengumpulkan."),
  });

  const cancelMutation = useMutation({
    mutationFn: async (reason: string) => {
      if (!cancelTarget) return;
      if (cancelTarget.submissionId) {
        await cancelByMember(cancelTarget.submissionId, reason);
      } else {
        await cancelByMemberWithoutSubmission({
          assignmentId: cancelTarget.assignmentId,
          memberId: me?.id as string,
          reason,
        });
      }
    },
    onSuccess: () => {
      toast.success("Tugas dibatalkan.");
      setCancelTarget(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e?.message || "Gagal membatalkan tugas."),
  });

  if (assignmentsQuery.isError || submissionsQuery.isError) {
    return (
      <ErrorState
        onRetry={() => {
          assignmentsQuery.refetch();
          submissionsQuery.refetch();
        }}
      />
    );
  }

  if (assignmentsQuery.isLoading || submissionsQuery.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-2xl" />
        ))}
      </div>
    );
  }

  const submissionOf = (id: string) => submissionByAssignment.get(id);

  /**
   * "Belum Dikerjakan" = belum dikumpulkan atau sudah dikirim tapi belum
   * disetujui. "Sudah Selesai" = sudah disetujui. Yang dibatalkan dipisah.
   */
  const progressOf = (a: InternalAssignment) => assignmentProgress(a, submissionOf(a.id));

  const pending = (assignments ?? [])
    .filter((a) => progressOf(a) === "pending")
    .sort(byUrgency);
  const done = (assignments ?? [])
    .filter((a) => progressOf(a) === "done")
    .sort((a, b) => byLatest(a, b, submissionOf, "done"));
  const cancelled = (assignments ?? [])
    .filter((a) => progressOf(a) === "cancelled")
    .sort((a, b) => byLatest(a, b, submissionOf, "cancelled"));

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <SectionHeading
          icon={ClipboardList}
          title="Belum Dikerjakan"
          count={pending.length}
          hint="Tenggat paling dekat ditampilkan lebih dulu."
        />
        {pending.length === 0 ? (
          <p className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground shadow-sm">
            Tidak ada tugas yang perlu dikerjakan saat ini.
          </p>
        ) : (
          pending.map((a) => {
            const sub = submissionOf(a.id);
            return (
              <ReceivedTaskCard
                key={a.id}
                assignment={a}
                submission={sub}
                escalations={(escalations ?? []).filter((e) => e?.submission_id === sub?.id)}
                assigner={(profiles ?? []).find((p) => p?.id === a?.created_by)}
                profiles={profiles ?? []}
                divisionNameOf={divisionNameOf}
                submitting={submitMutation.isPending}
                onSubmitWork={({ content, file }) =>
                  submitMutation.mutate({ assignmentId: a.id, content, file })
                }
                onCancel={() =>
                  setCancelTarget({ assignmentId: a.id, submissionId: sub?.id ?? null })
                }
              />
            );
          })
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading
          icon={CheckCircle2}
          title="Sudah Selesai"
          count={done.length}
          hint="Tugas yang kamu kumpulkan dan sudah disetujui."
        />
        {done.length === 0 ? (
          <p className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground shadow-sm">
            Belum ada tugas yang selesai.
          </p>
        ) : (
          <div className="space-y-2">
            {done.map((a) => (
              <HistoryTaskRow key={a.id} assignment={a} submission={submissionOf(a.id)} />
            ))}
          </div>
        )}
      </section>

      {cancelled.length > 0 && (
        <section className="space-y-2">
          <button
            className="flex w-full items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:bg-accent"
            onClick={() => setShowCancelled((v) => !v)}
            aria-expanded={showCancelled}
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                <Ban className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold tracking-tight">
                  Dibatalkan{" "}
                  <span className="text-muted-foreground">({cancelled.length})</span>
                </span>
                <span className="block text-xs text-muted-foreground">
                  Tugas yang dibatalkan pembuat atau kamu batalkan.
                </span>
              </span>
            </span>
            {showCancelled ? (
              <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            )}
          </button>
          {showCancelled && (
            <div className="space-y-2">
              {cancelled.map((a) => (
                <HistoryTaskRow key={a.id} assignment={a} submission={submissionOf(a.id)} />
              ))}
            </div>
          )}
        </section>
      )}

      <CancelReasonDialog
        open={!!cancelTarget}
        onOpenChange={(o) => !o && setCancelTarget(null)}
        title="Batalkan tugas ini?"
        info="Aksi ini tidak dapat dibatalkan. Assigner dan atasan akan menerima notifikasi berisi alasan kamu."
        confirmLabel="Ya, batalkan tugas"
        submitting={cancelMutation.isPending}
        onSubmit={(reason) => cancelMutation.mutate(reason)}
      />
    </div>
  );
}
