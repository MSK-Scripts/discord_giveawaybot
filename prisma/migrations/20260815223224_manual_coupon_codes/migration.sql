-- AlterTable
ALTER TABLE `Giveaway` ADD COLUMN `couponManualCode` VARCHAR(191) NULL,
    ADD COLUMN `couponManualCodesPerPrize` TEXT NOT NULL DEFAULT '[]',
    ADD COLUMN `couponManualNote` TEXT NULL;

-- AlterTable
ALTER TABLE `GuildSettings` MODIFY `buttonEmoji` VARCHAR(191) NOT NULL DEFAULT '🎉';
