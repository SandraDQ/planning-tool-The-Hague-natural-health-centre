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

-- F2 / F6 / F10 (review): 2FA on every table, explicit anon allow-list, no
-- dangerous privileges, no automatic grants for future objects.
do $$
declare
  v_list text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into v_list
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and not exists (select 1 from pg_policies p
                      where p.schemaname = 'public' and p.tablename = c.relname
                        and p.policyname = 'require_mfa' and p.permissive = 'RESTRICTIVE'
                        and p.roles = '{authenticated}' and p.cmd = 'ALL');
  perform tests.assert(v_list is null, 'every public table has the RESTRICTIVE require_mfa policy (2FA)' || coalesce(' (missing: ' || v_list || ')', ''));

  select string_agg(c.relname, ', ' order by c.relname) into v_list
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and not exists (select 1 from pg_policies p
                      where p.schemaname = 'public' and p.tablename = c.relname and p.permissive = 'PERMISSIVE');
  perform tests.assert(v_list is null, 'every public table has at least one permissive policy' || coalesce(' (missing: ' || v_list || ')', ''));

  -- anon: table-level privileges must match this allow-list exactly
  select string_agg(c.relname || ':' || a.privilege_type, ', ' order by c.relname, a.privilege_type) into v_list
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) a
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'S', 'p')
     and a.grantee = 'anon'::regrole;
  perform tests.assert_eq(v_list, 'services:SELECT, session_types:SELECT, therapies:SELECT',
    'anon table privileges match the allow-list');

  -- anon: column-level privileges only on the public therapist profile
  select string_agg(table_name || '.' || column_name || ':' || privilege_type, ', ' order by table_name, column_name) into v_list
    from information_schema.column_privileges
   where table_schema = 'public' and grantee = 'anon'
     and table_name not in ('services', 'session_types', 'therapies');  -- covered by table grants
  perform tests.assert_eq(v_list,
    'therapists.bio_en:SELECT, therapists.bio_nl:SELECT, therapists.display_name:SELECT, therapists.id:SELECT, '
    'therapists.photo_path:SELECT, therapists.public_email:SELECT, therapists.slug:SELECT',
    'anon column privileges match the allow-list (public therapist profile)');

  -- anon / PUBLIC: executable functions in public must match the allow-list
  select string_agg(p.proname, ', ' order by p.proname) into v_list
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
  perform tests.assert_eq(v_list, 'is_bookable_therapist, is_public_service', 'anon can execute only the allow-listed functions');

  select string_agg(distinct c.relname || ':' || a.privilege_type, ', ') into v_list
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) a
   where n.nspname = 'public' and c.relkind = 'r'
     and a.grantee in ('anon'::regrole, 'authenticated'::regrole)
     and a.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER');
  perform tests.assert(v_list is null, 'anon/authenticated have no TRUNCATE, REFERENCES or TRIGGER on any table' || coalesce(' (found: ' || v_list || ')', ''));

  select string_agg(d.defaclobjtype::text || ':' || a.grantee::regrole::text, ', ') into v_list
    from pg_default_acl d
    cross join lateral aclexplode(d.defaclacl) a
   where d.defaclnamespace = 'public'::regnamespace
     and a.grantee in ('anon'::regrole, 'authenticated'::regrole);
  perform tests.assert(v_list is null, 'no default privileges grant future public objects to anon/authenticated' || coalesce(' (found: ' || v_list || ')', ''));

  perform tests.assert(
    exists (select 1 from pg_default_acl d where d.defaclnamespace = 0 and d.defaclobjtype = 'f')
    and not exists (select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
                     where d.defaclnamespace = 0 and d.defaclobjtype = 'f' and a.grantee = 0),
    'future functions are not executable by PUBLIC by default');
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
