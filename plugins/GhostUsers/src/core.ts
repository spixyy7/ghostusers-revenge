// Who is hidden, where the hiding applies, and what is currently working.
// This mirrors the BetterDiscord plugin's core: every hidden person carries their
// own switches, and the global ones are only the defaults handed to new entries.

import { storage } from "@vendetta/plugin";
import { findByStoreName } from "@vendetta/metro";

function store$(name: string) {
    let mod: any = null;
    try {
        mod = findByStoreName(name);
    } catch {
        mod = null;
    }
    diagStores[name] = mod ? "ok" : "MISSING";
    return mod;
}

const diagStores: Record<string, string> = {};

export const ChannelStore = store$("ChannelStore");
export const UserStore = store$("UserStore");
export const SelectedChannelStore = store$("SelectedChannelStore");

export type Opts = {
    tag?: string;
    scopeGroups?: boolean;
    scopeServers?: boolean;
    scopeDMs?: boolean;
    autoVoiceMute?: boolean;
    hideMemberList?: boolean;
    hideMentions?: boolean;
};

export const OPT_KEYS = [
    "scopeGroups",
    "scopeServers",
    "scopeDMs",
    "autoVoiceMute",
    "hideMemberList",
    "hideMentions",
] as const;

type Store = {
    users: Record<string, Opts>;
    defaults: Required<Omit<Opts, "tag">>;
    /** "channelId:messageId:emojiKey" -> ids of hidden users the server counts there.
        Ids are STRINGS on purpose: a 19-digit snowflake does not survive a JSON
        number, which silently corrupted the Android cache for five versions. */
    reactionCache: Record<string, string[]>;
};

export const store = storage as unknown as Store;

export function initStorage() {
    store.users ??= {};
    store.reactionCache ??= {};
    store.defaults ??= {
        scopeGroups: true,
        scopeServers: false,
        scopeDMs: false,
        autoVoiceMute: true,
        hideMemberList: true,
        hideMentions: true,
    };
    for (const key of OPT_KEYS) store.defaults[key] ??= key === "scopeServers" || key === "scopeDMs" ? false : true;
}

export const anyHidden = () => Object.keys(store.users ?? {}).length > 0;

export const isHidden = (id?: string | null) => !!id && !!store.users?.[id];

export function opt(id: string, key: (typeof OPT_KEYS)[number]): boolean {
    const rec = store.users?.[id];
    if (!rec) return false;
    return rec[key] ?? store.defaults[key];
}

/** DM = 1, group DM = 3, anything else counts as a server channel. */
function channelType(channelId?: string | null): number | null {
    try {
        if (!channelId) return null;
        return ChannelStore?.getChannel?.(channelId)?.type ?? null;
    } catch {
        return null;
    }
}

/** Is this person hidden in THIS channel, per their own scope switches.
    [guildId] is a hint straight off the event when there is one: anything carrying a
    guild is a server channel, no store lookup needed. A channel the store knows
    nothing about is treated as a group DM — the scope that is on by default —
    because answering "no" there would quietly disable the whole plugin, which is
    exactly what a missing store lookup used to do. */
export function isHiddenIn(id?: string | null, channelId?: string | null, guildId?: string | null): boolean {
    if (!id || !store.users?.[id]) return false;
    const g = opt(id, "scopeGroups");
    const s = opt(id, "scopeServers");
    const d = opt(id, "scopeDMs");
    if (g && s && d) return true;
    if (guildId) return s;
    const type = channelType(channelId);
    if (type === 1) return d;
    if (type === 3 || type === null) return g;
    return s;
}

/** A tag or a reply only hides someone else's message if THAT person has it on. */
export const mentionHides = (id?: string | null, channelId?: string | null) =>
    !!id && opt(id, "hideMentions") && isHiddenIn(id, channelId);

/** Does this message mention, or reply to, a hidden person? */
export function touchesHidden(msg: any, channelId?: string | null): boolean {
    if (!msg) return false;
    const chId = channelId ?? msg.channel_id ?? msg.channelId;
    if (mentionHides(msg.author?.id, chId)) return true;
    for (const m of msg.mentions ?? []) if (mentionHides(m?.id ?? m, chId)) return true;
    const ref = msg.referenced_message ?? msg.referencedMessage;
    if (ref && mentionHides(ref.author?.id, chId)) return true;
    const content: string = msg.content ?? "";
    if (content.includes("<@"))
        for (const id of Object.keys(store.users ?? {}))
            if (mentionHides(id, chId) && (content.includes(`<@${id}>`) || content.includes(`<@!${id}>`)))
                return true;
    return false;
}

/** The whole message goes away: theirs, or one that tags/replies to them. */
export function shouldHideMessage(msg: any, channelId?: string | null): boolean {
    if (!msg) return false;
    const chId = channelId ?? msg.channel_id ?? msg.channelId;
    const author = msg.author?.id ?? msg.userId;
    if (isHiddenIn(author, chId)) return true;
    return touchesHidden(msg, chId);
}

export function hideUser(id: string, tag?: string) {
    const rec: Opts = { tag };
    for (const key of OPT_KEYS) rec[key] = store.defaults[key];
    store.users = { ...store.users, [id]: rec };
    resetReactionKnowledge();
}

export function showUser(id: string) {
    const next = { ...store.users };
    delete next[id];
    store.users = next;
    resetReactionKnowledge();
}

/** Everything learned about reactors is thrown away when the hidden set changes —
    the lists get looked up again and the counts are rebuilt from scratch. */
export function resetReactionKnowledge() {
    store.reactionCache = {};
    diag.lookupsSent = 0;
    diag.lookupsAnswered = 0;
}

/* ---- diagnostics: /ghost prints this, so a patch that never attached is visible
        on the phone instead of having to be guessed at from the outside ---- */

export const diag = {
    patches: {} as Record<string, string>,
    stores: diagStores,
    /** counters that prove whether the interception actually runs */
    events: 0,
    hiddenMsgs: 0,
    rows: 0,
    /** keys of the action sheets opened so far — this is how the right one gets found */
    sheets: [] as string[],
    /** what the row builder actually handed over, and what was made of it */
    lastRow: "",
    /** what a message collection looks like on this build */
    collection: "",
    /** which event types reach the patched dispatcher at all */
    eventTypes: [] as string[],
    lookupsSent: 0,
    lookupsAnswered: 0,
    notes: [] as string[],
};

/** The author id, wherever this build of the app keeps it. */
export function authorIdOf(msg: any): string | undefined {
    return msg?.author?.id ?? msg?.author?.userId ?? msg?.authorId ?? msg?.userId ?? msg?.user?.id;
}

/** Channel type as the app reports it, for the probe line. */
export function channelTypeOf(channelId?: string | null): number | null {
    try {
        return (channelId && ChannelStore?.getChannel?.(channelId)?.type) ?? null;
    } catch {
        return null;
    }
}

export function sawEvent(type: string) {
    if (!type || diag.eventTypes.includes(type)) return;
    diag.eventTypes.push(type);
    while (diag.eventTypes.length > 10) diag.eventTypes.shift();
}

export function sawSheet(key: string) {
    if (!key || diag.sheets.includes(key)) return;
    diag.sheets.push(key);
    while (diag.sheets.length > 8) diag.sheets.shift();
}

export function mark(name: string, ok: boolean, detail = "") {
    diag.patches[name] = ok ? "ok" : `MISSING${detail ? ` (${detail})` : ""}`;
}

export function note(line: string) {
    diag.notes.push(line);
    while (diag.notes.length > 6) diag.notes.shift();
}
