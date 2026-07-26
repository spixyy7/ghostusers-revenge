import { diag, initStorage, mark, store } from "./core";
import { patchDispatcher } from "./dispatcher";
import { patchMessages } from "./messages";
import { patchMembers } from "./members";
import { patchUserSheet } from "./userSheet";
import { clearCallMemory } from "./calls";
import { clearLookupState, resolveFetcher } from "./reactions";
import Settings from "./Settings";

let patches: (() => void)[] = [];

export const onLoad = () => {
    initStorage();
    patches = [];
    diag.patches = {};
    diag.notes = [];

    mark("reactorFetch", resolveFetcher());
    patchDispatcher(patches);
    patchMessages(patches);
    patchMembers(patches);
    patchUserSheet(patches);

    const missing = Object.entries(diag.patches).filter(([, v]) => v !== "ok").map(([k]) => k);
    console.log(
        `[GhostUsers] loaded, ${Object.keys(store.users ?? {}).length} hidden`
        + (missing.length ? `, unavailable: ${missing.join(", ")}` : ""),
    );
};

export const onUnload = () => {
    // every patch hands back its own undo — none of them may outlive the plugin
    for (const unpatch of patches) {
        try {
            unpatch();
        } catch (e) {
            console.log("[GhostUsers] unpatch", e);
        }
    }
    patches = [];
    clearCallMemory();
    clearLookupState();
};

export { Settings as settings };
