-- Display name and avatar of a winner, captured when the winner is drawn.
--
-- The dashboard used to show bare user IDs. The draw fetches every candidate
-- as a guild member anyway, so storing the name there costs no extra call and
-- keeps the name as it was on the server at that time (nickname first).
--
-- Both columns are nullable: winners drawn before this migration have no name
-- stored. GET /giveaway fills those in lazily from the user and does not write
-- them back, so nothing has to be backfilled here.

-- AlterTable
ALTER TABLE `Winner`
    ADD COLUMN `displayName` VARCHAR(191) NULL,
    ADD COLUMN `avatarUrl` VARCHAR(512) NULL;