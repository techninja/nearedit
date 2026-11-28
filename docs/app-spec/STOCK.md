# Found Pictures — Stock Stills with Their Credits

Narration without enough footage to cover it is the commonest hole in a
video. NearEdit can look for a picture in open collections, bring it into
the project, move over it slowly, and — the part people forget — keep
track of **where it came from and what is owed for it**, so the credits
write themselves.

```text
search a provider ─► pick ─► the file is copied into the project, its source
written beside it ─► a clip on the timeline carries the credit ─► the export
writes the credits, and says what the licences ask for
```

**Local first.** Nothing leaves the machine until someone searches; then
the search words go to the provider that was asked, and nowhere else. A
picture that was picked is a file in the project folder like any other:
the project works offline, and the credit cannot get lost.

## Providers

A provider answers two questions — *what do you have for these words?* and
*give me this one* — behind one interface (`src/api/stock/providers/`):

| Provider | Key | What it has |
| -------- | --- | ----------- |
| `openverse` | none | Openly licensed pictures gathered from many collections, each with its licence and creator. Openverse does not verify what it gathers: the licence and the source page are always shown |
| `wikimedia` | none | Wikimedia Commons: free licences and the public domain |
| `nasa` | none | NASA's image library — generally not under copyright; no endorsement may be implied |
| `unsplash` | `UNSPLASH_ACCESS_KEY` | Unsplash photos, under its own licence. Its API rules are followed: the photographer and Unsplash are credited with links, and each use is reported to it |
| `pexels` | `PEXELS_API_KEY` | Pexels photos, under its own licence |

A provider without its key is listed as unavailable, with what to set. Keys
live in the server's environment and are never sent to the browser. A
provider is a module: another is added by writing one like the five that
ship.

A found item, whatever the provider:

```json
{ "provider": "openverse", "id": "…", "title": "Foggy forest", "creator": "A. Person",
  "creatorUrl": "https://…", "pageUrl": "https://…", "thumbUrl": "https://…",
  "width": 4000, "height": 2667, "license": "cc-by-4.0", "licenseUrl": "https://…" }
```

## Licences

`licenseFacts(id)` (`src/utils/stock/licenses.js`, pure) says what a
licence asks for: **attribution**, **share alike**, **non-commercial**,
**no derivatives**.

- A search shows by default only what may be used in a video that is
  edited and may earn money: public domain, CC0, CC BY, and the providers'
  own licences. CC BY-SA can be switched in (the finished video then has to
  carry the same licence — the picker says so); non-commercial can be
  switched in with a visible mark; **no-derivatives pictures are never
  offered**, because cropping and moving over a picture changes it.
- An unknown licence is treated as asking for everything.

## In the project

Picking a picture copies it to `<project>/stock/<provider>-<id>.<ext>` (the
largest rendition up to 3840 wide) and writes its source into the file's
sidecar:

```json
{ "source": { "provider": "openverse", "id": "…", "title": "Foggy forest",
    "creator": "A. Person", "creatorUrl": "https://…", "pageUrl": "https://…",
    "license": "cc-by-4.0", "licenseUrl": "https://…", "fetchedAt": "2026-11-28T12:00:00Z" } }
```

The media list gives the `source` with the file, so the bin can show it.
Fetching the same item again finds the file that is there.

## In the document

A clip carries its credit:

```json
{ "sourceFile": "/project/stock/openverse-abc.jpg", "timelineStart": 12, "timelineEnd": 17,
  "credit": { "title": "Foggy forest", "creator": "A. Person", "provider": "openverse",
              "license": "cc-by-4.0", "licenseUrl": "https://…", "url": "https://…" } }
```

- Placing a file that has a `source` gives the clip its credit; so the
  document says what it owes even where the sidecars are not at hand.
- A credit can be written by hand for anything — a friend's photograph,
  licensed music — and edited or removed (`setCredit`).
- `credits(edl)` lists what the timeline owes, each source once, in the
  order of first appearance, with the clips that use it and whether its
  licence **requires** the credit. `creditsText(edl, { format })` writes
  them as people expect to read them — title, creator, source, licence:

```text
“Foggy forest” by A. Person — CC BY 4.0 — https://…
```

## Where the credits go

- **A credits file beside the video.** The render job's `credits: 'txt' |
  'md'` writes `<name>.credits.txt` from `creditsText`, ready for a
  description box, and names it in its result. The export dialog switches
  it on by itself when the timeline owes any.
- **A credits card.** Every complete brand kit has a tenth element,
  `credits` (a segment): the end card that lists them. `insertCredits(edl,
  kit)` places it — or refreshes the one that is there — from the timeline's
  credits.
- **A plain statement at export**: which pictures' licences require
  attribution, and that the credits file or card is how it is given.
  NearEdit never blocks an export over a licence; it makes it hard to
  forget.

## Server

| Method | Route | Purpose |
| ------ | ----- | ------- |
| GET | `/stock/providers` | `{ providers: [{ id, name, available, reason, needsKey, kinds, note }] }` |
| GET | `/stock/search?provider=&q=&page=&orientation=&licenses=` | `{ items, page, pages, total }` — items as above |
| POST | `/stock/fetch` | `{ projectId, provider, id }` → `{ file, source, cached }`: the picture in the project, with its source written |

Outbound requests go only to the provider's own hosts and to the address a
provider gives for a file, through the same guard web clips use (private
addresses refused); what comes back must be a picture, of at most 40 MB.
`STOCK_USER_AGENT` sets how NearEdit names itself to providers (Wikimedia
asks for a contact in it).

## The command line

`nearedit credits <edl.json> [--format txt|md] [-o file]` writes the
credits of a timeline; `validate` warns for a clip whose licence requires a
credit it lacks.

## Limits

- Stills only: no stock video or music yet.
- The credit is as good as the provider's data; Openverse and Wikimedia
  pass on what their sources say.
- The credit is not drawn over the picture while it shows — only in the
  credits card and file.
- Keyed providers were built to their published interfaces and checked
  against stand-ins; see [STOCK-SETUP.md](./STOCK-SETUP.md) for checking
  them with a real key.
