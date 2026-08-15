-- Mehrere Preise pro Giveaway.
--
-- `prize` (ein einzelner Text) wird zu `prizes` (JSON-Array). Die Spalte wird
-- deshalb erst angelegt und befuellt und danach erst geloescht, sonst waeren die
-- Preise laufender Giveaways weg.

-- AlterTable
ALTER TABLE `Giveaway` ADD COLUMN `prizeMode` VARCHAR(191) NOT NULL DEFAULT 'ALL',
    ADD COLUMN `prizes` TEXT NOT NULL DEFAULT '[]';

-- Bestandsdaten uebernehmen: aus einem Preis wird ein Array mit einem Element.
UPDATE `Giveaway`
   SET `prizes` = JSON_ARRAY(`prize`)
 WHERE `prize` IS NOT NULL AND `prize` <> '';

-- AlterTable
ALTER TABLE `Giveaway` DROP COLUMN `prize`;

-- AlterTable
ALTER TABLE `GuildSettings` MODIFY `buttonEmoji` VARCHAR(191) NOT NULL DEFAULT '🎉';

-- AlterTable
ALTER TABLE `Winner` ADD COLUMN `prizeIndex` INTEGER NULL;
