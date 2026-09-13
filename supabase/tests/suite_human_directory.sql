begin;
do $$ begin
 if has_function_privilege('anon','public.cph_pick_employees(uuid)','execute') then raise exception 'Anonymous directory exposed'; end if;
end; $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000099',true);
do $$ begin
 if exists(select 1 from public.cph_pick_employees()) then raise exception 'Unassigned user sees employees'; end if;
end; $$;
rollback;
select 'PASS: anonymous privilege denied; unassigned user sees no directory; rolled back' result;
