DO $$
DECLARE
  v_signature text;
  v_function regprocedure;
  v_signatures text[] := ARRAY[
    'public.generate_fund_request_number()',
    'public.get_my_division()',
    'public.generate_letter_number(text,public.letter_template)',
    'public.validate_proposal()',
    'public.notif_cancel_request()',
    'public.validate_vote()',
    'public.notif_proposal()',
    'public.notif_cancel_decision()',
    'public.remind_stakeholder_actions()',
    'public.handle_new_user()',
    'public.notify_cross_division_target()',
    'public.financial_category_breakdown(date,date,text)',
    'public.archive_record(text,uuid,text)',
    'public.notify_member_cancel()',
    'public.run_daily_reminders()',
    'public.create_task_from_decision(uuid)',
    'public.is_event_pic(uuid)',
    'public.is_my_assignment(uuid)',
    'public.notif_cash_payment()',
    'public.record_audit()',
    'public.notify_by_role(public.user_role[],text,text,text,text)',
    'public.fulfill_help_request()',
    'public.notif_coaching()',
    'public.notif_announcement()',
    'public.notif_help_decision()',
    'public.auto_approve_cancel_requests()',
    'public.auto_reject_help_requests()',
    'public.notif_contribution()',
    'public.member_report(uuid,date,date)',
    'public.notif_design_status()',
    'public.guard_warning_edit()',
    'public.is_section_visible(text)',
    'public.claim_invite(text)',
    'public.can_access_event(uuid)',
    'public.create_design_request_from_content(uuid,public.design_type,date,text)',
    'public.take_okr_snapshot(public.okr_period)',
    'public.notify_user(uuid,text,text,text,text)',
    'public.financial_period_summary(date,date)',
    'public.notif_content_review()',
    'public.notif_fund_submitted()',
    'public.restore_record(text,uuid)',
    'public.validate_invite(text)',
    'public.next_counter(text)',
    'public.find_similar_individuals(text,text,text)',
    'public.close_expired_proposals()',
    'public.is_resource_visible(uuid)',
    'public.notif_help_request()',
    'public.guard_coaching_note_edit()',
    'public.remind_content_and_design()',
    'public.notif_design_request()',
    'public.notif_warning()',
    'public.notify_escalation()',
    'public.can_access_division(text)',
    'public.get_my_role()',
    'public.notif_letter_review()',
    'public.remind_stale_tasks()',
    'public.generate_collection_bills(uuid)'
  ];
BEGIN
  FOREACH v_signature IN ARRAY v_signatures LOOP
    v_function := to_regprocedure(v_signature);
    IF v_function IS NULL THEN
      RAISE EXCEPTION 'Selected function does not exist: %', v_signature;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_function AND prosecdef) THEN
      RAISE EXCEPTION 'Selected function is not SECURITY DEFINER: %', v_signature;
    END IF;
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_catalog, pg_temp', v_function);
  END LOOP;
END;
$$;