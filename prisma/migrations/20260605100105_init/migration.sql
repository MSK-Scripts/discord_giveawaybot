-- CreateTable
CREATE TABLE `GuildSettings` (
    `guildId` VARCHAR(191) NOT NULL,
    `lang` VARCHAR(191) NOT NULL DEFAULT 'en',
    `embedColor` VARCHAR(191) NOT NULL DEFAULT '#00e676',
    `buttonEmoji` VARCHAR(191) NOT NULL DEFAULT '🎉',
    `buttonStyle` VARCHAR(191) NOT NULL DEFAULT 'PRIMARY',
    `blacklist` TEXT NOT NULL DEFAULT '[]',
    `managerRole` VARCHAR(191) NULL,
    `notifyRole` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`guildId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Giveaway` (
    `id` VARCHAR(191) NOT NULL,
    `guildId` VARCHAR(191) NOT NULL,
    `channelId` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NULL,
    `hostId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `winnersCount` INTEGER NOT NULL DEFAULT 1,
    `endAt` DATETIME(3) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endedAt` DATETIME(3) NULL,

    INDEX `Giveaway_guildId_status_idx`(`guildId`, `status`),
    INDEX `Giveaway_status_endAt_idx`(`status`, `endAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Entry` (
    `giveawayId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`giveawayId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Winner` (
    `giveawayId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `rerolled` BOOLEAN NOT NULL DEFAULT false,
    `pickedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`giveawayId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Entry` ADD CONSTRAINT `Entry_giveawayId_fkey` FOREIGN KEY (`giveawayId`) REFERENCES `Giveaway`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Winner` ADD CONSTRAINT `Winner_giveawayId_fkey` FOREIGN KEY (`giveawayId`) REFERENCES `Giveaway`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
