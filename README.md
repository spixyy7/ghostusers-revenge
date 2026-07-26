<div align="center">

# GhostUsers for Revenge

**Hide people locally on Discord for Android — quietly, and only for you.**

[![License](https://img.shields.io/badge/license-MIT-1f6feb)](LICENSE)
[![Revenge](https://img.shields.io/badge/Revenge%20%2F%20Bunny-plugin-e91e63)](https://github.com/revenge-mod)
[![Desktop](https://img.shields.io/badge/BetterDiscord-desktop%20version-5865F2)](https://github.com/spixyy7/bd-ghostusers)

</div>

Their messages, reactions and calls stop at your phone. Nothing is sent anywhere and nothing is blocked on Discord's side, so for them everything looks completely normal.

Unlike the [Aliucord build](https://github.com/spixyy7/ghostusers-aliucord), this one runs on the **official, current** Discord app, so voice calls still work — Aliucord's client predates Discord's DAVE encryption requirement and can no longer connect to any call.

## Install

Copy this link and paste it into Revenge (or Bunny) under Settings → Plugins → **+**:

```
https://spixyy7.github.io/ghostusers-revenge/GhostUsers/
```

Opening that link in a browser does nothing useful — the app is what reads it.

Requires [Revenge](https://github.com/revenge-mod) (installed with Revenge Manager, no root needed) or Bunny.

## What it does

Open someone's profile and tap **Hide user (Ghost)**. From that moment:

- their messages never show up, new or old, and there is no notification or sound
- no "X is typing…"
- their reactions don't appear, and a chip only they left disappears
- a call where every participant is hidden doesn't ring
- in calls they leave no tile and no empty slot
- they are not in member lists, and the counters count without them
- replies to their messages don't show the quoted preview

The same can optionally apply to anyone else's message that tags or replies to them.

Every hidden person carries their own switches — where hiding applies (group DMs, servers, DMs), auto mute in calls, member lists, tags and replies. The switches at the bottom of the settings are the defaults handed to newly hidden people.

## If something doesn't work

The settings page ends with a **Diagnostics** block listing every part of the plugin and whether it attached to this build of Discord. Discord changes its internals often; anything that can't attach turns itself off and says so there, rather than breaking the app.

## License

[MIT](LICENSE) — © spixyy7
