# Brand Kits — Where They Live and How a Project Uses One

[BRAND.md](./BRAND.md) says what a brand kit is. This document says where
kits are kept, the routes that list, read and write them and their files,
how a project chooses one, what the server hands out as the **effective
kit**, and the two commands that work with kits outside the editor.

```text
built in (in the code) ◄─ extends ─ library kit ◄─ extends ─ a project's own kit
  builtin:clean …          <data>/kits/<id>/           <project>/.nearedit/kit/
                                    ▲                             ▲
                                    └──── project.kit names one ──┘   (none: builtin:clean)

effective kit = the chain resolved, every logo and font as an absolute path
```

## Storage

A kit is a folder: `kit.json`, and beside it the logos and fonts it names.

```text
<data>/kits/                     the library (NEAREDIT_KITS_DIR moves it)
  acme/
    kit.json                     { "name": "Acme", "extends": "builtin:clean", "tokens": { … } }
    logo.png                     named in kit.json as "logo.png"
    fonts/AcmeSans-Bold.woff2    named as "fonts/AcmeSans-Bold.woff2"
<project>/.nearedit/
  project.json                   "kit": "acme" | "builtin:bold" | "project"
  kit/                           the project's own kit, same layout
    kit.json                     usually { "extends": "acme", "tokens": { … a few … } }
```

- **A library kit's id is its folder's name** (letters, digits, `-`, `_`,
  at most 40). An `id` inside `kit.json` that differs is reported and not
  used. A project's own kit always goes by `project`.
- **Reserved names.** `project`, and the names of the built-in kits
  (`clean`, `bold`, `documentary`, `playful`): the bare name of a built-in
  kit always means `builtin:<name>`, so a folder of that name is not a kit
  of the library.
- **Made by hand or through the API — both are read the same way.** Copy a
  kit folder into the library and it is listed. A `kit.json` that is
  broken, too large or names what is not there is still a kit: it is read
  as far as it can be and comes with its problems. A folder without
  `kit.json`, and a folder that is a symbolic link, is not a kit.
- **What the API writes** is the kit as the model keeps it
  (`normalizeKit`, plus `description`): bounded, the same when read back.
  Fields it does not know are dropped and said once, as warnings in the
  answer to the `PUT`.
- Files are named **relative to the kit's own folder**. A name that would
  leave it — absolute, `..`, a link that points elsewhere — is an error and
  is never turned into a path.
- `data/kits/` is in `.gitignore` with the rest of the data directory. A
  team that wants its brand under version control keeps the kit folders in
  a repository of their own and points `NEAREDIT_KITS_DIR` at it.

## Routes

All under `/api`. `:id` is a library id, or a built-in kit as
`builtin:clean` (URL-encoded: `builtin%3Aclean`; the bare `clean` works
too).

| Method | Route | |
| ------ | ----- | --- |
| GET | `/kits` | `{ kits: [KitEntry] }` — the built-in kits, then the library's by name |
| GET | `/kits/:id` | KitAnswer. `404` no such kit |
| PUT | `/kits/:id` | Body `{ kit }`: create or replace a library kit → KitAnswer. `422 { error, detail, problems }` when it does not validate (nothing is stored), `403` a built-in kit, `413` larger than 512 KB, `409` the library is full or the folder is a link |
| DELETE | `/kits/:id` | `204`; the folder and its files are removed. `403` a built-in kit, `404` no such kit |
| PUT | `/kits/:id/files/:name` | The request's body is the file → `{ name, size }`. `404` no such kit, `403` built-in, `422` not a kind of file a kit holds, `413` more than 10 MB, `409` 64 files already, `400` no body or an upload that broke off |
| DELETE | `/kits/:id/files/:name` | `204`. `404` no such file |
| GET | `/projects/:id/kit` | ProjectKitAnswer. `404` no such project. `?adaptation=<id>`: the kit of that adaptation |
| PUT | `/projects/:id/kit` | Body `{ choice }` chooses a kit; `{ kit }` writes the project's own kit and chooses it → ProjectKitAnswer. `422 { problems }` for a kit that does not validate or a choice that names no kit, `400` neither field, `413` |
| PUT, DELETE | `/projects/:id/kit/files/:name` | As for a library kit, in `<project>/.nearedit/kit/` (created on the first upload) |

