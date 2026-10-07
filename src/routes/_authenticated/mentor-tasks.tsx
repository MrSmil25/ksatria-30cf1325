import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ChangeEvent } from "react";
import { GraduationCap, Lock, Paperclip, Users } from "lucide-react";
import { toast } from "sonner";
import { format, isBefore } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMyProfile } from "@/hooks/useProfile";
import { useMyAssignments, useMySubmissions } from "@/hooks/useAssignments";
import { supabase } from "@/lib/supabase-external";
import { UserAvatar } from "@/components/UserAvatar";
import {
  fetchPeerSubmissions,
  signedFileUrl,
  uploadSubmissionFile,
  upsertSubmission,
  visibilityHint,
  type Assignment,
  type AssignmentSubmission,
} from "@/lib/assignments";

type WorkResultRow = {
  id: string;
  submitted_at: string | null;
  content: string | null;
  file_url: string | null;
  member: { full_name: string; photo_url: string | null } | null;
  assignment: { title: string } | null;
};

/** Hasil kerja seluruh anggota pada tugas Pembina, dikelompokkan per orang (A–Z). */
function WorkResultsSection() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["work-results-mentor"],
    queryFn: async (): Promise<WorkResultRow[]> => {
      const { data, error } = await supabase
        .from("assignment_submissions")
        .select(
          "id,submitted_at,content,file_url,member:profiles!assignment_submissions_member_id_fkey(full_name,photo_url),assignment:assignments(title)",
        )
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as WorkResultRow[];
    },
  });
  const [personFilter, setPersonFilter] = useState("all");

  const groups = new Map<string, { photo: string | null; items: WorkResultRow[] }>();
  for (const r of rows) {
    const name = r.member?.full_name ?? "Anggota";
    const g = groups.get(name) ?? { photo: r.member?.photo_url ?? null, items: [] };
    g.items.push(r);
    groups.set(name, g);
  }
  const names = [...groups.keys()].sort((a, b) => a.localeCompare(b, "id"));
  const visible = names.filter((n) => personFilter === "all" || n === personFilter);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground">
          HASIL KERJA ({rows.length})
        </h2>
        {names.length > 1 && (
          <select
            value={personFilter}
            onChange={(e) => setPersonFilter(e.target.value)}
            className="h-10 w-full rounded-xl border bg-card px-3 text-sm sm:w-64"
            aria-label="Pilih nama anggota"
          >
            <option value="all">Semua anggota (A–Z)</option>
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}
      </div>
      {isLoading ? (
        <Skeleton className="h-32 w-full rounded-2xl" />
      ) : names.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada hasil kerja yang terkumpul.</p>
      ) : (
        visible.map((name) => {
          const g = groups.get(name)!;
          return (
            <article key={name} className="rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <UserAvatar path={g.photo} name={name} className="size-9" />
                <div>
                  <p className="text-sm font-semibold">{name}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.items.length} hasil kerja
                  </p>
                </div>
              </div>
              <ul className="mt-3 space-y-2">
                {g.items.map((r) => (
                  <li key={r.id} className="rounded-xl bg-muted p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {r.assignment?.title ?? "Tugas"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.submitted_at
                          ? format(new Date(r.submitted_at), "d MMM yyyy, HH:mm", {
                              locale: idLocale,
                            })
                          : "-"}
                      </p>
                    </div>
                    {r.content && (
                      <p className="mt-1 line-clamp-3 whitespace-pre-line break-words text-sm text-muted-foreground">
                        {r.content}
                      </p>
                    )}
                    {r.file_url && <PeerFile path={r.file_url} />}
                  </li>
                ))}
              </ul>
            </article>
          );
        })
      )}
    </section>
  );
}

export const Route = createFileRoute("/_authenticated/mentor-tasks")({
  head: () => ({
    meta: [
      { title: "Tugas dari Pembina — OrgTool" },
      {
        name: "description",
        content: "Daftar penugasan dari Pembina beserta status pengumpulan dan catatan.",
      },
      { property: "og:title", content: "Tugas dari Pembina — OrgTool" },
      {
        property: "og:description",
        content: "Daftar penugasan dari Pembina beserta status pengumpulan dan catatan.",
      },
    ],
  }),
  component: MentorTasksPage,
});

function dueMeta(due: string | null) {
  if (!due) return { label: "Tanpa tenggat", urgent: false };
  const date = new Date(due);
  const urgent = isBefore(date, new Date(Date.now() + 2 * 86_400_000));
  return {
    label: format(date, "d MMM yyyy, HH:mm", { locale: idLocale }),
    urgent,
  };
}

