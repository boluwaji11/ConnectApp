-- ConnectApp security layer. Hand-written, because Drizzle owns table shape and not
-- security. Applied after the generated table migrations, and idempotent so it
-- can be re-run whenever a table is added.
--
-- Three things happen here:
--   1. A role the application connects as, that row-level security APPLIES to.
--   2. An RLS policy on every tenant-scoped table, reading app.tenant_id.
--   3. An append-only audit log, written by trigger so code cannot forget.

-- ---------------------------------------------------------------------------
-- 1. The application role
-- ---------------------------------------------------------------------------
-- Not the owner, because a table owner bypasses RLS. Not BYPASSRLS. Not the
-- Supabase service role. This is the only role a request path ever uses.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'hearth_app') then
    execute format('create role hearth_app login password %L', current_setting('hearth.app_password'));
  else
    execute format('alter role hearth_app login password %L', current_setting('hearth.app_password'));
  end if;
end $$;

alter role hearth_app nobypassrls;
grant usage on schema public to hearth_app;

/*
 * SEC-010. Nobody creates objects in `public` but the role that owns it.
 *
 * This is the precondition for shadowing anything a function resolves, and
 * Supabase's own bootstrap grants the whole schema to `anon`, `authenticated`
 * and `service_role`, so it is satisfied by default rather than by accident.
 * The functions above pin an empty search_path, which closes the same door from
 * the other side; both are cheap and neither is sufficient alone, because the
 * next function somebody writes may forget the pin.
 */
revoke create on schema public from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'hearth_app'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke create on schema public from %I', r);
    end if;
  end loop;
end $$;
grant select, insert, update, delete on all tables in schema public to hearth_app;
grant usage, select on all sequences in schema public to hearth_app;
alter default privileges in schema public grant select, insert, update, delete on tables to hearth_app;

/*
 * SEC-011. The platform's own tables are not a church's.
 *
 * Migration 0095 revoked `platform_admins` and `platform_events` from
 * `hearth_app`, and the blanket grant two lines above gave them straight back,
 * because this file runs after every migration. The default privileges on the
 * line above hand the next one over on creation too.
 *
 * `platform_events` carries a `tenant_id`, so it also matched the policy loop
 * below and was given a tenant policy: a church's own session could then read
 * every operator note written about that church, and write rows claiming it had
 * been approved. The audit loop already exempts `platform\_%`; the policy loop
 * did not, and nothing asserted either way.
 *
 * Taken back by pattern rather than by a list, so a table added later is
 * covered without this block being edited.
 */
