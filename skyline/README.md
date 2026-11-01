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
The city starts out owning every lot and sells one only when a tycoon
**calls an auction** on it. Tap a city lot and call it: you place the
opening bid at the reserve price, so every auction has a bid, and the panel
shows who called it. Rivals call auctions for lots they really want, mostly
during the day. Auctions are at least **6 game hours apart**, and each player
can call one every **12 game hours**. The clock stops while an auction runs.
You bid in real seconds against the rivals, and every bid resets the
countdown to at least 3.5 s. The rivals bid up to what a lot is worth to
them, which is much more if it completes their colour set or blocks yours.
Land sold back to the city, or seized from a bankrupt rival, can be called
again. Otherwise land changes hands through offers between tycoons.

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

Each shop sheet has four tabs:

- **Manage**: price, opening hours, stock, a two-week profit chart, refits,
  and extra **shop floors** (up to 3), which add capacity, staff places and bills.
- **Staff**: your team as named people. **Servers** set how many customers
  you can serve. **Stock clerks** add a 13:00 restock and cut spoilage. One
  **manager** lifts everyone's morale and the service. Each person has a skill
  that grows with experience and paid **training**, an hourly wage, and a
  **morale** that follows pay, opening hours, stress and management.
  Underpaid, overworked staff turn grumpy (customers notice) and eventually
  **quit**. Hire from the day's job seekers, give raises, promote, demote or fire
  (ten hours' severance).
- **Customers**: what shoppers say about this shop (great service, slow
  staff, rude staff, too pricey, queues, sold out, shut when I came), a
  satisfaction breakdown, and who shops there and which blocks they come from.
- **Promote**: ad campaigns that unlock by era (flyers, radio, TV, social
  media) and pull more customers for a few days.

### Block appeal, parks and buyouts
Every block has **appeal stars**. Wealthier districts start higher. Hold at
least half a block's lots and you can landscape its open spaces with a
garden, fountain plaza, monument (1950) or light sculpture (1990). Stars
draw wealthy shoppers and visitors, and raise land values and apartment rents.

On **your own land** you can **buy out** a rival's shop, team and stock
included. Owning the whole colour set makes buyouts much cheaper. Rivals do
this to you as well.

### Research and city lenses
Commission a **market survey** of any block ($1,500, valid 5 days). It ranks
every kind of business there by expected customers and profit, shows nearby
competition, and how many people are asking for it.

Tap **🗺️** for **city lenses**. Each lens paints every colour block by one
number, with a label over the block, a legend, and a **Rank blocks** list
that jumps to a block when tapped:

| Lens | Shows |
| --- | --- |
| 🔥 Unmet | People who couldn't get what they wanted, and the most-wanted business |
| 🙋 Interest | Everyone who went shopping from the block, served or not |
| 👣 Customers | Customers served by the block's shops yesterday |
| 💵 Revenue | The block's shop sales yesterday |
| 📈 Profit | Shop profit after every cost (green earns, red loses) |
| ⭐ Quality | Average shop quality (reputation + fit-out) in stars |
| 😊 Happiness | Share of customer comments that were positive |
| 🎯 Opportunity | Pick a business type: expected profit on the best free lot of each block |
| 💎 Appeal | Block stars and share of wealthy residents |
| 👪 People | Residents plus visitors |
| 🧾 Rent | Average daily ground rent |
| 💰 Land | Average land value |
| 🏳️ Owners | Who holds most of each block (✓ for a full set) |

The business lenses can switch between **all shops** and **my shops only**.
Picking a lens folds the chooser into a slim strip so the map stays clear.

### Utilities
Every business pays a nightly power and water bill. Heavy users such as
cinemas, arcades, hotels and gyms pay more, and so do bigger shops.
**Volt Works** takes a cut of all power bills and **Clearwater Works** of all
water bills, so their income follows what the city builds.

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

Win or lose, you can **keep playing**: the game carries on in free play with
no more goals or deadlines, and the rivals keep competing. If you went
bankrupt, your company is re-founded with half the usual starting cash. In LAN
games the host makes that choice for everyone.

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

The ⟲ ⟳ ⛰ ⌂ buttons rotate, tilt and reset the view. *Menu → Graphics*
cycles high / medium / battery. Phones start on medium. If a phone ever drops
the 3D context, the game rebuilds the view by itself at a lower setting.

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
  js/citizens.js   the citizens: needs, choices, queues, grudges, comments, trips
  js/staff.js      shop staff: roles, skill, wages, morale, training, quitting
  js/sim.js        economy: shops, stock, rent, sets, apartments, goals, trades, bank
  js/auction.js    live land auctions
  js/ai.js         rival tycoons (build, tune, trade, bid)
  js/game.js       the clock: advances the sim, wakes the AI, opens auctions
  js/actions.js    every player action by name, validated (single-player and server)
  js/net.js        LAN WebSocket client with auto-reconnect
  js/lens.js       city lenses: one number per block for heat maps and rankings
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
