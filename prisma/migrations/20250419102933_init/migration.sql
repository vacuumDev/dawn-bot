-- CreateTable
CREATE TABLE "dawn_accounts_v1.9" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "app_id" TEXT,
    "auth_token" TEXT,
    "active_account_proxy" TEXT,
    "sleep_until" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "dawn_accounts_v1.9_email_key" ON "dawn_accounts_v1.9"("email");
