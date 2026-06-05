-- AlterTable
ALTER TABLE `Giveaway` ADD COLUMN `pausedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `GuildSettings` ADD COLUMN `bonusRoles` TEXT NOT NULL DEFAULT '{}',
    ADD COLUMN `logChannel` VARCHAR(191) NULL,
    ADD COLUMN `minAccountDays` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `minMemberDays` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `whitelist` TEXT NOT NULL DEFAULT '[]',
    MODIFY `buttonEmoji` VARCHAR(191) NOT NULL DEFAULT '🎉';

-- CreateTable
CREATE TABLE `GiveawayTemplate` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guildId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `duration` VARCHAR(191) NOT NULL,
    `winnersCount` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `GiveawayTemplate_guildId_name_key`(`guildId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
