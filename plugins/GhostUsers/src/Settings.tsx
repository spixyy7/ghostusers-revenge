// Settings: the hidden list with each person's own switches, the defaults handed to
// newly hidden people, and a diagnostics block — the phone has no console, so the
// plugin has to be able to say what is and isn't working out loud.

import { React, ReactNative as RN } from "@vendetta/metro/common";
import { useProxy } from "@vendetta/storage";
import { Forms, General } from "@vendetta/ui/components";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";

import { diag, hideUser, OPT_KEYS, showUser, store, UserStore } from "./core";

const { FormSection, FormRow, FormSwitchRow, FormInput, FormDivider, FormText } = Forms;
const { ScrollView } = General;

const LABELS: Record<string, string> = {
    scopeGroups: "Group DMs",
    scopeServers: "Servers",
    scopeDMs: "One-on-one DMs",
    autoVoiceMute: "Auto mute in calls",
    hideMemberList: "Hide from member lists",
    hideMentions: "Hide tags & replies",
};

export default function Settings() {
    useProxy(store);
    const [open, setOpen] = React.useState<string | null>(null);
    const [newId, setNewId] = React.useState("");

    const ids = Object.keys(store.users ?? {});

    return React.createElement(
        ScrollView,
        null,

        React.createElement(
            FormSection,
            { title: "Hidden users" },
            ids.length === 0
                ? React.createElement(FormText, { style: { padding: 16 } },
                    "Nobody is hidden yet. Open someone's profile and tap \"Hide user (Ghost)\", or paste their user id below.")
                : ids.map(id => {
                    const rec = store.users[id];
                    const name = rec.tag ?? UserStore?.getUser?.(id)?.username ?? id;
                    const expanded = open === id;
                    return React.createElement(
                        React.Fragment,
                        { key: id },
                        React.createElement(FormRow, {
                            label: name,
                            subLabel: id,
                            trailing: React.createElement(FormRow.Arrow, null),
                            onPress: () => setOpen(expanded ? null : id),
                        }),
                        ...(expanded
                            ? [
                                ...OPT_KEYS.map(key =>
                                    React.createElement(FormSwitchRow, {
                                        key: `${id}-${key}`,
                                        label: LABELS[key] ?? key,
                                        value: rec[key] ?? store.defaults[key],
                                        onValueChange: (v: boolean) => {
                                            store.users = { ...store.users, [id]: { ...rec, [key]: v } };
                                        },
                                    }),
                                ),
                                React.createElement(FormRow, {
                                    key: `${id}-remove`,
                                    label: "Remove",
                                    leading: React.createElement(FormRow.Icon, {
                                        source: getAssetIDByName("ic_message_delete"),
                                    }),
                                    onPress: () => {
                                        showUser(id);
                                        setOpen(null);
                                        showToast(`${name} — visible again`, getAssetIDByName("ic_eye"));
                                    },
                                }),
                            ]
                            : []),
                        React.createElement(FormDivider, null),
                    );
                }),
        ),

        React.createElement(
            FormSection,
            { title: "Add by user id" },
            React.createElement(FormInput, {
                value: newId,
                onChange: (v: string) => setNewId(v),
                placeholder: "123456789012345678",
                title: "USER ID",
            }),
            React.createElement(FormRow, {
                label: "Hide this user",
                leading: React.createElement(FormRow.Icon, { source: getAssetIDByName("ic_eye_hide") }),
                onPress: () => {
                    const id = newId.trim();
                    if (!/^\d{5,}$/.test(id)) return showToast("That is not a user id", getAssetIDByName("Small"));
                    hideUser(id, UserStore?.getUser?.(id)?.username);
                    setNewId("");
                    showToast("Hidden", getAssetIDByName("ic_eye_hide"));
                },
            }),
        ),

        React.createElement(
            FormSection,
            { title: "Defaults for newly hidden users" },
            ...OPT_KEYS.map(key =>
                React.createElement(FormSwitchRow, {
                    key: `def-${key}`,
                    label: LABELS[key] ?? key,
                    value: store.defaults[key],
                    onValueChange: (v: boolean) => {
                        store.defaults = { ...store.defaults, [key]: v };
                    },
                }),
            ),
            React.createElement(FormRow, {
                label: "Apply to everyone already hidden",
                onPress: () => {
                    const next = { ...store.users };
                    for (const id of Object.keys(next)) next[id] = { ...next[id], ...store.defaults };
                    store.users = next;
                    showToast("Applied", getAssetIDByName("ic_check"));
                },
            }),
        ),

        React.createElement(
            FormSection,
            { title: "Diagnostics" },
            React.createElement(FormText, { style: { paddingHorizontal: 16, paddingBottom: 12 } },
                Object.entries(diag.patches).map(([k, v]) => `${k}: ${v}`).join("\n")
                + `\nreactor lookups: ${diag.lookupsSent} sent, ${diag.lookupsAnswered} answered`
                + (diag.notes.length ? `\n${diag.notes.join("\n")}` : "")),
        ),
    );
}
