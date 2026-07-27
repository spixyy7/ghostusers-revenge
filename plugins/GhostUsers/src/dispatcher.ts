// One patch on the Flux dispatcher does most of the work: a hidden person's events
// never reach the app, so nothing of theirs is ever stored, drawn, sounded or
// notified. Everything else in this plugin is a backstop for what Discord draws
// from data it already had.

import { instead } from "@vendetta/patcher";
import { FluxDispatcher } from "@vendetta/metro/common";
import { anyHidden, diag, isHiddenIn, mark, opt, sawEvent, shouldHideMessage, store } from "./core";
import { filterCallEvent, isHiddenStream, maskVoiceStates } from "./calls";
import { forgetReactions, learnFromEvent, learnFromReactorList } from "./reactions";

const memberEventsSeen = new Set<string>();

/** Reports, once per kind, any action that carries people — that is how the screen
    which still lists a hidden person gets traced back to its source. */
function noteMemberEvent(e: any) {
    if (!/MEMBER|USERS|CHUNK/i.test(e.type) || memberEventsSeen.has(e.type)) return;
    memberEventsSeen.add(e.type);
    const shape = Object.entries(e)
        .filter(([k]) => k !== "type")
        .map(([k, v]) => `${k}:${Array.isArray(v) ? `array(${v.length})` : typeof v}`)
        .join(" ");
    console.log(`[GhostUsers] member event ${e.type} ${shape}`);
}

/** true = the event is swallowed and never happened for this client. */
function handle(e: any): boolean {
    noteMemberEvent(e);
    switch (e.type) {
        case "MESSAGE_CREATE":
        case "MESSAGE_UPDATE": {
            const chId = e.channelId ?? e.channel_id ?? e.message?.channel_id;
            const guildId = e.guildId ?? e.guild_id ?? e.message?.guild_id;
            if (isHiddenIn(e.message?.author?.id, chId, guildId)) {
                diag.hiddenMsgs++;
                return true;
            }
            if (shouldHideMessage(e.message, chId)) {
                diag.hiddenMsgs++;
                return true;
            }
            // their message quoted under someone else's reply
            const ref = e.message?.referenced_message;
            if (ref && isHiddenIn(ref.author?.id, chId)) e.message.referenced_message = null;
            return false;
        }

        case "LOAD_MESSAGES_SUCCESS": {
            if (!Array.isArray(e.messages)) return false;
            const chId = e.channelId ?? e.channel_id;
            e.messages = e.messages.filter((m: any) => !shouldHideMessage(m, chId));
            for (const m of e.messages)
                if (m?.referenced_message && isHiddenIn(m.referenced_message.author?.id, chId))
                    m.referenced_message = null;
            return false;
        }

        case "GUILD_MEMBER_LIST_UPDATE": {
            // A server's member list arrives as operations on a list, with the
            // counts alongside. Hidden people are taken out of both, so the list is
            // right from the first frame instead of being corrected afterwards.
            const guildId = e.guildId ?? e.guild_id;
            const gone = (uid?: string) =>
                !!uid && isHiddenIn(uid, undefined, guildId) && opt(uid, "hideMemberList");
            const itemUser = (it: any) => it?.member?.user?.id ?? it?.member?.userId ?? it?.user?.id;
            let removed = 0;

            for (const op of e.ops ?? []) {
                if (Array.isArray(op.items)) {
                    const kept = op.items.filter((it: any) => {
                        if (!gone(itemUser(it))) return true;
                        removed++;
                        return false;
                    });
                    if (kept.length !== op.items.length) op.items = kept;
                }
                if (op.item && gone(itemUser(op.item))) {
                    removed++;
                    op.items = [];
                    op.item = null;
                    op.op = "NONE";
                }
            }

            if (removed) {
                if (typeof e.memberCount === "number") e.memberCount = Math.max(0, e.memberCount - removed);
                if (typeof e.onlineCount === "number") e.onlineCount = Math.max(0, e.onlineCount - removed);
                for (const g of e.groups ?? [])
                    if (typeof g?.count === "number") g.count = Math.max(0, g.count - removed);
                diag.rows += removed;
            }
            return false;
        }

        case "TYPING_START":
            return isHiddenIn(e.userId ?? e.user_id, e.channelId ?? e.channel_id);

        case "MESSAGE_REACTION_ADD":
        case "MESSAGE_REACTION_REMOVE":
            // learned from, never swallowed: the count Discord keeps stays exactly
            // what the server says, and the row correction hides the difference
            learnFromEvent(e);
            return false;

        case "MESSAGE_REACTION_REMOVE_ALL":
            forgetReactions(e.channelId ?? e.channel_id, e.messageId ?? e.message_id);
            return false;

        case "MESSAGE_REACTION_REMOVE_EMOJI":
            forgetReactions(e.channelId ?? e.channel_id, e.messageId ?? e.message_id, e.emoji?.id ?? e.emoji?.name);
            return false;

        case "MESSAGE_REACTION_ADD_USERS":
            learnFromReactorList(e);
            return false;

        case "VOICE_STATE_UPDATES":
            maskVoiceStates(e);
            return false;

        case "CALL_CREATE":
        case "CALL_UPDATE":
            filterCallEvent(e);
            return false;

        case "STREAM_CREATE":
        case "STREAM_UPDATE":
        case "STREAM_SERVER_UPDATE":
            return isHiddenStream(e.streamKey);

        default:
            return false;
    }
}

export function patchDispatcher(patches: (() => void)[]) {
    const fd: any = FluxDispatcher;
    if (!fd) {
        mark("dispatcher", false, "FluxDispatcher not found");
        return;
    }

    // Flux has a proper way to refuse an action — an interceptor that returns true
    // drops it before any store sees it. That beats patching dispatch(), which on
    // this client barely carries any gateway traffic at all.
    if (typeof fd.addInterceptor === "function") {
        const interceptor = (e: any) => {
            if (!e?.type || !anyHidden()) return false;
            try {
                diag.events++;
                sawEvent(e.type);
                return handle(e);
            } catch (err) {
                console.log("[GhostUsers] intercept", e?.type, err);
                return false;
            }
        };
        const removed = fd.addInterceptor(interceptor);
        patches.push(() => {
            try {
                if (typeof removed === "function") removed();
                else if (Array.isArray(fd._interceptors)) {
                    const i = fd._interceptors.indexOf(interceptor);
                    if (i >= 0) fd._interceptors.splice(i, 1);
                }
            } catch (e) {
                console.log("[GhostUsers] remove interceptor", e);
            }
        });
        mark("dispatcher", true, "addInterceptor");
        return;
    }

    // fallback for a client without interceptors: take every dispatch entry point
    const seen = new WeakSet<object>();
    const entries = ["dispatch", "_dispatch"].filter(name => typeof fd[name] === "function");
    for (const name of entries) {
        patches.push(
            instead(name, fd, (args: any[], orig: any) => {
                const e = args[0];
                if (!e?.type || !anyHidden()) return orig.apply(fd, args);
                try {
                    if (!seen.has(e)) {
                        seen.add(e);
                        diag.events++;
                        sawEvent(e.type);
                        if (handle(e)) return;
                    }
                } catch (err) {
                    console.log("[GhostUsers] dispatch", e?.type, err);
                }
                return orig.apply(fd, args);
            }),
        );
    }
    mark("dispatcher", entries.length > 0, entries.join("+") || "none");
}

export const hiddenCount = () => Object.keys(store.users ?? {}).length;
