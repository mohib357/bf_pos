-- Auth Extensions: account lock, password reset tokens
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "login_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "locked_until" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pwd_reset_token" TEXT,
  ADD COLUMN IF NOT EXISTS "pwd_reset_expiry" TIMESTAMP(3);

-- Index for password reset token lookups
CREATE INDEX IF NOT EXISTS "users_pwd_reset_token_idx" ON "users"("pwd_reset_token");
