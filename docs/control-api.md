# Control API: dashboard endpoints

The bot runs a small HTTP server for the web dashboard (`src/services/controlServer.js`). It listens on `127.0.0.1:${CONTROL_PORT}` only and is off without `CONTROL_SECRET`. Every request needs:

- the header `X-Control-Secret` with the value of `CONTROL_SECRET` (compared timing-safe), otherwise `401 unauthorized`;
- a `guildId` (query string for GET, JSON body for POST) that is a snowflake (`400 invalid_guild`) of a guild the bot is in (`403 bot_not_in_guild`).

Bodies are JSON, at most 1 MB (`413 payload_too_large`). The dashboard checks permissions (manager or owner) before it calls; the bot additionally enforces the guild owner for `/tebex*`.

This page describes the endpoints added for the dashboard in the `[Unreleased]` block of the [CHANGELOG](../CHANGELOG.md). The older ones (`/giveaways`, `/settings`, `/roles`, `/channels`, `/templates`, the lifecycle actions, `/tebex*`) are unchanged apart from the fields noted below.

Giveaway IDs are checked against `^[A-Z0-9]{4,12}$` (case-insensitive input, `400 invalid_id`).

## Statuses

| Status | Meaning |
|---|---|
| `SCHEDULED` | Created with a start time; no Discord message yet. New. |
| `ACTIVE` | Posted, accepting entries |
| `PAUSED` | Posted, entries frozen |
| `ENDED` | Winners drawn |
| `CANCELLED` | Cancelled by a manager, or a scheduled post that failed |

## GET /guild

Name, icon and member count from the bot's cache, no Discord REST call.

```
GET /guild?guildId=<id>
200 { "guild": { "id": "…", "name": "My Server", "iconUrl": "https://cdn.discordapp.com/icons/…?size=128" | null, "memberCount": 1234 | null } }
```

`memberCount` is the value Discord sent when the bot connected. The bot has no GuildMembers intent, so joins and leaves do not update it; treat it as a display value.

## Winner names

Each winner row stores `displayName` (server nickname, else global name, else username) and `avatarUrl` (128 px) at the moment the winner is drawn, in every draw path: ending, rerolling all, replacing one.

- `GET /giveaways`: `winners[]` is `{ userId, prizeIndex, displayName, avatarUrl }` (ENDED only, current winners). Names come from the database only; winners drawn before this change have `null`.
- `GET /giveaway`: `winners[]` is `{ userId, rerolled, prizeIndex, displayName, avatarUrl }`. Missing names are looked up from the user (global name, not the server nickname), at most 25 per request, and not written back. A deleted account stays `null`.

## Scheduled giveaways

### POST /giveaway/create

Unchanged body plus an optional `startAt`:

| Field | Values |
|---|---|
| `startAt` | ISO 8601 **with offset** (`2026-11-01T18:00:00Z`, `2026-11-01T19:00+01:00`) or epoch milliseconds (number or digit string). Must lie in the future and at most 365 days ahead. Absent, `null` or `""` means "post now". |

Errors: `400 invalid_start` (unparseable, no offset, impossible date such as Feb 30), `400 start_in_past`, `400 start_too_far`, plus the existing ones.

With `startAt` the giveaway is stored as `SCHEDULED`, no message is posted, and `endAt = startAt + duration`. Coupon settings are stored as usual.

```
200 { "id": "AB12CD", "status": "SCHEDULED" | "ACTIVE", "startAt": "<ISO>" | null, "endAt": "<ISO>" }
```

Every serialized giveaway (`/giveaways`, `/giveaway`, `/giveaway/edit`) now carries `startAt` (`null` for one posted right away).

### What happens at the start

The scheduler (10 s tick) claims `SCHEDULED -> ACTIVE` in one conditional UPDATE and posts the message; only the claim that wins posts, so overlapping ticks and restarts post once. The reminder is planned at that moment.

- **Posting fails** (channel deleted, permissions missing): the giveaway becomes `CANCELLED` with `endedAt` set and the log channel gets the reason. It is never deleted.
- **Late start** (bot was offline more than a minute past `startAt`): `startAt` and `endAt` move by the delay, so it still runs its full duration.
- **Cancelled or deleted while the message goes out**: the message is deleted again.
- **Known gap**: a crash between the claim and the post leaves an `ACTIVE` giveaway without a message, which ends at `endAt` without entries.

### Edit and actions

- `POST /giveaway/edit` works for `SCHEDULED`. Additionally accepts `startAt` (same rules as create; `endAt` moves along, the duration stays) and `duration` (counts from the start). Both answer `409 not_scheduled` for a giveaway that is not `SCHEDULED`, also when the scheduler started it in the meantime.
- `POST /giveaway/cancel` works for `SCHEDULED` (no message to edit).
- `POST /giveaway/{extend,end,pause,resume,reroll}` answer `409 not_started` for `SCHEDULED`.

## POST /giveaway/delete

```
POST /giveaway/delete { "guildId": "…", "id": "AB12CD" }
200 { "ok": true, "couponsIssued": 2, "message": "deleted" | "gone" | "none" | "failed" }
```

Allowed for `ENDED`, `CANCELLED` and `SCHEDULED`. `ACTIVE` and `PAUSED` answer `409 still_running` (end or cancel first). `404 not_found` for an unknown ID or one of another guild.

The Discord message is deleted first (`gone`: it was already deleted; `none`: there was none; `failed`: another error, logged, the delete goes on), then the row; entries, winners and coupon records go with it. The deletion is written to the log channel.

`couponsIssued` is the number of coupon codes handed out and not revoked. **They are not revoked in the store** and stay valid. `GET /giveaway` returns the same `couponsIssued`, so the dashboard can warn before deleting. The public results page of the giveaway is not removed by this call.

## GET /history

```
GET /history?guildId=<id>&days=30
200 { "days": 30, "history": [ { "date": "2026-10-28", "created": 1, "ended": 0, "entries": 14 }, … ] }
```

One row per UTC day, oldest first, today last, every day present (zeros on quiet days). `days` is a whole number 1..365, default 90; anything else answers `400 invalid_days`.

- `created`: giveaways created that day (scheduled and cancelled ones included)
- `ended`: giveaways that ended that day (status `ENDED`, by `endedAt`)
- `entries`: entries made that day across the guild's giveaways

The numbers are computed from what is stored now. **Not included:** entries that were withdrawn (a second click removes the row), deleted giveaways with their entries, and guilds the bot left (their data is deleted).

## POST /giveaway/preview

Takes the body of `/giveaway/create` (same validation and error codes; `channelId` may be left out) plus an optional `lang` (one of `en de fr es hu pl pt`, else `400 invalid_lang`). Writes nothing and does not call Discord.

```
200 {
  "embed": { …discord embed JSON… },
  "components": [ { …action row with the join button… } ],
  "lang": "de",
  "status": "ACTIVE" | "SCHEDULED",
  "startAt": "<ISO>" | null,
  "endAt": "<ISO>"
}
```

The message is built by the same code a create uses, with the placeholder ID `PREVIEW` (footer, button `custom_id`), the bot as host and zero entries. Timestamps in fields are Discord markup (`<t:…:R>`); the embed `timestamp` is `endAt`. Without `lang` the guild's language applies.
