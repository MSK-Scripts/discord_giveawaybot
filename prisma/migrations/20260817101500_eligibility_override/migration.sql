-- Entry conditions per giveaway now REPLACE the server-wide ones instead of
-- adding to them. NULL means "nothing of its own", so the server setting
-- applies; any value that is set (an empty list included) wins for that
-- giveaway. The three fields are independent of each other.

-- AlterTable: the columns become nullable and lose their default.
ALTER TABLE `Giveaway`
    MODIFY `blacklistRoles` TEXT NULL,
    MODIFY `whitelistRoles` TEXT NULL,
    MODIFY `bonusRoles` TEXT NULL;

-- Running giveaways keep the behaviour they had. Everything that used to be
-- added on top of the server setting is merged once and written down as the
-- giveaway's own value. Ended and cancelled ones are left alone, nothing about
-- them is evaluated again.
UPDATE `Giveaway` g
    JOIN `GuildSettings` s ON s.`guildId` = g.`guildId`
    SET g.`blacklistRoles` = JSON_MERGE_PRESERVE(COALESCE(NULLIF(s.`blacklist`, ''), '[]'), g.`blacklistRoles`)
    WHERE g.`status` IN ('ACTIVE', 'PAUSED')
      AND g.`blacklistRoles` IS NOT NULL
      AND g.`blacklistRoles` NOT IN ('[]', '')
      AND JSON_VALID(g.`blacklistRoles`);

UPDATE `Giveaway` g
    JOIN `GuildSettings` s ON s.`guildId` = g.`guildId`
    SET g.`whitelistRoles` = JSON_MERGE_PRESERVE(COALESCE(NULLIF(s.`whitelist`, ''), '[]'), g.`whitelistRoles`)
    WHERE g.`status` IN ('ACTIVE', 'PAUSED')
      AND g.`whitelistRoles` IS NOT NULL
      AND g.`whitelistRoles` NOT IN ('[]', '')
      AND JSON_VALID(g.`whitelistRoles`);

-- Bonus entries used to be summed up per role. A sum is not expressible here,
-- so the giveaway value wins per role and the remaining server roles are kept.
-- Only a role carrying a bonus in both places is affected, and it keeps the
-- number that was set for this giveaway.
UPDATE `Giveaway` g
    JOIN `GuildSettings` s ON s.`guildId` = g.`guildId`
    SET g.`bonusRoles` = JSON_MERGE_PATCH(COALESCE(NULLIF(s.`bonusRoles`, ''), '{}'), g.`bonusRoles`)
    WHERE g.`status` IN ('ACTIVE', 'PAUSED')
      AND g.`bonusRoles` IS NOT NULL
      AND g.`bonusRoles` NOT IN ('{}', '')
      AND JSON_VALID(g.`bonusRoles`);

-- Everything that was left at the old default said "nothing extra" and now says
-- "inherit the server setting".
UPDATE `Giveaway` SET `blacklistRoles` = NULL WHERE `blacklistRoles` IN ('[]', '');
UPDATE `Giveaway` SET `whitelistRoles` = NULL WHERE `whitelistRoles` IN ('[]', '');
UPDATE `Giveaway` SET `bonusRoles` = NULL WHERE `bonusRoles` IN ('{}', '');

-- AlterTable: a template can carry the same three conditions, with the same
-- meaning of NULL.
ALTER TABLE `GiveawayTemplate`
    ADD COLUMN `blacklistRoles` TEXT NULL,
    ADD COLUMN `whitelistRoles` TEXT NULL,
    ADD COLUMN `bonusRoles` TEXT NULL;
