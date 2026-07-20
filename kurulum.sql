-- ============================================================
-- TAKVIM UYGULAMASI - Supabase kurulum semasi
-- SQL Editor'de bir kez calistirilir. Tekrar calistirmak
-- gerekirse once asagidaki DROP satirlarinin yorumunu ac.
-- ============================================================
-- drop table if exists public.olaylar;
-- drop table if exists public.uyeler cascade;

-- Uyeler: her kayitli kullanici icin bir satir
create table public.uyeler (
  id uuid primary key references auth.users(id) on delete cascade,
  eposta text,
  ad_soyad text default '',
  durum text not null default 'beklemede',  -- beklemede | aktif | engelli
  kayit_tarihi timestamptz default now(),
  son_giris timestamptz,
  giris_sayisi int not null default 0,
  islem_sayisi int not null default 0,
  odeme_tarihi timestamptz,
  veri jsonb not null default '{}'::jsonb   -- gorevler + vardiya plani
);

alter table public.uyeler enable row level security;

-- Admin kontrolu: sadece bu e-posta admin sayilir
create or replace function public.admin_mi() returns boolean
language sql stable security definer as $$
  select coalesce((auth.jwt() ->> 'email') = 'muh.safasoylu@gmail.com', false)
$$;

-- Herkes kendi satirini okur; admin herkesi okur
create policy "uye_okur" on public.uyeler for select
  using (auth.uid() = id or public.admin_mi());

-- Herkes kendi satirini gunceller (engelli guncelleyemez); admin herkesi
create policy "uye_gunceller" on public.uyeler for update
  using ((auth.uid() = id and durum <> 'engelli') or public.admin_mi())
  with check (auth.uid() = id or public.admin_mi());

-- durum / odeme_tarihi / kayit_tarihi alanlarini sadece admin degistirebilir
create or replace function public.durum_koru() returns trigger
language plpgsql security definer as $$
begin
  if not public.admin_mi() then
    new.durum := old.durum;
    new.odeme_tarihi := old.odeme_tarihi;
    new.kayit_tarihi := old.kayit_tarihi;
  end if;
  return new;
end $$;

create trigger durum_koru_tg before update on public.uyeler
  for each row execute function public.durum_koru();

-- Kayit aninda uye satiri otomatik olusur; admin e-postasi dogrudan aktif
create or replace function public.yeni_uye() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.uyeler (id, eposta, ad_soyad, durum)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'ad_soyad', ''),
    case when new.email = 'muh.safasoylu@gmail.com' then 'aktif' else 'beklemede' end
  );
  return new;
end $$;

create trigger yeni_uye_tg after insert on auth.users
  for each row execute function public.yeni_uye();

-- Olay gunlugu: giris ve islem kayitlari (site trafigi)
create table public.olaylar (
  id bigint generated always as identity primary key,
  uye_id uuid references public.uyeler(id) on delete cascade,
  tur text not null,        -- giris | islem
  detay text default '',
  zaman timestamptz default now()
);

alter table public.olaylar enable row level security;

-- Herkes kendi olayini ekler; sadece admin okur
create policy "olay_ekler" on public.olaylar for insert
  with check (auth.uid() = uye_id);

create policy "olay_okur" on public.olaylar for select
  using (public.admin_mi());
