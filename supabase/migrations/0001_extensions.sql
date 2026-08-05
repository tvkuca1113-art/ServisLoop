-- =============================================================================
-- 0001_extensions.sql — database primitives
--
-- Runs first. Everything here must be safe to re-run: `supabase db reset` replays
-- the whole migration folder from scratch, and CI replays it against a shadow
-- database on every `supabase db diff`.
-- =============================================================================

-- Supabase convention: extensions live in their own schema rather than `public`,
-- so that PostgREST's exposed schema contains only application objects and an
-- extension upgrade can never collide with a table name.
create schema if not exists extensions;

-- pgcrypto gives us gen_random_bytes(), used as a server-side fallback when a
-- device's `public_token` has to be minted outside the application (seed data,
-- manual backfill). Primary keys deliberately do NOT depend on it: gen_random_uuid()
-- has been a core function since PostgreSQL 13, so column defaults resolve through
-- pg_catalog and are immune to search_path differences between the migration
-- session, PostgREST and the Supabase pooler.
create extension if not exists pgcrypto with schema extensions;

comment on schema extensions is
  'Third-party extensions. Never exposed through PostgREST (see api.schemas in config.toml).';
