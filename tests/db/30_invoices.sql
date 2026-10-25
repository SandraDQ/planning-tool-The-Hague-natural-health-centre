-- Invoices (MASTER_PROMPT 9.3, D10): immutable after issue, gap-free
-- sequential numbering per seller.
begin;
select tests.setup();
select tests.block(tests.therapist('A'), 1, '2027-03-01 08:00 Europe/Amsterdam', '2027-03-01 12:00 Europe/Amsterdam');
select tests.block(tests.therapist('B'), 2, '2027-03-01 08:00 Europe/Amsterdam', '2027-03-01 12:00 Europe/Amsterdam');
insert into public.therapist_business (therapist_id, legal_name, kvk_number, btw_number)
values (tests.therapist('A'), 'Test Therapeut A Praktijk', '12345678', 'NL000000000B01');

create temporary table t_ids (k text primary key, id uuid) on commit drop;
insert into t_ids values
  ('apptA', tests.book(tests.therapist('A'), 1, tests.session_type('A60'), '2027-03-01 09:00 Europe/Amsterdam', tests.client(1))),
  ('apptB', tests.book(tests.therapist('B'), 2, tests.session_type('B60'), '2027-03-01 09:00 Europe/Amsterdam', tests.client(2)));

-- ------------------------------------------------------------- numbering --
do $$
declare
  v_apptA uuid := (select id from t_ids where k = 'apptA');
  v_apptB uuid := (select id from t_ids where k = 'apptB');
  v_year  text := to_char(now() at time zone 'Europe/Amsterdam', 'YYYY');
  v_inv   uuid;
  v_num   text;
begin
  v_inv := tests.draft_invoice(tests.therapist('A'), v_apptA, tests.client(1), 2000);
  insert into t_ids values ('invA1', v_inv);
  perform tests.assert((select number is null from public.invoices where id = v_inv), 'draft invoice has no number');

  v_num := public.issue_invoice(v_inv);
  perform tests.assert_eq(v_num, v_year || '-0001', 'first invoice of therapist A is <year>-0001');
  perform tests.assert_eq((select total_cents from public.invoices where id = v_inv), 2000, 'totals are frozen from the lines');
  perform tests.assert_eq((select seller_snapshot ->> 'kvk_number' from public.invoices where id = v_inv), '12345678',
    'seller snapshot taken from the business details at issue');
  perform tests.assert_eq((select buyer_snapshot ->> 'last_name' from public.invoices where id = v_inv), 'Een',
    'buyer snapshot taken from the client at issue');

  perform public.issue_invoice(tests.draft_invoice(tests.therapist('A'), v_apptA, tests.client(1), 3000));
  perform public.issue_invoice(tests.draft_invoice(tests.therapist('B'), v_apptB, tests.client(2), 1750));
  perform public.issue_invoice(tests.draft_invoice(tests.therapist('A'), v_apptA, tests.client(1), 5000, 'final'));
  perform public.issue_invoice(tests.draft_invoice(tests.therapist('B'), v_apptB, tests.client(2), 5250, 'final'));

  -- A transaction that issues and then fails must not burn a number.
  v_inv := tests.draft_invoice(tests.therapist('A'), v_apptA, tests.client(1), 100);
  begin
    perform public.issue_invoice(v_inv);
    raise exception 'simulated failure after issuing';
  exception when raise_exception then
    null;  -- subtransaction rolled back, including the sequence increment
  end;
  perform tests.assert((select status from public.invoices where id = v_inv) = 'draft',
    'issue rolled back: invoice is still a draft');
  perform public.issue_invoice(v_inv);

  perform tests.assert_eq(
    (select array_agg(sequence_number order by sequence_number) from public.invoices
      where seller_therapist_id = tests.therapist('A') and status = 'issued'),
    array[1, 2, 3, 4], 'therapist A numbers are 1,2,3,4: sequential, no gaps (incl. after a rollback)');
  perform tests.assert_eq(
    (select array_agg(sequence_number order by sequence_number) from public.invoices
      where seller_therapist_id = tests.therapist('B') and status = 'issued'),
    array[1, 2], 'therapist B has its own sequence 1,2');

  -- credit note joins the seller's sequence, negative total
  insert into public.invoices (seller_type, seller_therapist_id, kind, appointment_id, buyer_client_id, credited_invoice_id)
  values ('therapist', tests.therapist('A'), 'credit_note', v_apptA, tests.client(1), (select id from t_ids where k = 'invA1'))
  returning id into v_inv;
  insert into public.invoice_lines (invoice_id, description, quantity, unit_cents, line_total_cents, btw_treatment, btw_rate_bp, btw_cents, exemption_ground)
  values (v_inv, 'Terugbetaling aanbetaling / Deposit refund', 1, -2000, -2000, 'exempt', 0, 0, 'test ground');
  perform public.issue_invoice(v_inv);
  perform tests.assert_eq((select (sequence_number, total_cents)::text from public.invoices where id = v_inv),
    '(5,-2000)', 'credit note gets the next number of the same seller and a negative total');

  -- credit note for another seller's invoice is refused
  insert into public.invoices (seller_type, seller_therapist_id, kind, appointment_id, buyer_client_id, credited_invoice_id)
  values ('therapist', tests.therapist('B'), 'credit_note', v_apptB, tests.client(2), (select id from t_ids where k = 'invA1'))
  returning id into v_inv;
  insert into public.invoice_lines (invoice_id, description, quantity, unit_cents, line_total_cents, btw_treatment, btw_rate_bp, btw_cents, exemption_ground)
  values (v_inv, 'x', 1, -100, -100, 'exempt', 0, 0, 'test ground');
  perform tests.assert_raises(format('select public.issue_invoice(%L)', v_inv), 'TH010',
    'credit note must refer to an invoice of the same seller');

  -- centre (room rent) has its own sequence
  insert into public.invoices (seller_type, kind, buyer_therapist_id) values ('centre', 'room_rent', tests.therapist('A'))
  returning id into v_inv;
  insert into public.invoice_lines (invoice_id, description, quantity, unit_cents, line_total_cents, btw_treatment, btw_rate_bp, btw_cents)
  values (v_inv, 'Huur kamer 1, 4 blokken', 4, 2500, 10000, '21', 2100, 2100);
  perform tests.assert_eq(public.issue_invoice(v_inv), v_year || '-0001', 'centre room-rent invoices are numbered separately');
  perform tests.assert_eq((select total_cents from public.invoices where id = v_inv), 12100, 'room-rent total incl. 21% BTW');

  perform tests.assert_raises(
    $q$insert into public.invoices (seller_type, seller_therapist_id, kind, buyer_therapist_id) values ('centre', null, 'deposit', null)$q$,
    '23514', 'the centre only issues room-rent invoices');
