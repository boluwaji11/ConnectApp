-- HRT-437, R1.8, R21.4. Two-step verification.
--
-- Supabase holds the factor itself, which is why it was chosen (PRD 13.9).
-- Two things it does not hold are kept here.

-- The mirror. Whether a person has finished setting up is asked on every
-- request that resolves a session, and asking Supabase for it is a round trip
-- on every navigation. This is read in the same statement as the memberships.
--
-- A mirror can drift from what Supabase holds, so nothing refuses anybody on
-- this column alone: the screen that acts on it reads the factors themselves
-- and clears this where Supabase says there is none.
alter table app_users
  add column if not exists mfa_enrolled_at timestamptz;

-- The way back in when the phone is gone.
--
-- Supabase has no recovery codes of its own on the version this runs against,
-- and enrolment without recovery hands every lost phone to the one person
-- maintaining this (PRD 5.6). Ten codes, shown once, hashed here, spent on
-- first use.
create table if not exists account_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users (id) on delete cascade,

  -- SHA-256 of the code, lowercased and stripped of its separator. The code
  -- itself is never stored, so this table being read hands nobody a way in.
  code_hash text not null,

  -- Set the first time it works. A spent code is kept rather than deleted, so
  -- the count of what is left is honest and a reuse is distinguishable from a
  -- code that was never issued.
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists account_recovery_codes_user_idx
  on account_recovery_codes (user_id);

-- One live set a person. Reissuing replaces, it does not accumulate.
create index if not exists account_recovery_codes_live_idx
  on account_recovery_codes (user_id)
  where used_at is null;

-- This belongs to a person rather than to a church, so it carries no tenant_id
-- and gets no tenant policy. It is read before a tenant context exists, on the
-- owner connection, the same way a membership is. RLS on with no policy, and
-- the application role revoked outright: nothing in a request path reaches it.
alter table account_recovery_codes enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'hearth_app') then
    revoke all on account_recovery_codes from hearth_app;
  end if;
end $$;
