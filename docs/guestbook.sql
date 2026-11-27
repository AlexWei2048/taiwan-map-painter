-- Island Palette guestbook. Run once in the dedicated Supabase project's SQL editor as postgres.
-- No table is exposed through the public API. Only the RPCs below are granted to anon.
begin;
create schema if not exists guestbook_private;
revoke all on schema guestbook_private from public, anon, authenticated;
create table if not exists guestbook_private.messages (
 id uuid primary key, owner_hash text not null, nickname text not null,
 category text not null check(category in ('suggestion','correction','feature','other')),
 body text not null, created_at timestamptz not null default now(),
 visibility text not null default 'pending' check(visibility in ('pending','approved','rejected')),
 reply text not null default '', reviewed_at timestamptz,
 check(char_length(nickname) between 1 and 24), check(char_length(body) between 5 and 1500)
);
create table if not exists guestbook_private.contacts (
 message_id uuid primary key references guestbook_private.messages(id) on delete cascade,
 contact text not null check(char_length(contact) between 1 and 200)
);
create index if not exists guestbook_messages_owner on guestbook_private.messages(owner_hash,created_at desc);
create index if not exists guestbook_messages_public on guestbook_private.messages(visibility,created_at desc);
create index if not exists guestbook_messages_created on guestbook_private.messages(created_at desc);
alter table guestbook_private.messages enable row level security;
alter table guestbook_private.contacts enable row level security;
revoke all on all tables in schema guestbook_private from public, anon, authenticated;

create or replace function public.guestbook_submit(p_id uuid,p_secret text,p_nickname text,p_category text,p_body text,p_contact text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 owner_digest text; nick text := coalesce(nullif(btrim(p_nickname),''),'匿名访客');
 body_text text := btrim(coalesce(p_body,'')); contact_text text := btrim(coalesce(p_contact,''));
 existing guestbook_private.messages%rowtype;
begin
 if p_id is null or p_secret is null or p_secret !~ '^[0-9a-f]{64}$' then raise exception '无效的留言凭证'; end if;
 if char_length(nick)>24 or char_length(body_text) not between 5 and 1500 or char_length(contact_text)>200 or p_category is null or p_category not in ('suggestion','correction','feature','other') then raise exception '请检查留言内容和长度'; end if;
 if contact_text<>'' and (position(lower(contact_text) in lower(body_text))>0 or position(lower(contact_text) in lower(nick))>0) then raise exception '请勿在公开内容中填写联系方式'; end if;
 owner_digest:=encode(sha256(convert_to(p_secret,'UTF8')),'hex');
 -- Serialize submissions for atomic throttling; no IP addresses are stored.
 perform pg_advisory_xact_lock(20261127,1);
 select * into existing from guestbook_private.messages where id=p_id;
 if found then
   if existing.owner_hash<>owner_digest then raise exception '无效的留言凭证'; end if;
   return jsonb_build_object('id',existing.id,'visibility',existing.visibility);
 end if;
 if (select count(*) from guestbook_private.messages where owner_hash=owner_digest and created_at>now()-interval '10 minutes')>=3
 or (select count(*) from guestbook_private.messages where created_at>now()-interval '10 minutes')>=50 then
   raise exception '留言过于频繁，请稍后重试';
 end if;
 insert into guestbook_private.messages(id,owner_hash,nickname,category,body) values(p_id,owner_digest,nick,p_category,body_text);
 if contact_text<>'' then insert into guestbook_private.contacts(message_id,contact) values(p_id,contact_text); end if;
 return jsonb_build_object('id',p_id,'visibility','pending');
end $$;

create or replace function public.guestbook_public(p_category text default '',p_offset integer default 0)
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc,t.id desc),'[]'::jsonb)
 from (select id,nickname,category,body,created_at,reply from guestbook_private.messages
 where visibility='approved' and (coalesce(p_category,'')='' or category=p_category)
 order by created_at desc,id desc limit 20 offset greatest(0,least(coalesce(p_offset,0),10000))) t
$$;

create or replace function public.guestbook_mine(p_secret text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if p_secret is null or p_secret !~ '^[0-9a-f]{64}$' then raise exception '无效的留言凭证'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc,t.id desc),'[]'::jsonb)
 from (select m.id,m.nickname,m.category,m.body,m.created_at,m.visibility,m.reply,c.contact
 from guestbook_private.messages m left join guestbook_private.contacts c on c.message_id=m.id
 where m.owner_hash=encode(sha256(convert_to(p_secret,'UTF8')),'hex')
 order by m.created_at desc,m.id desc limit 100) t);
end $$;

create or replace function public.guestbook_remove_contact(p_id uuid,p_secret text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
 if p_secret is null or p_secret !~ '^[0-9a-f]{64}$' then return false; end if;
 if not exists(select 1 from guestbook_private.messages where id=p_id and owner_hash=encode(sha256(convert_to(p_secret,'UTF8')),'hex')) then return false; end if;
 delete from guestbook_private.contacts where message_id=p_id;
 return true;
end $$;

revoke all on function public.guestbook_submit(uuid,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.guestbook_public(text,integer) from public,anon,authenticated;
revoke all on function public.guestbook_mine(text) from public,anon,authenticated;
revoke all on function public.guestbook_remove_contact(uuid,text) from public,anon,authenticated;
grant execute on function public.guestbook_submit(uuid,text,text,text,text,text) to anon;
grant execute on function public.guestbook_public(text,integer) to anon;
grant execute on function public.guestbook_mine(text) to anon;
grant execute on function public.guestbook_remove_contact(uuid,text) to anon;
commit;

-- Developer moderation, only in authenticated SQL editor, not a public RPC:
-- select m.id,m.nickname,m.category,m.body,m.visibility,m.created_at,c.contact
-- from guestbook_private.messages m left join guestbook_private.contacts c on c.message_id=m.id order by m.created_at desc;
-- update guestbook_private.messages set visibility='approved',reply='感谢建议',reviewed_at=now() where id='<message UUID>';
-- update guestbook_private.messages set visibility='rejected',reviewed_at=now() where id='<message UUID>';
