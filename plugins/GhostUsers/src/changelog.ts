// What changed, shown in the plugin's own settings. Written for whoever uses it.

export const VERSION = "1.7.0";

export const CHANGELOG: { version: string; lines: string[] }[] = [
    {
        version: "1.7.0",
        lines: [
            "Hiding works. What kept it from working was not Discord but the way this plugin was packaged: the bundler gave two unrelated variables the same short name, so a cache became a piece of text at runtime and every channel it tried to filter threw. Names are left alone now.",
            "Everything is filtered where the app reads it rather than after it is drawn, so nobody flashes on screen first: the member list and its counters, typing, reactions and who reacted, calls and who is in them.",
            "A hidden person is dropped from a group's member list, its count, and the line of names under the group's title.",
        ],
    },
    {
        version: "1.2.0",
        lines: [
            "The status block now also reports what the row builder was actually handed — which author id it found on a message, what kind of channel it decided the message was in, and whether that came out hidden. A hook that attaches but recognises nobody looks exactly like one that never ran, unless it says so.",
            "The author of a message is looked for in every place different builds of the app keep it, and a hidden row is emptied out more thoroughly.",
        ],
    },
    {
        version: "1.1.0",
        lines: [
            "Fixed hiding doing nothing at all: a channel the app could not identify was treated as \"leave it alone\", which silently switched the whole plugin off. Anything with a server behind it now counts as a server, and an unknown channel falls back to the group setting.",
            "The \"Hide user (Ghost)\" button now looks for a profile by what the sheet carries rather than by its name, since that name has changed more than once.",
            "Settings now open with a status block: which parts attached to this build of Discord, and counters showing whether the interception is actually running. It never leaves your phone.",
        ],
    },
    {
        version: "1.0.0",
        lines: [
            "First release for Revenge — the port of the desktop plugin. Runs on the official Discord app, so calls still work, unlike the Aliucord build.",
        ],
    },
];
