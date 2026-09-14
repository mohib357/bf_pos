-- DropIndex
DROP INDEX "users_pwd_reset_token_idx";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "pwd_changed_at" TIMESTAMP(3);
