ALTER TABLE "SecurityAlertChannel" ADD COLUMN "userId" TEXT;

CREATE UNIQUE INDEX "SecurityAlertChannel_userId_key" ON "SecurityAlertChannel"("userId");

ALTER TABLE "SecurityAlertChannel"
ADD CONSTRAINT "SecurityAlertChannel_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "AppUser"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
