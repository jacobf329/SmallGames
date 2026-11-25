// Leftover Uprising - the jokes: what the food says, what each wave is
// called, and how the bosses make their entrance. Family-friendly.
//
// Lines are drawn from shuffle bags (createLines): nothing repeats until its
// whole pool has been used, so a long game keeps finding new ones.

// ── What the food says ──────────────────────────────────────────────────────
// spawn: as it marches in · pop: as it's taken out · leak: escaping out the
// back door · split: bosses breaking apart
export const BARKS = {
  pea: {
    spawn: ['Nobody split up!', 'Is this the way out? Somebody check!', 'Peas in a pod, peas in a pod...', 'Stay close, I can see a cleaver!', 'Why are there so many of us?'],
    pop: ['Tell my pod I tried!', 'Not the face!', 'I was so close to being soup.', 'Pea-ce out...', 'Somebody catch me!'],
    leak: ['We made it! Wait, where\'s Kevin?', 'Freedom smells like dish soap!', 'Run, little peas, run!', 'Out the door and under the fridge!'],
  },
  grape: {
    spawn: ['Bunch up!', 'We are not raisins yet!', 'Roll out, team!', 'Stick to the vine, people!'],
    pop: ['I was going to be a raisin.', 'Juice everywhere. Sorry.', 'Squish!', 'Wine was my dream...', 'Grape-ful for the memories.'],
    leak: ['Grape escape!', 'Nobody will ever make me into jelly!', 'See you at the vineyard!', 'Rolling home!'],
  },
  meatball: {
    spawn: ['Let\'s roll.', 'Who\'s got the sauce?', 'I\'ve been simmering for this.', 'Somebody save me a noodle.'],
    pop: ['I\'m all crumbs now...', 'Should\'ve stayed in the sub.', 'Mamma mia!', 'Pass the parmesan... on my grave...'],
    leak: ['Rolling, rolling, rolling!', 'Off to find some spaghetti.', 'Ciao, kitchen!', 'Downhill all the way!'],
  },
  drumstick: {
    spawn: ['Leg day.', 'One leg and still faster than you.', 'Nobody eats me with a fork.', 'Bawk. That\'s a threat.'],
    pop: ['Down to the bone...', 'Finger-lickin\'... ow.', 'Should have flown south.', 'I had a good leg run.'],
    leak: ['Kicked my way out!', 'One leg, zero problems.', 'Hop, hop, gone!', 'Chicken? I\'m the brave one!'],
  },
  broccoli: {
    spawn: ['I am a tiny tree. Respect me.', 'Kids hate me. Let\'s see about cooks.', 'Eat your vegetables? Make me.', 'Fear the forest!'],
    pop: ['Florets, assemble!', 'You can\'t chop a forest!', 'Scatter, my little ones!', 'Timber!'],
    leak: ['Nobody eats their broccoli. Proven again.', 'Back to the garden!', 'Vegetables win!'],
  },
  floret: {
    pop: ['Mini timber!', 'Eek!', 'I was the cute one!', 'Tiny tree down!'],
    leak: ['Tiny but free!', 'Sprout out!', 'Small, fast, gone!'],
  },
  celery: {
    spawn: ['Go ahead. Try to chew through this.', 'Nobody likes me and I like it that way.', 'Pure crunch. Zero fear.', 'I am ninety percent water and ten percent spite.'],
    pop: ['Snapped like a... well, celery.', 'At least I was healthy.', 'Strings everywhere. Gross.', 'Crunch... my final sound.'],
    leak: ['Too crunchy to stop.', 'Off to ruin a soup.', 'Enjoy your stringy floor!'],
  },
  coconut: {
    spawn: ['Knock all you want.', 'I\'m basically a rock with ambitions.', 'Brought my own armour.', 'Hairy, round and ready.'],
    pop: ['Crack! Okay, that one hurt.', 'Coconut water everywhere. You\'re welcome.', 'Took you long enough.', 'I had such a good shell...'],
    leak: ['Tell the blender I said hi.', 'Rolling to the beach!', 'Still have all my hair!'],
  },
  popcorn: {
    spawn: ['POP! Hi! POP!', 'We fly now!', 'Can\'t catch what\'s up here!', 'Extra butter, extra attitude!'],
    pop: ['Pop! Wait, that\'s my line...', 'Un-popped!', 'Buttery goodbye!', 'Should\'ve stayed a kernel.'],
    leak: ['Popping off to the movies!', 'Up, up and away!', 'Kernel of truth: you missed!'],
  },
  cottoncandy: {
    spawn: ['Floating in, sweeties!', 'I\'m mostly air. Good luck.', 'Fluff incoming!', 'Pink and dangerous!'],
    pop: ['Melted on the job...', 'Too sweet for this world.', 'Poof!', 'Sticky fingers... everywhere...'],
    leak: ['Off to the fair!', 'Sweet, sweet freedom!', 'Fluffed my way out!'],
  },
  icecream: {
    spawn: ['Stay frosty.', 'Cold doesn\'t scare me. I AM cold.', 'Two scoops of trouble.', 'Sprinkles are my armour.'],
    pop: ['I\'m melting! Classic.', 'Brain freeze... permanent...', 'Sprinkles... everywhere...', 'Should\'ve been a sundae.'],
    leak: ['Cool exit.', 'Off to find a cone!', 'Chill, I\'m leaving.'],
  },
  frozenpeas: {
    spawn: ['We\'ve been in the freezer since forever.', 'Frozen solid, still angry.', 'Thawing out and ready!', 'Nobody remembers buying us!'],
    pop: ['Freezer burn...', 'We were best before last year!', 'Defrosted!', 'Back to the bag...'],
    leak: ['Ice to meet you, bye!', 'Cool runnings!', 'Out before we thaw!'],
  },
  jelly: {
    spawn: ['Wobble wobble.', 'Hit me. I dare you.', 'I am unstoppable jiggle.', 'You can\'t chop what wobbles.'],
    pop: ['Splat.', 'No more wobble...', 'I set for this?', 'Jiggled my last jiggle.'],
    leak: ['Wobbled right past you!', 'Still here. Still wobbly. Gone.', 'Jiggle out!'],
  },
  sourdough: {
    spawn: ['I\'ve been rising all morning.', 'My starter is older than you.', 'Crusty and proud.', 'Knead to get past? I do.'],
    pop: ['My starter will avenge me!', 'Stale...', 'Torn to toast.', 'I was artisanal!'],
    leak: ['I rise again!', 'Off to a fancy bakery.', 'Loafing my way out.'],
  },
  chili: {
    spawn: ['Hot coming through!', 'Heat? I eat heat for breakfast!', 'Can\'t touch this. Literally.', 'Spicy and speedy!'],
    pop: ['Ah! Too cold! Too cold!', 'Spicy... goodbye...', 'Mild. I went out MILD.', 'Somebody get me a glass of milk!'],
    leak: ['Too hot to handle!', 'Zoom! Spice is fast!', 'Burn rubber!'],
  },
  watermelon: {
    spawn: ['Big, round, unstoppable.', 'Mostly water, all attitude.', 'Make way for the melon!', 'I am the picnic now.'],
    pop: ['Seeds! Seeds everywhere!', 'Slices, go!', 'Picnic\'s over...', 'Somebody save the rind!'],
    leak: ['Rolled out like a champ!', 'Summer\'s calling!', 'Watermelon escape! That\'s a thing now.'],
  },
  melonslice: {
    pop: ['Spit out my seeds, I dare you.', 'Rind and gone.', 'Juicy ending!'],
    leak: ['Slice of freedom!', 'Juicy getaway!', 'Smile! I\'m shaped like one!'],
  },
  bacon: {
    spawn: ['Too cool for syrup.', 'Sizzle sizzle.', 'Everyone loves me. Even you.', 'Grease is the word.'],
    pop: ['Crispy... finally...', 'Extra crispy. Worth it.', 'I regret nothing.', 'Save me for breakfast...'],
    leak: ['Slid right out!', 'Greased lightning!', 'Too slippery for you!'],
  },
  cake: {
    spawn: ['I OBJECT TO THIS WEDDING!', 'Nobody is cutting ME today!', 'Three tiers of fury!'],
    split: ['You can cut me, but there\'s MORE CAKE!', 'Tier two, take over!', 'The party splits up!'],
    pop: ['Nobody... gets... a piece...', 'Save the top tier... for my anniversary...'],
    leak: ['The reception continues without you!', 'Off on my honeymoon!'],
  },
  cake2: {
    split: ['Cupcakes, scatter!', 'Mini me, go!'],
    pop: ['Tier down!', 'Frosting failure!'],
    leak: ['The party goes on!', 'Leftover cake wins again!'],
  },
  cupcake: {
    pop: ['Mini meltdown!', 'Sprinkle out!', 'Too cute to lose!', 'My wrapper!'],
    leak: ['Party favour escaping!', 'Sweet ride!', 'Bye, sprinkle haters!'],
  },
  turkey: {
    spawn: ['GOBBLE. That means run.', 'I was roasted once. Never again.', 'Who\'s carving? Nobody\'s carving.'],
    pop: ['Leftovers... for a week...', 'Gravy... take care of the family...', 'At least... I wasn\'t dry...'],
    leak: ['Gobble gobble, see you never!', 'Off to haunt next Thanksgiving!'],
  },
  pizza: {
    spawn: ['Extra large. Extra angry.', 'Delivery for... NOBODY!', 'I\'ve got a topping for every one of you.'],
    split: ['Slices! Go! Go! Go!', 'Cut me into eighths? Bad move.', 'Each slice for itself!'],
    pop: ['Thirty minutes... or less... goodbye...', 'Hold the... anchovies...'],
    leak: ['Delivery complete!', 'Keep the change!'],
  },
  slice: {
    split: ['Crust, run for it!', 'Toppings off, crust out!'],
    pop: ['Extra cheese... gone...', 'Delivery failed!', 'I was the best slice!'],
    leak: ['Thirty minutes or less!', 'Hot and fresh, out the door!'],
  },
  crust: {
    pop: ['Nobody eats the crust anyway.', 'Crunch.', 'Always the leftover...'],
    leak: ['Crust never quits!', 'The crust gets the last laugh!'],
  },
};

