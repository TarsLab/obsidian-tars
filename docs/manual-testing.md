# Manual testing against a running Obsidian

`npm run build` and `npm run lint` say nothing about whether the settings tab
actually works. Since 1.13 the tab is built from `getSettingDefinitions()` and
rendered by Obsidian, so a definition can type-check perfectly and still
produce a row that never appears, a control that never saves, or a page the
user cannot get out of.

The [Obsidian CLI](https://help.obsidian.md/cli) can drive a running instance,
which makes those things checkable instead of guessable. This document is the
setup, the traps that cost the most time, and a checklist to run before
release.

## Setup

Use a **scratch vault**, not a working one. The checklist adds, renames and
deletes providers, and a real vault's `data.json` holds every API key you have
configured.

```bash
export VAULT="$HOME/path/to/scratch-vault"          # adjust
export PLUGIN="$VAULT/.obsidian/plugins/tars"
mkdir -p "$PLUGIN"
```

Open that vault in Obsidian, then confirm the CLI is talking to it:

```bash
obsidian version
obsidian eval code="app.vault.getName()"
```

The CLI targets the most recently focused vault. With more than one open, pass
`vault=<name>` as the first parameter to every command.

## Deploy loop

```bash
npm run build
cp main.js manifest.json styles.css "$PLUGIN/"
obsidian plugin:reload id=tars
obsidian dev:errors            # empty output means no exceptions
```

Back up settings before a run that mutates them, and restore afterwards:

```bash
cp "$PLUGIN/data.json" /tmp/tars-data-backup.json
# ... testing ...
cp /tmp/tars-data-backup.json "$PLUGIN/data.json"
obsidian plugin:reload id=tars
```

Writing `data.json` directly only takes effect after a reload — the plugin
holds settings in memory and will overwrite the file on its next save.

To capture console output, attach the debugger first; it is off by default:

```bash
obsidian dev:debug on
# ... testing ...
obsidian dev:console level=error
obsidian dev:debug off
```

This document covers the settings UI. For providers — CORS, streaming, and the
network paths that make a working provider look broken — see
[Testing providers against real networks](provider-testing.md).

## Traps

Each of these produced a wrong conclusion at least once.

### `obsidian eval` has no top-level await

Wrap anything asynchronous in `(async () => { ... })()`. The CLI awaits the
promise you return, so the value comes back normally, but a bare `await` is a
syntax error. `require` works, absolute paths included — `require('obsidian')`
does not, since only real plugins are given that module.

### The settings window is a separate window

Obsidian opens settings in a popout. `document` inside `obsidian eval` is the
**main** window, so a modal opened from the settings tab is invisible to it —
which reads exactly like a button that does nothing.

```js
const W = app.setting.win // the settings window
const D = W.document // query this, not `document`
D.querySelectorAll('.suggestion-item').length
```

A modal lands in whichever window opened it, and `obsidian eval` is the main
window. Click the real control and the vendor picker appears in
`app.setting.win`; call `promptForNewProvider()` from eval and the same picker
appears in `document` instead. That difference is an artefact of the test, not
of the plugin, so query both before concluding a modal failed to open.

`app.setting.containerEl.isConnected` is `false` even while settings is open;
it is not a liveness check. `app.setting.activeTab.containerEl.isConnected`
is the one that means what it looks like.

`obsidian dev:screenshot` captures the main window too, so it cannot show a
settings pane. Assert on the DOM instead — a `ButtonComponent`'s styling, for
instance, is readable as its class (`mod-cta`, `mod-destructive`).

### Navigation lives on internal APIs

`SettingTab` and `SettingPage` expose nothing for navigating between the
provider list and a provider's page. The settings modal does, and none of it
is in `obsidian.d.ts`:

|                                   |                                             |
| --------------------------------- | ------------------------------------------- |
| `app.setting.pageStack.length`    | `0` on the list, `1` inside a provider page |
| `app.setting.getCurrentPageEl()`  | the element the user is looking at          |
| `app.setting.closePage()`         | go back one level                           |
| `app.setting.openTabById('tars')` | open the plugin's tab                       |

Treat them as test-only. `src/settingTab.ts` reaches for `closePage()` in one
place, behind a narrow structural type, because there is no alternative.

Going the other way is worse. `app.setting.openPage()` wants a page object, and
one is only built when a row is activated — the rendered list holds
`{type, key, def, settingEl}`, no page — so a row's `settingEl.click()` is the
only handle there is. That is what `openProviderPage()` uses to land on a newly
added provider.

### A tab's `containerEl` is detached while a sub-page is open

Open a provider's page and the tab's own `containerEl.isConnected` becomes
`false` — `app.setting.getCurrentPageEl()` is a different element by then. So
`deferredUpdate()`, which guards on exactly that, is **silently dropped for
anything issued from inside a provider page**. `tagDef` only appears to work
because its update fires as the page is being left.

Anything that has to change a row while its page is open must rewrite the row —
`setting.clear()`, then add the components again — rather than ask for a
re-render. `modelFetchDef` does this when a provider's model list cannot be read.

### `update()` rebuilds the open page too

`update()` re-reads `getSettingDefinitions()` and re-renders. It does not
close an open sub-page, but it does rebuild that page's rows — so calling it
from an `onChange` destroys the input mid-keystroke, which looks like the pane
going blank. Anything that must re-render from inside a page should go through
the deferred path in `settingTab.ts` rather than calling `update()` directly.

### Components listen for different events

Synthetic events have to match what the component listens for, or a working
control looks broken:

| Component                            | Event    |
| ------------------------------------ | -------- |
| `TextComponent`, `TextAreaComponent` | `input`  |
| `SliderComponent`                    | `change` |

```js
el.value = '3'
el.dispatchEvent(new Event('change', { bubbles: true }))
```

Real interaction fires both, so a mismatch here is a bug in the test, not the
plugin. Give saves a moment before asserting — `saveSettings()` is async.

### A definition with no name is dropped

`SettingDefinitionBase.name` is required and a row with `name: ''` is skipped
entirely, description included. The pre-1.13 pattern of a description-only row
(`setting.setDesc(...)` with no name) has no declarative equivalent; put the
text on the settings it describes.

### Do not remove modal elements by hand

`document.querySelector('.modal-container').remove()` detaches the settings
modal itself. Everything afterwards misreports until the window is reloaded
(`app.commands.executeCommandById('app:reload')`). Close things the way the
app does — `app.setting.close()`, or Escape into `app.setting.win`.

## Checklist

Run against a scratch vault, restoring `data.json` at the end.

```js
// helpers, paste into obsidian eval
const s = app.setting,
	p = app.plugins.plugins['tars']
const C = () => s.activeTab.containerEl
const rows = () =>
	Array.from(C().querySelectorAll('.setting-item')).filter((e) => e.querySelector('.setting-item-name'))
const row = (name) => rows().find((e) => e.querySelector('.setting-item-name').textContent.includes(name))
const names = () => Array.from(C().querySelectorAll('.setting-item-name')).map((e) => e.textContent)
```

| #   | Check                                                                                         | Passes when                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Add a provider: `+` in the list header, pick a vendor                                         | count grows and `pageStack` becomes `1` — the new provider's own page, tag field included; the tag is non-empty and unique, so a second provider of one vendor is `Vendor2`     |
| 2   | Missing API key                                                                               | providers with an empty key show a warning; Ollama, which needs none, does not                                                                                                  |
| 3   | Rename a tag, then `closePage()`                                                              | typing does not tear down the page; the list entry shows the new tag                                                                                                            |
| 4   | Invalid tags: a name already in use, `#` in the name, a space, empty                          | all four rejected, stored tag unchanged                                                                                                                                         |
| 5   | Clear the tag field and click away                                                            | a notice says the tag may not be empty, the field snaps back to the stored tag, and the stored tag never changed                                                                |
| 6   | Remove, from inside the provider's page                                                       | count drops, `pageStack` returns to `0`, the entry is gone                                                                                                                      |
| 7   | Reset buttons: base URL, the three message tags, answer delay                                 | field, stored value **and** any number rendered beside a slider all return to the default                                                                                       |
| 8   | Model row on a provider whose list cannot be read (an unverified SiliconFlow account will do) | the button is replaced in place by a text field carrying the current model, the description gains a ⚠️, typing saves, and leaving the page and returning brings the button back |
| 9   | Default system message toggle                                                                 | switches the textarea's `disabled` state both ways                                                                                                                              |
| 10  | Section structure                                                                             | four headings (AI assistants, Message tags, System message, Advanced), no heading printed twice                                                                                 |
| 11  | Vendor picker: open it                                                                        | `Custom` is the first row and carries a description under its name; every other vendor follows it in alphabetical order, OpenAI among them                                      |
| 12  | Custom provider: add one, then switch its protocol between the three                          | the page rebuilds in place — `pageStack` stays `1` — and the rows follow: Claude adds web search, thinking, budget tokens and max tokens; OpenAI and Gemini have none of them   |
| 13  | Custom provider: base URL across a protocol switch                                            | a URL still at a protocol's default moves to the new one; a URL you typed is left alone                                                                                         |
| 14  | Custom provider: the model row                                                                | the list is fetched from the endpoint the chosen protocol defines, not from the vendor named `Custom`                                                                           |
| 15  | `obsidian dev:errors`                                                                         | empty                                                                                                                                                                           |

Checks 12–14 are the ones the declarative settings API makes easy to get wrong:
the protocol dropdown is the only place in the tab that calls `update()` from an
`onChange`, because it has to add and remove rows rather than rewrite one. See
the trap above about `update()` rebuilding the open page.

Check 6 is worth doing by eye as well: a reset that writes to a component's
underlying element instead of calling the component's `setValue()` moves the
control but leaves the displayed value stale.

## Cleanup

```bash
cp /tmp/tars-data-backup.json "$PLUGIN/data.json"
obsidian plugin:reload id=tars
obsidian dev:debug off
```

Screenshots (`obsidian dev:screenshot path=...`) resolve relative to the vault
root, so pass an absolute path outside the vault to avoid leaving files in it.
