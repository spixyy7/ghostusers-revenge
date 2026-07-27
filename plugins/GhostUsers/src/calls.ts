// Calls: a hidden person leaves no trace in one, and a call that is only theirs
// never rings. Both lessons from the desktop build are carried over here:
//
//  - newer clients send `ongoingRings` (objects), not `ringing` (ids) — a filter
//    written for the old field silently does nothing, which is why rings kept
//    coming through for months;
//  - "nobody visible is in this call" is NOT proof that the call is theirs, it also
//    happens when voice states are simply late. Since a hidden person is masked out
//    of the store the moment they join, they are remembered here instead.

import { ChannelStore, isHiddenIn, store } from "./core";

const hiddenVoice = new Map<string, Set<string>>();

export function rememberHiddenInCall(userId?: string, channelId?: string) {
    if (!userId || !channelId) return;
    let set = hiddenVoice.get(channelId);
    if (!set) hiddenVoice.set(channelId, (set = new Set()));
    set.add(userId);
}

export function forgetHiddenInCall(userId?: string) {
    if (!userId) return;
    for (const [ch, set] of hiddenVoice) if (set.delete(userId) && !set.size) hiddenVoice.delete(ch);
}

export const hiddenInCall = (channelId?: string) =>
    (channelId && hiddenVoice.get(channelId)?.size) || 0;

export function clearCallMemory() {
    hiddenVoice.clear();
}

/** True when this is a one-on-one DM and the person on the other side is hidden. */
export function hiddenDmRecipient(channelId?: string): boolean {
    try {
        const ch = channelId && ChannelStore?.getChannel?.(channelId);
        if (!ch || ch.type !== 1) return false;
        const other = (ch.recipients ?? [])[0];
        const id = typeof other === "string" ? other : other?.id;
        return !!id && isHiddenIn(id, channelId);
    } catch {
        return false;
    }
}

const ringUserId = (r: any) =>
    r && typeof r === "object" ? (r.userId ?? r.user_id ?? r.ringerId ?? r.ringer_id ?? r.id) : r;

/**
 * Rewrites an incoming CALL_CREATE / CALL_UPDATE in place: hidden people are taken
 * out of the participants and out of the ring list, and a call that turns out to be
 * theirs alone stops ringing altogether.
 */
export function filterCallEvent(e: any): void {
    const chId = e.channelId ?? e.channel_id;
    const before = Array.isArray(e.ringing) ? e.ringing.length
        : Array.isArray(e.ongoingRings) ? e.ongoingRings.length : 0;

    const vsKey = Array.isArray(e.voiceStates) ? "voiceStates"
        : Array.isArray(e.voice_states) ? "voice_states" : null;
    const ringKey = Array.isArray(e.ringing) ? "ringing"
        : Array.isArray(e.ongoingRings) ? "ongoingRings" : null;

    if (ringKey && e[ringKey].length)
        e[ringKey] = e[ringKey].filter((r: any) => !isHiddenIn(ringUserId(r), chId));

    if (vsKey && e[vsKey].length)
        e[vsKey] = e[vsKey].filter((vs: any) =>
            !isHiddenIn(vs?.userId ?? vs?.user_id, chId ?? vs?.channelId ?? vs?.channel_id));

    // Only silence a ring when the call is provably theirs.
    const evidence = hiddenInCall(chId) > 0 || hiddenDmRecipient(chId);
    const visible = vsKey ? e[vsKey].length : null;
    if (evidence && visible === 0 && ringKey && e[ringKey].length) e[ringKey] = [];

    console.log(
        `[GhostUsers] ${e.type} ch=${chId} rings ${before}->${ringKey ? e[ringKey].length : "n/a"}`
        + ` participants=${visible ?? "not in payload"} hiddenKnownInCall=${hiddenInCall(chId)}`
        + ` dmWithHidden=${hiddenDmRecipient(chId)}`,
    );
}

/** Voice states: a hidden person joining is presented as having left, so the store
    never records them — no join sound, no tile, no empty slot in the layout. */
export function maskVoiceStates(e: any): void {
    if (!Array.isArray(e.voiceStates)) return;
    e.voiceStates = e.voiceStates.map((vs: any) => {
        const ch = vs?.channelId ?? vs?.channel_id;
        const uid = vs?.userId ?? vs?.user_id;
        if (!ch || !isHiddenIn(uid, ch)) {
            forgetHiddenInCall(uid);
            return vs;
        }
        rememberHiddenInCall(uid, ch);
        return { ...vs, channelId: null, channel_id: null };
    });
}

/** streamKey looks like "call:<channelId>:<ownerId>" or "guild:<g>:<ch>:<ownerId>". */
export function isHiddenStream(streamKey?: string): boolean {
    if (!streamKey || !Object.keys(store.users ?? {}).length) return false;
    const parts = String(streamKey).split(":");
    const owner = parts[parts.length - 1];
    const channelId = parts.length >= 3 ? parts[parts.length - 2] : undefined;
    return isHiddenIn(owner, channelId);
}