```json
// KitEntry
{ "id": "acme", "name": "Acme", "description": "…", "source": "library",
  "extends": "builtin:clean", "key": "0dba0200fe3dfd2cadd3",
  "colors": { "background": "#0b1020", "surface": "#1e1b4b", "primary": "#4f46e5",
              "accent": "#f59e0b", "text": "#ffffff" },
  "elements": 9, "problems": 0 }

// KitAnswer
{ "id": "acme", "source": "library",
  "kit": { "id": "acme", "name": "Acme", "description": "…", "extends": "builtin:clean",
           "tokens": { "logo": { "mark": "logo.png" } }, "fonts": [], "elements": {}, "defaults": {} },
  "effective": { "id": "acme", "tokens": { "logo": { "mark": "/data/kits/acme/logo.png" } }, "…": "…" },
  "key": "0dba0200fe3dfd2cadd3",
  "chain": ["acme", "builtin:clean"],
  "files": [{ "name": "logo.png", "size": 13101 }],
  "problems": [{ "path": "tokens.color.muted", "message": "…", "level": "warning" }] }

// ProjectKitAnswer: a KitAnswer plus
{ "choice": "acme" }
```

- **`id`** is how the kit is named in a URL and as a `choice`: a library
  id, `builtin:<name>`, or `project`. **`source`** is `builtin`, `library`
  or `project`: where `kit` lives, and whether it can be written.
- **`kit`** is the kit as stored — what it sets itself, files by their
  names. **`effective`** is the kit resolved through its chain, complete,
  with files as absolute paths: what `insertElement`, `restyle` and
  `staleElements` take. **`key`** is `kitKey(effective)`; the editor
  computes the same from the JSON it receives.
- **`chain`** names the kits the effective kit was made from, child first,
  each as its `id`: `["project", "acme", "builtin:clean"]`.
- **`files`** are the logo and font files in the kit's folder and up to
  three folders below it (`fonts/AcmeSans-Bold.woff2`), without links and
  hidden files. The file routes work on files directly in the folder.
- **`problems`** are errors and warnings, each with the path of what it
  concerns in `kit.json` (`tokens.color.text`, `fonts[0].file`, `extends`).
  `problems` in a KitEntry is their number. A kit with errors is still
  listed, read and usable — the editor never goes without a kit — but it
  cannot be *written* with errors.
- Errors follow [API.md](./API.md): `{ error, detail? }`; a `422` of these
  routes adds `problems`, a refused file name `fields.name`.

### What makes a kit invalid

Everything `validateKit` calls an error (a colour that is not one, a font
file of the wrong kind, a bundled family redefined, a broken element — see
BRAND.md), and what only the server can see: `extends` naming a kit that is
not there or a built-in that does not exist, a chain that loops or is
longer than five, a file name that leaves the kit folder. A file that is
merely **not there yet** is a warning: a kit may be written first and its
logo uploaded after. Contrast that is hard to read and a font family
without a file are warnings too.

### Files

- Kinds: `png`, `jpg`, `jpeg`, `webp`, `gif` (logos and pictures) and
  `woff2`, `woff`, `ttf`, `otf` (fonts). No SVG.
- Send the bytes as the body of the `PUT`, with any content type except
  `application/json`. The answer's `name` is the name the file was stored
  under: the last path segment of what was sent, with everything but
  letters, digits, `.`, `_`, `-` and spaces replaced, no leading dot, the
  extension in lower case, at most 100 characters. Use that name in the kit.
- The bytes are written beside their place and renamed into it when all
  have arrived: a reader never finds half a file, and of several uploads of
  one name exactly one remains, whole. An upload that breaks off leaves
  nothing.
- A file is only ever stored and sent back as what its name says
  (`image/png` for a `.png`, a download for a font), with `nosniff`: wrong
  content for its extension is never run or read as anything else. The
  server itself never opens the file; the compositor does, as a picture or
  a font.

