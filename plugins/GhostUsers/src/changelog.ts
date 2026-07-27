// What changed, shown in the plugin's own settings. Written for whoever uses it.

export const VERSION = "1.1.0";

export const CHANGELOG: { version: string; lines: string[] }[] = [
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