do $$
declare t text;
declare p record;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'platform\_%'
  loop
    execute format('revoke all on public.%I from hearth_app', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;

  /*
   * Exempting these from the policy loop below stops a new policy being
   * written. It does not take away one written before the exemption existed,
   * and a database that has run an older copy of this file is carrying one.
   * A fresh database never had it, so the test that asserts this passes in CI
   * either way and the development database failed on the first run.
   */
  for p in
    select tablename, policyname from pg_policies
     where schemaname = 'public' and tablename like 'platform\_%'
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Tenant context helpers
-- ---------------------------------------------------------------------------
-- A missing setting returns null rather than raising, so a query without a
-- tenant context returns no rows instead of an error that might get caught and
-- swallowed. Silence is the safe failure here.
--
-- Every function pins a search_path. Without one, anyone able to create an
-- object in a schema earlier in the path could shadow something the function
-- resolves, which is a privilege-escalation path rather than a style issue.
--
-- The ones written here, and every SECURITY DEFINER function, pin `''`, so
-- everything outside pg_catalog must be schema-qualified and the shadowing has
-- nowhere to happen. Section 13 pins the handful that migrations created
-- without one, to `public, pg_catalog`, because their bodies name tables
-- unqualified; fixed rather than inherited is the property that matters there.
-- Section 11 revokes CREATE on `public` from everybody but its owner, which
-- closes the same door from the other side.

create or replace function public.app_tenant_id() returns uuid
language sql stable
set search_path = ''
as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

create or replace function public.app_role() returns text
language sql stable
set search_path = ''
as $$
  select nullif(current_setting('app.role', true), '')
$$;

create or replace function public.app_user_id() returns uuid
language sql stable
set search_path = ''
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- These are called by the RLS policies, so the application role needs them, and
-- nobody else does. PUBLIC execute would expose them over PostgREST for no reason.
revoke all on function public.app_tenant_id() from public;
revoke all on function public.app_role() from public;
revoke all on function public.app_user_id() from public;
grant execute on function public.app_tenant_id() to hearth_app;
grant execute on function public.app_role() to hearth_app;
grant execute on function public.app_user_id() to hearth_app;

-- ---------------------------------------------------------------------------
-- 3. Row-level security on every tenant-scoped table
-- ---------------------------------------------------------------------------
-- Applied in a loop over every table carrying tenant_id, so a table added later
-- cannot be forgotten: re-running this file covers it.
--
-- Deliberately NOT forced. FORCE would bind the owner too, and the owner is the
-- role that runs migrations, seeds, exports, and genuinely cross-tenant platform
-- jobs. Binding it would make those impossible and push the work into a
-- BYPASSRLS role instead, which is strictly worse.
--
-- The guarantee we ship is about hearth_app, because hearth_app is what every
-- request uses. It is not the owner, it owns no table, and it is NOBYPASSRLS,
-- all three asserted by the test suite. The owner connection never appears in a
-- request path, which is enforced by a test as well as by review.

do $$
declare t text;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and a.attnum > 0
    where n.nspname = 'public' and c.relkind = 'r'
      -- SEC-011. The platform's own, which no church reaches. See above.
      and c.relname not like 'platform\_%'
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I no force row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    /*
     * R21.1. One policy a table, and it is this one.
     *
     * A few migrations wrote a second policy of their own, named after the
     * table, that cast the setting straight to uuid. With no tenant set that
     * cast raises rather than matching nothing, so a query with no context
     * answered with an error instead of with an empty result, and a reader
     * learned that the table exists. Any such policy is taken off here.
     */
    execute format('drop policy if exists %I on public.%I', t || '_tenant', t);
    execute format(
      'create policy tenant_isolation on public.%I using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id())',
      t
    );
  end loop;
end $$;

-- The tenants table itself keys on id, not tenant_id.
alter table public.tenants enable row level security;
alter table public.tenants no force row level security;
drop policy if exists tenant_isolation on public.tenants;
create policy tenant_isolation on public.tenants
  using (id = app_tenant_id()) with check (id = app_tenant_id());

-- app_users is global, so it is reachable only for users who belong to the
-- current tenant. Without this, a join could enumerate every user on the platform.
alter table public.app_users enable row level security;
alter table public.app_users no force row level security;
drop policy if exists tenant_members_only on public.app_users;
create policy tenant_members_only on public.app_users
  using (
    exists (
      select 1 from public.tenant_members m
      where m.user_id = app_users.id and m.tenant_id = app_tenant_id()
    )
  )
  with check (
    exists (
      select 1 from public.tenant_members m
      where m.user_id = app_users.id and m.tenant_id = app_tenant_id()
    )
  );

-- R1.8. The recovery codes belong to a person, not to a church.
--
-- No tenant_id, so the policy loop never visits it, and that is the whole of
-- the reason this block exists: the blanket grant in section 1 runs after every
-- migration and hands back whatever a migration revoked. SEC-011 was that
-- mistake on the platform's own tables.
--
-- Read and written only on the owner connection, before a tenant context
-- exists, the same way a membership is. RLS on with no policy means the
-- application role sees nothing even if a grant is restored by accident.
alter table public.account_recovery_codes enable row level security;
revoke all on public.account_recovery_codes from hearth_app;

-- ---------------------------------------------------------------------------
-- 4. Confidential notes
-- ---------------------------------------------------------------------------
-- Defence in depth. The body is already encrypted with a key the database never
-- sees (R21.3), and the repository omits the field for roles that may not read
-- it (R1.5). This policy adds a third layer: a role outside the confidential
-- tier cannot even select the ciphertext column's row through a raw query.
--
-- Metadata visibility is preserved deliberately: R6.2 requires that a user sees
-- a note EXISTS, with its date and author, while being unable to read it. So the
-- policy permits the row and the encryption plus the projection withhold the
-- content.

-- ---------------------------------------------------------------------------
-- 5. Address integrity
-- ---------------------------------------------------------------------------
alter table public.addresses drop constraint if exists addresses_one_owner;
alter table public.addresses add constraint addresses_one_owner
  check ((household_id is null) <> (member_id is null));

-- ---------------------------------------------------------------------------
-- 6. Append-only audit log
-- ---------------------------------------------------------------------------
-- Written by trigger, so no code path can forget to audit. UPDATE and DELETE are
-- revoked from the application role, which is what makes R1.11's acceptance
-- criterion true: the log cannot be modified or deleted by any application role,
-- including Owner.

-- SECURITY INVOKER, not DEFINER.
--
-- DEFINER was unnecessary: hearth_app already holds INSERT on audit_entries and
-- the isolation policy passes, because the row's tenant_id is the tenant in
-- context. Running as the invoker removes an escalation surface entirely rather
-- than guarding it, which is the better trade whenever it is available.
create or replace function public.audit_write() returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_before jsonb;
  v_after jsonb;
begin
  -- R1.14. One case writes no audit row: deleting a tenant outright, which
  -- cascades to its people and would have the trigger writing rows pointing at
  -- the tenant being removed. It is set per connection, for one transaction,
  -- by the maintenance path that does it.
  --
  -- A session setting rather than disabling the triggers, because disabling one
  -- takes an exclusive lock on every audited table and stops the rest of the
  -- platform while it runs. This affects nobody but the connection that sets
  -- it, and it cannot be set through the request path: app_role() is read from
  -- the same place and the application never sets this one.
  -- Honoured for the owner connection only. hearth_app is what every request
  -- runs as, and a query layer that could switch its own auditing off is a
  -- query layer that could erase what it did. Setting it there changes nothing.
  if coalesce(current_setting('app.audit_off', true), '') = '1'
     and current_user <> 'hearth_app' then
    return null;
  end if;

  if tg_op = 'DELETE' then
    v_before := to_jsonb(old);
    v_tenant := (v_before ->> 'tenant_id')::uuid;
  else
    v_after := to_jsonb(new);
    v_tenant := (v_after ->> 'tenant_id')::uuid;
    if tg_op = 'UPDATE' then v_before := to_jsonb(old); end if;
  end if;

  -- Never store a confidential note's ciphertext in the audit log. The log is
  -- read by more people than the note is.
  if tg_table_name = 'notes' then
    v_before := v_before - 'body_encrypted' - 'body';
    v_after  := v_after  - 'body_encrypted' - 'body';
  end if;

  -- R21.15. Nor a church's own provider credential. It is sealed in the column
  -- and no read path selects it, and an audit row carrying it would put every
  -- church's mail password into a log that Owner can read and that nothing can
  -- ever edit. Who connected what still lands here: only the secret comes out.
  --
  -- SEC-023. `access_token` is sealed with the same key and carries the same
  -- objection, and it was the one of the two that stayed in the log.
  if tg_table_name = 'church_providers' then
    v_before := v_before - 'credential' - 'access_token';
    v_after  := v_after  - 'credential' - 'access_token';
  end if;

  -- SEC-023. A child's pickup code, which is the strongest reason of the lot.
  --
  -- The argument written above for a note is "the log is read by more people
  -- than the note is", and it is truer here: a security code is the one control
  -- between a stranger and a child, and every live code was landing in a table
  -- that an Owner can read and that nothing can edit or delete. The visit, the
  -- room and the times still land. Only the code comes out.
  if tg_table_name = 'checkin_visits' then
    v_before := v_before - 'code';
    v_after  := v_after  - 'code';
  end if;

  -- SEC-023. The tokens that are somebody's whole credential on a public path:
  -- the unsubscribe link, and the one a serving request is answered by. A
  -- guessable one would let anybody take anybody off the church's list, which
  -- is what the column's own comment says, and a logged one needs no guessing.
  if tg_table_name = 'contact_consent' then
    v_before := v_before - 'token';
    v_after  := v_after  - 'token';
  end if;

  if tg_table_name = 'serving_assignments' then
    v_before := v_before - 'respond_token';
    v_after  := v_after  - 'respond_token';
  end if;

  insert into public.audit_entries (tenant_id, actor_user_id, actor_role, action, entity, entity_id, before, after, ip)
  values (
    v_tenant,
    public.app_user_id(),
    public.app_role(),
    lower(tg_op)::public.audit_action,
    tg_table_name,
    coalesce((v_after ->> 'id')::uuid, (v_before ->> 'id')::uuid),
    v_before,
    v_after,
    nullif(current_setting('app.ip', true), '')
  );

  return coalesce(new, old);
end $$;

-- Every table that carries a tenant_id gets the trigger, found by looking rather
-- than by a list. A list is a thing somebody forgets to add to, and an unaudited
-- table looks identical to an audited one until the day someone asks who changed
-- a record. audit_entries itself is excluded: auditing the audit log recurses.
--
-- The platform's own tables are excluded too, and that one is not a convenience.
-- `platform_events.tenant_id` names the church an operator acted on, which is a
-- different thing from the column this loop is looking for: it is null for every
-- action that is not about one church, and granting an operator is one of those.
-- Auditing it therefore wrote an audit_entries row with no tenant and the insert
-- was refused, so nobody could be granted the portal at all. Those tables sit
-- outside the tenancy and keep their own append-only log in platform_events.
do $$
declare t text;
declare old_trigger text;
begin
  /* A database set up before the exclusion above carries the trigger already,
     and the loop below cannot take off a trigger from a table it no longer
     visits. */
  for t in
    select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'platform\_%'
  loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
  end loop;

  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and a.attnum > 0
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relname <> 'audit_entries'
       and c.relname not like 'platform\_%'
     order by c.relname
  loop
    /*
     * R1.11. One audit trigger a table.
     *
     * A table that has been renamed keeps the trigger it carried under its
     * old name, and both fire: every insert on members was written to the
     * audit log twice, once as members and once as people. Anything on this
     * table that writes the audit log under another name is taken off.
     */
    for old_trigger in
      select tgname from pg_trigger
       where tgrelid = format('public.%I', t)::regclass
         and not tgisinternal
         and tgfoid = 'public.audit_write()'::regprocedure
         and tgname <> 'audit_' || t
    loop
      execute format('drop trigger %I on public.%I', old_trigger, t);
    end loop;

    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format(
      'create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function audit_write()',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. R1.2. Campus, filled in rather than left null
-- ---------------------------------------------------------------------------
--
-- Every record that belongs somewhere carries a campus_id. The UI is
-- single-campus and says nothing about it, so nothing on a screen ever sets
-- one, and the column would be a column of nulls that a multi-campus release
-- has to backfill from nothing.
--
-- So the database fills it: on insert, a null campus_id becomes the tenant's
-- primary campus. By trigger rather than by code, because the call sites are
-- the people repository, the importer, the seed script and whatever is written
-- next, and a rule enforced in four of those five places is not a rule.

create or replace function public.campus_default() returns trigger
language plpgsql
security invoker
as $$
declare v_campus uuid;
begin
  if new.campus_id is not null then return new; end if;

  select id into v_campus
    from public.campuses
   where tenant_id = new.tenant_id
     and is_primary
   order by created_at
   limit 1;

  new.campus_id := v_campus;
  return new;
end $$;

-- Found by looking, like the audit triggers. A table that gains a campus_id
-- later is covered the next time this file runs.
do $$
declare t text;
declare old_trigger text;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'campus_id' and a.attnum > 0
      join pg_attribute b on b.attrelid = c.oid and b.attname = 'tenant_id' and b.attnum > 0
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relname <> 'campuses'
       and c.relname <> 'locations'
     order by c.relname
  loop
    /* The same housekeeping as the audit triggers: a renamed table keeps the
       trigger it carried under its old name, and both fire. */
    for old_trigger in
      select tgname from pg_trigger
       where tgrelid = format('public.%I', t)::regclass
         and not tgisinternal
         and tgfoid = 'public.campus_default()'::regprocedure
         and tgname <> 'campus_default_' || t
    loop
      execute format('drop trigger %I on public.%I', old_trigger, t);
    end loop;

    execute format('drop trigger if exists campus_default_%1$s on public.%1$I', t);
    execute format(
      'create trigger campus_default_%1$s before insert on public.%1$I for each row execute function campus_default()',
      t
    );
  end loop;
end $$;

revoke all on function public.campus_default() from public;
grant execute on function public.campus_default() to hearth_app;

-- R1.2. Anything written before the trigger existed. Harmless to run again, and
-- a no-op on the second pass because every row already has one.
--
-- Audited off for the duration. A church with four thousand records would
-- otherwise get four thousand audit rows saying a column nobody has ever seen
-- changed from null to the only value it could have.
do $$
declare t text;
begin
  perform set_config('app.audit_off', '1', true);

  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'campus_id' and a.attnum > 0
      join pg_attribute b on b.attrelid = c.oid and b.attname = 'tenant_id' and b.attnum > 0
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relname not in ('campuses', 'locations')
     order by c.relname
  loop
    execute format(
      'update public.%1$I t set campus_id = c.id from public.campuses c'
      ' where c.tenant_id = t.tenant_id and c.is_primary and t.campus_id is null',
      t
    );
  end loop;
end $$;

-- Not callable as an API endpoint. It is a trigger function, and a trigger fires
-- it regardless of EXECUTE privilege, so nothing needs to be able to call it.
revoke all on function public.audit_write() from public;
grant execute on function public.audit_write() to hearth_app;

-- The log is append only. Insert is allowed so the trigger and the confidential
-- read path can write; nothing may change or remove an entry.
revoke update, delete, truncate on public.audit_entries from hearth_app;
alter table public.audit_entries enable row level security;
alter table public.audit_entries no force row level security;
drop policy if exists tenant_isolation on public.audit_entries;
create policy tenant_isolation on public.audit_entries
  using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());

-- ---------------------------------------------------------------------------
-- 7. Nothing is reachable over the auto-generated REST API
-- ---------------------------------------------------------------------------
-- Supabase exposes the public schema through PostgREST to the anon and
-- authenticated roles. ConnectApp does not use PostgREST at all: every query goes
-- through Drizzle on the hearth_app connection, because field-level permissions
-- belong in our query layer.
--
-- Row-level security already reduces those roles to zero rows, since they cannot
-- set app.tenant_id. This removes the privilege as well, so the guarantee does
-- not rest on a policy evaluating the way we expect. Two independent reasons a
-- request over that API returns nothing is better than one.

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated']
  loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);
      execute format('alter default privileges in schema public revoke all on tables from %I', r);
      execute format('alter default privileges in schema public revoke all on sequences from %I', r);
      execute format('alter default privileges in schema public revoke all on functions from %I', r);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- The device list and remote revoke were cut in October 2026, and the two
