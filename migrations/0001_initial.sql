-- PostgreSQL 14+, applied as a migration owner, not as the runtime role.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid text NOT NULL UNIQUE,
  email text,
  display_name text NOT NULL,
  avatar_url text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deletion_requested')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE diaries (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  kind text NOT NULL CHECK (kind IN ('personal','connected')),
  relationship_label text,
  other_name text,
  target_mode text NOT NULL DEFAULT 'none' CHECK (target_mode IN ('none','date','duration')),
  target_duration integer CHECK (target_duration BETWEEN 1 AND 36500),
  target_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'personal' AND relationship_label IS NULL AND other_name IS NULL) OR
         (kind = 'connected' AND length(relationship_label) BETWEEN 1 AND 60 AND length(other_name) BETWEEN 1 AND 80)),
  CHECK ((target_mode = 'none' AND target_duration IS NULL AND target_date IS NULL) OR
         (target_mode = 'date' AND target_duration IS NULL AND target_date IS NOT NULL) OR
         (target_mode = 'duration' AND target_duration IS NOT NULL))
);
CREATE TABLE diary_members (
  diary_id uuid NOT NULL REFERENCES diaries(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('owner','member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (diary_id, user_id),
  UNIQUE (diary_id, role)
);
CREATE INDEX diary_members_user_idx ON diary_members(user_id, diary_id);
CREATE OR REPLACE FUNCTION enforce_membership_limits() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE member_total integer; space_total integer; diary_kind text; diary_owner uuid;
BEGIN
  -- Row locks serialize concurrent joins across both the diary and the user.
  PERFORM 1 FROM users WHERE id = NEW.user_id FOR UPDATE;
  SELECT kind, owner_id INTO diary_kind, diary_owner FROM diaries WHERE id = NEW.diary_id FOR UPDATE;
  IF diary_kind IS NULL THEN RAISE EXCEPTION 'Diary missing' USING ERRCODE='23503'; END IF;
  SELECT count(*) INTO member_total FROM diary_members WHERE diary_id=NEW.diary_id;
  SELECT count(*) INTO space_total FROM diary_members WHERE user_id=NEW.user_id;
  IF member_total >= 2 OR (diary_kind = 'personal' AND member_total >= 1) THEN
    RAISE EXCEPTION 'Diary member limit reached' USING ERRCODE='23514';
  END IF;
  IF space_total >= 2 THEN RAISE EXCEPTION 'User diary limit reached' USING ERRCODE='23514'; END IF;
  IF (NEW.role='owner') <> (NEW.user_id=diary_owner) THEN
    RAISE EXCEPTION 'Invalid diary owner role' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enforce_membership_limits_before_insert BEFORE INSERT ON diary_members
FOR EACH ROW EXECUTE FUNCTION enforce_membership_limits();
-- Membership removal is not offered in v1: otherwise prior approvals need invalidation.
CREATE OR REPLACE FUNCTION block_membership_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Membership changes require a controlled support process' USING ERRCODE='55000'; END $$;
CREATE TRIGGER prevent_membership_mutation BEFORE UPDATE OR DELETE ON diary_members
FOR EACH ROW EXECUTE FUNCTION block_membership_change();

CREATE TABLE diary_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diary_id uuid NOT NULL REFERENCES diaries(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES users(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by uuid REFERENCES users(id),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX diary_invitations_diary_idx ON diary_invitations(diary_id, created_at DESC);
CREATE TABLE diary_key_envelopes (
  diary_id uuid NOT NULL REFERENCES diaries(id) ON DELETE RESTRICT,
  purpose text NOT NULL CHECK (purpose IN ('password','owner_escrow')),
  envelope jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(diary_id, purpose)
);
CREATE TABLE feelings_vault (
  diary_id uuid PRIMARY KEY REFERENCES diaries(id) ON DELETE RESTRICT,
  unlocked_at timestamptz
);
CREATE TABLE vault_approvals (
  diary_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(diary_id,user_id),
  FOREIGN KEY (diary_id,user_id) REFERENCES diary_members(diary_id,user_id) ON DELETE RESTRICT
);
CREATE TABLE connection_state (
  diary_id uuid PRIMARY KEY REFERENCES diaries(id) ON DELETE RESTRICT,
  connected_at timestamptz,
  last_streak_break_at timestamptz
);
CREATE TABLE media_uploads (
  id uuid PRIMARY KEY,
  diary_id uuid NOT NULL,
  author_id uuid NOT NULL,
  object_key text NOT NULL UNIQUE,
  declared_mime text NOT NULL,
  plaintext_size bigint NOT NULL CHECK (plaintext_size > 0),
  ciphertext_size bigint NOT NULL CHECK (ciphertext_size = plaintext_size + 16),
  iv text NOT NULL,
  object_version_id text,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','ready','published','deleting')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (state NOT IN ('ready','published') OR object_version_id IS NOT NULL),
  FOREIGN KEY (diary_id,author_id) REFERENCES diary_members(diary_id,user_id) ON DELETE RESTRICT
);
CREATE OR REPLACE FUNCTION block_published_media_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state='published' THEN RAISE EXCEPTION 'Published media is immutable' USING ERRCODE='55000'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER published_media_immutable BEFORE UPDATE OR DELETE ON media_uploads
FOR EACH ROW EXECUTE FUNCTION block_published_media_mutation();
CREATE INDEX media_cleanup_idx ON media_uploads(state,created_at);
CREATE TABLE drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diary_id uuid NOT NULL,
  author_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  ciphertext jsonb NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('text','photo','video','voice','media')),
  for_vault boolean NOT NULL DEFAULT false,
  attachment_ids uuid[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(diary_id,author_id),
  FOREIGN KEY (diary_id,author_id) REFERENCES diary_members(diary_id,user_id) ON DELETE RESTRICT
);
CREATE TABLE draft_save_operations (
  diary_id uuid NOT NULL,
  author_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  draft_id uuid NOT NULL,
  payload_hash text NOT NULL,
  result_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(diary_id,author_id,operation_id),
  FOREIGN KEY(diary_id,author_id) REFERENCES diary_members(diary_id,user_id) ON DELETE RESTRICT
);
CREATE TABLE published_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diary_id uuid NOT NULL,
  author_id uuid NOT NULL,
  request_id uuid NOT NULL,
  source_draft_id uuid NOT NULL UNIQUE,
  source_draft_version integer NOT NULL CHECK (source_draft_version > 0),
  entry_type text NOT NULL CHECK (entry_type IN ('text','photo','video','voice','media')),
  ciphertext jsonb NOT NULL,
  for_vault boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(author_id, request_id),
  FOREIGN KEY (diary_id,author_id) REFERENCES diary_members(diary_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX entries_diary_date_idx ON published_entries(diary_id, created_at DESC, id DESC);
CREATE INDEX entries_author_date_idx ON published_entries(author_id, diary_id, created_at DESC, id DESC);
CREATE TABLE entry_attachments (
  entry_id uuid NOT NULL REFERENCES published_entries(id) ON DELETE RESTRICT,
  upload_id uuid NOT NULL UNIQUE REFERENCES media_uploads(id) ON DELETE RESTRICT,
  PRIMARY KEY(entry_id,upload_id)
);
CREATE OR REPLACE FUNCTION block_published_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Published entries and attachments are immutable' USING ERRCODE='55000'; END $$;
CREATE TRIGGER published_entries_immutable BEFORE UPDATE OR DELETE ON published_entries
FOR EACH ROW EXECUTE FUNCTION block_published_mutation();
CREATE TRIGGER entry_attachments_immutable BEFORE UPDATE OR DELETE ON entry_attachments
FOR EACH ROW EXECUTE FUNCTION block_published_mutation();
CREATE TABLE streak_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diary_id uuid NOT NULL REFERENCES diaries(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN ('publication','break')),
  entry_id uuid UNIQUE REFERENCES published_entries(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX streak_events_diary_idx ON streak_events(diary_id,created_at DESC);
CREATE TABLE owner_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  diary_id uuid REFERENCES diaries(id),
  reason text NOT NULL,
  success boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX owner_access_recent_idx ON owner_access_requests(created_at DESC);
CREATE TABLE support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('deletion','support')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id),
  diary_id uuid REFERENCES diaries(id),
  action text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('success','failure')),
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_recent_idx ON audit_logs(created_at DESC);
CREATE TABLE rate_limits (
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket,window_start)
);
CREATE INDEX rate_limits_window_idx ON rate_limits(window_start);
