import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useMyProfile } from "@/hooks/useProfile";
import { confirmWorkspaceRead, fetchWorkspaceReads, taskReadTime, type WorkspaceTaskKind } from "@/lib/workspace-task-reads";

export function TaskReadConfirmation({ kind, taskId }: { kind: WorkspaceTaskKind; taskId: string }) {
  const { data: profile } = useMyProfile();
  const client = useQueryClient();
  const reads = useQuery({
    queryKey: ["workspace-task-reads", profile?.id],
    queryFn: () => profile?.id ? fetchWorkspaceReads(profile.id) : Promise.resolve([]),
    enabled: !!profile?.id,
  });
  const readAt = taskReadTime(reads.data ?? [], kind, taskId);
  const confirm = useMutation({
    mutationFn: () => confirmWorkspaceRead(kind, taskId),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["workspace-task-reads"] });
      toast.success("Konfirmasi membaca tugas tersimpan.");
    },
    onError: () => toast.error("Konfirmasi belum tersimpan. Silakan coba lagi."),
  });
  return (
    <div role="status" className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-secondary p-3">
      <div className="flex min-w-0 items-start gap-2 text-sm">
        {readAt ? <CheckCheck className="mt-0.5 size-4 shrink-0 text-primary" /> : <Eye className="mt-0.5 size-4 shrink-0 text-primary" />}
        <div>
          <p className="font-medium">{readAt ? "Sudah membaca tugas" : "Konfirmasi membaca tugas"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {readAt ? new Date(readAt).toLocaleString("id-ID") : reads.isError ? "Status baca gagal dimuat." : "Belum dikonfirmasi"}
          </p>
        </div>
      </div>
      {!readAt && (
        <Button size="sm" className="w-full sm:w-auto" disabled={!profile?.id || reads.isPending || confirm.isPending}
          onClick={() => reads.isError ? reads.refetch() : confirm.mutate()}>
          <CheckCheck className="size-4" />
          {reads.isError ? "Coba lagi" : confirm.isPending ? "Menyimpan…" : "Saya sudah membaca"}
        </Button>
      )}
    </div>
  );
}