// ── Wave titles ─────────────────────────────────────────────────────────────
export const WAVE_TITLES = {
  any: [
    'The Lunch Rush', 'Second Helpings', 'The Midnight Snack', 'Return of the Leftovers', 'Fridge Break',
    'The Great Tupperware Escape', 'Doggy Bag Revolt', 'Brunch Gone Wrong', 'The Buffet Strikes Back',
    'All You Can\'t Eat', 'Family-Style Chaos', 'Snack Attack', 'The Potluck Plot', 'Picnic Panic',
    'The Crumbs Have Eyes', 'Sell-By Date Rebellion', 'Expired and Angry', 'Not On The Menu', 'The Daily Special',
    'Prep Time Is Over', 'Hold The Line, Hold The Mayo', 'No Substitutions', 'Order Up!', 'Back of House Brawl',
    'The Dish Pit Uprising', 'Rush Hour at the Fridge', 'Use It Or Lose It', 'Who Left The Fridge Open?',
    'Late Night Cravings', 'Room Service Riot', 'Seconds, Anyone?', 'The Five-Second Rule Is Off',
    'Lunchbox Liberation', 'Tuesday Night Leftovers', 'The Sandwich Can Wait', 'Mystery Container Mayhem',
    'Taste Test Trouble', 'The Kitchen Never Closes', 'Overcooked Ambitions', 'Clean Plate Club Rejects',
  ],
  horde: ['Peas Out!', 'Grape Expectations', 'Small Bites, Big Crowd', 'Pea Pandemonium', 'Bite-Sized Bedlam'],
  tank: ['Meatball Madness', 'Heavy Helpings', 'Drumstick Drumroll', 'The Protein Parade'],
  splitter: ['Broccoli Breakup', 'Divide and Conquer the Kitchen', 'Tiny Trees, Big Trouble', 'Forest Floor Fiasco'],
  fast: ['Hot Pursuit', 'The Spice Race', 'Fast Food', 'Speedy Seasoning'],
  armoured: ['Crunch Time', 'Tough Nuts to Crack', 'Celery Surprise', 'The Hard Shell Gang'],
  flying: ['Pop Goes the Kitchen', 'Airborne Snacks', 'Fluff and Fury', 'Look Up!'],
  regen: ['Wobble Rebellion', 'Rise of the Sourdough', 'The Jelly Won\'t Quit', 'Back for Seconds, Again'],
  frozen: ['Freezer Burn', 'The Cold Shoulder', 'Brain Freeze Brigade', 'Frost Bite Night'],
  heatproof: ['Can\'t Stand The Heat', 'Melon Rollers', 'Hot Stuff Only', 'Fireproof Picnic'],
  greasy: ['Grease Lightning', 'The Bacon Breakout', 'Slippery When Sizzling', 'Breakfast Bandits'],
};
// Waves aimed at what the team leans on.
export const COUNTER_TITLES = {
  heat: ['Someone Bought Too Many Grills', 'Fireproof Friday', 'The Heat Is Off', 'Turn Down the Stove', 'Oven Mitts Not Required', 'Spice Up Your Strategy'],
  chop: ['Knives Can\'t Reach Us', 'The Butcher Problem', 'Dull Blades Day', 'Put the Cleaver Down', 'Cutting Board Blues', 'Chop Chop, Not So Fast'],
  cold: ['Your Freezer Is Showing', 'Ice Ice Maybe', 'Thawed and Annoyed', 'Cold Feet, Warm Food', 'Already Frozen, Thanks', 'Snow Day Cancelled'],
  sticky: ['Syrup Doesn\'t Stick', 'Non-Stick Coating', 'Pancakes Not Included', 'Slip and Slide', 'Butter Them Up', 'Unstuck and Unbothered'],
  basic: ['Prep Stations Won\'t Cut It', 'Basic Is Boring', 'Time to Upgrade, Chef', 'Plain Plates, Big Problems', 'Paper Plates Won\'t Save You', 'Seasoning Sold Separately'],
};
export const BOSS_TITLES = {
  cake: ['The Wedding Crasher', 'Here Comes the Cake', 'Let Them Eat Chaos'],
  turkey: ['Thanksgiving Never Ends', 'The Bird Is Back', 'Stuffed and Furious'],
  pizza: ['The Final Delivery', 'Extra Large, Extra Trouble', 'Last Slice Standing'],
};

