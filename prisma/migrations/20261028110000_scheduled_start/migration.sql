-- Scheduled giveaways: created now, posted later.
--
-- A giveaway with a start time is stored with status SCHEDULED and no Discord
-- message. The scheduler claims SCHEDULED -> ACTIVE at `startAt` and posts the
-- message then. `status` is a VARCHAR, so the new value needs no change there.
--
-- `startAt` is nullable: every existing giveaway was posted right away and
-- keeps NULL, nothing has to be backfilled.

-- AlterTable
ALTER TABLE `Giveaway`
    ADD COLUMN `startAt` DATETIME(3) NULL;

-- CreateIndex: the scheduler asks "which SCHEDULED giveaways are due" on every
-- tick, the same way it asks for due ACTIVE ones via (status, endAt).
CREATE INDEX `Giveaway_status_startAt_idx` ON `Giveaway`(`status`, `startAt`);