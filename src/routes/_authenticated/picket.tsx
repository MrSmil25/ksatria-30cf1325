import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Brush,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileImage,
  Plus,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useMyProfile, useProfiles } from "@/hooks/useProfile";
import { PROOF_ACCEPT, PROOF_FORMAT_HINT, validateProofFile } from "@/lib/fund-requests";
import {
  addPicketManager,
  cancelPicket,
  cancelPicketFine,
  createPicketTask,
  deletePicketTask,
  fetchIsPicketManager,
  fetchPicketFines,
  fetchPicketManagers,
  fetchPicketWeek,
  givePicketFine,
  openPicketProof,
  removePicketManager,
  reviewPicket,
  shiftWeek,
  submitPicketProof,
  takePicket,
  weekStartOf,
  type PicketSignup,
  type PicketTask,
} from "@/lib/picket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/picket")({
  head: () => ({
    meta: [
      { title: "Piket Mingguan — My Room" },
      { name: "description", content: "Ambil piket mingguan, kumpulkan bukti before-after, dan kelola denda piket." },
      { property: "og:title", content: "Piket Mingguan — My Room" },
      { property: "og:description", content: "Ambil piket mingguan, kumpulkan bukti before-after, dan kelola denda piket." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PicketPage,
});

const STATUS_VARIANT: Record<PicketSignup["status"], string> = {
  Diambil: "bg-muted text-muted-foreground",
  Dikumpulkan: "bg-primary/10 text-primary",
  Disetujui: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  Ditolak: "bg-destructive/10 text-destructive",
};

const rupiah = (n: number) => "Rp " + n.toLocaleString("id-ID");
const fmtDeadline = (s: string) =>
  new Date(s).toLocaleString("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtWeek = (w: string) => {
  const [y = 1970, m = 1, d = 1] = w.split("-").map(Number);
  const a = new Date(y, m - 1, d);
  const b = new Date(y, m - 1, d + 6);
  const o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${a.toLocaleDateString("id-ID", o)} – ${b.toLocaleDateString("id-ID", { ...o, year: "numeric" })}`;
};
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan");

function PicketPage() {
  const qc = useQueryClient();
  const { data: me } = useMyProfile();
  const { data: profiles = [] } = useProfiles();
  const [week, setWeek] = useState(() => weekStartOf(new Date()));
  const [createOpen, setCreateOpen] = useState(false);
  const [managersOpen, setManagersOpen] = useState(false);
  const [proofFor, setProofFor] = useState<PicketSignup | null>(null);

  const isKetua = me?.role === "Ketua";
  const { data: isManager = false } = useQuery({ queryKey: ["picket-is-manager"], queryFn: fetchIsPicketManager });
  const weekQ = useQuery({ queryKey: ["picket-week", week], queryFn: () => fetchPicketWeek(week) });
  const finesQ = useQuery({ queryKey: ["picket-fines", week], queryFn: () => fetchPicketFines(week) });

  const nameOf = useMemo(() => {
    const map = new Map(profiles.map((p) => [p.id, p.nickname || p.full_name]));
    return (id: string) => map.get(id) ?? "Anggota";
  }, [profiles]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["picket-week"] });
    qc.invalidateQueries({ queryKey: ["picket-fines"] });
  };
  const act = useMutation({
    mutationFn: (fn: () => Promise<void>) => fn(),
    onSuccess: refresh,
    onError: (e) => toast.error(errMsg(e)),
  });

  const tasks = weekQ.data?.tasks ?? [];
  const signups = weekQ.data?.signups ?? [];
  const now = Date.now();

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Kebersamaan</p>
          <h1 className="font-display text-3xl font-bold tracking-tight">Piket Mingguan</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Pilih piket yang tersedia, kerjakan, lalu kumpulkan foto before &amp; after sebelum deadline.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isKetua && (
            <Button variant="outline" onClick={() => setManagersOpen(true)}>
              <UserCog className="mr-2 h-4 w-4" /> Pengelola piket
            </Button>
          )}
          {isManager && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Tambah piket
            </Button>
          )}
        </div>
      </header>

      <div className="flex items-center justify-between rounded-2xl border bg-card/70 p-2 backdrop-blur">
        <Button variant="ghost" size="icon" aria-label="Minggu sebelumnya" onClick={() => setWeek(shiftWeek(week, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-center">
          <p className="text-sm font-semibold">{fmtWeek(week)}</p>
          {week !== weekStartOf(new Date()) && (
            <button className="text-xs text-primary hover:underline" onClick={() => setWeek(weekStartOf(new Date()))}>
              Kembali ke minggu ini
            </button>
          )}
        </div>
        <Button variant="ghost" size="icon" aria-label="Minggu berikutnya" onClick={() => setWeek(shiftWeek(week, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">Daftar piket</TabsTrigger>
          {isManager && <TabsTrigger value="review">Periksa bukti</TabsTrigger>}
          {isManager && <TabsTrigger value="fines">Belum piket &amp; denda</TabsTrigger>}
          {!isManager && <TabsTrigger value="myfines">Denda saya</TabsTrigger>}
        </TabsList>

        <TabsContent value="tasks" className="mt-4">
          {weekQ.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-40" />
              <Skeleton className="h-40" />
            </div>
          ) : tasks.length === 0 ? (
            <EmptyState text={isManager ? "Belum ada piket minggu ini. Tambahkan jenis piket pertama." : "Belum ada piket untuk minggu ini."} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {tasks.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  signups={signups.filter((s) => s.task_id === t.id)}
                  myId={me?.id}
                  mySignupThisWeek={signups.find((s) => s.member_id === me?.id)}
                  isManager={isManager}
                  nameOf={nameOf}
                  now={now}
                  busy={act.isPending}
                  onTake={() => me && act.mutate(() => takePicket(t.id, me.id), { onSuccess: () => toast.success("Piket diambil") })}
                  onCancel={(id) => act.mutate(() => cancelPicket(id))}
                  onSubmit={(s) => setProofFor(s)}
                  onDelete={() => {
                    if (confirm(`Hapus piket "${t.title}"?`)) act.mutate(() => deletePicketTask(t.id));
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {isManager && (
          <TabsContent value="review" className="mt-4">
            <ReviewList
              tasks={tasks}
              signups={signups.filter((s) => s.status === "Dikumpulkan" || s.status === "Disetujui" || s.status === "Ditolak")}
              nameOf={nameOf}
              onReview={(s, status, note) =>
                me && act.mutate(() => reviewPicket(s.id, me.id, status, note), { onSuccess: () => toast.success(`Bukti ${status.toLowerCase()}`) })
              }
            />
          </TabsContent>
        )}

        {isManager && (
          <TabsContent value="fines" className="mt-4">
            <FinesPanel
              week={week}
              tasks={tasks}
              signups={signups}
              fines={finesQ.data ?? []}
              profiles={profiles.filter((p) => p.status === "Active")}
              nameOf={nameOf}
              now={now}
              onGive={(member, amount, reason) =>
                act.mutate(() => givePicketFine(member, week, amount, reason), { onSuccess: () => toast.success("Denda dicatat dan masuk ke Kas") })
              }
              onCancel={(id) => act.mutate(() => cancelPicketFine(id), { onSuccess: () => toast.success("Denda dibatalkan") })}
            />
          </TabsContent>
        )}

        {!isManager && (
          <TabsContent value="myfines" className="mt-4">
            {(finesQ.data ?? []).filter((f) => f.status === "Didenda").length === 0 ? (
              <EmptyState text="Tidak ada denda piket untuk minggu ini." />
            ) : (
              <div className="space-y-2">
                {(finesQ.data ?? []).filter((f) => f.status === "Didenda").map((f) => (
                  <div key={f.id} className="flex items-center justify-between rounded-xl border bg-card p-4">
                    <div>
                      <p className="font-semibold">{rupiah(f.amount)}</p>
                      <p className="text-sm text-muted-foreground">{f.reason || "Belum piket hingga deadline"}</p>
                    </div>
                    <a href="/cash" className="text-sm font-medium text-primary hover:underline">Bayar di Kas →</a>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {isManager && (
        <CreateTaskDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          week={week}
          onCreate={(input) =>
            act.mutate(() => createPicketTask(input), {
              onSuccess: () => {
                toast.success("Piket ditambahkan");
                setCreateOpen(false);
              },
            })
          }
          busy={act.isPending}
        />
      )}
      {isKetua && me && (
        <ManagersDialog open={managersOpen} onOpenChange={setManagersOpen} meId={me.id} profiles={profiles.filter((p) => p.status === "Active")} />
      )}
      <ProofDialog signup={proofFor} onClose={() => setProofFor(null)} onDone={refresh} />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card/50 px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Brush className="h-5 w-5" />
      </div>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function TaskCard(props: {
  task: PicketTask;
  signups: PicketSignup[];
  myId?: string;
  mySignupThisWeek?: PicketSignup;
  isManager: boolean;
  nameOf: (id: string) => string;
  now: number;
  busy: boolean;
  onTake: () => void;
  onCancel: (id: string) => void;
  onSubmit: (s: PicketSignup) => void;
  onDelete: () => void;
}) {
  const { task: t, signups, myId, isManager, nameOf } = props;
  const mine = signups.find((s) => s.member_id === myId);
  const full = signups.length >= t.quota;
  const passed = props.now > new Date(t.deadline).getTime();
  return (
    <article className="flex flex-col gap-4 rounded-2xl border bg-card/80 p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold">{t.title}</h3>
          {t.description && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{t.description}</p>}
        </div>
        {isManager && (
          <Button variant="ghost" size="icon" aria-label="Hapus piket" onClick={props.onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className={`inline-flex items-center gap-1 ${passed ? "text-destructive" : ""}`}>
          <Clock className="h-3.5 w-3.5" /> {passed ? "Deadline lewat · " : "Deadline "}
          {fmtDeadline(t.deadline)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Users className="h-3.5 w-3.5" /> {signups.length}/{t.quota} orang
        </span>
      </div>
      {signups.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {signups.map((s) => (
            <li key={s.id} className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_VARIANT[s.status]}`}>
              {nameOf(s.member_id)} · {s.status}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap gap-2">
        {mine ? (
          <>
            {mine.status !== "Disetujui" && !passed && (
              <Button size="sm" onClick={() => props.onSubmit(mine)}>
                <FileImage className="mr-2 h-4 w-4" />
                {mine.status === "Diambil" ? "Kumpulkan bukti" : "Kirim ulang bukti"}
              </Button>
            )}
            {mine.status === "Diambil" && !passed && (
              <Button size="sm" variant="outline" disabled={props.busy} onClick={() => props.onCancel(mine.id)}>
                Batal ambil
              </Button>
            )}
            {mine.review_note && <p className="w-full text-xs text-muted-foreground">Catatan pengelola: {mine.review_note}</p>}
          </>
        ) : passed ? (
          <span className="text-xs text-muted-foreground">Pendaftaran ditutup</span>
        ) : full ? (
          <Badge variant="secondary">Kuota penuh</Badge>
        ) : props.mySignupThisWeek ? (
          <span className="text-xs text-muted-foreground">Kamu sudah mengambil piket lain minggu ini</span>
        ) : (
          <Button size="sm" disabled={props.busy} onClick={props.onTake}>
            Ambil piket ini
          </Button>
        )}
      </div>
    </article>
  );
}

function ReviewList(props: {
  tasks: PicketTask[];
  signups: PicketSignup[];
  nameOf: (id: string) => string;
  onReview: (s: PicketSignup, status: "Disetujui" | "Ditolak", note: string | null) => void;
}) {
  if (props.signups.length === 0) return <EmptyState text="Belum ada bukti piket yang dikumpulkan minggu ini." />;
  const title = (id: string) => props.tasks.find((t) => t.id === id)?.title ?? "Piket";
  return (
    <div className="space-y-3">
      {props.signups.map((s) => (
        <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
          <div>
            <p className="font-semibold">
              {props.nameOf(s.member_id)} <span className="font-normal text-muted-foreground">· {title(s.task_id)}</span>
            </p>
            {s.note && <p className="text-sm text-muted-foreground">{s.note}</p>}
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${STATUS_VARIANT[s.status]}`}>{s.status}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => openPicketProof(s.before_url)}>Before</Button>
            <Button size="sm" variant="outline" onClick={() => openPicketProof(s.after_url)}>After</Button>
            {s.status !== "Disetujui" && (
              <Button size="sm" onClick={() => props.onReview(s, "Disetujui", null)}>
                <ShieldCheck className="mr-1 h-4 w-4" /> Setujui
              </Button>
            )}
            {s.status !== "Ditolak" && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  const note = prompt("Alasan penolakan (opsional):");
                  if (note !== null) props.onReview(s, "Ditolak", note || null);
                }}
              >
                Tolak
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function FinesPanel(props: {
  week: string;
  tasks: PicketTask[];
  signups: PicketSignup[];
  fines: { id: string; member_id: string; amount: number; reason: string | null; status: string }[];
  profiles: { id: string; full_name: string; nickname: string | null }[];
  nameOf: (id: string) => string;
  now: number;
  onGive: (member: string, amount: number, reason: string) => void;
  onCancel: (id: string) => void;
}) {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const lastDeadline = props.tasks.reduce((m, t) => Math.max(m, new Date(t.deadline).getTime()), 0);
  const allPassed = props.tasks.length > 0 && props.now > lastDeadline;
  const done = new Set(
    props.signups.filter((s) => s.status === "Disetujui" || s.status === "Dikumpulkan").map((s) => s.member_id),
  );
  const activeFine = new Map(props.fines.filter((f) => f.status === "Didenda").map((f) => [f.member_id, f]));
  const missing = props.profiles.filter((p) => !done.has(p.id));

  if (props.tasks.length === 0) return <EmptyState text="Belum ada piket minggu ini, jadi belum ada yang perlu didenda." />;
  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
        {allPassed
          ? "Semua deadline minggu ini sudah lewat. Anggota di bawah belum mengumpulkan bukti piket — kamu bisa memberi denda atau membiarkannya."
          : "Deadline minggu ini belum semua lewat. Daftar ini masih bisa berubah; denda sebaiknya diberikan setelah deadline."}
        {" "}Denda otomatis muncul sebagai tagihan di halaman Kas anggota.
      </p>
      {missing.length === 0 ? (
        <EmptyState text="Semua anggota sudah piket minggu ini." />
      ) : (
        <div className="divide-y rounded-2xl border bg-card">
          {missing.map((p) => {
            const fine = activeFine.get(p.id);
            const took = props.signups.find((s) => s.member_id === p.id);
            return (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{p.nickname || p.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {took ? `Mengambil piket, status: ${took.status}` : "Tidak mengambil piket"}
                  </p>
                </div>
                {fine ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">Didenda {rupiah(fine.amount)}</Badge>
                    <Button size="sm" variant="outline" onClick={() => props.onCancel(fine.id)}>Batalkan denda</Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      placeholder="Nominal (Rp)"
                      className="w-36"
                      value={amounts[p.id] ?? ""}
                      onChange={(e) => setAmounts((a) => ({ ...a, [p.id]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={!Number(amounts[p.id])}
                      onClick={() => props.onGive(p.id, Number(amounts[p.id]), "Belum melaksanakan piket hingga deadline")}
                    >
                      Denda
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {props.fines.some((f) => f.status === "Dibatalkan") && (
        <p className="text-xs text-muted-foreground">
          Denda dibatalkan minggu ini: {props.fines.filter((f) => f.status === "Dibatalkan").map((f) => props.nameOf(f.member_id)).join(", ")}
        </p>
      )}
    </div>
  );
}

function CreateTaskDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  week: string;
  busy: boolean;
  onCreate: (input: { title: string; description: string | null; week_start: string; deadline: string; quota: number }) => void;
}) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [deadline, setDeadline] = useState("");
  const [quota, setQuota] = useState("2");
  const valid = title.trim() && deadline && Number(quota) >= 1;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tambah piket</DialogTitle>
          <DialogDescription>Untuk minggu {fmtWeek(props.week)}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pk-title">Jenis piket</Label>
            <Input id="pk-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Menyapu ruang sekretariat" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pk-desc">Yang perlu dilakukan</Label>
            <Textarea id="pk-desc" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pk-deadline">Deadline</Label>
              <Input id="pk-deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pk-quota">Kuota orang</Label>
              <Input id="pk-quota" type="number" min={1} value={quota} onChange={(e) => setQuota(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!valid || props.busy}
            onClick={() => {
              props.onCreate({
                title: title.trim(),
                description: desc.trim() || null,
                week_start: props.week,
                deadline: new Date(deadline).toISOString(),
                quota: Math.floor(Number(quota)),
              });
              setTitle("");
              setDesc("");
              setDeadline("");
            }}
          >
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManagersDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  meId: string;
  profiles: { id: string; full_name: string; nickname: string | null; role: string }[];
}) {
  const qc = useQueryClient();
  const { data: managers = [] } = useQuery({ queryKey: ["picket-managers"], queryFn: fetchPicketManagers, enabled: props.open });
  const [pick, setPick] = useState("");
  const m = useMutation({
    mutationFn: (fn: () => Promise<void>) => fn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["picket-managers"] }),
    onError: (e) => toast.error(errMsg(e)),
  });
  const candidates = props.profiles.filter((p) => !managers.includes(p.id) && p.role !== "Ketua");
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pengelola piket</DialogTitle>
          <DialogDescription>Pengelola bisa menambah jenis piket, memeriksa bukti, dan memberi atau membatalkan denda.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <select
            className="h-10 flex-1 rounded-md border bg-background px-3 text-sm"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
          >
            <option value="">Pilih anggota…</option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
          <Button disabled={!pick || m.isPending} onClick={() => m.mutate(() => addPicketManager(pick, props.meId), { onSuccess: () => setPick("") })}>
            Tambah
          </Button>
        </div>
        <ul className="divide-y rounded-xl border">
          {managers.length === 0 && <li className="p-3 text-sm text-muted-foreground">Belum ada pengelola selain Ketua.</li>}
          {managers.map((id) => (
            <li key={id} className="flex items-center justify-between p-3 text-sm">
              {props.profiles.find((p) => p.id === id)?.full_name ?? "Anggota"}
              <Button size="sm" variant="ghost" onClick={() => m.mutate(() => removePicketManager(id))}>Hapus</Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function ProofDialog(props: { signup: PicketSignup | null; onClose: () => void; onDone: () => void }) {
  const [before, setBefore] = useState<File | null>(null);
  const [after, setAfter] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const pickFile = (set: (f: File | null) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f) {
      try {
        validateProofFile(f);
      } catch (err) {
        toast.error(errMsg(err));
        e.target.value = "";
        return;
      }
    }
    set(f);
  };
  const close = () => {
    setBefore(null);
    setAfter(null);
    setNote("");
    props.onClose();
  };
  return (
    <Dialog open={!!props.signup} onOpenChange={(v) => !v && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kumpulkan bukti piket</DialogTitle>
          <DialogDescription>{PROOF_FORMAT_HINT}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pk-before">Foto before</Label>
            <Input id="pk-before" type="file" accept={PROOF_ACCEPT} onChange={pickFile(setBefore)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pk-after">Foto after</Label>
            <Input id="pk-after" type="file" accept={PROOF_ACCEPT} onChange={pickFile(setAfter)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pk-note">Catatan (opsional)</Label>
            <Textarea id="pk-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!before || !after || busy}
            onClick={async () => {
              if (!props.signup || !before || !after) return;
              setBusy(true);
              try {
                await submitPicketProof(props.signup.id, before, after, note.trim() || null);
                toast.success("Bukti piket terkirim");
                props.onDone();
                close();
              } catch (e) {
                toast.error(errMsg(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Mengunggah…" : "Kirim bukti"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
