-- HRT-425, SEC-012. The slug helpers name their tables, so they can pin nothing.
--
-- Every function in `public` has a fixed `search_path`, which `security.sql`
-- enforces. These five were created without one and were pinned to
-- `public, pg_catalog` rather than to the empty string, because their bodies
-- named `members`, `saved_reports` and `mailers` unqualified: an empty path
-- would have pinned them to failure instead of to safety.
--
-- Fixed was the property that mattered and it was already true. What is left
-- is the difference between a path with a schema in it and a path with none.
-- A caller who can create objects in a schema on that path can shadow a name
-- the body resolves; with nothing on the path, every name in the body has to
-- be written out and there is nothing left to shadow. These are SECURITY
-- INVOKER, so this is defence in depth rather than a hole being closed, which
-- is why it waited.
--
-- `pg_catalog` is searched whether or not it is named, so the built-in
-- functions, operators and types below still resolve with an empty path.

create or replace function public.hearth_slug(source text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    left(
      trim(both '-' from regexp_replace(
        lower(replace(replace(coalesce(source, ''), '''', ''), '’', '')),
        '[^a-z0-9]+', '-', 'g')),
      60),
    '')
$$;

create or replace function public.hearth_free_member_slug(tenant uuid, words text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  base text := coalesce(public.hearth_slug(words), 'member');
  candidate text := base;
  n int := 1;
begin
  while exists (
    select 1 from public.members m where m.tenant_id = tenant and m.slug = candidate
  ) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end $$;

create or replace function public.hearth_free_report_slug(
  tenant uuid, words text, keeping uuid default null
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  base text := coalesce(public.hearth_slug(words), 'report');
  candidate text := base;
  n int := 1;
begin
  while exists (
    select 1 from public.saved_reports r
     where r.tenant_id = tenant and r.slug = candidate
       and (keeping is null or r.id <> keeping)
  ) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end $$;

create or replace function public.hearth_free_mailer_slug(
  tenant uuid, words text, keeping uuid default null
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  base text := coalesce(public.hearth_slug(words), 'mailer');
  candidate text := base;
  n int := 1;
begin
  while exists (
    select 1 from public.mailers m
     where m.tenant_id = tenant and m.slug = candidate
       and (keeping is null or m.id <> keeping)
  ) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end $$;

-- `campus_default` is not here. `security.sql` owns its definition and rewrites
-- it on every migration, so a copy in a migration would be overwritten by the
-- next deployment and the two would disagree about what the function is. It is
-- pinned where it lives instead.