-- security-definer functions that stood at the auth boundary went with them.
-- A church of this size has one admin and one laptop. Signing out ends the
-- session on the device in front of them, and a password change invalidates
-- the refresh tokens everywhere, which is the answer to a lost laptop.
-- ---------------------------------------------------------------------------

drop function if exists public.my_sessions();
drop function if exists public.revoke_session(uuid);


-- ---------------------------------------------------------------------------
-- R1.16. The church bucket, and who may write into it.
--
-- Objects are laid out as <church-slug>/<purpose>/<id>.<ext>, so one string
-- comparison answers which church an object belongs to. The policies read
-- membership from our own tables through a security-definer helper, because
-- storage.objects cannot see app.tenant_id: it is reached with the user's own
-- Supabase session rather than through our pooled connection.
--
-- The bucket is private. Everything is served through a signed URL with a short
-- life, so a leaked path is not a permanent hole.
--
-- Conditional, because the storage schema belongs to Supabase.
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'storage.objects not present, skipping bucket policies';
    return;
  end if;

  -- The membership check the bucket policies call.
  --
  -- It lives outside public because PostgREST serves every function in the
  -- exposed schema as an RPC endpoint, and the storage policies are evaluated
  -- as the authenticated role, so the role has to be able to execute it. A
  -- schema PostgREST does not expose gives the policies what they need without
  -- publishing a security definer function on the open API.
  create schema if not exists connectapp;
  execute 'grant usage on schema connectapp to authenticated';

  /*
   * The function was written into a schema named after the old product name
   * and the rename only reached half of it: the schema created here was the
   * new one and the function was still put in the old. A database made before
   * this keeps both, so the old one is taken off once the new one is in place
   * below.
   */

  execute $fn$
    create or replace function connectapp.user_in_church(p_slug text)
    returns boolean
    language sql
    security definer
    set search_path = ''
    stable
    as $body$
      select exists (
        select 1
        from public.tenant_members m
        join public.tenants t on t.id = m.tenant_id
        where m.user_id = auth.uid() and t.slug = p_slug
      )
    $body$;
  $fn$;

  execute 'revoke all on function connectapp.user_in_church(text) from public';
  execute 'grant execute on function connectapp.user_in_church(text) to authenticated';

  insert into storage.buckets (id, name, public)
  values ('church', 'church', false)
  on conflict (id) do update set public = false;

  execute 'drop policy if exists church_read on storage.objects';
  execute 'drop policy if exists church_logo_read on storage.objects';
  execute 'drop policy if exists church_website_media_read on storage.objects';
  execute 'drop policy if exists church_write on storage.objects';
  execute 'drop policy if exists church_update on storage.objects';
  execute 'drop policy if exists church_delete on storage.objects';

  /*
   * HRT-377, R22.2. Whether a stored picture is one a published website shows.
   *
   * A church's website media sits in the church's own private folder, and this
   * is the one thing that lets a reader with no account fetch any of it. So it
   * answers the narrowest question there is: does the church's LIVE document
   * point at this exact object. A picture on the draft is refused, and so is a
   * picture the church has taken off the page, within the same press.
   *
   * The document is a tree, so the key is looked for at any depth rather than
   * in named fields: a hero's photograph, a card's picture inside a repeated
   * row, a section's background, the header's logo. The old flat homepage is
   * still answered underneath, for a church whose site has not been brought
   * forward yet.
   */
  execute $fn$
    create or replace function connectapp.website_media_is_public(p_key text)
    returns boolean
    language sql
    stable
    security definer
    set search_path = ''
    as $body$
      select exists (
        select 1
        from public.stored_files sf
        join public.tenants t on t.id = sf.tenant_id
        left join public.church_sites cs on cs.tenant_id = sf.tenant_id
        left join public.church_websites w on w.tenant_id = sf.tenant_id
        where sf.bucket = 'church'
          and sf.key = p_key
          and sf.purpose = 'website_media'
          and t.approved_at is not null
          and t.demo_expires_at is null
          and (
            (
              cs.live is not null
              and pg_catalog.jsonb_path_exists(
                cs.live,
                '$.**.key ? (@ == $k)',
                pg_catalog.jsonb_build_object('k', p_key)
              )
            )
            or (
              w.published
              and exists (
                select 1
                from pg_catalog.jsonb_array_elements(w.sections) section(value)
                where section.value ->> 'imageKey' = p_key
                   or section.value ->> 'videoKey' = p_key
              )
            )
          )
      )
    $body$;
  $fn$;

  execute 'revoke all on function connectapp.website_media_is_public(text) from public';
  execute 'grant execute on function connectapp.website_media_is_public(text) to anon, authenticated';

  execute $pol$
    create policy church_read on storage.objects for select to authenticated
    using (bucket_id = 'church' and connectapp.user_in_church((storage.foldername(name))[1]))
  $pol$;
  /*
   * R1.1. A church's mark, readable by anybody.
   *
   * The door a member signs in at, the giving page and the group finder are
   * all screens somebody meets before they belong to the church, and a church
   * logo is public by nature: it is on their website and their notice sheet.
   * Everything else in the bucket stays behind the membership check above.
   *
   * Narrowed to the logo folder by position, so widening it means writing a
   * second policy rather than adding a file to the wrong folder.
   */
  execute $pol$
    create policy church_logo_read on storage.objects for select to anon, authenticated
    using (bucket_id = 'church' and (storage.foldername(name))[2] = 'logo')
  $pol$;
  execute $pol$
    create policy church_website_media_read on storage.objects for select to anon, authenticated
    using (
      bucket_id = 'church'
      and (storage.foldername(name))[2] = 'website_media'
      and connectapp.website_media_is_public(name)
    )
  $pol$;
  execute $pol$
    create policy church_write on storage.objects for insert to authenticated
    with check (bucket_id = 'church' and connectapp.user_in_church((storage.foldername(name))[1]))
  $pol$;
  execute $pol$
    create policy church_update on storage.objects for update to authenticated
    using (bucket_id = 'church' and connectapp.user_in_church((storage.foldername(name))[1]))
    with check (bucket_id = 'church' and connectapp.user_in_church((storage.foldername(name))[1]))
  $pol$;
  execute $pol$
    create policy church_delete on storage.objects for delete to authenticated
    using (bucket_id = 'church' and connectapp.user_in_church((storage.foldername(name))[1]))
  $pol$;

  -- R4.1. What somebody with no account may write, and only that.
  --
  -- A form question can ask for a file, and whoever answers it has no session
  -- to upload on. Rather than putting the service role key in a request path,
  -- the anon role is given one narrow door: insert only, only into this
  -- bucket, only under <church>/form_answer/, and only for a church that
  -- exists and has been approved. It can read nothing, change nothing and
  -- delete nothing.
  --
  -- The route in front of it is what checks the form is open, the question
  -- takes files, the type is one it asks for, the size is inside the ceiling
  -- and the church has the room. The policy is the second say, not the first.
  execute $fn$
    create or replace function connectapp.church_takes_files(p_slug text)
    returns boolean
    language sql
    security definer
    set search_path = ''
    stable
    as $body$
      select exists (
        select 1 from public.tenants t
         where t.slug = p_slug
           and t.approved_at is not null
           and t.demo_expires_at is null
      )
    $body$
  $fn$;
  execute 'grant usage on schema connectapp to anon';
  execute 'grant execute on function connectapp.church_takes_files(text) to anon';

  execute 'drop policy if exists church_public_answer on storage.objects';
  execute $pol$
    create policy church_public_answer on storage.objects for insert to anon
    with check (
      bucket_id = 'church'
      and (storage.foldername(name))[2] = 'form_answer'
      and connectapp.church_takes_files((storage.foldername(name))[1])
    )
  $pol$;

  /*
   * What the rename left behind.
   *
   * Both functions were written into a schema named after the old product and
   * the rename reached only one of them, so `church_takes_files` was still
   * being created in `hearth` while nothing created that schema. A database
   * made before the rename has it and carried on working; a database made
   * from this file on a fresh project stopped here with "schema hearth does
   * not exist", which is how it was found.
   *
   * Dropped once nothing points at either of them, and only where the schema
   * is actually there: `drop ... if exists` forgives a missing function and
   * still raises on a missing schema.
   */
  if exists (select 1 from pg_namespace where nspname = 'hearth') then
    execute 'drop function if exists hearth.user_in_church(text)';
    execute 'drop function if exists hearth.church_takes_files(text)';
  end if;

  -- Where it used to live, when it was also an RPC endpoint.
  execute 'drop function if exists public.user_in_church(text)';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Function privileges in public, by pattern rather than by list