## A project's kit

`project.kit` in the project file is a library id, `builtin:<name>`, or
`project` for the kit in `<project>/.nearedit/kit/`. With none it is
`builtin:clean`.

- `PUT { "choice": "acme" }` chooses; `""` or `null` un-chooses. A choice
  must name a kit that is there.
- `PUT { "kit": { "extends": "acme", "tokens": { … } } }` writes the
  project's own kit and chooses it. Choosing another kit later keeps the
  project's own on disk; `{ "choice": "project" }` goes back to it.
- **`files` in the answer are always those of the project's own kit
  folder** — what the project's file routes manage — whichever kit is
  chosen, so a logo can be uploaded before the kit that names it is saved.
  `kit` is the kit at the head of the chain in use: the project's own when
  the choice is `project`, the chosen library or built-in kit otherwise.
- **A chosen kit that is gone** (deleted from the library, another
  machine): the answer keeps `choice` as it was stored, `effective` is
  `builtin:clean`, and `problems` holds an error at `choice`.
- **An adaptation may name another kit**: `PUT
  /projects/:id/kit?adaptation=<aid>` with `{ choice }` stores it on the
  adaptation (`adaptation.kit`; `""` goes back to the project's), and `GET`
  with `?adaptation=` answers with that adaptation's kit. A project has one
  kit of its own; an adaptation chooses among `project`, the library and
  the built-in kits. A copy of an adaptation keeps its source's choice.
- Changing a kit never touches a timeline. Element clips made from the
  kit as it was are then out of date (`staleElements`), and stay as they
  are until someone updates them.

## Effective kits

One function resolves a kit for everything on the server that needs a
brand — these routes now, the director next:

```js
import { effectiveKit, projectKit } from './src/api/kits/index.js';

projectKit(projectId, adaptationId?)   // → { choice, effective, key, chain, problems, kit, source, … }
effectiveKit(choice, projectDir?)      // the same for a choice, without a registered project
```

- The chain is followed project's own → library → built-in, each kit's
  files made absolute against **its own** folder (`mapKitFiles`), then
  resolved with `resolveKit`.
- It always answers with a usable kit. A chain that breaks — a missing
  parent, a loop, more than five kits — is cut there and set on
  `builtin:clean`, with an error at `extends`; a choice that is not there
  falls back the same way with an error at `choice`. `projectKit` throws
  only for an unknown project or adaptation (`404`).
- **Never stale, rarely recomputed.** Every `kit.json` of the chain and
  every file it names is looked at (not read) on each call; while none of
  them changed, the same object comes back, so `kitKey` and the designs
  made from it are computed once. `effective` is shared: never change it.
- The key covers the paths of the files, not their bytes: replacing
  `logo.png` by another picture of the same name shows at once and makes no
  clip out of date; moving a kit to another folder does.

## Kit files as media

A design made from an effective kit names its logo and its fonts by
absolute path, like any media. `GET /api/media/file?path=` serves them:
the library is inside the data directory (or is `NEAREDIT_KITS_DIR`), a
project's kit inside its project folder — all of them roots the media
routes already allow — and a render may read them for the same reason
([API.md](./API.md) § Render). Nothing else became readable.

## Limits

| What | Limit |
| ---- | ----- |
| `kit.json` | 512 KB, read and written (a larger one is listed, unread, with an error) |
| A logo or font file | 10 MB (`413`, whether or not the request declares its length) |
| Files directly in one kit folder | 64 |
| Kits in the library | 500 |
| A chain | 5 kits, the built-in one included |
| Ids | letters, digits, `-`, `_`; 40 characters |
| File names | 100 characters; listed up to three folders deep |

Inside a kit, the bounds of [BRAND.md](./BRAND.md) apply (64 elements,
48 layers an element, 32 font files).

## Commands

Both read a kit folder with the code that reads the library, so a kit
behaves the same in both places. A kit folder may extend a built-in kit or
**another kit folder beside it** (`"extends": "house"` is `../house/`); it
goes by the `id` in its `kit.json`, else by its folder's name.
`--library <dir>` names a folder of kit folders — a server's `data/kits`
— where the kits it extends are looked for first: that is how a project's
own kit, which extends a library kit, is read from a shell
(`nearedit kit <project>/.nearedit/kit --library data/kits`).

### `nearedit kit <kit folder | builtin:name> [--json]`

Validates a kit and prints its chain and key, every token (`*` marks what
this kit sets itself), its elements with their slots, its files with what
uses each, and its problems. Exit `0` when it validates, `1` when not.
`--json`: `{ kit, id, name, description, extends, chain, key, valid, tokens,
own, fonts, elements, defaults, files: [{ name, size, used }], errors,
warnings }`.

### `nearedit restyle <timeline.json | folder> --kit <kit folder | builtin:name>`

Gives every element clip the design its element has in the kit now —
`restyle` of the editor — keeping slots and everything outside the
`element` block, on locked tracks too. Only those blocks and the
document's `fonts` table are rewritten; the rest of the file stays as it
was written.

| Option | |
| ------ | --- |
| `-k`, `--kit <kit>` | Required |
| `--only <element,…>` | Only clips of these elements; an element the kit lacks is a usage error |
| `-o`, `--output <file>` | Write there instead of over the original (one timeline only) |
| `-l`, `--library <dir>` | Where the kits the kit extends are looked for first |
| `--dry-run` | Say what would change, write nothing |

Given a folder, every `*.json` directly in it that is a timeline is
restyled in place; other JSON files are passed over. One line a document:

```text
talk.json: 3 lower-third, 1 intro: updated; 2 already current
```

`not in the kit, left as they are` names clips of an element the kit does
not have. Exit `1` — and nothing is changed — when the kit does not
validate; `1` too when a timeline of a folder cannot be read (the others
are still restyled).

A kit folder **inside the timeline's folder** is named relative to it, so
the two travel together. One that lies elsewhere is named by absolute
path, and `frame`, `render` and `validate` then need `--media <kit
folder>`; `restyle` says so.

## A worked example

Make a kit by hand, look at it, choose it, restyle.

```bash
mkdir -p data/kits/acme && cp ~/brand/logo.png ~/brand/AcmeSans-Bold.woff2 data/kits/acme/
cat > data/kits/acme/kit.json <<'EOF'
{ "name": "Acme", "extends": "builtin:clean",
  "tokens": { "color": { "primary": "#4f46e5", "surface": "#1e1b4b" },
              "font": { "heading": { "family": "Acme Sans", "weight": 700 } },
              "logo": { "mark": "logo.png" } },
  "fonts": [{ "family": "Acme Sans", "weight": 700, "file": "AcmeSans-Bold.woff2" }] }
EOF
nearedit kit data/kits/acme                       # tokens, elements, files, problems
curl localhost:3000/api/kits                      # it is listed
curl -X PUT localhost:3000/api/projects/$P/kit \
     -H 'Content-Type: application/json' -d '{"choice":"acme"}'
```

The same through the API, for a kit that does not exist yet:

```bash
curl -X PUT localhost:3000/api/kits/acme -H 'Content-Type: application/json' \
     -d '{"kit":{"name":"Acme","tokens":{"logo":{"mark":"logo.png"}}}}'
curl -X PUT localhost:3000/api/kits/acme/files/logo.png --data-binary @logo.png \
     -H 'Content-Type: image/png'
```

The editor now offers Acme's elements, and `GET /projects/$P/kit` gives
the effective kit its Create tab uses. Timelines outside the editor are
brought up to date from a shell:

```bash
nearedit restyle exports/ --kit data/kits/acme --dry-run     # what would change
nearedit restyle exports/talk.json --kit data/kits/acme
nearedit frame exports/talk.json --time 3 --media data/kits/acme
```

## Not built

- No route packs a kit into a zip or takes one; a kit folder is copied.
- A project has one kit of its own; adaptations choose, they do not have
  kits of their own.
- The file routes add and remove files directly in a kit folder; files in
  sub-folders of a hand-made kit are listed and used, not managed.
- Deleting a library kit does not look for the projects and kits that use
  it: they fall back to `builtin:clean` and say so.
