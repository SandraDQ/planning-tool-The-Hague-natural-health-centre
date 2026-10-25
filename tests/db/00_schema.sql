-- Schema-wide guarantees: RLS everywhere, no admin policy on intake data,
-- money in integer cents, seed data present.
begin;

do $$
declare
  v_missing text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into v_missing
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  perform tests.assert(v_missing is null, 'RLS is enabled on every public table' || coalesce(' (missing: ' || v_missing || ')', ''));

  select string_agg(c.relname, ', ' order by c.relname) into v_missing
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname);
  perform tests.assert(v_missing is null, 'every public table has at least one explicit policy' || coalesce(' (missing: ' || v_missing || ')', ''));
end;
$$;

do $$
begin
  perform tests.assert_eq(
    (select count(*)::integer from pg_policies
      where schemaname = 'public' and tablename in ('intakes', 'intake_access_log')
        and (policyname ilike '%admin%' or coalesce(qual, '') ilike '%admin%' or coalesce(with_check, '') ilike '%admin%')),
    0, 'no admin policy on intakes / intake_access_log');

  perform tests.assert_eq(
    (select count(*)::integer from pg_policies
      where schemaname = 'public' and tablename in ('intakes', 'intake_access_log')
        and ('public' = any (roles) or 'anon' = any (roles))),
    0, 'no anon/public policy on intakes / intake_access_log');

  perform tests.assert_eq(
    (select string_agg(table_name || '.' || column_name, ', ')
       from information_schema.columns
      where table_schema = 'public' and column_name like '%\_cents' and data_type not in ('integer', 'bigint')),
    null::text, 'all *_cents columns are integers');

  perform tests.assert_eq(
    (select count(*)::integer from pg_constraint
      where contype = 'x' and conname in ('room_blocks_no_overlap', 'appointments_no_therapist_overlap', 'appointments_no_room_overlap')),
    3, 'exclusion constraints for blocks and appointments exist');
end;
$$;

do $$
begin
  perform tests.assert_eq((select count(*)::integer from public.rooms), 6, 'seed: 6 rooms');
  perform tests.assert_eq(
    (select string_agg(number::text, ',' order by number) from public.rooms where kind = 'private'), '3,4,6',
    'seed: rooms 3, 4, 6 are private');
  perform tests.assert_eq(
    (select string_agg(number::text, ',' order by number) from public.rooms where kind = 'shared'), '1,2,5',
    'seed: rooms 1, 2, 5 are shared');
  perform tests.assert_eq(
    (select string_agg(to_char(start_time, 'HH24') || '-' || to_char(end_time, 'HH24'), ',' order by start_time)
       from public.block_templates), '08-12,13-17,18-22',
    'seed: block templates 08-12, 13-17, 18-22');
  perform tests.assert_eq((select count(*)::integer from public.therapies), 13, 'seed: 13 therapies');
  perform tests.assert_eq(
    (select count(*)::integer from public.therapists where display_name like 'Test Therapeut %'), 3,
    'seed: 3 fake test therapists');
end;
$$;

rollback;
