// Reactions. Discord sends the count of an old reaction but never says who left it,
// so the plugin learns the reactors and subtracts the hidden ones from the number
// shown. Two things were learned the hard way on Android and are baked in here:
//
//  - ids are kept as strings (a snowflake does not survive a JSON number);
//  - the correction happens where the row is built, never in the store, and it is
//    recomputed from the raw count each time so it can never compound.

import { FluxDispatcher } from "@vendetta/metro/common";
import { findByProps } from "@vendetta/metro";
import { diag, isHiddenIn, store } from "./core";

const key = (channelId: string, messageId: string, emoji: string) =>
    `${channelId}:${messageId}:${emoji}`;

/** custom emoji -> its id, unicode emoji -> the character itself. */
export function emojiKey(emoji: any): string | null {
    if (!emoji) return null;
    if (typeof emoji === "string") return emoji;
    return emoji.id ?? emoji.name ?? null;
}

export const knownReactors = (channelId: string, messageId: string, emoji: string): string[] | null =>
    store.reactionCache?.[key(channelId, messageId, emoji)] ?? null;

export function learnReactors(channelId: string, messageId: string, emoji: string, ids: string[]) {
    const k = key(channelId, messageId, emoji);
    const merged = new Set([...(store.reactionCache[k] ?? []), ...ids]);
    const next = { ...store.reactionCache, [k]: [...merged] };
    // keep the cache from growing without end
    const keys = Object.keys(next);
    if (keys.length > 4000) for (const old of keys.slice(0, keys.length - 4000)) delete next[old];
    store.reactionCache = next;
}

export function forgetReactions(channelId: string, messageId: string, emoji?: string | null) {
    const next = { ...store.reactionCache };
    if (emoji) delete next[key(channelId, messageId, emoji)];
    else for (const k of Object.keys(next)) if (k.startsWith(`${channelId}:${messageId}:`)) delete next[k];
    store.reactionCache = next;
}

/** Live event: remember that this hidden person reacted, never swallow it. The store
    then matches the server exactly, and the row correction does the rest. */
export function learnFromEvent(e: any) {
    const chId = e.channelId ?? e.channel_id;
    const msgId = e.messageId ?? e.message_id;
    const uid = e.userId ?? e.user_id;
    const ek = emojiKey(e.emoji);
    if (!chId || !msgId || !ek || !uid) return;
    if (e.type === "MESSAGE_REACTION_ADD") {
        if (isHiddenIn(uid, chId)) learnReactors(chId, msgId, ek, [uid]);
    } else {
        const left = (knownReactors(chId, msgId, ek) ?? []).filter(id => id !== uid);
        store.reactionCache = { ...store.reactionCache, [key(chId, msgId, ek)]: left };
    }
}

/* ---- asking Discord who reacted ----
   The app's own reactor fetch is used, exactly the request it makes when the
   reactions sheet is opened, one chip at a time and only once per chip. */

let fetcher: any = null;
const queue: { channelId: string; messageId: string; emoji: any }[] = [];
const asked = new Set<string>();
let pumping = false;

export function resolveFetcher() {
    fetcher =
        findByProps("fetchReactions") ??
        findByProps("getReactions", "fetchReactions") ??
        null;
    return !!fetcher?.fetchReactions;
}

export function queueReactorLookup(channelId: string, messageId: string, emoji: any) {
    const ek = emojiKey(emoji);
    if (!ek) return;
    const k = key(channelId, messageId, ek);
    if (asked.has(k) || queue.length > 200) return;
    asked.add(k);
    queue.push({ channelId, messageId, emoji });
    pump();
}

function pump() {
    if (pumping) return;
    const next = queue.shift();
    if (!next) return;
    pumping = true;
    try {
        fetcher?.fetchReactions?.(next.channelId, next.messageId, next.emoji);
        diag.lookupsSent++;
    } catch (e) {
        asked.delete(key(next.channelId, next.messageId, emojiKey(next.emoji)!));
    }
    setTimeout(() => {
        pumping = false;
        pump();
    }, 400);
}

export function clearLookupState() {
    queue.length = 0;
    asked.clear();
}

/** The answer comes back as a dispatch — that is where the hidden reactors are
    learned and, at the same time, dropped so they are never listed either. */
export function learnFromReactorList(e: any) {
    const chId = e.channelId ?? e.channel_id;
    const msgId = e.messageId ?? e.message_id;
    const ek = emojiKey(e.emoji);
    const users: any[] = e.users ?? [];
    if (!chId || !msgId || !ek) return;
    const hidden = users.filter(u => isHiddenIn(u?.id, chId)).map(u => u.id);
    learnReactors(chId, msgId, ek, hidden);
    diag.lookupsAnswered++;
    if (hidden.length) e.users = users.filter(u => !isHiddenIn(u?.id, chId));
}

/**
 * Returns a corrected copy of a message's reactions, or null when nothing changes.
 * Chips nobody has looked into yet are queued for a lookup on the way past.
 */
export function correctedReactions(channelId: string, messageId: string, reactions: any[]): any[] | null {
    if (!Array.isArray(reactions) || !reactions.length) return null;
    const out: any[] = [];
    let changed = false;
    for (const r of reactions) {
        const ek = emojiKey(r?.emoji);
        if (!ek) {
            out.push(r);
            continue;
        }
        const known = knownReactors(channelId, messageId, ek);
        if (known === null) {
            queueReactorLookup(channelId, messageId, r.emoji);
            out.push(r);
            continue;
        }
        const sub = known.filter(id => isHiddenIn(id, channelId)).length;
        if (!sub) {
            out.push(r);
            continue;
        }
        const count = (r.count ?? 0) - sub;
        changed = true;
        if (count > 0) out.push({ ...r, count });
    }
    return changed ? out : null;
}

export const dispatchTypes = {
    add: "MESSAGE_REACTION_ADD",
    remove: "MESSAGE_REACTION_REMOVE",
    removeAll: "MESSAGE_REACTION_REMOVE_ALL",
    removeEmoji: "MESSAGE_REACTION_REMOVE_EMOJI",
    users: "MESSAGE_REACTION_ADD_USERS",
};

export const Dispatcher = FluxDispatcher;
