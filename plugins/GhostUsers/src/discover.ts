// One-off reconnaissance, printed to the app's log. Names of Discord's internals
// differ between builds, and guessing them is how the Aliucord port lost five
// releases to hooks that attached to nothing. So the plugin looks around the actual
// client it is running in and reports what it finds; the results decide which
// modules the next version targets.
//
// Everything here only reads and prints — it changes nothing and sends nothing.

import { findAll } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";

const log = (line: string) => console.log(`[GhostUsers][find] ${line}`);

const INTERESTING = /member|reaction|call|voice|ring|typing|message|channel/i;

export function reconnoitre() {
    try {
        // 1. Flux stores, by their own reported name
        const stores = findAll((m: any) => typeof m?.getName === "function" && typeof m?.addChangeListener === "function");
        const names = new Set<string>();
        for (const s of stores) {
            try {
                const n = s.getName();
                if (typeof n === "string" && INTERESTING.test(n)) names.add(n);
            } catch { /* a store that dislikes being asked */ }
        }
        log(`stores: ${[...names].sort().join(", ") || "none"}`);

        // 2. the dispatcher's own entry points
        log(`dispatcher methods: ${Object.keys(FluxDispatcher ?? {}).filter(k => typeof (FluxDispatcher as any)[k] === "function").join(", ")}`);

        // 3. anything that can open a sheet — the profile button needs one of these
        const sheets = findAll((m: any) =>
            m && typeof m === "object" && Object.keys(m).some(k => /^open(Lazy|ActionSheet|Sheet)$/i.test(k)));
        log(`sheet modules: ${sheets.slice(0, 4).map((m: any) => Object.keys(m).slice(0, 6).join("/")).join(" | ") || "none"}`);

        // 4. whoever knows how to fetch who reacted
        const reactionMods = findAll((m: any) =>
            m && typeof m === "object" && Object.keys(m).some(k => /fetchReaction|getReactions|addReaction/i.test(k)));
        log(`reaction modules: ${reactionMods.slice(0, 4).map((m: any) => Object.keys(m).filter(k => /reaction/i.test(k)).slice(0, 5).join("/")).join(" | ") || "none"}`);

        // 5. row components for lists of people
        const rows = findAll((m: any) => {
            const c = m?.default ?? m;
            const n = c?.displayName ?? c?.name;
            return typeof n === "string" && /member|participant|voiceuser/i.test(n);
        });
        const rowNames = rows
            .map((m: any) => (m?.default ?? m)?.displayName ?? (m?.default ?? m)?.name)
            .filter((n: any) => typeof n === "string");
        log(`people-row components: ${[...new Set(rowNames)].slice(0, 12).join(", ") || "none"}`);
    } catch (e) {
        log(`failed: ${e}`);
    }
}