end;
$$;

-- ----------------------------------------------------------- immutability --
do $$
declare
  v_inv uuid := (select id from t_ids where k = 'invA1');
  v_line uuid := (select id from public.invoice_lines where invoice_id = (select id from t_ids where k = 'invA1'));
begin
  perform tests.assert_raises(format('update public.invoices set total_cents = 1 where id = %L', v_inv),
    'TH003', 'issued invoice: amounts cannot be updated');
  perform tests.assert_raises(format('update public.invoices set number = %L where id = %L', 'X-1', v_inv),
    'TH003', 'issued invoice: number cannot be updated');
  perform tests.assert_raises(format('update public.invoices set buyer_snapshot = %L where id = %L', '{"last_name":"Ander"}', v_inv),
    'TH003', 'issued invoice: buyer details cannot be updated');
  perform tests.assert_raises(format('update public.invoices set status = %L where id = %L', 'draft', v_inv),
    'TH003', 'issued invoice cannot go back to draft');
  perform tests.assert_raises(format('delete from public.invoices where id = %L', v_inv),
    'TH003', 'issued invoice cannot be deleted');
  perform tests.assert_raises(format('update public.invoice_lines set unit_cents = 1, line_total_cents = 1 where id = %L', v_line),
    'TH003', 'lines of an issued invoice cannot be updated');
  perform tests.assert_raises(format('delete from public.invoice_lines where id = %L', v_line),
    'TH003', 'lines of an issued invoice cannot be deleted');
  perform tests.assert_raises(
    format($q$insert into public.invoice_lines (invoice_id, description, unit_cents, line_total_cents, btw_treatment, btw_rate_bp, btw_cents)
              values (%L, 'extra', 100, 100, '21', 2100, 21)$q$, v_inv),
    'TH003', 'no lines can be added to an issued invoice');
  perform tests.assert_raises(format('select public.issue_invoice(%L)', v_inv),
    'TH003', 'an issued invoice cannot be issued again');

  update public.invoices set pdf_path = 'invoices/a/0001.pdf' where id = v_inv;
  perform tests.assert_eq((select pdf_path from public.invoices where id = v_inv), 'invoices/a/0001.pdf',
    'pdf_path can be filled in once after issue');
  update public.invoices set sent_at = now() where id = v_inv;
  perform tests.assert((select sent_at is not null from public.invoices where id = v_inv), 'sent_at can be filled in once');
  perform tests.assert_raises(format('update public.invoices set pdf_path = %L where id = %L', 'other.pdf', v_inv),
    'TH003', 'pdf_path cannot be replaced once set');
end;
$$;

-- --------------------------------------------- issuing only via issue_invoice --
do $$
declare
  v_draft uuid := tests.draft_invoice(tests.therapist('A'), (select id from t_ids where k = 'apptA'), tests.client(1), 700);
begin
  update public.invoices set locale = 'en' where id = v_draft;
  perform tests.assert_eq((select locale from public.invoices where id = v_draft), 'en', 'a draft can still be edited');

  perform tests.assert_raises(
    format($q$update public.invoices set status = 'issued', number = '2026-9999', sequence_year = 2026,
                     sequence_number = 9999, issued_at = now() where id = %L$q$, v_draft),
    'TH003', 'an invoice cannot be issued by a direct UPDATE (bypassing the sequence)');
  perform tests.assert_raises(
    format($q$insert into public.invoices (seller_type, seller_therapist_id, kind, appointment_id, buyer_client_id, status, number, sequence_year, sequence_number, issued_at)
              values ('therapist', %L, 'deposit', %L, %L, 'issued', '2026-0099', 2026, 99, now())$q$,
           tests.therapist('A'), (select id from t_ids where k = 'apptA'), tests.client(1)),
    'TH003', 'an invoice cannot be inserted as already issued');

  delete from public.invoices where id = v_draft;
  perform tests.assert(not exists (select 1 from public.invoices where id = v_draft), 'a draft can be deleted');
end;
$$;

-- ----------------------------------------------- only the server may issue --
select tests.login('admin');
set local role authenticated;
do $$
begin
  perform tests.assert_raises(
    format('select public.issue_invoice(%L)', (select id from public.invoices where status = 'draft' limit 1)),
    '42501', 'issue_invoice() is not callable through the API (server only)');
  perform tests.assert_raises('select public.next_invoice_number(''therapist'', null, 2026)',
    '42501', 'next_invoice_number() is not callable through the API');
end;
$$;
reset role;

rollback;
