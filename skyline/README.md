# Skyline Hustle

A real-time 3D city business tycoon for phones. Win land at live auctions,
open shops anywhere, set their prices, staff, hours and stock, and build
your colour districts into a skyline while three AI tycoons try to do the
same. The game runs from the 1930s onward, and new businesses, fit-outs and
taller buildings unlock as the years pass.

## Play

```bash
node skyline/server.mjs         # zero dependencies, Node 18+
```

Open the printed `http://<your-ip>:8090` on a phone on the same wifi (or
`http://localhost:8090` on the computer). Single-player games save
themselves every midnight in the browser.

### LAN multiplayer

Up to **4 players** on the same wifi, with AI rivals filling any empty seats.
Everyone opens the address the server prints, enters a name and taps
**Join LAN lobby**. The first person in is the host and picks the scenario
and difficulty. The server runs the one shared city: everyone bids in the
same live auctions, rents your land, and competes for the same customers.

- **Shared speed, by agreement.** Tapping a speed button (pause included)
  *proposes* it. Every other connected player gets a banner with **Agree / No**
  and has 20 seconds to answer. One "no", or silence, cancels it. After
  proposing you must wait **60 seconds** before proposing again (this stops
  anyone spamming requests). Playing alone on the server? Changes apply instantly.
- **Auctions** pause everyone's clock. When every player who isn't leading
  has tapped *Pass*, the rivals settle it at once.
- **Offers** from rivals don't pause the shared game; they wait until they expire.
- **Drop out and back in** any time: your phone remembers its seat, and your
  company keeps trading while you're away. Someone new can take over a seat
  whose player has left.
- **Milestone scenarios** become a race: the first player to hit every goal
  wins. Miss a deadline and you're out of the running, but you can keep playing.
- The server saves the LAN game every midnight to `skyline/saves/`; the host
  can **resume** it from the lobby. *Menu → End the game for everyone* (host
  only) sends everybody back to the lobby.

There is also a single self-contained file (three.js included, ~860 KB)
that needs no server:

```bash
node skyline/tools/bundle.mjs   # -> dist/skyline-hustle.html
```

## The game

### Land: live auctions
The city starts out owning every lot and sells them **by live auction at
9:00, 13:00 and 17:00**. The clock stops while an auction runs. You bid in
real seconds against the rivals, and every bid resets the countdown to at
least 3.5 s. The rivals bid up to what a lot is worth to them, which is much
more if it completes their colour set or blocks yours. Tap any city lot to
**petition** for it to be auctioned next. Lots nobody bids on come back
cheaper. Land sold back to the city, or seized from a bankrupt rival, goes
back into the auction queue. After that, land changes hands through offers
between tycoons.

### Colour sets
The city has eight colour districts. Owning **every lot of a colour**
doubles the ground rent and the apartment rent on all of them.

### Businesses
You can open a shop on **any free lot**, even land you don't own. You just
pay the landowner (or the city) ground rent every night. Each shop has:

| Control | What it does |
| --- | --- |
| **Price** | 50–200% of the usual ticket, in 5% steps. Budget crowds flee high prices; wealthy ones barely notice. |
| **Staff** | Each staff member serves a set number of customers an hour. Queues turn people away and hurt your reputation. |
| **Opening hours** | Pick the opening time and how long to stay open. Wages are paid for every open hour. Demand is lower outside a business's usual hours, but it's there. |
| **Stock** | Delivered at 06:00. *Auto* orders what you sold yesterday plus a margin, at a 6% wholesaler premium. *Manual* lets you set the delivery size. Food spoils overnight, other stock costs 1% a day to store, and empty shelves send customers away angry. A rush delivery costs +25%. |
| **Fit-out** | Basic → Smart → Flagship (as the technology arrives). Nicer shops draw more people and serve them faster. |

Reputation (★) rises when you serve everyone who comes and falls when you
turn them away or charge luxury prices.

### Apartments
You can build apartments on **any lot you own**. Each level adds residents,
who become customers for every shop nearby, plus rent. Owning the full
colour set doubles that rent. Height is limited by the era: 2 floors in
1930, up to a **Skyline Tower** from 1972.

