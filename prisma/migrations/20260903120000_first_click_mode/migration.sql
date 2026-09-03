-- "First click wins": a second way to determine the winners. RANDOM keeps the
-- draw at the end, FIRST_CLICK hands the prize to whoever presses the button
-- first and ends the giveaway right there.
--
-- The default is RANDOM, so every existing giveaway keeps behaving exactly as
-- it did. Nothing has to be rewritten.

-- AlterTable
ALTER TABLE `Giveaway`
    ADD COLUMN `winnerMode` VARCHAR(191) NOT NULL DEFAULT 'RANDOM';

-- AlterTable: a template carries the mode as well. The quick giveaways this is
-- meant for (crate keys, event prizes) are exactly the ones people repeat.
ALTER TABLE `GiveawayTemplate`
    ADD COLUMN `winnerMode` VARCHAR(191) NOT NULL DEFAULT 'RANDOM';

-- CreateIndex: FIRST_CLICK reads the entries in click order. Without this index
-- that is a filesort over every entry of the giveaway, at the exact moment the
-- mode promises to be fast.
CREATE INDEX `Entry_giveawayId_joinedAt_idx` ON `Entry`(`giveawayId`, `joinedAt`);
