begin;

create table public.admin_roles (
  key text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  constraint admin_roles_key_check check (key ~ '^[a-z][a-z0-9_]{2,47}$'),
  constraint admin_roles_name_check check (char_length(btrim(name)) between 1 and 80)
);

create table public.admin_permissions (
  key text primary key,
  description text not null,
  constraint admin_permissions_key_check check (key ~ '^[a-z][a-z0-9_.]{2,47}$')
);

create table public.admin_role_permissions (
  role_key text not null references public.admin_roles (key) on delete cascade,
  permission_key text not null references public.admin_permissions (key) on delete cascade,
  primary key (role_key, permission_key)
);

create table public.admin_members (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  role_key text not null references public.admin_roles (key),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles (user_id),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  previous_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now(),
  constraint admin_audit_action_check check (char_length(action) between 1 and 80),
  constraint admin_audit_resource_check check (char_length(resource_type) between 1 and 80)
);

create index admin_members_active_role_idx on public.admin_members (role_key) where is_active;
create index admin_audit_actor_created_idx on public.admin_audit_log (actor_id, created_at desc);
create index admin_audit_resource_created_idx on public.admin_audit_log (resource_type, resource_id, created_at desc);
create index reports_category_status_created_idx on public.reports (category, status, created_at desc, id desc);

create trigger admin_members_set_updated_at
before update on public.admin_members
for each row execute function public.set_updated_at();

insert into public.admin_roles (key, name) values
  ('moderator', 'Moderação'),
  ('admin', 'Administração');

insert into public.admin_permissions (key, description) values
  ('reports.read', 'Consultar denúncias e indicadores operacionais'),
  ('reports.update_status', 'Alterar o estado de denúncias');

insert into public.admin_role_permissions (role_key, permission_key) values
  ('moderator', 'reports.read'),
  ('moderator', 'reports.update_status'),
  ('admin', 'reports.read'),
  ('admin', 'reports.update_status');

alter table public.admin_roles enable row level security;
alter table public.admin_roles force row level security;
alter table public.admin_permissions enable row level security;
alter table public.admin_permissions force row level security;
alter table public.admin_role_permissions enable row level security;
alter table public.admin_role_permissions force row level security;
alter table public.admin_members enable row level security;
alter table public.admin_members force row level security;
alter table public.admin_audit_log enable row level security;
alter table public.admin_audit_log force row level security;

-- Nenhuma tabela administrativa possui policy para clientes. A autorização e
-- todas as leituras/escritas passam pelas funções abaixo, que derivam auth.uid().
create function public.has_admin_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_members member
    join public.admin_role_permissions permission on permission.role_key = member.role_key
    where member.user_id = (select auth.uid())
      and member.is_active
      and permission.permission_key = required_permission
  );
$$;

create function public.get_admin_access()
returns table (allowed boolean, role_key text, permissions text[])
language sql
stable
security definer
set search_path = ''
as $$
  select
    member.user_id is not null,
    member.role_key,
    coalesce(array_agg(permission.permission_key order by permission.permission_key)
      filter (where permission.permission_key is not null), array[]::text[])
  from (select (select auth.uid()) as caller) session
  left join public.admin_members member
    on member.user_id = session.caller and member.is_active
  left join public.admin_role_permissions permission on permission.role_key = member.role_key
  group by member.user_id, member.role_key;
$$;

create function public.get_admin_report_stats()
returns table (open_count bigint, in_review_count bigint, resolved_count bigint, closed_count bigint, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_admin_permission('reports.read') then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  return query select
    count(*) filter (where status = 'open'),
    count(*) filter (where status = 'in_review'),
    count(*) filter (where status = 'resolved'),
    count(*) filter (where status = 'closed'),
    count(*)
  from public.reports;
end;
$$;

create function public.list_admin_reports(
  page_number integer default 1,
  page_size integer default 20,
  status_filter text default null,
  category_filter text default null
)
returns table (
  id uuid, target_type text, target_id uuid, category text, status text,
  description_preview text, created_at timestamptz, updated_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare safe_page integer := greatest(coalesce(page_number, 1), 1);
declare safe_size integer := least(greatest(coalesce(page_size, 20), 1), 50);
begin
  if not public.has_admin_permission('reports.read') then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if status_filter is not null and status_filter not in ('open','in_review','resolved','closed') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if category_filter is not null and category_filter not in ('spam','harassment','hate_speech','violence','sexual_content','impersonation','privacy','other') then
    raise exception 'invalid category' using errcode = '22023';
  end if;
  return query
  select report.id, report.target_type, report.target_id, report.category, report.status,
    left(report.description, 180), report.created_at, report.updated_at, count(*) over ()
  from public.reports report
  where (status_filter is null or report.status = status_filter)
    and (category_filter is null or report.category = category_filter)
  order by report.created_at desc, report.id desc
  limit safe_size offset ((safe_page - 1) * safe_size);
end;
$$;

create function public.get_admin_report(report_id uuid)
returns table (
  id uuid, target_type text, target_id uuid, category text, status text,
  description text, created_at timestamptz, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_admin_permission('reports.read') then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  return query select report.id, report.target_type, report.target_id, report.category,
    report.status, report.description, report.created_at, report.updated_at
  from public.reports report where report.id = report_id;
end;
$$;

create function public.update_admin_report_status(report_id uuid, next_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid());
declare previous_status text;
begin
  if not public.has_admin_permission('reports.update_status') then
    raise exception 'admin permission required' using errcode = '42501';
  end if;
  if next_status not in ('open','in_review','resolved','closed') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  select status into previous_status from public.reports where id = report_id for update;
  if previous_status is null then raise exception 'report not found' using errcode = 'P0002'; end if;
  if previous_status = next_status then return; end if;
  update public.reports set status = next_status where id = report_id;
  insert into public.admin_audit_log (actor_id, action, resource_type, resource_id, previous_data, new_data)
  values (caller, 'report.status_changed', 'report', report_id,
    jsonb_build_object('status', previous_status), jsonb_build_object('status', next_status));
end;
$$;

revoke all on table public.admin_roles, public.admin_permissions, public.admin_role_permissions, public.admin_members, public.admin_audit_log from public, anon, authenticated;
revoke all on function public.has_admin_permission(text), public.get_admin_access(), public.get_admin_report_stats(), public.list_admin_reports(integer,integer,text,text), public.get_admin_report(uuid), public.update_admin_report_status(uuid,text) from public, anon;
grant execute on function public.get_admin_access(), public.get_admin_report_stats(), public.list_admin_reports(integer,integer,text,text), public.get_admin_report(uuid), public.update_admin_report_status(uuid,text) to authenticated;

commit;
