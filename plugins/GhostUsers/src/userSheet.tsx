// "Hide user (Ghost)" on a person's profile sheet — the way you actually use this
// plugin. The sheet is patched as it opens; the row is built from the plugin API's
// own form components, because the button component Discord used to expose no longer
// exists on this build. If the sheet ever changes shape the button simply doesn't
// appear, the status block says so, and adding people by id still works.

import { findByProps } from "@vendetta/metro";
import { React } from "@vendetta/metro/common";
import { after, before } from "@vendetta/patcher";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { Forms } from "@vendetta/ui/components";
import { showToast } from "@vendetta/ui/toasts";
import { findInReactTree } from "@vendetta/utils";

import { hideUser, isHidden, mark, sawSheet, showUser, UserStore } from "./core";

const { FormRow } = Forms;
const LazyActionSheet = findByProps("openLazy", "hideActionSheet");

function GhostRow({ userId }: { userId: string }) {
    const hidden = isHidden(userId);
    const name = UserStore?.getUser?.(userId)?.username ?? userId;
    return React.createElement(FormRow, {
        label: hidden ? "Show user (Ghost)" : "Hide user (Ghost)",
        leading: React.createElement(FormRow.Icon, {
            source: getAssetIDByName(hidden ? "ic_eye" : "ic_eye_hide"),
        }),
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
    if (!LazyActionSheet?.openLazy) {
        mark("userSheet", false, "no action sheet module");
        return;
    }

    patches.push(
        before("openLazy", LazyActionSheet, ([component, key, props]: any[]) => {
            sawSheet(String(key ?? "?"), props);
            const userId = props?.userId ?? props?.user?.id ?? props?.user?.userId;
            if (!userId) return;
            if (String(key ?? "").includes("Message")) return;
            if (userId === UserStore?.getCurrentUser?.()?.id) return;

            component?.then?.((instance: any) => {
                const unpatch = after("default", instance, (_a: any, ret: any) => {
                    React.useEffect(() => () => unpatch(), []);
                    // whatever list of rows the sheet renders, the Ghost row goes on top
                    const rows =
                        findInReactTree(ret, (x: any) => Array.isArray(x) && x.some((c: any) => c?.type?.name?.includes?.("Row")))
                        ?? findInReactTree(ret, (x: any) => Array.isArray(x) && x.length > 1 && x.every((c: any) => c?.props));
                    if (!Array.isArray(rows)) return ret;
                    rows.unshift(React.createElement(GhostRow, { userId }));
                    return ret;
                });
            });
        }),
    );
    mark("userSheet", true);
}
