-- ============================================
-- Pear Music Schema
-- ============================================

-- Users table (single user, passkey auth)
CREATE TABLE users (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username     text UNIQUE NOT NULL,
  display_name text,
  created_at   timestamptz DEFAULT now()
);

-- WebAuthn credentials (multiple passkeys per user)
CREATE TABLE user_credentials (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  credential_id  text UNIQUE NOT NULL,
  public_key     text NOT NULL,
  sign_count     bigint DEFAULT 0,
  device_info    text,
  created_at     timestamptz DEFAULT now()
);

-- Temporary WebAuthn challenges (cleaned up after use)
CREATE TABLE webauthn_challenges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge   text NOT NULL,
  type        text NOT NULL CHECK (type IN ('registration', 'login')),
  metadata    jsonb DEFAULT '{}',
  created_at  timestamptz DEFAULT now()
);

-- Library items (albums)
CREATE TABLE library_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  collection_id  bigint NOT NULL,
  name           text NOT NULL,
  artist_name    text NOT NULL,
  artwork_url    text NOT NULL,
  storefront     text DEFAULT 'us',
  genre          text,
  release_date   timestamptz,
  url            text,
  added_at       timestamptz DEFAULT now(),
  UNIQUE(user_id, collection_id)
);

-- Indexes
CREATE INDEX idx_library_items_user_id ON library_items(user_id);
CREATE INDEX idx_library_items_name ON library_items USING gin(name gin_trgm_ops);
CREATE INDEX idx_library_items_artist ON library_items USING gin(artist_name gin_trgm_ops);
CREATE INDEX idx_user_credentials_user_id ON user_credentials(user_id);
CREATE INDEX idx_webauthn_challenges_created ON webauthn_challenges(created_at);

-- Enable trigram extension for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE webauthn_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_items ENABLE ROW LEVEL SECURITY;

-- Users: authenticated users can read their own row
CREATE POLICY "Users can read own profile"
  ON users FOR SELECT
  USING (id = auth.uid());

-- Users: allow unauthenticated count check (for setup detection)
CREATE POLICY "Anyone can count users"
  ON users FOR SELECT
  USING (true);

-- Library items: full CRUD for own items
CREATE POLICY "Users can read own library"
  ON library_items FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own library"
  ON library_items FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own library"
  ON library_items FOR DELETE
  USING (user_id = auth.uid());

-- User credentials: no direct client access (managed by Edge Functions with service key)
-- No policies needed — service key bypasses RLS

-- WebAuthn challenges: no direct client access (managed by Edge Functions with service key)
-- No policies needed — service key bypasses RLS
