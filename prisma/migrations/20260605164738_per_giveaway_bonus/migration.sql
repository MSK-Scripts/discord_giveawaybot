-- AlterTable
ALTER TABLE `Giveaway` ADD COLUMN `bonusRoles` TEXT NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE `GuildSettings` MODIFY `buttonEmoji` VARCHAR(191) NOT NULL DEFAULT '🎉';
