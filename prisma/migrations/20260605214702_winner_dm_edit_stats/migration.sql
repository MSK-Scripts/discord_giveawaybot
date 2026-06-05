-- AlterTable
ALTER TABLE `Giveaway` ADD COLUMN `prize` TEXT NULL,
    ADD COLUMN `reminderAt` DATETIME(3) NULL,
    ADD COLUMN `reminderSent` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `GuildSettings` ADD COLUMN `claimMessage` TEXT NULL,
    ADD COLUMN `reminderMinutes` INTEGER NOT NULL DEFAULT 0,
    MODIFY `buttonEmoji` VARCHAR(191) NOT NULL DEFAULT '🎉';
