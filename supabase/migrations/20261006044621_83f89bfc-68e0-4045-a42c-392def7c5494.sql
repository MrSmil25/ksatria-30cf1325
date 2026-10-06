ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS peers_can_view boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.can_view_peer_submission(p_assignment uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM assignments a WHERE a.id = p_assignment AND a.peers_can_view AND a.is_active)
     AND public.is_my_assignment(p_assignment)
$$;

CREATE POLICY "Anggota lihat jawaban rekan bila diizinkan Pembina"
ON public.assignment_submissions FOR SELECT TO authenticated
USING (public.can_view_peer_submission(assignment_id));