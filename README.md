# Gedview

A browser-based genealogy tree viewer with full support for
[FamilySearch GEDCOM 7.0](https://gedcom.io/specifications/FamilySearchGEDCOMv7.html)
(and reading GEDCOM 5.5.1).

Files are opened and parsed entirely in the browser: Gedview never uploads
your tree, uses no analytics and makes no third-party requests except to the
address you asked it to load a file from.

> Work in progress.

## Features (target)

- GEDCOM 7.0: calendars (`JULIAN`, `FRENCH_R`, `HEBREW`), dates with
  `PHRASE`, `FAMC.STAT` (disputed links drawn dashed), `PEDI`, `ASSO` with
  roles (godparents, witnesses), sources with `QUAY` and `DATA/TEXT`, `EXID`
  links (FamilySearch, Find a Grave, WikiTree), `SNOTE`, HTML notes, media
  with `CROP` and `FILE.TRAN`, places with `MAP` and `TRAN`, `NO`, `SDATE`,
  `RESN`.
- GEDZIP (`.gdz`): a tree bundled with its photos.
- Julian dates shown in both styles (Old Style / New Style).
- Russian and English UI, light and dark themes, full keyboard and screen
  reader support.

## Build

Requires Node.js 22 or newer.

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # static files in dist/
```

All checks (same as CI):

```bash
npx playwright install chromium   # once
npm run check:all
```

`npm run fixtures` downloads the official FamilySearch test files into
`tests/fixtures/gedcom70/` (they are not stored in the repository: their
source repository carries no license). Files are pinned to a commit and
verified by SHA-256.

Visual snapshots are per platform. To regenerate the Linux ones, run the
CI workflow manually with `update_snapshots` enabled and commit the
`linux-snapshots` artifact.

## UI

- `/?demo` opens a built-in, fictional Sokolov family (no file needed).
- UI languages: each `src/i18n/<code>.json` file is a language (its name and
  button label are the `meta.name` and `meta.short` keys); missing keys fall
  back to English. `en.json` and `ru.json` must have the same keys (checked
  by `npm test`).
- Theme (light, dark, system), language and chart settings are stored in
  `localStorage`; the URL hash holds only the chart view and the selected
  person id (`#view=hourglass&id=I1`).
- Keys: `/` — find a person, `Esc` — close a panel or the card.

## Deploy

Live: https://device25.github.io/gedview/ (try `?demo`).

Every push to `main` that passes CI is deployed to GitHub Pages by
`.github/workflows/pages.yml`. `dist/` is a static site with no server side,
so it can also be served from any static host or locally with
`npm run preview`.

## Personal data

Never add real trees with living people to the repository, tests,
screenshots or issues. For manual testing, put files in `private/` or name
them `*.private.ged` — both are git-ignored.

## Development

Trunk-based: short-lived branches, small pull requests, `main` always green
(protected: linear history, CI required for pull requests). Commits and pull
request titles follow [Conventional Commits](https://www.conventionalcommits.org).
Commits, pull requests, docs and code comments are in English. Dependabot
proposes weekly dependency updates.

## License

Apache License 2.0, see [LICENSE](LICENSE). Third-party components are listed
in [THIRD_PARTY.md](THIRD_PARTY.md). Relationship charts are drawn with the
[topola](https://github.com/PeWu/topola) library © Przemek Więch
(Apache-2.0).
