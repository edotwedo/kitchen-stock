---
description: Turn a folder of kitchen photos into a Kitchen Stock list file to review and load
argument-hint: <folder of photos> [kitchen name]
---

Photo intake for a Kitchen Stock kitchen. Folder: `$ARGUMENTS` (first part is the folder; anything after it is the kitchen's name).

The person running this is the organizer. Nothing goes into a client's app until they review the list and load it themselves with **Settings → Add items from a file**. Your job is to read the photos carefully and write that file.

## 1. Read every photo

- List the image files in the folder (jpg, jpeg, png, heic, webp). Read each one. If a photo is too blurry or dark to read, note its file name and move on.
- One photo often shows many items (a freezer shelf, a pantry shelf). Log each item you can actually identify.
- Work out the place from the photo and file name (`chest-freezer-03.jpg`, `fridge door.jpg`). Use the kitchen's own words for places: Chest freezer, Garage freezer, Fridge, Pantry, Cupboards. If you can't tell, ask before writing the file.

## 2. For each item, record only what you can see

- `name`: plain and short, brand plus product where the label shows it ("Kirkland Italian beef meatballs"). For unlabeled packages, describe what it is and say so in `note` ("Unlabeled, looks like ground beef").
- `loc`: the place key (lowercase, dashes: `chest-freezer`).
- `qty`: the count or package size you can see ("2 bags", "1.5 lb", "about 6").
- `level`: `full`, `half`, `low` or `out`, judged from the package.
- `useBy`: only a date printed and readable on the label, as YYYY-MM-DD. Never estimate one.
- `frozenOn`: for freezer items, a date written on the package if there is one, else leave it out (the app uses the count date).
- `wrap`: `vacuum` for vacuum-sealed bags, `chamber` only if it clearly came off a chamber sealer (tight, flat, thick bag, often with a butcher label), else leave it out.
- `flags`: only from the label or an obvious product (bacon, ham and pepperoni are pork). Use these ids when they apply: `pork`, `beef`, `shellfish`, `fish`, `alcohol`, `gelatin`, `milk`, `eggs`, `peanuts`, `tree-nuts`, `wheat`, `soy`, `sesame`, `gluten`, `added-sugar`. When unsure, leave it off and add "check for pork" (or similar) to `note`.
- `note`: under 12 words, only when useful: "Freezer burn on top", "Opened", "Unlabeled".

## 3. Merge duplicates across photos

The same item can appear in two photos. If two entries have the same name in the same place, keep one and combine the quantity only when the photos clearly show different packages.

## 4. Write the file

Write `kitchen-list.json` into the photo folder, in this shape:

```json
{
  "household": "<kitchen name, or the folder name>",
  "counted": "<today, YYYY-MM-DD>",
  "locations": [{ "key": "chest-freezer", "label": "Chest freezer", "kind": "freezer" }],
  "flags": [{ "id": "pork", "label": "Pork" }],
  "items": [
    { "name": "Ground beef", "loc": "chest-freezer", "qty": "2 lb", "level": "full", "wrap": "vacuum", "flags": ["beef"], "note": "" }
  ]
}
```

`kind` is one of `freezer`, `fridge`, `pantry`, `other`. List only the flags the items use. Leave out fields you have nothing for.

## 5. Report back

Tell the organizer, briefly:
- how many items were logged, per place
- the photos you couldn't read
- every item that needs a human check: unlabeled packages, guessed names, possible pork or other flags, anything that looked spoiled or freezer-burned
- that the file is ready to load with **Settings → Add items from a file** (items with the same name in the same place update instead of duplicating)

Never invent items, dates or brands you can't see.
