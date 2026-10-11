-- CreateEnum
CREATE TYPE "UiLanguage" AS ENUM ('en', 'ur');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "bodyKey" TEXT,
ADD COLUMN     "params" JSONB,
ADD COLUMN     "titleKey" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "fontScale" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "preferredLanguage" "UiLanguage" NOT NULL DEFAULT 'en';
