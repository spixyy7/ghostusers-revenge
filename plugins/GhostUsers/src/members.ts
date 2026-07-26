// Member lists. Unlike the message path there is no single documented entry point
// here, so several known row components are tried by name and whichever one this
// build of Discord actually has gets patched. If none of them exists the feature is
// simply off and says so in the diagnostics — it never guesses silently, which is
// the mistake that cost the Android build five releases.

import { after } from "@vendetta/patcher";
import { findByName, findByProps } from "@vendetta/metro";
import { anyHidden, isHiddenIn, mark, opt, SelectedChannelStore } from "./core";

const ROW_CANDIDATES = [
    "MemberListItem",
    "ChannelMemberRow",
    "MemberRow",
    "UserRow",
];

function hiddenHere(userId?: string): boolean {
    if (!userId || !anyHidden()) return false;
    const channelId = SelectedChannelStore?.getChannelId?.();
    return isHiddenIn(userId, channelId) && opt(userId, "hideMemberList");
}

export function patchMembers(patches: (() => void)[]) {
    let attached = "";

    for (const name of ROW_CANDIDATES) {
        const mod = findByName(name, false) ?? findByName(name);
        const target = mod?.default ? mod : null;
        if (!target) continue;
        try {
            patches.push(
                after("default", target, ([props]: any[], ret: any) => {
                    try {
                        const userId = props?.user?.id ?? props?.userId ?? props?.item?.user?.id;
                        return hiddenHere(userId) ? null : ret;
                    } catch {
                        return ret;
                    }
                }),
            );
            attached = name;
            break;
        } catch {
            /* try the next candidate */
        }
    }

    mark("memberRow", !!attached, ROW_CANDIDATES.join("/"));
    if (attached) mark("memberRow", true, attached);

    // "N Members" style counters: whatever module exposes a member count for a
    // channel gets the hidden ones subtracted from it.
    const countMod = findByProps("getMemberCount") ?? findByProps("getMemberIds", "getMemberCount");
    if (countMod?.getMemberCount) {
        patches.push(
            after("getMemberCount", countMod, ([channelIdOrGuildId]: any[], ret: any) => {
                try {
                    if (typeof ret !== "number" || !anyHidden()) return ret;
                    const ids = countMod.getMemberIds?.(channelIdOrGuildId);
                    if (!Array.isArray(ids)) return ret;
                    const hidden = ids.filter((id: string) => isHiddenIn(id, channelIdOrGuildId) && opt(id, "hideMemberList")).length;
                    return hidden ? Math.max(0, ret - hidden) : ret;
                } catch {
                    return ret;
                }
            }),
        );
        mark("memberCount", true);
    } else {
        mark("memberCount", false, "getMemberCount");
    }
}
