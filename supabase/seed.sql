-- Local/staging seed data for browser E2E runs.
--
-- These users are intentionally synthetic. Hosted staging should either use these
-- accounts with staging-only access or replace their passwords immediately after
-- the first seed and store the real values in GitHub Environment secrets.

create extension if not exists pgcrypto with schema extensions;

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_sso_user,
  is_anonymous
) values
  (
    'eeeeeeee-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'e2e-gm@example.test',
    extensions.crypt('HexmapE2E123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"E2E GM"}'::jsonb,
    now(),
    now(),
    false,
    false
  ),
  (
    'eeeeeeee-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'e2e-player1@example.test',
    extensions.crypt('HexmapE2E123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"E2E Player 1"}'::jsonb,
    now(),
    now(),
    false,
    false
  ),
  (
    'eeeeeeee-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'e2e-player2@example.test',
    extensions.crypt('HexmapE2E123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"E2E Player 2"}'::jsonb,
    now(),
    now(),
    false,
    false
  )
on conflict (id) do update set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = now();

insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
) values
  (
    'eeeeeeee-0000-0000-0000-000000000001',
    'eeeeeeee-0000-0000-0000-000000000001',
    'eeeeeeee-0000-0000-0000-000000000001',
    '{"sub":"eeeeeeee-0000-0000-0000-000000000001","email":"e2e-gm@example.test","email_verified":true,"phone_verified":false}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    'eeeeeeee-0000-0000-0000-000000000002',
    'eeeeeeee-0000-0000-0000-000000000002',
    'eeeeeeee-0000-0000-0000-000000000002',
    '{"sub":"eeeeeeee-0000-0000-0000-000000000002","email":"e2e-player1@example.test","email_verified":true,"phone_verified":false}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    'eeeeeeee-0000-0000-0000-000000000003',
    'eeeeeeee-0000-0000-0000-000000000003',
    'eeeeeeee-0000-0000-0000-000000000003',
    '{"sub":"eeeeeeee-0000-0000-0000-000000000003","email":"e2e-player2@example.test","email_verified":true,"phone_verified":false}'::jsonb,
    'email',
    now(),
    now(),
    now()
  )
on conflict (provider_id, provider) do update set
  identity_data = excluded.identity_data,
  updated_at = now();

insert into storage.buckets (id, name, public) values
  ('bug-screenshots', 'bug-screenshots', false),
  ('dungeon-images', 'dungeon-images', false),
  ('reference-photos', 'reference-photos', true),
  ('session-maps', 'session-maps', false)
on conflict (id) do update set public = excluded.public;
