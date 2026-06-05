-- AlterTable
ALTER TABLE `Giveaway` ADD COLUMN `blacklistRoles` TEXT NOT NULL DEFAULT '[]',
    ADD COLUMN `whitelistRoles` TEXT NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE `GuildSettings` MODIFY `buttonEmoji` VARCHAR(191) NOT NULL DEFAULT '🎉';
