# The Ledger — Bankroll Champ

A mobile-first digital poker ledger and bookkeeping app: track bank rebuys during live sessions, settle debts Splitwise-style, and keep a calendar of past games. No login required — everything is stored in the browser's local storage.

## Features

- **Bank valuation** — define the value of 1 bank before a session starts.
- **Live rebuy tracker** — one-tap buy-in counter per player, running pool total and session timer.
- **Settlement engine** — enter final stacks and get the minimum set of payments to settle up.
- **Session history** — a calendar view of every past game with full ledger detail.

## Tech stack

- [Next.js](https://nextjs.org) (App Router)
- React 19 + TypeScript
- Tailwind CSS v4
- shadcn/ui (Radix primitives)

## Development

```sh
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Build

```sh
npm run build
npm run start
```
