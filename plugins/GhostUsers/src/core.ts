// Who is hidden, where the hiding applies, and what is currently working.
// This mirrors the BetterDiscord plugin's core: every hidden person carries their
// own switches, and the global ones are only the defaults handed to new entries.

import { storage } from "@vendetta/plugin";
import { findByStoreName } from "@vendetta/metro";

export const ChannelStore = findByStoreName("ChannelStore");
export const UserStore = findByStoreName("UserStore");
export const SelectedChannelStore = findByStoreName("SelectedChannelStore");

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

/** Is this person hidden in THIS channel, per their own scope switches. */
export function isHiddenIn(id?: string | null, channelId?: string | null): boolean {
    if (!id || !store.users?.[id]) return false;
    const g = opt(id, "scopeGroups");
    const s = opt(id, "scopeServers");
    const d = opt(id, "scopeDMs");
    if (g && s && d) return true;
    const type = channelType(channelId);
    if (type === null) return false; // unknown channel → leave it alone
    if (type === 3) return g;
    if (type === 1) return d;
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
    lookupsSent: 0,
    lookupsAnswered: 0,
    notes: [] as string[],
};

export function mark(name: string, ok: boolean, detail = "") {
    diag.patches[name] = ok ? "ok" : `MISSING${detail ? ` (${detail})` : ""}`;
}

export function note(line: string) {
    diag.notes.push(line);
    while (diag.notes.length > 6) diag.notes.shift();
}
