-- AlterTable
ALTER TABLE `Giveaway` ADD COLUMN `couponPackages` TEXT NOT NULL DEFAULT '[]',
    ADD COLUMN `couponPercent` INTEGER NULL,
    ADD COLUMN `couponValidDays` INTEGER NULL;

-- AlterTable
ALTER TABLE `GuildSettings` ADD COLUMN `tebexPublicToken` VARCHAR(191) NULL,
    ADD COLUMN `tebexSecret` TEXT NULL,
    ADD COLUMN `tebexSecretHint` VARCHAR(191) NULL,
    ADD COLUMN `tebexSecretSetAt` DATETIME(3) NULL,
    ADD COLUMN `tebexStoreUrl` VARCHAR(191) NULL,
    MODIFY `buttonEmoji` VARCHAR(191) NOT NULL DEFAULT '🎉';

-- CreateTable
CREATE TABLE `GiveawayCoupon` (
    `giveawayId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `tebexId` INTEGER NULL,
    `percent` INTEGER NOT NULL,
    `expiresAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GiveawayCoupon_code_idx`(`code`),
    PRIMARY KEY (`giveawayId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `GiveawayCoupon` ADD CONSTRAINT `GiveawayCoupon_giveawayId_fkey` FOREIGN KEY (`giveawayId`) REFERENCES `Giveaway`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