// ── Boss entrances (title cards) ────────────────────────────────────────────
export const BOSS_CARDS = {
  cake: [
    { name: 'The Wedding Cake', line: 'It objected to its own wedding. Now it wants out.' },
    { name: 'The Wedding Cake', line: 'Three tiers, zero manners, and a grudge against cake knives.' },
    { name: 'The Wedding Cake', line: 'Somebody said "cut the cake." It heard that.' },
  ],
  turkey: [
    { name: 'The Roast Turkey', line: 'Already roasted once. It did not enjoy it.' },
    { name: 'The Roast Turkey', line: 'Twenty pounds of gravy-soaked revenge.' },
    { name: 'The Roast Turkey', line: 'It survived Thanksgiving. Your kitchen is next.' },
  ],
  pizza: [
    { name: 'The Giant Pizza', line: 'Eight slices. One goal. Extra cheese.' },
    { name: 'The Giant Pizza', line: 'Delivered by mistake, and it is not leaving quietly.' },
    { name: 'The Giant Pizza', line: 'Cut it up and every slice comes for you.' },
  ],
};

// Shuffle bags: draw(key, pool) never repeats a line until that pool is used up.
export function createLines(rng = Math.random) {
  const bags = new Map();
  return function draw(key, pool) {
    if (!pool || !pool.length) return null;
    let bag = bags.get(key);
    if (!bag || !bag.length) {
      bag = pool.slice();
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
      // Don't open a fresh bag with the line that just closed the last one.
      const last = bags.get(key + ':last');
      if (bag.length > 1 && bag[bag.length - 1] === last) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      bags.set(key, bag);
    }
    const line = bag.pop();
    bags.set(key + ':last', line);
    return line;
  };
}
