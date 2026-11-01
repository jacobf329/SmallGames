# Skyline Hustle

A real-time city business tycoon for phones. Buy up a little isometric city
block by block, open shops, set their prices and staffing, and race three AI
tycoons to a target net worth.

The heart of the game is **colour sets**. The city is split into eight colour
districts. Own **every lot of a colour** and:

- ground rent on every lot in that colour **doubles**, and
- you can stack **apartments** on those lots, built evenly across the set, two
  floors at a time, all the way up to a **Skyline Tower**.

Apartments add residents to the block, and residents are customers, so a
finished set feeds every shop on it.

## Play

```bash
node skyline/serve.mjs          # zero dependencies, Node 18+
```

Open the printed `http://<your-ip>:8090` on a phone on the same wifi (or
`http://localhost:8090` on the computer). The game saves itself every midnight
in the browser.

There is also a single self-contained file with no server needed:

```bash
node skyline/tools/bundle.mjs   # -> dist/skyline-hustle.html (~145 KB)
```

Copy that file to a phone, or host it anywhere, and open it.

## How it plays

| | |
| --- | --- |
| **Tap a lot** | Buy the land, open a business, manage it, build apartments, bid on a rival's lot |
| **Drag / pinch** | Pan and zoom the city (mouse wheel on desktop) |
| **❚❚ ▶ ▶▶ ▶▶▶** | Pause / play / fast / fastest (keys `0`–`3`, space) |
| **Empire** | Every shop and lot you own, with yesterday's profit |
| **Sets** | Who owns what in each colour, plus stations and utilities |
| **Rivals** | Standings, net worth charts, each rival's style |
| **Bank** | Borrow / repay, yesterday's books, asset breakdown |

### The economy

- **Land vs. business.** Land and the business on it are separate things. You
  can open a shop on anyone's lot, but you pay the landowner ground rent every
  night. City lots are leased from the city. Rivals will happily build on your
  land and pay you.
- **Customers.** Every hour each district produces customers for each kind of
  business, depending on how many budget, middle-income and wealthy residents
  it has, its visitors, the time of day, the weekday and any events. They split
  between the open shops of that kind on the block and its neighbours,
  favouring nicer fit-outs and better prices.
- **Price.** Budget crowds flee expensive shops; wealthy crowds barely notice.
  Luxury pricing on Regent Heights works. On Foundry Row it does not.
- **Staff.** Each staff member serves a fixed number of customers an hour. If
  the shop is turning people away, hire. If the busyness meter never fills, cut
  staff, because wages are paid for every open hour.
- **Fit-out.** Refit to Smart or Flagship to draw more customers and serve
  them faster.
- **Metro stations** pay nightly fares, and they pay more per station the more
  you own. They also bring visitors to nearby blocks.
- **Utilities** take a cut of every business's nightly bill, so they grow with
  the city.
- **Events** roll each morning: street festivals, heatwaves, rainstorms,
  conventions, fitness crazes, phone launches, property booms and slumps.
- **Trades.** Rivals bid (sometimes generously) for the lot that completes
  their set. You can bid for theirs. They want a lot more for a lot that breaks
  their set or completes yours.
- **Bank.** Borrow against your assets at 0.8% a day. Go overdrawn and the
  bank tops you up from your credit line. With no credit left you have three
  days to raise cash before you are declared bankrupt.

### Rivals

| Rival | Style |
| --- | --- |
| Margo Vance, Vance Estates | Land baron: hoards lots, completes colour sets, builds towers |
| Rex Dupree, Dupree & Sons | Cheap food everywhere, undercuts on price |
| Ines Kato, Kato Collective | Premium prices, smart fit-outs, wealthy streets |

They use exactly the same rules and actions as you. Every move goes through
the same functions in `js/sim.js`. Difficulty (Relaxed / Sharp / Ruthless)
changes how often they think, how good a deal has to be before they take it,
how well they re-tune their shops, whether they borrow, and their starting
cash.

### Scenarios

- **Quick Deal**: first to a $500K net worth within 40 days
- **City Mogul**: first to $2M within 100 days
- **Free Play**: no deadline

## Code

```
skyline/
  index.html       screens and HUD markup
  style.css        phone-first UI (portrait, landscape, desktop)
  serve.mjs        tiny static server for LAN play
  js/data.js       every number: districts, businesses, prices, events, tuning
  js/sim.js        the simulation: map, demand, rent, sets, apartments, trades, bank
  js/ai.js         rival tycoons and the advanceGame() clock driver
  js/render.js     isometric canvas renderer (no image assets)
  js/ui.js         bottom sheet, tabs, toasts, offers, modals
  js/audio.js      synthesised sound effects
  js/main.js       game loop, touch input, saving
  tools/bundle.mjs single-file build
  tools/simtest.mjs headless balance run: node skyline/tools/simtest.mjs [days] [seed] [easy|normal|hard] [--greedy]
```

`sim.js` and `ai.js` never touch the DOM, so `tools/simtest.mjs` can run a
100-day game in about a second. Use it after changing anything in `data.js`.
