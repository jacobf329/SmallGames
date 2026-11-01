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
**Join LAN lobby**. The first person in is the host and picks the scenario,
map and difficulty. The server runs the one shared city: everyone bids in the
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
Pass and the panel shrinks to a thin strip at the top of the screen, so you
can get on with running your shops while the rivals fight it out.

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
- **Books**: the shop's own ledger (sales, stock deliveries, storage, wages,
  training and severance, ground rent, power and water, advertising) for
  today, yesterday, the last 7 or 30 days, or all recorded days, with stock
  spoiled, money invested, money earned back, and payback %. Below it, a chart
  of any metric over the last 60 days: profit, revenue, costs, customers,
  turned away, average ticket, price, **stock at close**, deliveries, spoilage,
  staff, wage bill, morale, reputation, happiness, busiest hour and opening
  hours. A second chart shows **shelf stock hour by hour** for today.

The **Bank** tab charts the company over time: net worth, cash, loan,
operating profit, sales, stock, wages, rent paid and received, apartment rent
and number of shops. In LAN games these histories are fetched only when you
open them, so the regular city updates stay small.

### Block appeal, parks and buyouts
Every block has **appeal stars**. Wealthier districts start higher. Hold at
least half a block's lots and you can landscape its open spaces with a
garden, fountain plaza, monument (1950) or light sculpture (1990). Stars
draw wealthy shoppers and visitors, and raise land values and apartment rents.

On **your own land** you can **buy out** a rival's shop, team and stock
included. Owning the whole colour set makes buyouts much cheaper. Rivals do
this to you as well.

### Brands and chains

Three or more shops of the same kind make a **chain** under your brand
(for example "Vance Tea Room"). Chains:

| Branches | Name | Stock discount |
| --- | --- | --- |
| 3+ | Chain | 3% |
| 5+ | Brand | 6% |
| 8+ | Household name | 9%, plus +3% pull |

- **Shared reputation:** half of each branch's reputation is the brand's
  average, so one badly run branch drags the others down (the advisor warns
  you).
- **Loyal fans:** a customer whose favourite is one branch also prefers the
  others (×1.12).
- **One tap** copies a branch's price, hours and stock policy to the whole
  chain.

### Landmarks

One of each per city, built in a race. Meet the requirement, pick an
empty lot of yours (no shop, no apartments) and pay up front. Building takes
days; **night shifts** cost 30% more and halve the time left. Everyone can
see who is building what. The first to finish owns the landmark; anyone
else building it gets **half their money back**. Each landmark brings
crowds (+8% for every shop on its block, +4% next door), costs upkeep, and
gives its owner a perk:

| Landmark | From | Needs | Perk |
| --- | --- | --- | --- |
| 🕰️ Clock Tower | 1930 | 3 shops | Your shops on its block and next door +12% |
| 🚉 Grand Terminal | 1934 | 2 stations | Your station fares +50% |
| 🎭 Opera House | 1940 | 1 colour set | Your smart shops (fit-out 2+) +15%; nightly tickets |
| 🏟️ Stadium | 1950 | 6 shops | Weekend match days: food and fun nearby +40% (yours +60%); gate takings |
| 📡 TV Tower | 1960 | 8 shops | Your promotions half price, 50% longer |
| 🏛️ Convention Centre | 1970 | 2 sets | Your hotels and bistros +25%; tickets |
| 🏙️ Glass HQ Tower | 1980 | $1M net worth | Half the loan interest, 50% more credit |
| 🔭 Science Museum | 1990 | 10 shops | Weekend crowds: shops nearby +30% (yours +45%); tickets |
| 💡 Tech Campus | 2000 | $3M net worth | New shop types 5 years early; free surveys |
| 🎡 Harbour Wheel | 2010 | 3 sets | Shops on its block +20%; big daily ticket sales |

Town offers five of them, City seven, and the larger maps all ten. A landmark
lot can't be sold or traded; if its owner goes bankrupt, whoever wins the
lot at auction gets the landmark.