function AssignmentCard({
  item,
  submission,
  onClick,
}: {
  item: Assignment;
  submission?: AssignmentSubmission | undefined;
  onClick: () => void;
}) {
  const due = dueMeta(item.due_date);
  return (
    <button
      onClick={onClick}
      className="w-full rounded-2xl border bg-card p-5 text-left shadow-sm transition-colors hover:bg-accent/40"
    >
      <div className="flex flex-wrap items-center gap-2">
        {item.category && (
          <span className="rounded-full border bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
            {item.category}
          </span>
        )}
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
            submission
              ? "border-primary/30 bg-primary/10 text-primary"
              : due.urgent
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : "bg-muted"
          }`}
        >
          {submission ? "Sudah dikumpulkan" : "Belum dikumpulkan"}
        </span>
      </div>
      <h3 className="mt-2 text-base font-bold leading-snug">{item.title}</h3>
      {item.instructions && (
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.instructions}</p>
      )}
      <p
        className={`mt-3 text-xs font-medium ${
          !submission && due.urgent ? "text-destructive" : "text-muted-foreground"
        }`}
      >
        Tenggat: {due.label}
      </p>
      {submission?.supervisor_comment && (
        <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
          Ada catatan dari Pembina
        </p>
      )}
    </button>
  );
}

function PeerFile({ path }: { path: string }) {
  const { data: url } = useQuery({
    queryKey: ["submission-file", path],
    queryFn: () => signedFileUrl(path),
  });
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mt-2 flex items-center gap-2 text-sm text-primary underline"
    >
      <Paperclip className="size-4" /> Lihat lampiran
    </a>
  );
}

function PeerAnswers({ assignmentId, myId }: { assignmentId: string; myId: string }) {
  const { data: peers = [], isLoading } = useQuery({
    queryKey: ["peer-submissions", assignmentId, myId],
    queryFn: () => fetchPeerSubmissions(assignmentId, myId),
  });
  const [selected, setSelected] = useState<string>("");
  const chosen = peers.find((p) => p.id === selected) ?? null;

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <Label className="flex items-center gap-2">
        <Users className="size-4 text-primary" /> Lihat jawaban anggota lain
      </Label>
      {isLoading ? (
        <Skeleton className="h-9 w-full" />
      ) : peers.length === 0 ? (
        <p className="text-xs text-muted-foreground">Belum ada anggota lain yang mengumpulkan.</p>
      ) : (
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger>
            <SelectValue placeholder={`Pilih anggota (${peers.length})`} />
          </SelectTrigger>
          <SelectContent>
            {peers.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.member?.full_name ?? "Anggota"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {chosen && (
        <div className="rounded-lg bg-muted p-3">
          <p className="text-xs text-muted-foreground">
            {chosen.member?.full_name} ·{" "}
            {chosen.submitted_at
              ? format(new Date(chosen.submitted_at), "d MMM yyyy, HH:mm", { locale: idLocale })
              : "-"}
          </p>
          {chosen.content && (
            <p className="mt-2 whitespace-pre-line break-words text-sm">{chosen.content}</p>
          )}
          {chosen.file_url && <PeerFile path={chosen.file_url} />}
        </div>
      )}
    </div>
  );
}

function DetailDialog({
  item,
  submission,
  onClose,
}: {
  item: Assignment | null;
  submission?: AssignmentSubmission | undefined;
  onClose: () => void;
}) {
  const { data: profile } = useMyProfile();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileLink, setFileLink] = useState<string | null>(null);

  useEffect(() => {
    setContent(submission?.content ?? "");
    setFile(null);
    setFileLink(null);
    if (submission?.file_url) {
      signedFileUrl(submission.file_url).then(setFileLink).catch(() => setFileLink(null));
    }
  }, [submission, item?.id]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!item || !profile) return;
      let fileUrl = submission?.file_url ?? null;
      if (file) fileUrl = await uploadSubmissionFile(file, profile.id);
      await upsertSubmission({
        assignmentId: item.id,
        memberId: profile.id,
        content: item.allow_text ? content.trim() || null : null,
        fileUrl,
      });
    },
    onSuccess: () => {
      toast.success("Jawaban tersimpan.");
      queryClient.invalidateQueries({ queryKey: ["my-submissions"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const due = dueMeta(item?.due_date ?? null);

  const MAX_WORDS = 5000;
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const overLimit = wordCount > MAX_WORDS;
  const emptyAnswer =
    (item?.allow_text ? !content.trim() : true) && !file && !submission?.file_url;

  function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    if (picked && !["image/png", "image/jpeg", "application/pdf"].includes(picked.type)) {
      toast.error("Lampiran harus berupa gambar PNG/JPG atau dokumen PDF.");
      e.target.value = "";
      setFile(null);
      return;
    }
    setFile(picked);
  }

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item?.title}</DialogTitle>
        </DialogHeader>
        {item && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Tenggat: {due.label}</p>
            {item.instructions && (
              <p className="whitespace-pre-line rounded-xl bg-muted p-3 text-sm">
                {item.instructions}
              </p>
            )}

            {submission?.supervisor_comment && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Catatan dari Pembina
                </p>
                <p className="mt-1 whitespace-pre-line text-sm">{submission.supervisor_comment}</p>
              </div>
            )}

            {submission && (
              <p className="text-xs text-muted-foreground">
                Dikumpulkan{" "}
                {submission.submitted_at
                  ? format(new Date(submission.submitted_at), "d MMM yyyy, HH:mm", {
                      locale: idLocale,
                    })
                  : "-"}
              </p>
            )}

            {item.allow_text && (
              <div className="space-y-2">
                <Label>Jawaban kamu</Label>
                <Textarea
                  rows={6}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Tulis jawaban di sini… Kamu bisa menyertakan link (https://…) di dalam jawaban."
                />
                <p
                  className={`text-right text-xs ${
                    overLimit ? "font-semibold text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {wordCount}/{MAX_WORDS} kata
                  {overLimit ? " — melebihi batas" : ""}
                </p>
              </div>
            )}

            {item.allow_file && (
              <div className="space-y-2">
                <Label>Lampiran</Label>
                {fileLink && (
                  <a
                    href={fileLink}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-primary underline"
                  >
                    <Paperclip className="size-4" /> Lihat lampiran yang sudah dikirim
                  </a>
                )}
                <Input
                  type="file"
                  accept="image/png,image/jpeg,application/pdf,.png,.jpg,.jpeg,.pdf"
                  onChange={onPickFile}
                />
                <p className="text-xs text-muted-foreground">
                  Format yang didukung: PNG, JPG, atau PDF.
                </p>
              </div>
            )}

            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Lock className="mt-0.5 size-3.5 shrink-0" />
              {visibilityHint(item.visibility)}
              {item.peers_can_view ? " Pembina juga mengizinkan anggota lain membaca jawaban di tugas ini." : ""}
            </p>

            {item.peers_can_view && profile && (
              <PeerAnswers assignmentId={item.id} myId={profile.id} />
            )}

            <Button
              className="w-full"
              onClick={() => submit.mutate()}
              disabled={submit.isPending || overLimit || emptyAnswer}
            >
              {submit.isPending
                ? "Menyimpan…"
                : submission
                  ? "Perbarui Jawaban"
                  : "Kumpulkan"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MentorTasksPage() {
  const { data: assignments = [], isLoading } = useMyAssignments();
  const { data: submissions = [] } = useMySubmissions();
  const [openId, setOpenId] = useState<string | null>(null);

  const byAssignment = new Map(submissions.map((s) => [s.assignment_id, s]));
  const pending = assignments.filter((a) => !byAssignment.has(a.id));
  const done = assignments.filter((a) => byAssignment.has(a.id));
  const active = assignments.find((a) => a.id === openId) ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <GraduationCap className="size-6 text-primary" /> Tugas dari Pembina
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Penugasan yang ditujukan untuk kamu beserta catatan dari Pembina.
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      ) : assignments.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">Belum ada tugas dari Pembina.</p>
        </div>
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground">
              BELUM DIKUMPULKAN ({pending.length})
            </h2>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">Semua tugas sudah kamu kumpulkan. 🎉</p>
            ) : (
              pending.map((a) => (
                <AssignmentCard key={a.id} item={a} onClick={() => setOpenId(a.id)} />
              ))
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground">
              SUDAH DIKUMPULKAN ({done.length})
            </h2>
            {done.map((a) => (
              <AssignmentCard
                key={a.id}
                item={a}
                submission={byAssignment.get(a.id)}
                onClick={() => setOpenId(a.id)}
              />
            ))}
          </section>
        </div>
      )}

      <DetailDialog
        item={active}
        submission={active ? byAssignment.get(active.id) : undefined}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}
