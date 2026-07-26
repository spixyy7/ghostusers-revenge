// Two safety nets under the dispatcher, for data the app already had before anyone
// was hidden: the read the chat does when it draws (MessageStore.getMessages) and
// the row builder itself (RowManager), which is also where reaction chips get their
// numbers corrected.

import { after } from "@vendetta/patcher";
import { findByName, findByStoreName } from "@vendetta/metro";
import { anyHidden, mark, shouldHideMessage } from "./core";
import { correctedReactions } from "./reactions";

export function patchMessages(patches: (() => void)[]) {
    const MessageStore = findByStoreName("MessageStore");
    if (MessageStore?.getMessages) {
        patches.push(
            after("getMessages", MessageStore, ([channelId]: any[], ret: any) => {
                try {
                    if (!anyHidden() || !ret) return ret;
                    const list: any[] = ret._array ?? ret.array?.() ?? null;
                    if (!Array.isArray(list) || !list.length) return ret;
                    const kept = list.filter(m => !shouldHideMessage(m, channelId));
                    if (kept.length === list.length) return ret;
                    // the collection is handed back with the same identity, only shorter
                    if (ret._array) ret._array = kept;
                    return ret;
                } catch (e) {
                    console.log("[GhostUsers] getMessages", e);
                    return ret;
                }
            }),
        );
        mark("messageStore", true);
    } else {
        mark("messageStore", false, "MessageStore.getMessages");
    }

    const RowManager = findByName("RowManager");
    if (RowManager?.prototype?.generate) {
        patches.push(
            after("generate", RowManager.prototype, ([data]: any[], row: any) => {
                try {
                    if (!anyHidden() || !row) return;
                    const msg = row.message ?? data?.message;
                    if (!msg) return;
                    const channelId = msg.channelId ?? msg.channel_id ?? data?.channelId;
                    const messageId = msg.id;
                    if (!channelId || !messageId) return;

                    // a row that should not exist is emptied out rather than deleted:
                    // the list keeps its indices, and nothing of theirs is drawn
                    if (shouldHideMessage(msg, channelId)) {
                        row.renderContentOnly = true;
                        msg.content = [];
                        msg.embeds = [];
                        msg.attachments = [];
                        msg.reactions = [];
                        msg.referencedMessage = null;
                        row.hidden = true;
                        return;
                    }

                    const fixed = correctedReactions(channelId, messageId, msg.reactions);
                    if (fixed) msg.reactions = fixed;
                } catch (e) {
                    console.log("[GhostUsers] row", e);
                }
            }),
        );
        mark("rowManager", true);
    } else {
        mark("rowManager", false, "RowManager.generate");
    }
}
