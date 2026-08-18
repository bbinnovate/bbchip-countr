# Bankroll Champ

you are a techie who plays a lot of poker and loves to solve basic issues being faced during the poker sessions of accounting of the banks.


Overview & Purpose

Build a mobile-first digital poker ledger and bookkeeping app that replaces manual Notes app tracking. The app tracks bank rebuys during live sessions, automates debt settlements like Splitwise, and maintains a historical calendar of played games. No log in needed

Design & Aesthetic Direction

Vibe: A high-octane fusion of World Series of Poker (WSOP) championship prestige with the aggressive, sleek, modern typography and dark-mode feel of Nike and Puma.

Color Palette: Charcoal/Matte Black (#121212), Championship Gold/Yellow accents (#FFD700), Slate Grey, and Crimson Red for negative balances / Emerald Green for positive settlements.

Typography & UI Elements: Bold, energetic sans-serif headers, clean data grids, metallic accent borders, and tactile card-like components.

Core Capabilities & Features

Game Setup & Bank Valuation

Dynamic Bank Value: Before starting a session, the host defines the unit value of 1 Bank (e.g., $1\text{ Bank} = ₹500$ or $1\text{ Bank} = ₹10,000$).

Player Setup: Add up to 12 players per active session with customizable display names. keep a cache of the names for the next time same players play as poker games usually happen amongst friends

Live Session Tracker (The Digital Notes App Replacement)

One-Tap Rebuy Counter: Fast "+1 Buy in"  button next to each player name for quick entry during live play. along with current state and a confirmation popup

Real-Time Cash-In Counter: Show the total cash pool in real time based on total banks issued $\times$ bank value.

Session Timer & Log: A simple running clock showing session duration.

End-of-Game Cashout & Splitwise-Style Settlement Engine

Final Stack Input: At game end, enter each player's final remaining cash or chip stack value.

Balance Validation: Automatically compute total buy-ins vs. total cashouts. Highlight discrepancies if the sum does not equal zero (e.g., "Pool Mismatch: $+₹500$ uncollected").

Payout Simplification Algorithm: Automatically compute the minimum number of transactions needed to settle all debts (Splitwise-style).

Example output: "Player A pays Player B ₹1,500" rather than multiple cross-payments.

Calendar View & Session History

Interactive Calendar: Visual monthly/weekly calendar displaying marked dates where sessions occurred.

Day Detail Sheet: Tapping a date opens a slide-over modal detailing that day's session: bank value, duration, list of players, total pool, and final settlement ledger.

UX & Layout Structure

Home Dashboard: Quick actions ("Start New Session", "View Past Games") + recent game summary cards.

Active Table View: Clean vertical list of 1 to 12 active players with large, touch-friendly rebuy controls.

Settlement Screen: High-contrast summary card displaying net profits/losses per player alongside simplified payment steps.

Tech & Components Guidelines

Use Tailwind CSS for custom dark theme styling.

Use Lucide icons for clean, modern athletic-style iconography.

Use local storage or simple database state to preserve game history across sessions.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://bbchip-countr.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/fbc5e29f-3a89-4b15-bcb6-b80eac60f24b).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