### City Hall

Every week or so City Hall posts a job (the 🏛️ tab), and rivals bid too:

- **Tenders** (tram line, street lighting): sealed quotes for two days, and
  the **lowest quote wins**. The winner pays the build cost up front and is
  paid the quote in daily instalments. A tram line gives +8% customers to
  shops in the districts it runs through, for good. Street lighting gives
  cinemas, arcades, clubs, bistros and hotels +8% citywide.
- **Sponsorship** (city festival): the highest sealed bid wins. For two days
  the sponsor's shops get +30% citywide, and every shop in the festival
  district +20%.
- **Grants** (housing drive, green spaces): the city pays anyone who builds
  apartments, or parks in the named districts, before the deadline, until
  the budget runs out.

### Advisor alerts

The 🔔 button (top of the camera controls) opens your advisor's inbox. Every
game hour it looks over your company and files what needs attention:

- **Shops:** sold out right now, running dry day after day, customers giving
  up on queues, three days of losses, staff close to quitting, stock spoiling,
  and the loudest customer complaint
- **Land:** one lot from completing a set, a rival holding your last lot,
  land standing empty
- **Rivals:** a rival one lot from a set (when you can block it), a rival
  opening the same kind of shop near yours
- **Money:** overdrawn, days of cash left at the current losses, spare cash to
  clear the loan, purchase offers
- **Goals:** a milestone due within three days, a rival closing in on the race
  target
- **City Hall:** open tenders and grants, a landmark you can now build, a
  rival ahead of you in a landmark race (with a one-tap night-shift fix)
- **Tips:** new kinds of shop as they are invented, one more shop for a chain

Alerts mark themselves **sorted** when the problem clears. Many have a one-tap
fix (rush delivery, call auction, repay loan), and **Show** jumps to the lot and
the right tab. A lot's own alerts also appear at the top of its sheet. Urgent
alerts pop up as a toast and turn the bell red. You can mute any topic; urgent
alerts still come through.

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

### Maps

| Map | Grid | Colour blocks | Lots | Rivals | Race goals |
| --- | --- | --- | --- | --- | --- |
| Town | 13×10 | 8 | 28 | 3 | as listed |
| City | 19×13 | 17 | 57 | 4 | ×1.6 |
| Metropolis | 25×16 | 29 | 98 | 5 | ×2.3 |
| Megalopolis | 31×19 | 46 | 150 | 5 | ×3 |

Town is hand-made. The larger maps are generated from a fixed layout: stations
around the edge, parks spread out from the centre, and the priciest streets
next to the parks and downtown. Bigger maps space their auctions closer
together, and rivals think a little less often to keep phones smooth. In LAN games,
human players take rival seats, up to 4 humans.

### Rivals

| Rival | Style |
| --- | --- |
| Margo Vance, Vance Estates | Land baron: bids hard for set-completing lots, builds apartments |
| Rex Dupree, Dupree & Sons | Cheap food everywhere, undercuts on price |
| Ines Kato, Kato Collective | Premium prices, smart fit-outs, wealthy streets |
| Olga Petrov, Petrov Holdings | Land baron (City and larger) |
| Sid Okafor, Okafor Brands | Premium (Metropolis and larger) |

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
  js/map.js        the maps (Town + generated larger cities), road network (BFS distances / paths), seeded RNG
  js/demand.js     demand curves by hour, opening hours, era fashions
  js/citizens.js   the citizens: needs, choices, queues, grudges, comments, trips
  js/staff.js      shop staff: roles, skill, wages, morale, training, quitting
  js/sim.js        economy: shops, stock, rent, sets, apartments, goals, trades, bank
  js/civic.js      chains, landmarks (race, perks), City Hall projects; hourly perk refresh
  js/advisor.js    the advisor inbox: alert rules, sorted/one-off tracking, mute
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
