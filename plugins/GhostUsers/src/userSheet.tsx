// "Hide user (Ghost)" on a person's profile sheet — the way you actually use this
// plugin. The sheet is patched the moment it is opened; if the app ever renames it,
// the button simply doesn't appear and /ghost says so, while adding people by id in
// the settings keeps working.

import { findByName, findByProps } from "@vendetta/metro";
import { React } from "@vendetta/metro/common";
import { after, before } from "@vendetta/patcher";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";
import { findInReactTree } from "@vendetta/utils";

import { hideUser, isHidden, mark, showUser, UserStore } from "./core";

const LazyActionSheet = findByProps("openLazy", "hideActionSheet");
const ButtonRow = findByName("ButtonRow");

function GhostButton({ userId }: { userId: string }) {
    const hidden = isHidden(userId);
    const name = UserStore?.getUser?.(userId)?.username ?? userId;
    return React.createElement(ButtonRow, {
        label: hidden ? "Show user (Ghost)" : "Hide user (Ghost)",
        icon: getAssetIDByName(hidden ? "ic_eye" : "ic_eye_hide"),
        onPress: () => {
            if (hidden) {
                showUser(userId);
                showToast(`${name} — visible again`, getAssetIDByName("ic_eye"));
            } else {
                hideUser(userId, name);
                showToast(`${name} — hidden`, getAssetIDByName("ic_eye_hide"));
            }
            LazyActionSheet?.hideActionSheet?.();
        },
    });
}

export function patchUserSheet(patches: (() => void)[]) {
    if (!LazyActionSheet?.openLazy || !ButtonRow) {
        mark("userSheet", false, "action sheet or ButtonRow not found");
        return;
    }

    patches.push(
        before("openLazy", LazyActionSheet, ([component, key, props]: any[]) => {
            if (!key || !String(key).includes("UserProfile")) return;
            const userId = props?.userId ?? props?.user?.id;
            if (!userId) return;
            // don't offer to hide yourself
            if (userId === UserStore?.getCurrentUser?.()?.id) return;

            component?.then?.((instance: any) => {
                const unpatch = after("default", instance, (_a: any, ret: any) => {
                    React.useEffect(() => () => unpatch(), []);
                    const buttons = findInReactTree(ret, (x: any) => x?.[0]?.type?.name === "ButtonRow");
                    if (!buttons) return ret;
                    buttons.unshift(React.createElement(GhostButton, { userId }));
                });
            });
        }),
    );
    mark("userSheet", true);
}
