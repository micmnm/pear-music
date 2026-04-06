-- ============================================
-- User Settings
-- ============================================

CREATE TABLE user_settings (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  storefront text NOT NULL DEFAULT 'ro',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own settings"
  ON user_settings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can upsert own settings"
  ON user_settings FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE
  USING (user_id = auth.uid());

-- Seed settings for existing users with default storefront
INSERT INTO user_settings (user_id, storefront)
SELECT id, 'ro' FROM users
ON CONFLICT (user_id) DO NOTHING;

-- Fix existing library items: normalize all storefronts to 'ro'
UPDATE library_items SET storefront = 'ro';

-- Change default for future inserts
ALTER TABLE library_items ALTER COLUMN storefront SET DEFAULT 'ro';
