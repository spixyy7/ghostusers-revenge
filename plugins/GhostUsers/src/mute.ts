// Local mute. Hiding someone silences them for you in calls; unhiding always gives
// their sound back, whether or not they were muted before — that is the rule the
// person using this asked for, and it is the one that can't leave anybody stuck
// silent without knowing why.
//
// Only your own client is touched: local mute is a setting on this device, and the
// other side is never told anything.

import { findByProps, findByStoreName } from "@vendetta/metro";
import { mark, onHideChanged, opt, store } from "./core";

let actions: any = null;
let state: any = null;

function resolve() {
    // whichever module this build keeps the local mute action in
    actions =
        findByProps("setLocalMute")
        ?? findByProps("toggleLocalMute")
        ?? findByProps("toggleUserMuted")
        ?? null;
    state =
        findByProps("isLocalMute")
        ?? findByStoreName("MediaEngineStore")
        ?? findByStoreName("MediaSettingsStore")
        ?? null;
    return !!actions;
}

/** Is this person already silenced for me? null when the app won't say. */
function isMuted(userId: string): boolean | null {
    for (const attempt of [
        () => state?.isLocalMute?.(userId),
        () => state?.getMutedUsers?.()?.[userId],
        () => state?.isMuted?.(userId),
    ]) {
        try {
            const value = attempt();
            if (typeof value === "boolean") return value;
        } catch { /* ask the next one */ }
    }
    return null;
}

function setMuted(userId: string, muted: boolean) {
    for (const attempt of [
        () => actions?.setLocalMute?.(userId, muted),
        () => (isMuted(userId) !== muted ? actions?.toggleLocalMute?.(userId) : true),
        () => (isMuted(userId) !== muted ? actions?.toggleUserMuted?.(userId) : true),
    ]) {
        try {
            if (attempt() !== undefined) return true;
        } catch { /* try the next shape */ }
    }
    return false;
}

/** Silence them when hidden — but never touch someone already silenced, so
    unhiding cannot appear to "unmute" a choice that was not ours. */
export function applyMute(userId: string, hidden: boolean) {
    if (!actions) return;
    try {
        if (hidden) {
            if (!opt(userId, "autoVoiceMute")) return;
            if (isMuted(userId) === true) return; // already silent, leave it alone
            setMuted(userId, true);
        } else {
            // unhiding always gives the sound back
            setMuted(userId, false);
        }
    } catch (e) {
        console.log("[GhostUsers] mute", e);
    }
}

export function setUpMute() {
    mark("localMute", resolve(), "setLocalMute/toggleLocalMute");
    if (!actions) return;

    onHideChanged(applyMute);

    // anyone hidden from an earlier session is silenced again on start
    for (const id of Object.keys(store.users ?? {})) applyMute(id, true);
}