### Citizens
Every person walking the streets is a simulated citizen: a household of 8
with a home, a wealth level, a personal price sensitivity, a favourite shop,
grudges, and seven needs (food, groceries, health, fitness, fun, shopping,
a bed). Each need fills up at its own daily rhythm. When one passes the
citizen's threshold they choose where to go, weighing distance, price,
fit-out, reputation and memory. Visitors arrive by metro and need hotels.
**Tap a walker** to see their needs and what they think. Each block's
**word on the street** shows what locals couldn't get: no shop nearby,
shut, too pricey, queue too long, sold out. That's where the opportunities are.

### Eras and tech
A year passes every 5 game days. Business types appear (Diners 1946, Dance
Halls 1956, Health Clubs 1966, Video Arcades 1979, Smoothie Bars 2001),
fit-outs and apartment heights unlock, shops get era-appropriate names (Tea
Room → Coffee Bar → Coffee House), fashions shift demand (cinemas boom
before TV and slump after it), and events fit the times.

### Scenarios

| Scenario | Start | Win by |
| --- | --- | --- |
| Boomtown | 1930 | Meeting every milestone on time: 2 shops by day 10, 3 lots by day 20, $2.5K daily profit by day 30, a colour set by day 42, $250K by day 60 |
| Golden Age | 1950 | 4 shops, 1,500 customers in a day, 6 apartment levels, 2 sets, 2 stations, $1M, each by its deadline |
| Mogul Race | 1975 | First to a $3M net worth within 100 days |
| Quick Deal | 1990 | First to $750K within 40 days |
| Free Play | 1930 | No goals, no deadline |

Miss a milestone deadline and the scenario is lost.

### Rivals

| Rival | Style |
| --- | --- |
| Margo Vance, Vance Estates | Land baron: bids hard for set-completing lots, builds apartments |
| Rex Dupree, Dupree & Sons | Cheap food everywhere, undercuts on price |
| Ines Kato, Kato Collective | Premium prices, smart fit-outs, wealthy streets |

They use exactly the same rules and actions as you. Difficulty (Relaxed /
Sharp / Ruthless) changes how often they think, the returns they insist on,
how carefully they re-tune their shops, whether they borrow, how much they
will pay at auction, and their starting cash.

## Controls

| | Phone | Computer |
| --- | --- | --- |
| Pan | drag | drag |
| Zoom | pinch | wheel |
| Rotate | twist two fingers | right-drag, or `Q` / `E` |
| Tilt | drag two fingers up/down | right-drag |
| Select | tap a building or a person | click |
| Speed | ❚❚ ▶ ▶▶ ▶▶▶ | `0`–`3`, space |

The ⟲ ⟳ ⛰ ⌂ buttons rotate, tilt and reset the view. *Menu → Graphics:
battery* turns off shadows and lowers the resolution for older phones.

## Code

```
skyline/
  index.html, style.css   screens, HUD, lobby and phone-first UI
  server.mjs              static server + LAN multiplayer: lobby, the shared
                          city, speed votes, saves (reuses ../server/ws.js)
  vendor/three.module.min.js   three.js r160 (MIT)
  js/data.js       every number: districts, businesses, eras, tech, scenarios, events
  js/map.js        the city grid, road network (BFS distances / paths), seeded RNG
  js/demand.js     demand curves by hour, opening hours, era fashions
  js/citizens.js   the citizens: needs, choices, queues, grudges, trips
  js/sim.js        economy: shops, stock, rent, sets, apartments, goals, trades, bank
  js/auction.js    live land auctions
  js/ai.js         rival tycoons (build, tune, trade, bid)
  js/game.js       the clock: advances the sim, wakes the AI, opens auctions
  js/actions.js    every player action by name, validated (single-player and server)
  js/net.js        LAN WebSocket client with auto-reconnect
  js/render3d.js   three.js city, people, cars, day/night, free camera, picking
  js/ui.js         bottom sheet, auction panel, tabs, toasts, modals
  js/main.js       game loop and title screen
  tools/bundle.mjs   single-file build
  tools/simtest.mjs  headless run: node skyline/tools/simtest.mjs [days] [seed] [easy|normal|hard] [scenario]
```

Everything except `render3d.js`, `ui.js`, `audio.js` and `main.js` runs in
plain Node with no DOM. `simtest.mjs` plays out a 100-day game (about
4,000 citizens, auctions settled instantly) in about 4 seconds, and compares
the build-menu forecasts against what the citizens actually did.
