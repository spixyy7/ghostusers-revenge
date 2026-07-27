// One patch on the Flux dispatcher does most of the work: a hidden person's events
// never reach the app, so nothing of theirs is ever stored, drawn, sounded or
// notified. Everything else in this plugin is a backstop for what Discord draws
// from data it already had.

import { instead } from "@vendetta/patcher";
import { FluxDispatcher } from "@vendetta/metro/common";
import { anyHidden, diag, isHiddenIn, mark, sawEvent, shouldHideMessage, store } from "./core";
import { filterCallEvent, isHiddenStream, maskVoiceStates } from "./calls";
import { forgetReactions, learnFromEvent, learnFromReactorList } from "./reactions";

/** true = the event is swallowed and never happened for this client. */
function handle(e: any): boolean {
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
    if (!FluxDispatcher?.dispatch) {
        mark("dispatcher", false, "FluxDispatcher not found");
        return;
    }
    patches.push(
        instead("dispatch", FluxDispatcher, (args: any[], orig: any) => {
            const e = args[0];
            if (!e?.type || !anyHidden()) return orig.apply(FluxDispatcher, args);
            try {
                diag.events++;
                sawEvent(e.type);
                if (handle(e)) return;
            } catch (err) {
                console.log("[GhostUsers] dispatch", e?.type, err);
            }
            return orig.apply(FluxDispatcher, args);
        }),
    );
    mark("dispatcher", true);
}

export const hiddenCount = () => Object.keys(store.users ?? {}).length;