-- ---------------------------------------------------------------------------
-- SEC-012. A function created in Postgres carries EXECUTE for PUBLIC by
-- default, and this file revoked that one function at a time. Five escaped the
-- list: `hearth_slug`, `hearth_free_person_slug`, `hearth_free_report_slug`,
-- `hearth_free_member_slug` and `hearth_free_mailer_slug`, all added by later
-- migrations. The role-by-role revoke in section 9 cannot reach them, because
-- revoking from `anon` does not remove a privilege `anon` holds through PUBLIC,
-- so they stayed executable by anybody the database lets connect.
--
-- The exposure is small: each reads a tenant-scoped table as the invoker, and
-- `anon` holds no SELECT there, so the call errors rather than answering. The
-- defect is the list, which is a thing somebody forgets to add to. This is the
-- same shape as the audit trigger's coverage loop: ask the catalogue.
--
-- hearth_app is granted EXECUTE on each in the same pass, which is what it
-- held through PUBLIC a moment ago, so nothing it calls stops working.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'hearth_app') then
      execute format('grant execute on function %s to hearth_app', f.sig);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Every function in public has a fixed search_path
-- ---------------------------------------------------------------------------
-- SEC-012. A function with no `search_path` of its own resolves names through
-- whatever the calling session happens to have set. For a SECURITY DEFINER
-- function that is escalation, and the three of those pin an empty path and
-- schema-qualify everything. For a SECURITY INVOKER function it is narrower,
-- since the body runs with the caller's own privileges, but a caller who sets a
-- hostile path still redirects which table the function reads.
--
-- `campus_default` and the five slug helpers were created by migrations without
-- one. They are pinned here rather than rewritten, and to `public, pg_catalog`
-- rather than to the empty string, because their bodies name `members`,
-- `saved_reports` and `mailers` unqualified: an empty path would pin them to
-- failure instead of to safety. Fixed is the property that matters. Rewriting
-- those bodies to qualify every name, and then pinning them to nothing like the
-- rest, is HRT-425.
--
-- Anything created with a path already set is left exactly as it is, so this
-- cannot quietly widen one of the three that pin nothing.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.proname not like 'pg\_%'
       and (p.proconfig is null
            or not exists (
              select 1 from unnest(p.proconfig) as c where c like 'search\_path=%'
            ))
  loop
    execute format('alter function %s set search_path = public, pg_catalog', f.sig);
  end loop;
end $$;
