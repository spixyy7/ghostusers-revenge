// Everything the app reads before it draws. Filtering here rather than in the UI is
// what keeps a hidden person from ever flashing on screen: the client is simply
// handed data they are not in, so there is nothing to un-draw a moment later.
//
// Every store and method name below was read out of the running client, not guessed.

import { after } from "@vendetta/patcher";
import { findByStoreName } from "@vendetta/metro";
import { anyHidden, diag, isHiddenIn, isHidden, mark, opt, SelectedChannelStore } from "./core";
import { learnReactors, emojiKey } from "./reactions";

const idOf = (x: any): string | undefined =>
    typeof x === "string" ? x : x?.userId ?? x?.user?.id ?? x?.id;

/** Hidden here, and hidden from lists of people specifically. */
const hiddenInList = (userId?: string, channelId?: string) =>
    !!userId && isHiddenIn(userId, channelId) && opt(userId, "hideMemberList");

export function patchStores(patches: (() => void)[]) {
    const on = (storeName: string, method: string, cb: (args: any[], ret: any) => any, mark$ = storeName) => {
        const store = findByStoreName(storeName);
        if (!store || typeof store[method] !== "function") {
            mark(mark$, false, `${storeName}.${method}`);
            return false;
        }
        patches.push(
            after(method, store, (args: any[], ret: any) => {
                try {
                    if (!anyHidden()) return ret;
                    return cb(args, ret);
                } catch (e) {
                    console.log(`[GhostUsers] ${storeName}.${method}`, e);
                    return ret;
                }
            }),
        );
        mark(mark$, true);
        return true;
    };

    /* ---- typing ---- */
    on("TypingStore", "getTypingUsers", ([channelId], ret) => {
        if (!ret || typeof ret !== "object") return ret;
        const out: any = {};
        let changed = false;
        for (const [userId, value] of Object.entries(ret)) {
            if (isHiddenIn(userId, channelId)) changed = true;
            else out[userId] = value;
        }
        return changed ? out : ret;
    }, "typing");

    /* ---- member list: the rows the panel draws ---- */
    on("ChannelMemberStore", "getRows", (args, ret) => {
        if (!Array.isArray(ret)) return ret;
        const channelId = args[1] ?? args[0];
        const kept = ret.filter((row: any) => {
            const userId = idOf(row?.user) ?? row?.userId ?? idOf(row);
            return !hiddenInList(userId, channelId);
        });
        if (kept.length === ret.length) return ret;
        diag.rows++;
        // headers carry their own count, which has to shrink with the rows
        return kept.map((row: any) => {
            const count = row?.count;
            if (typeof count !== "number") return row;
            const removed = ret.length - kept.length;
            return { ...row, count: Math.max(0, count - removed) };
        });
    }, "memberRows");

    /* ---- the counters above those lists ---- */
    const countHiddenIn = (channelId?: string) => {
        try {
            const store = findByStoreName("ChannelMemberStore");
            const rows = store?.getRows?.(undefined, channelId);
            if (!Array.isArray(rows)) return 0;
            return rows.filter((r: any) => hiddenInList(idOf(r?.user) ?? r?.userId, channelId)).length;
        } catch {
            return 0;
        }
    };

    on("GuildMemberCountStore", "getMemberCount", ([guildId], ret) =>
        typeof ret === "number" ? Math.max(0, ret - countHiddenIn(SelectedChannelStore?.getChannelId?.())) : ret,
        "memberCount");

    on("GuildMemberCountStore", "getOnlineCount", ([guildId], ret) =>
        typeof ret === "number" ? Math.max(0, ret - countHiddenIn(SelectedChannelStore?.getChannelId?.())) : ret,
        "onlineCount");

    on("ChannelMemberCountStore", "getMemberCount", ([channelId], ret) =>
        typeof ret === "number" ? Math.max(0, ret - countHiddenIn(channelId)) : ret,
        "channelMemberCount");

    /* ---- reactions: who reacted, straight from the store ----
       This is the same trick the desktop plugin uses. Every list of reactors the app
       reads is filtered, and what it said is remembered, so the numbers on the chips
       can be corrected even for reactions left long before anyone was hidden. */
    on("MessageReactionsStore", "getReactions", ([channelId, messageId, emoji], ret) => {
        if (!Array.isArray(ret) || !ret.length) return ret;
        const ek = emojiKey(emoji);
        const hidden = ret.filter((u: any) => isHiddenIn(idOf(u), channelId)).map((u: any) => idOf(u)!);
        if (!hidden.length) {
            if (ek) learnReactors(channelId, messageId, ek, []);
            return ret;
        }
        if (ek) learnReactors(channelId, messageId, ek, hidden);
        return ret.filter((u: any) => !isHiddenIn(idOf(u), channelId));
    }, "reactors");

    /* ---- calls ---- */
    const visibleInCall = (channelId?: string) => {
        try {
            const store = findByStoreName("VoiceStateStore");
            const states = store?.getVoiceStatesForChannel?.(channelId);
            if (!states) return null;
            const list = Array.isArray(states) ? states : Object.values(states);
            return list.filter((vs: any) => !isHiddenIn(idOf(vs), channelId)).length;
        } catch {
            return null;
        }
    };

    const stripCall = (call: any) => {
        if (!call || typeof call !== "object") return call;
        const chId = call.channelId ?? call.channel_id;
        const ringing = call.ringing ?? call.ongoingRings;
        if (!Array.isArray(ringing)) return call;
        const kept = ringing.filter((r: any) => !isHiddenIn(idOf(r), chId));
        return kept.length === ringing.length ? call : { ...call, ringing: kept, ongoingRings: kept };
    };

    on("CallStore", "getCall", ([channelId], ret) => {
        if (!ret) return ret;
        // a call nobody visible is in does not exist for us
        return visibleInCall(channelId) === 0 ? null : stripCall(ret);
    }, "callStore");

    on("CallStore", "getCalls", (_a, ret) =>
        Array.isArray(ret)
            ? ret.filter((c: any) => visibleInCall(c?.channelId ?? c?.channel_id) !== 0).map(stripCall)
            : ret,
        "callList");

    on("CallStore", "isCallActive", ([channelId], ret) =>
        ret && visibleInCall(channelId) === 0 ? false : ret,
        "callActive");

    /* ---- who the call UI thinks is in the call ---- */
    const filterStates = (states: any, channelId?: string) => {
        if (!states) return states;
        if (Array.isArray(states)) {
            const kept = states.filter((vs: any) => !isHiddenIn(idOf(vs), channelId));
            return kept.length === states.length ? states : kept;
        }
        if (typeof states !== "object") return states;
        const out: any = {};
        let changed = false;
        for (const [userId, vs] of Object.entries(states)) {
            if (isHiddenIn(userId, channelId)) changed = true;
            else out[userId] = vs;
        }
        return changed ? out : states;
    };

    for (const storeName of ["VoiceStateStore", "SortedVoiceStateStore"]) {
        on(storeName, "getVoiceStatesForChannel", ([a, b], ret) => filterStates(ret, b ?? a), `${storeName}.forChannel`);
        on(storeName, "getVoiceStates", ([a], ret) => filterStates(ret, a), `${storeName}.states`);
        on(storeName, "getAllVoiceStates", (_a, ret) => {
            if (!ret || typeof ret !== "object") return ret;
            const out: any = {};
            for (const [ctx, states] of Object.entries(ret)) out[ctx] = filterStates(states, undefined);
            return out;
        }, `${storeName}.all`);
    }

    on("SortedVoiceStateStore", "countVoiceStatesForChannel", ([a, b], ret) => {
        const n = visibleInCall(b ?? a);
        return typeof n === "number" ? n : ret;
    }, "voiceCount");

    on("VoiceStateStore", "getVoiceState", ([a, b], ret) =>
        ret && isHidden(idOf(ret)) ? null : ret,
        "voiceState");
}
