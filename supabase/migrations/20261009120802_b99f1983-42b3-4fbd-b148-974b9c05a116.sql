CREATE TABLE public.workspace_task_reads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
 assignment_id uuid REFERENCES public.assignments(id) ON DELETE CASCADE,
 member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 read_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (num_nonnulls(task_id,assignment_id)=1),
 UNIQUE(task_id,member_id), UNIQUE(assignment_id,member_id)
);
GRANT SELECT ON public.workspace_task_reads TO authenticated;
GRANT ALL ON public.workspace_task_reads TO service_role;
ALTER TABLE public.workspace_task_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_own_confirmation ON public.workspace_task_reads FOR SELECT TO authenticated USING(member_id=auth.uid());
CREATE TRIGGER workspace_reads_updated BEFORE UPDATE ON public.workspace_task_reads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE FUNCTION public.acknowledge_workspace_task(p_kind text,p_id uuid) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_time timestamptz; v_user uuid := auth.uid();
BEGIN
 IF v_user IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=v_user AND status='Active') THEN RAISE EXCEPTION 'Tidak berwenang'; END IF;
 IF p_kind='task' THEN
  IF NOT EXISTS(SELECT 1 FROM tasks WHERE id=p_id AND assignee_id=v_user) THEN RAISE EXCEPTION 'Tugas bukan untuk kamu'; END IF;
  INSERT INTO workspace_task_reads(task_id,member_id) VALUES(p_id,v_user) ON CONFLICT(task_id,member_id) DO NOTHING;
  SELECT read_at INTO v_time FROM workspace_task_reads WHERE task_id=p_id AND member_id=v_user;
 ELSIF p_kind='assignment' THEN
  IF NOT EXISTS(SELECT 1 FROM assignments a JOIN profiles p ON p.id=v_user WHERE a.id=p_id AND a.assignment_type='Internal' AND a.is_active AND NOT coalesce(a.is_cancelled,false) AND (a.scope='Semua' OR (a.scope='Divisi' AND a.target_division=p.division) OR (a.scope='Individu' AND EXISTS(SELECT 1 FROM assignment_targets t WHERE t.assignment_id=a.id AND t.member_id=v_user)))) THEN RAISE EXCEPTION 'Tugas bukan untuk kamu'; END IF;
  INSERT INTO workspace_task_reads(assignment_id,member_id) VALUES(p_id,v_user) ON CONFLICT(assignment_id,member_id) DO NOTHING;
  SELECT read_at INTO v_time FROM workspace_task_reads WHERE assignment_id=p_id AND member_id=v_user;
 ELSE RAISE EXCEPTION 'Jenis tugas tidak valid'; END IF;
 RETURN v_time;
END $$;
REVOKE ALL ON FUNCTION public.acknowledge_workspace_task(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_workspace_task(text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.notif_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF new.is_active THEN
  INSERT INTO notifications(recipient_id,type,title,body,link)
  SELECT p.id, CASE WHEN new.assignment_type='Internal' THEN 'task_assigned' ELSE 'tugas_pembina' END,
   CASE WHEN new.assignment_type='Internal' THEN 'Tugas baru di Ruang Kerja Saya' ELSE 'Tugas baru dari Pembina' END,new.title,
   CASE WHEN new.assignment_type='Internal' THEN '/workspace?tab=assigned-to-me' ELSE '/mentor-tasks' END
  FROM profiles p WHERE p.status='Active' AND
   ((new.scope='Semua' AND p.role<>'Supervisor') OR (new.scope='Divisi' AND p.division=new.target_division))
   AND (new.assignment_type<>'Internal' OR p.id IS DISTINCT FROM new.created_by);
 END IF;
 RETURN new;
END $$;
CREATE OR REPLACE FUNCTION public.notif_workspace_individual_target() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.assignments;
BEGIN
 SELECT * INTO a FROM assignments WHERE id=new.assignment_id;
 IF a.assignment_type='Internal' AND a.scope='Individu' AND a.is_active AND NOT coalesce(a.is_cancelled,false) AND new.member_id IS DISTINCT FROM a.created_by AND EXISTS(SELECT 1 FROM profiles WHERE id=new.member_id AND status='Active') THEN
  INSERT INTO notifications(recipient_id,type,title,body,link) VALUES(new.member_id,'task_assigned','Tugas baru di Ruang Kerja Saya',a.title,'/workspace?tab=assigned-to-me');
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER notif_workspace_individual AFTER INSERT ON public.assignment_targets FOR EACH ROW EXECUTE FUNCTION public.notif_workspace_individual_target();
CREATE OR REPLACE FUNCTION public.notif_task_assigned() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF new.assignee_id IS NOT DISTINCT FROM old.assignee_id THEN RETURN new; END IF;
 END IF;
 IF new.assignee_id IS NOT NULL AND new.assignee_id IS DISTINCT FROM new.created_by AND EXISTS(SELECT 1 FROM profiles WHERE id=new.assignee_id AND status='Active') THEN
  PERFORM public.notify_user(new.assignee_id,'task_assigned','Task baru untuk kamu',new.title,'/workspace');
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER notif_task_reassigned AFTER UPDATE OF assignee_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.notif_task_assigned();