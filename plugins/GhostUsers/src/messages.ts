// Two safety nets under the dispatcher, for data the app already had before anyone
// was hidden: the read the chat does when it draws (MessageStore.getMessages) and
// the row builder itself (RowManager), which is also where reaction chips get their
// numbers corrected.
//
// Both of them also report what they were handed — the shape of a message differs
// between builds of the app, and a hook that attaches but never recognises anybody
// is indistinguishable from one that never ran unless it says so out loud.

import { after } from "@vendetta/patcher";
import { findByName, findByStoreName } from "@vendetta/metro";
import { anyHidden, authorIdOf, channelTypeOf, diag, isHiddenIn, mark, shouldHideMessage } from "./core";
import { correctedReactions } from "./reactions";

/** Empties a row so nothing of theirs is drawn, whatever shape the row has. */
function blankRow(row: any, msg: any) {
    row.renderContentOnly = true;
    row.hidden = true;
    for (const field of ["content", "embeds", "attachments", "reactions", "stickers", "components"])
        if (Array.isArray(msg[field])) msg[field] = [];
    msg.referencedMessage = null;
    msg.referenced_message = null;
    // some builds draw from these instead of the arrays above
    if (typeof msg.text === "string") msg.text = "";
    if (row.message?.content) row.message.content = [];
}

export function patchMessages(patches: (() => void)[]) {
    const MessageStore = findByStoreName("MessageStore");
    if (MessageStore?.getMessages) {
        patches.push(
            after("getMessages", MessageStore, ([channelId]: any[], ret: any) => {
                try {
                    if (!anyHidden() || !ret) return ret;
                    const list: any[] | null = Array.isArray(ret)
                        ? ret
                        : Array.isArray(ret._array)
                            ? ret._array
                            : typeof ret.toArray === "function"
                                ? ret.toArray()
                                : null;
                    if (!diag.collection)
                        diag.collection = `${Array.isArray(ret) ? "array" : Object.keys(ret).slice(0, 6).join(",")}`
                            + ` len=${list?.length ?? "?"}`;
                    if (!Array.isArray(list) || !list.length) return ret;
                    const kept = list.filter(m => !shouldHideMessage(m, channelId));
                    if (kept.length === list.length) return ret;
                    if (Array.isArray(ret)) return kept;
                    if (Array.isArray(ret._array)) ret._array = kept;
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
                    if (!row) return;
                    const msg = row.message ?? data?.message ?? data;
                    if (!msg || typeof msg !== "object") return;
                    const channelId = msg.channelId ?? msg.channel_id ?? data?.channelId ?? data?.channel_id;
                    const messageId = msg.id ?? msg.messageId;
                    const author = authorIdOf(msg);
                    const hide = !!author && shouldHideMessage(msg, channelId);

                    // one line that says everything about why a row did or didn't match
                    diag.lastRow =
                        `author=${author ?? "none"} ch=${channelId ?? "none"} type=${channelTypeOf(channelId)}`
                        + ` hidden=${hide} rowType=${row.rowType ?? data?.rowType ?? "?"}`
                        + ` msgKeys=${Object.keys(msg).slice(0, 10).join(",")}`;

                    if (!anyHidden()) return;
                    if (hide) {
                        diag.rows++;
                        blankRow(row, msg);
                        return;
                    }
                    if (!channelId || !messageId) return;
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

export { isHiddenIn };
