REVOKE EXECUTE ON FUNCTION public.can_view_peer_submission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_peer_submission(uuid) TO authenticated;