-- =============================================================================
-- THNHC platform · seed data (local development and tests)
-- Rooms, block templates and therapies reflect the centre (MASTER_PROMPT 1).
-- The three therapists are clearly FAKE test data: no real names, e-mail
-- addresses (.invalid domain) or business details. Safe to run more than once.
-- In production the admin manages rooms, templates, therapies and renters in
-- the admin portal; do not load the test therapists there.
-- =============================================================================

-- Block templates (local time, Europe/Amsterdam)
insert into public.block_templates (name, start_time, end_time, sort_order) values
  ('Ochtend / Morning',   '08:00', '12:00', 1),
  ('Middag / Afternoon',  '13:00', '17:00', 2),
  ('Avond / Evening',     '18:00', '22:00', 3)
on conflict (start_time, end_time) do nothing;

-- Therapies (admin-editable). NL names are drafts for owner approval.
insert into public.therapies (slug, name_nl, name_en, sort_order) values
  ('acupuncture',          'Acupunctuur',                 'Acupuncture',               1),
  ('chinese-herbs',        'Chinese kruiden',             'Chinese Herbs',             2),
  ('high-power-laser',     'High Power Lasertherapie',    'High Power Laser Therapy',  3),
  ('ayurveda',             'Ayurveda',                    'Ayurveda',                  4),
  ('coaching',             'Coaching',                    'Coaching',                  5),
  ('doula',                'Doula',                       'Doula',                     6),
  ('homeopathy',           'Homeopathie',                 'Homeopathy',                7),
  ('massage',              'Massage',                     'Massage',                   8),
  ('nutrition',            'Voeding',                     'Nutrition',                 9),
  ('orthomolecular',       'Orthomoleculaire therapie',   'Orthomolecular Therapy',   10),
  ('psychology',           'Psychologie',                 'Psychology',               11),
  ('reiki',                'Reiki',                       'Reiki',                    12),
  ('shamanism',            'Sjamanisme',                  'Shamanism',                13)
on conflict (slug) do nothing;

-- Fake test therapists. A and B work in shared rooms; C has private room 3
-- and is not bookable yet (onboarding in progress).
insert into public.therapists (id, slug, display_name, bio_nl, bio_en, public_email,
                               bookable, onboarding_status, buffer_minutes) values
  ('00000000-0000-4000-8000-0000000000a1', 'test-therapeut-a', 'Test Therapeut A',
   'Fictieve therapeut voor tests.', 'Fictional therapist for tests.', 'test-a@example.invalid',
   true, 'complete', 0),
  ('00000000-0000-4000-8000-0000000000a2', 'test-therapeut-b', 'Test Therapeut B',
   'Fictieve therapeut voor tests.', 'Fictional therapist for tests.', 'test-b@example.invalid',
   true, 'complete', 0),
  ('00000000-0000-4000-8000-0000000000a3', 'test-therapeut-c', 'Test Therapeut C',
   'Fictieve therapeut voor tests.', 'Fictional therapist for tests.', 'test-c@example.invalid',
   false, 'in_progress', 0)
on conflict (id) do nothing;

-- Rooms: 3, 4, 6 private; 1, 2, 5 shared. Room 3 assigned to Test Therapeut C;
-- rooms 4 and 6 are assigned by the admin to the real therapists later.
insert into public.rooms (number, name, kind, private_therapist_id) values
  (1, 'Kamer 1', 'shared',  null),
  (2, 'Kamer 2', 'shared',  null),
  (3, 'Kamer 3', 'private', '00000000-0000-4000-8000-0000000000a3'),
  (4, 'Kamer 4', 'private', null),
  (5, 'Kamer 5', 'shared',  null),
  (6, 'Kamer 6', 'private', null)
on conflict (number) do nothing;

-- Test services and session types
insert into public.services (id, therapist_id, therapy_id, name_nl, name_en, deposit_type, deposit_value)
select v.id::uuid, v.therapist_id::uuid, th.id, v.name_nl, v.name_en, v.deposit_type, v.deposit_value
  from (values
    ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'massage',
     'Testmassage', 'Test massage', 'fixed', 2000),
    ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a2', 'reiki',
     'Test-reiki', 'Test reiki', 'percent', 25),
    ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000a3', 'homeopathy',
     'Test-homeopathie', 'Test homeopathy', 'fixed', 3000)
  ) as v (id, therapist_id, therapy_slug, name_nl, name_en, deposit_type, deposit_value)
  join public.therapies th on th.slug = v.therapy_slug
on conflict (id) do nothing;

insert into public.session_types (id, service_id, name_nl, name_en, duration_min, price_cents, sort_order) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1', 'Behandeling 60 min', 'Treatment 60 min', 60,  8000, 1),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000b1', 'Behandeling 90 min', 'Treatment 90 min', 90, 11000, 2),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000b2', 'Sessie 60 min',      'Session 60 min',   60,  7000, 1),
  ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-0000000000b3', 'Eerste consult',     'First consultation', 90, 12000, 1)
on conflict (id) do nothing;

insert into public.cancellation_policies (therapist_id, notice_value, notice_unit, fee_type, fee_value, exempt_new_clients, text_nl, text_en)
values
  ('00000000-0000-4000-8000-0000000000a1', 24, 'hours', 'percent', 100, false,
   'Kosteloos annuleren tot 24 uur vooraf.', 'Free cancellation up to 24 hours before.'),
  ('00000000-0000-4000-8000-0000000000a2', 2, 'business_days', 'fixed', 2500, true,
   'Kosteloos annuleren tot 2 werkdagen vooraf.', 'Free cancellation up to 2 business days before.'),
  ('00000000-0000-4000-8000-0000000000a3', 48, 'hours', 'percent', 50, false,
   'Kosteloos annuleren tot 48 uur vooraf.', 'Free cancellation up to 48 hours before.')
on conflict (therapist_id) do nothing;

-- Room-rent settings (one row). Rates are entered by the admin (D12).
insert into public.rent_settings (billing_day, payment_term_days, auto_send)
values (1, 14, false)
on conflict (singleton) do nothing;
