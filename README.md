# Kitchen Stock

A household kitchen inventory app, built as an installable web app (PWA) that works on Android and iPhone.

- **Location tabs** for each place in the kitchen, plus **Use first** (use-by date within 7 days) and **Shopping** (anything low or out).
- **Tap the gauge** to step an item full → half → low → out. Tap **Restocked** on the shopping list to reset it to full.
- **Dietary flags per household** (pork, gluten, allergens, whatever the household needs), and **per-person rules**, so an item can be marked "Not for Sam" while it's fine for everyone else.
- **Backup and import** of the whole list as a JSON file.

Coming next: shared household accounts with live sync, push reminders for use-by dates and the weekly shopping list, and a "What can I cook?" helper.

## Run it locally

Requires [Node.js](https://nodejs.org/) 20 or newer.

```
npm install
npm run dev      # open the address it prints
npm test
npm run build
```

## Privacy

No household data lives in this repo. Lists are loaded from a file at runtime and stored on the device. Real inventory files, `.env` secrets and notes are git-ignored.
