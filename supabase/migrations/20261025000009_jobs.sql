-- =============================================================================
-- THNHC platform · 0009 scheduled jobs
-- Scheduled with pg_cron when the extension is enabled (Supabase: Database ->
-- Extensions -> pg_cron). Without pg_cron (e.g. local tests) this is a no-op;
-- re-run the block below after enabling it.
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- D5: cancel unpaid checkout holds every minute
    perform cron.schedule('thnhc-expire-holds', '* * * * *', 'select public.expire_stale_holds()');
    -- 11.2: delete intakes past their retention date, daily at 03:15 UTC
    perform cron.schedule('thnhc-purge-intakes', '15 3 * * *', 'select public.purge_expired_intakes()');
  else
    raise notice 'pg_cron not installed: jobs thnhc-expire-holds and thnhc-purge-intakes not scheduled';
  end if;
end;
$$;
