// What changed, in the plugin's own settings. Written for whoever uses it — what is
// different for them, not what moved in the code.

export const VERSION = "1.11.0";

export type Entry = { version: string; summary: string; lines: string[] };

export const CHANGELOG: Entry[] = [
    {
        version: "1.11.0",
        summary: "Pictures, and a tidier settings screen",
        lines: [
            "Hidden people show their picture next to their name, and each name folds open to their own switches, with a line explaining what each one does.",
            "The status block is out of the way: one line at the bottom says whether everything is working, and opens if you want the detail.",
            "Two voice readers were reported as unavailable although nothing was missing — each exists on one of Discord's two voice stores, so the absent pairing means nothing.",
        ],
    },
    {
        version: "1.9.0",
        summary: "Servers, properly",
        lines: [
            "A hidden person is gone from a server's member list, from the count above it and from the server's member total — but only in servers they are actually in.",
            "Their place no longer keeps a grey slot loading forever. That came from removing them on the way in, which left a hole in the numbered range the list keeps; they are taken out where the screen reads its rows instead.",
        ],
    },
    {
        version: "1.8.0",
        summary: "Hidden means hidden",
        lines: [
            "Hiding someone now applies everywhere — servers and direct messages included — instead of group conversations only. Anyone hidden under the old meaning came along, unless their switches had been changed by hand.",
        ],
    },
    {
        version: "1.7.0",
        summary: "The one where it started working",
        lines: [
            "What kept everything from working was not Discord but the way this plugin was packaged: two unrelated variables were given the same short name, so a cache turned into a piece of text and every channel it touched failed quietly.",
            "Everything is filtered where the app reads it rather than after it is drawn, so nobody appears for a moment first: messages, member lists and counters, typing, reactions, calls and who is in them.",
        ],
    },
    {
        version: "1.0.0",
        summary: "First release for Revenge",
        lines: [
            "The desktop plugin, ported to the official Discord app — so calls still work, unlike the Aliucord build, which Discord no longer lets into a call at all.",
        ],
    },
];
