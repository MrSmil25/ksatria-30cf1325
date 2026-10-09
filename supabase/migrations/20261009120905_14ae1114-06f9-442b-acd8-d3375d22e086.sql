REVOKE ALL ON FUNCTION public.notif_workspace_individual_target() FROM PUBLIC,anon,authenticated;
ALTER FUNCTION public.acknowledge_workspace_task(text,uuid) SECURITY INVOKER;
GRANT INSERT(task_id,assignment_id,member_id) ON public.workspace_task_reads TO authenticated;
CREATE POLICY confirm_own_received_task ON public.workspace_task_reads FOR INSERT TO authenticated WITH CHECK (
 member_id=auth.uid() AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.status='Active') AND (
 (task_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.tasks t WHERE t.id=task_id AND t.assignee_id=auth.uid())) OR
 (assignment_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.assignments a WHERE a.id=assignment_id AND a.assignment_type='Internal' AND a.is_active AND NOT coalesce(a.is_cancelled,false) AND (a.scope='Semua' OR (a.scope='Divisi' AND a.target_division=public.get_my_division()) OR (a.scope='Individu' AND EXISTS(SELECT 1 FROM public.assignment_targets t WHERE t.assignment_id=a.id AND t.member_id=auth.uid())))))
 ));