const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Connect to MongoDB
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gridcardgame';
    await mongoose.connect(mongoURI);
    console.log('MongoDB connected successfully');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    // Don't exit - allow game to run without DB (guest mode only)
  }
};

// User Schema
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    minlength: 3,
    maxlength: 20,
    match: /^[a-zA-Z0-9_]+$/
  },
  passwordHash: {
    type: String,
    required: true
  },
  email: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  // Campaign Progress
  campaign: {
    currentLevel: { type: Number, default: 1 },
    completedLevels: [Number],
    stars: { type: Map, of: Number, default: {} }, // levelId -> stars (1-3)
    defeatedBosses: [String] // boss deck IDs they've beaten
  },
  
  // Card Collection - cards they own (key -> count)
  cardCollection: {
    type: Map,
    of: Number,
    default: () => {
      // Start with 3 of each medieval card
      const startingCollection = new Map();
      const medievalCards = [
        'peasant', 'squire', 'archer', 'manatarms', 'shieldbearer', 
        'warhound', 'battlefieldmedic', 'knight', 'crusader', 
        'royalguard', 'paladin', 'siegeram', 'warbanner', 
        'shrine', 'armory', 'castlewalls', 'treasury', 'rally'
      ];
      medievalCards.forEach(card => {
        startingCollection.set(card, 3); // 3 copies of each
      });
      return startingCollection;
    }
  },
  
  // Holographic Card Collection - holo versions won from Challenge mode (key -> count)
  holoCollection: {
    type: Map,
    of: Number,
    default: () => new Map()
  },
  
  // Unlocked content
  unlockedDecks: {
    type: [String],
    default: ['medieval'] // Start with medieval unlocked
  },
  unlockedMusic: {
    type: [String],
    default: ['medieval'] // Start with medieval theme
  },
  unlockedBackgrounds: {
    type: [String],
    default: ['medieval'] // Start with medieval background
  },
  
  // Custom Decks
  customDecks: [{
    id: String,
    name: { type: String, maxlength: 30 },
    cards: [String], // Array of 30 card keys
    music: String,
    background: String,
    createdAt: { type: Date, default: Date.now }
  }],
  
  // Preferences
  preferences: {
    selectedDeck: { type: String, default: 'medieval' },
    selectedMusic: { type: String, default: 'medieval' },
    selectedBackground: { type: String, default: 'medieval' },
    tutorialCompleted: { type: Boolean, default: false }
  },
  
  // Stats
  stats: {
    gamesPlayed: { type: Number, default: 0 },
    gamesWon: { type: Number, default: 0 },
    campaignWins: { type: Number, default: 0 },
    pvpWins: { type: Number, default: 0 },
    totalKills: { type: Number, default: 0 },
    totalDamage: { type: Number, default: 0 },
    cardsPlayed: { type: Number, default: 0 },
    spellsPlayed: { type: Number, default: 0 },
    winStreak: { type: Number, default: 0 },
    bestWinStreak: { type: Number, default: 0 },
    challengeBossesBeaten: { type: Number, default: 0 },
    lowestWinHp: { type: Number, default: 999 }, // Lowest HP when winning
    highestSingleAttack: { type: Number, default: 0 }, // Highest damage in one attack
    spellOnlyWins: { type: Number, default: 0 }, // Wins using only spells
    turnsInGamesWon: { type: Number, default: 0 }, // Total turns in won games
    gamesWonCount: { type: Number, default: 0 } // For calculating average
  },
  
  // Achievements - boolean flags for each achievement
  achievements: {
    type: Map,
    of: Boolean,
    default: () => new Map()
  },
  
  // Unlocked Mats
  unlockedMats: {
    type: [String],
    default: ['default'] // Start with default mat
  },
  
  // Selected cosmetics
  selectedMat: {
    type: String,
    default: 'default'
  },
  
  // Gold currency
  gold: {
    type: Number,
    default: 0
  },

  // Rift Gems currency - used by the Card Creator
  riftGems: {
    type: Number,
    default: 0
  },

  // Custom cards built in the Card Creator (key -> full card def + count owned)
  customCards: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: () => new Map()
  },

  // Black market purchases: rotation-period-number -> [cardKey, ...]
  blackMarketPurchases: {
    type: Map,
    of: [String],
    default: () => new Map()
  },

  // Holo upgrade purchases: 'YYYY-MM-DD' -> [cardKey, ...]
  holoUpgradePurchases: {
    type: Map,
    of: [String],
    default: () => new Map()
  }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('passwordHash')) return next();
  // Note: passwordHash will already be hashed when we set it
  next();
});

// Method to check password
userSchema.methods.comparePassword = async function(password) {
  return bcrypt.compare(password, this.passwordHash);
};

// Method to get public profile (no password)
userSchema.methods.toPublicJSON = function() {
  return {
    id: this._id,
    username: this.username,
    campaign: this.campaign,
    cardCollection: Object.fromEntries(this.cardCollection),
    holoCollection: Object.fromEntries(this.holoCollection || new Map()),
    unlockedDecks: this.unlockedDecks,
    unlockedMusic: this.unlockedMusic,
    unlockedBackgrounds: this.unlockedBackgrounds,
    unlockedMats: this.unlockedMats || ['default'],
    selectedMat: this.selectedMat || 'default',
    customDecks: this.customDecks,
    preferences: this.preferences,
    stats: this.stats,
    achievements: Object.fromEntries(this.achievements || new Map()),
    gold: this.gold || 0,
    riftGems: this.riftGems || 0,
    customCards: Object.fromEntries(this.customCards || new Map()),
    createdAt: this.createdAt
  };
};

const User = mongoose.model('User', userSchema);

// Card rarity definitions (used for lottery system)
const CARD_RARITIES = {
  // Void Alien
  'voiddrone': 'common',
  'scavengerlarva': 'common',
  'spittercrawler': 'common',
  'phaseskirmisher': 'common',
  'energyleech': 'rare',
  'burrowerbeast': 'rare',
  'psionicoverseer': 'rare',
  'neuralharvester': 'rare',
  'adaptivecolossus': 'legendary',
  'sporetitan': 'legendary',
  'voidbroodmother': 'legendary',
  'eclipsedevourer': 'legendary',
  'ufoscraper': 'legendary',
  'assimilation': 'rare',
  'voidcollapse': 'rare',
  'hiveascension': 'legendary',
  // Western Skeleton
  'bonedeputy': 'common',
  'dustyrattler': 'common',
  'graverobber': 'rare',
  'phantomscout': 'common',
  'bonerevolver': 'rare',
  'undeadsheriff': 'rare',
  'coffintrapper': 'rare',
  'undertaker': 'rare',
  'thehangedman': 'legendary',
  'ghostlystampede': 'legendary',
  'bonecolossus': 'legendary',
  'deadmanshand': 'common',
  'mostwanted': 'rare',
  'shallowgrave': 'legendary',
  'highnoon': 'legendary',
  // Crimson Court (Vampire)
  'thrall': 'common',
  'bloodfamiliar': 'common',
  'nightstalker': 'common',
  'cryptkeeper': 'rare',
  'vampirespawn': 'common',
  'bloodpriest': 'rare',
  'soulcollector': 'rare',
  'nosferatu': 'rare',
  'coffin': 'rare',
  'bloodcountess': 'legendary',
  'eldervampire': 'legendary',
  'vampirelord': 'legendary',
  'bloodpact': 'rare',
  'bloodtransfusion': 'rare',
  'crimsonrevival': 'rare',
  'sanguinefeast': 'legendary',
  // Jeweled Court
  'rubysprite': 'common',
  'emeraldforager': 'common',
  'sapphiredancer': 'common',
  'topazminer': 'common',
  'amethystenchanter': 'rare',
  'diamondguardian': 'rare',
  'opaldevourer': 'rare',
  'pearlblessing': 'rare',
  'garnetqueen': 'legendary',
  'moonstonewitch': 'legendary',
  'prismaticfairy': 'legendary',
  'gemstonecurse': 'legendary',
  'fairyring': 'legendary',
  // Elune's Chosen
  'moonsentinel': 'common',
  'starweavearcher': 'common',
  'moonlitbladedancer': 'common',
  'lunarpriestess': 'common',
  'twilightsrespite': 'rare',
  'huntinggodsblessing': 'rare',
  'stonegiant': 'rare',
  'nightshadeambusher': 'rare',
  'moonshadowwarden': 'rare',
  'elunesmoonwell': 'rare',
  'lunarprayer': 'rare',
  'moonflaresorceress': 'rare',
  'starlitchampion': 'legendary',
  'starinvoker': 'legendary',
  'templeofthemoon': 'legendary',
  'lunarbarrage': 'legendary',
  // Dragon Wizard
  'wizardsrune': 'common',
  'meditationmonk': 'common',
  'wyrmwhelp': 'common',
  'cinderwing': 'common',
  'manasiphonmage': 'rare',
  'arcanetether': 'rare',
  'stormdrake': 'rare',
  'mirrorwizard': 'rare',
  'volcanicdragon': 'rare',
  'redwizard': 'legendary',
  'bluewizard': 'legendary',
  'chronodrake': 'legendary',
  'polymorph': 'rare',
  'manadrain': 'rare',
  'arcanesurge': 'rare',
  // Celestial Host
  'cherubhymnist': 'common',
  'angelicattendant': 'common',
  'maidenofvirtue': 'common',
  'angelofdestruction': 'rare',
  'seraphichunter': 'rare',
  'archangelmichael': 'legendary',
  'archangeluriel': 'legendary',
  'archangelgabriel': 'legendary',
  'archangelraphael': 'legendary',
  'luciferfallenangel': 'legendary',
  'gardenofeden': 'legendary',
  'blessingofmight': 'common',
  'blessingofvigor': 'common',
  'blessingofprotection': 'rare',
  'blessingofkings': 'rare',
  'angelicdescent': 'rare',
  'heavenlyrescue': 'rare',
  'layonhands': 'rare',
  'resurrection': 'legendary',
  'wrathofgod': 'legendary',
  // 8-Bit Battalion
  'slimesprite': 'common',
  'skeletonwarrior8bit': 'common',
  'barrel': 'common',
  'healerfairy': 'common',
  'bosskey': 'common',
  'newgameplus': 'common',
  'knighterrant': 'rare',
  'pixelproducer': 'rare',
  'cheatcode': 'rare',
  'savestate': 'rare',
  'wizardnpc': 'legendary',
  'finalboss': 'legendary',
  'resetbutton': 'legendary',
  'ragequit': 'legendary',
  // Medieval Kingdom
  'peasant': 'common',
  'squire': 'common',
  'archer': 'common',
  'manatarms': 'common',
  'battlefieldmedic': 'common',
  'knight': 'common',
  'castlewalls': 'common',
  'treasury': 'common',
  'rally': 'common',
  'shieldbearer': 'rare',
  'warhound': 'rare',
  'royalguard': 'rare',
  'siegeram': 'rare',
  'warbanner': 'rare',
  'shrine': 'rare',
  'armory': 'rare',
  'crusader': 'legendary',
  'paladin': 'legendary'
};

// Card Creator effect bank - curated, generalized monster effects a player can
// attach to a custom card. tier seeds the cost floor (see TIER_FLOORS) and the
// deck-copy-limit bucket (reuses the same common/rare/legendary buckets as real cards).
// trigger mirrors the `effect` field real cards use; extraFields are static
// properties some effects need on the card object beyond atk/hp/effectId.
const EFFECT_BANK = {
  // --- Common ---
  spawn_slimelings:        { tier: 'common', trigger: 'onDeath', name: 'Slime Burst', desc: 'On death, spawn two 1/1 Slimeling tokens in adjacent empty tiles.' },
  respawn_once:            { tier: 'common', trigger: 'onDeath', name: 'Second Wind', desc: 'The first time this unit dies, it returns to your spawn tile instead.' },
  explode_aoe:             { tier: 'common', trigger: 'onDeath', name: 'Death Explosion', desc: 'On death, deal 3 damage to all adjacent enemies.' },
  heal_adjacent_and_death: { tier: 'common', trigger: 'endOfTurn', name: 'Healing Spirit', desc: 'At end of turn, heal adjacent allies 1 HP. On death, heal all allies 1 HP.' },
  cherub_draw:             { tier: 'common', trigger: 'onDeploy', name: 'Inspired Arrival', desc: 'On deploy, draw a card.' },
  attendant_heal:          { tier: 'common', trigger: 'startOfTurn', name: 'Gentle Mending', desc: 'At start of turn, heal adjacent allies 1 HP.' },
  maiden_heal:             { tier: 'common', trigger: 'startOfTurn', name: 'Devoted Ward', desc: 'At start of turn, heal your heart 1 HP.' },
  blood_bite:              { tier: 'common', trigger: 'passive', name: 'Double Bite', desc: 'Attacks twice; the second attack deals 1 damage.' },
  lifesteal:               { tier: 'common', trigger: 'passive', name: 'Lifesteal', desc: 'Heals 1 HP whenever this unit attacks.' },
  meditation_buff:         { tier: 'common', trigger: 'startOfTurn', name: 'Meditation', desc: 'At start of turn, give a random friendly unit +1 ATK or +1 HP. Cannot move.', extraFields: { stationary: true } },
  anti_effect:             { tier: 'common', trigger: 'passive', name: 'Effect Hunter', desc: '+1 ATK when attacking units that have an effect.' },
  splash_random:           { tier: 'common', trigger: 'onAttack', name: 'Wild Splash', desc: 'On attack, deal 1 splash damage to a random other enemy.' },
  sentinel_growth:         { tier: 'common', trigger: 'startOfTurn', name: 'Growing Resolve', desc: 'At start of turn, gain +1 HP if adjacent to 2+ allies.' },
  starweave_ranged:        { tier: 'common', trigger: 'passive', name: 'Ranged Support', desc: 'Range 2. Gains +1 ATK for each adjacent ally.' },
  blade_dance:             { tier: 'common', trigger: 'onKill', name: 'Blade Dance', desc: 'On kill, this unit can move again this turn.' },
  heal_attack:             { tier: 'common', trigger: 'passive', name: 'Mending Strike', desc: 'Can attack allies to heal them for its ATK instead of dealing damage.' },
  death_gem_card:          { tier: 'common', trigger: 'onDeath', name: 'Shard Drop', desc: 'On death, add a 1/1 Gem Shard card to your hand.' },
  gem_spawn:               { tier: 'common', trigger: 'onDeploy', name: 'Gem Seeding', desc: 'On deploy, summon a 1/1 Gem Shard token in an adjacent empty tile.' },
  fairy_swap:              { tier: 'common', trigger: 'passive', name: 'Swap', desc: 'Can swap positions with any friendly unit instead of moving.' },
  gem_adjacent_buff:       { tier: 'common', trigger: 'endOfTurn', name: 'Gem Empowerment', desc: 'At end of turn, gain +1 ATK if adjacent to a Gem Shard token.' },
  diagonal_attack:         { tier: 'common', trigger: 'passive', name: 'Diagonal Strike', desc: 'Can attack diagonally.' },
  knight_leap:             { tier: 'common', trigger: 'passive', name: "Knight's Leap", desc: 'Can move to any friendly unit instead of a normal move.' },
  ranged:                  { tier: 'common', trigger: 'passive', name: 'Ranged', desc: 'Can attack targets 2 tiles away.' },
  heal_adjacent:           { tier: 'common', trigger: 'endOfTurn', name: 'Field Medic', desc: 'At end of turn, heal adjacent allies 1 HP.' },
  drone_death_damage:      { tier: 'common', trigger: 'onDeath', name: 'Parting Shot', desc: 'On death, deal 1 damage to a random enemy.' },
  energy_on_death:         { tier: 'common', trigger: 'onDeath', name: 'Energy Burst', desc: 'On death, gain 1 energy.' },
  drain_energy:            { tier: 'common', trigger: 'onKill', name: 'Energy Drain', desc: 'On kill, drain 1 energy from your opponent.' },
  energy_on_hit:           { tier: 'common', trigger: 'onAttack', name: 'Energized Strike', desc: 'On attack, if the target survives, gain 1 energy.' },
  spawn_bone_pile:         { tier: 'common', trigger: 'onDeath', name: 'Bone Pile', desc: 'On death, summon a 1/1 Bone Pile token.' },
  phantom:                 { tier: 'common', trigger: 'passive', name: 'Phantom', desc: "Untargetable during the opponent's first turn after being deployed." },

  // --- Rare ---
  triple_move:             { tier: 'rare', trigger: 'passive', name: 'Triple Step', desc: 'Can move three times per turn.' },
  spawn_pixel:             { tier: 'rare', trigger: 'endOfTurn', name: 'Pixel Factory', desc: 'At end of turn, spawn a 1/1 Pixel token in a random adjacent empty tile.' },
  destruction_heart:       { tier: 'rare', trigger: 'onKill', name: 'Heartpiercer', desc: 'On kill, deal 1 damage directly to the enemy heart.' },
  seraphic_range:          { tier: 'rare', trigger: 'passive', name: 'Extended Range', desc: 'Range 3. Can only move or attack each turn, not both.', extraFields: { range: 3 } },
  grow_max_hp_on_ally_death: { tier: 'rare', trigger: 'passive', name: 'Mourning Growth', desc: 'Gains +1 max HP whenever a friendly unit dies.' },
  steal_card:              { tier: 'rare', trigger: 'onKill', name: 'Soul Collector', desc: 'On kill, add a copy of the killed unit to your hand.' },
  lifesteal_weaken:        { tier: 'rare', trigger: 'passive', name: 'Draining Presence', desc: 'Lifesteal (heal 1 HP on attack). Adjacent enemies deal -1 damage.' },
  mana_drain_kill:         { tier: 'rare', trigger: 'onKill', name: 'Mana Siphon', desc: 'On kill, the enemy loses 1 energy.' },
  arcane_link:             { tier: 'rare', trigger: 'passive', name: 'Arcane Link', desc: 'When this unit takes damage, deal 1 damage to the nearest enemy.' },
  spell_echo:              { tier: 'rare', trigger: 'passive', name: 'Spell Echo', desc: 'Whenever you cast a spell, deal 1 damage to a random enemy.' },
  arcane_reflection:       { tier: 'rare', trigger: 'passive', name: 'Mirror Ward', desc: 'When this unit takes damage, reflect that damage back to the attacker.' },
  volcanic_death:          { tier: 'rare', trigger: 'onDeath', name: 'Volcanic Collapse', desc: 'On death, set all adjacent units (and units adjacent to them) to 1 HP.' },
  stone_shield:            { tier: 'rare', trigger: 'passive', name: 'Stone Shield', desc: 'When an adjacent ally would take damage, this unit takes it instead.' },
  ambush_deploy:           { tier: 'rare', trigger: 'passive', name: 'Ambush', desc: 'Can be deployed into the neutral middle rows.' },
  shadow_root:             { tier: 'rare', trigger: 'onAttack', name: 'Shadow Root', desc: 'On attack, the target cannot move next turn.' },
  moonflare_aura:          { tier: 'rare', trigger: 'passive', name: 'Moonflare Aura', desc: 'Adjacent allies gain +1 ATK and +1 HP.' },
  reflect_damage:          { tier: 'rare', trigger: 'passive', name: 'Thorns', desc: 'Reflects 1 damage back to attackers.' },
  bodyguard:               { tier: 'rare', trigger: 'passive', name: 'Bodyguard', desc: 'When an adjacent friendly unit takes damage, this unit takes 1 of that damage instead.' },
  consume_gem:             { tier: 'rare', trigger: 'passive', name: 'Gem Devourer', desc: 'Can attack friendly Gem Shard tokens to gain +2/+2.' },
  shield_aura:             { tier: 'rare', trigger: 'passive', name: 'Shield Aura', desc: 'Adjacent allies take 1 less damage.' },
  double_move:             { tier: 'rare', trigger: 'passive', name: 'Double Move', desc: 'Can move twice per turn.' },
  cleave:                  { tier: 'rare', trigger: 'passive', name: 'Cleave', desc: 'Deals half damage to enemies adjacent to its attack target.' },
  siege:                   { tier: 'rare', trigger: 'passive', name: 'Siege', desc: 'Deals double damage to row structures.' },
  burrow:                  { tier: 'rare', trigger: 'passive', name: 'Burrow', desc: 'Untargetable for 2 turns after deploying. Can deploy adjacent to allies.' },
  attack_aura:             { tier: 'rare', trigger: 'passive', name: 'Attack Aura', desc: 'Adjacent allies gain +1 ATK.' },
  half_damage_aura:        { tier: 'rare', trigger: 'passive', name: 'Splash Attacks', desc: 'Attacks also deal 1 splash damage to enemies adjacent to the target.' },
  draw_on_kill:            { tier: 'rare', trigger: 'onKill', name: 'Grave Robbing', desc: 'On kill, draw 1 card.' },
  ranged_pierce:           { tier: 'rare', trigger: 'passive', name: 'Piercing Shot', desc: 'Ranged (2 tiles). Ignores shield effects.' },
  weaken_aura:             { tier: 'rare', trigger: 'passive', name: 'Weaken Aura', desc: 'Adjacent enemies deal 1 less damage.' },
  root_aura:               { tier: 'rare', trigger: 'passive', name: 'Root Aura', desc: 'Adjacent enemies cannot move.' },
  grow_on_ally_death:      { tier: 'rare', trigger: 'passive', name: 'Vengeful Growth', desc: 'Gains +1/+1 whenever a friendly unit dies.' },

  // --- Legendary ---
  stacking_aura:           { tier: 'legendary', trigger: 'passive', name: 'Growing Presence', desc: "Buffs adjacent allies, starting at +1/+1 and growing +1/+1 each turn it doesn't move (max +4/+4). Resets if it moves." },
  rage_mode:               { tier: 'legendary', trigger: 'passive', name: "Berserker's Rage", desc: 'Gains +1 ATK for each HP it has lost.' },
  adapt_hp:                { tier: 'legendary', trigger: 'passive', name: 'Adaptive Growth', desc: 'Gains +1 max HP whenever it survives damage.' },
  absorb_ally:             { tier: 'legendary', trigger: 'passive', name: 'Absorption', desc: 'Can attack a friendly unit to absorb their stats.' },
  death_explosion:         { tier: 'legendary', trigger: 'onDeath', name: 'Final Detonation', desc: 'On death, deal 2 damage to all adjacent enemies.' },
  stampede:                { tier: 'legendary', trigger: 'passive', name: 'Stampede', desc: 'Can move up to 2 tiles. Deals +2 damage to structures.' },
  thick_bones:             { tier: 'legendary', trigger: 'passive', name: 'Thick Bones', desc: 'Takes 1 less damage from all sources.' },
  lifesteal_grow:          { tier: 'legendary', trigger: 'passive', name: 'Bloodthirst', desc: 'Lifesteal (heal 1 HP on attack). On kill, gain +1/+1.' },
  immortal:                { tier: 'legendary', trigger: 'passive', name: 'Immortal', desc: 'The first time this unit would die, it heals to full HP instead (once per game).' },
  lifesteal_lord:          { tier: 'legendary', trigger: 'passive', name: 'Vampiric Lordship', desc: 'Can attack diagonally. All friendly units gain Lifesteal.' },
  garnet_aura:             { tier: 'legendary', trigger: 'passive', name: 'Royal Decree', desc: 'Adjacent enemies have their ATK capped at 2. Adjacent allies gain +1 ATK.' },
  gem_transform:           { tier: 'legendary', trigger: 'onKill', name: 'Gem Curse', desc: 'On kill, transform the killed unit into a 1/1 Gem Shard. Gains +1 ATK per Gem Shard on the field.' },
  gem_death_aoe:           { tier: 'legendary', trigger: 'passive', name: 'Shattering Grief', desc: 'Whenever a friendly Gem Shard dies, all enemies take 1 damage.' },
  heal_on_kill:            { tier: 'legendary', trigger: 'onKill', name: 'Vengeful Healing', desc: 'On kill, heal 2 HP (can exceed max HP).' },
  energy_on_kill:          { tier: 'legendary', trigger: 'onKill', name: 'Energized Victory', desc: 'On kill, gain 1 energy.' },
  spawn_drone:             { tier: 'legendary', trigger: 'onKill', name: 'Brood Mother', desc: 'On kill, spawn a Void Drone token. Gains +1 ATK for each Void Drone you control.' },
  starlit_slayer:          { tier: 'legendary', trigger: 'onKill', name: 'Starlit Ascension', desc: 'On kill, gain 1 energy and permanently gain +1 ATK.' },
  star_strike:             { tier: 'legendary', trigger: 'startOfTurn', name: 'Star Strike', desc: 'At start of turn, deal 2 damage to a random enemy.' },
  red_wizard:              { tier: 'legendary', trigger: 'passive', name: 'Vital Resonance', desc: 'Whenever any unit on the field gains HP, this unit also gains +1 HP.' },
  blue_wizard:             { tier: 'legendary', trigger: 'passive', name: 'Power Resonance', desc: 'Whenever any unit on the field gains ATK, this unit also gains +1 ATK.' },
  time_rift:               { tier: 'legendary', trigger: 'onDeploy', name: 'Time Rift', desc: 'On deploy, resurrect a unit from your discard pile adjacent to this unit, with full stats.' },
  michael_rampage:         { tier: 'legendary', trigger: 'onKill', name: 'Relentless Assault', desc: 'The first kill each turn lets this unit move and attack again.' },
  uriel_wisdom:            { tier: 'legendary', trigger: 'passive', name: 'Arcane Wisdom', desc: 'Gain 1 energy whenever you draw a card. Draw a card whenever this unit kills an enemy.' },
  gabriel_wrath:           { tier: 'legendary', trigger: 'onAttack', name: 'Wrathful Strike', desc: 'On attack, deal 1 damage to all enemies in the same row as the target.' },
  raphael_shield:          { tier: 'legendary', trigger: 'passive', name: 'Guardian Ward', desc: 'Immune to damage when deployed. Allies within 3 tiles behind it take no damage.' },
  lucifer_curse:           { tier: 'legendary', trigger: 'startOfTurn', name: 'Hellfire Pact', desc: 'Can be deployed to any space on the board. At the start of each turn, deal 3 damage to your own heart.', extraFields: { deployAnywhere: true } }
};

const FACTION_CARDS = {
  'medieval':          ['peasant','squire','archer','manatarms','battlefieldmedic','knight','castlewalls','treasury','rally','shieldbearer','warhound','royalguard','siegeram','warbanner','shrine','armory','crusader','paladin'],
  'void-alien':        ['voiddrone','scavengerlarva','spittercrawler','phaseskirmisher','energyleech','burrowerbeast','psionicoverseer','neuralharvester','adaptivecolossus','sporetitan','voidbroodmother','eclipsedevourer','ufoscraper','assimilation','voidcollapse','hiveascension'],
  'western-skeleton':  ['bonedeputy','dustyrattler','graverobber','phantomscout','bonerevolver','undeadsheriff','coffintrapper','undertaker','thehangedman','ghostlystampede','bonecolossus','deadmanshand','mostwanted','shallowgrave','highnoon'],
  'crimson-court':     ['thrall','bloodfamiliar','nightstalker','cryptkeeper','vampirespawn','bloodpriest','soulcollector','nosferatu','coffin','bloodcountess','eldervampire','vampirelord','bloodpact','bloodtransfusion','crimsonrevival','sanguinefeast'],
  'jeweled-court':     ['rubysprite','emeraldforager','sapphiredancer','topazminer','amethystenchanter','diamondguardian','opaldevourer','pearlblessing','garnetqueen','moonstonewitch','prismaticfairy','gemstonecurse','fairyring'],
  'elunes-chosen':     ['moonsentinel','starweavearcher','moonlitbladedancer','lunarpriestess','twilightsrespite','huntinggodsblessing','stonegiant','nightshadeambusher','moonshadowwarden','elunesmoonwell','lunarprayer','moonflaresorceress','starlitchampion','starinvoker','templeofthemoon','lunarbarrage'],
  'dragon-wizard':     ['wizardsrune','meditationmonk','wyrmwhelp','cinderwing','manasiphonmage','arcanetether','stormdrake','mirrorwizard','volcanicdragon','redwizard','bluewizard','chronodrake','polymorph','manadrain','arcanesurge'],
  'celestial-host':    ['cherubhymnist','angelicattendant','maidenofvirtue','angelofdestruction','seraphichunter','archangelmichael','archangeluriel','archangelgabriel','archangelraphael','luciferfallenangel','gardenofeden','blessingofmight','blessingofvigor','blessingofprotection','blessingofkings','angelicdescent','heavenlyrescue','layonhands','resurrection','wrathofgod'],
  '8bit-battalion':    ['slimesprite','skeletonwarrior8bit','barrel','healerfairy','bosskey','newgameplus','knighterrant','pixelproducer','cheatcode','savestate','wizardnpc','finalboss','resetbutton','ragequit']
};

const FACTION_NAMES = {
  'medieval':         'Medieval Kingdom',
  'void-alien':       'Void Alien',
  'western-skeleton': 'Western Skeleton',
  'crimson-court':    'Crimson Court',
  'jeweled-court':    'Jeweled Court',
  'elunes-chosen':    "Elune's Chosen",
  'dragon-wizard':    'Dragon Wizard',
  'celestial-host':   'Celestial Host',
  '8bit-battalion':   '8-Bit Battalion'
};

// Campaign Bosses Definition
const CAMPAIGN_BOSSES = [
  {
    id: 1,
    name: "The Void Scout",
    description: "A lone alien scout testing Earth's defenses",
    deckId: "void-alien",
    challengeDeckId: "void-alien-challenge", // Challenge mode deck
    difficulty: "easy",
    aiLevel: 1,
    cardRewards: ['voiddrone', 'scavengerlarva', 'spittercrawler', 'phaseskirmisher', 'energyleech', 'burrowerbeast', 'psionicoverseer', 'neuralharvester', 'adaptivecolossus', 'sporetitan', 'voidbroodmother', 'eclipsedevourer', 'ufoscraper', 'assimilation', 'voidcollapse', 'hiveascension'],
    unlocks: {
      music: 'void-alien',
      background: 'void-alien'
    },
    eventType: 'void_collapse', // Black hole event every 3 boss turns
    eventConfig: {
      turnInterval: 3, // Every 3 boss turns
      startSize: 2,    // Starts as 2x2
      maxSize: 3,      // Grows up to 3x3
      growthRate: 1    // Grows by 1 each occurrence
    }
  },
  {
    id: 2,
    name: "The Dead Sheriff",
    description: "An undead lawman risen from Boot Hill to enforce his own twisted justice",
    deckId: "western-skeleton",
    challengeDeckId: "western-skeleton-challenge",
    difficulty: "medium",
    aiLevel: 2,
    requiresBoss: 1,
    cardRewards: ['bonedeputy', 'dustyrattler', 'graverobber', 'phantomscout', 'bonerevolver', 'undeadsheriff', 'coffintrapper', 'undertaker', 'thehangedman', 'ghostlystampede', 'bonecolossus', 'deadmanshand', 'mostwanted', 'shallowgrave', 'highnoon'],
    unlocks: {
      music: 'western-skeleton',
      background: 'western-skeleton'
    },
    eventType: 'ghost_train',
    eventConfig: {
      turnInterval: 3,    // Every 3 boss turns
      startLines: 1,      // Starts hitting 1 row/column
      maxLines: 4,        // Max 4 rows/columns at once
      growthRate: 1       // Grows by 1 each occurrence
    }
  },
  {
    id: 3,
    name: "The Blood Countess",
    description: "An ancient vampire queen who has fed on countless souls",
    deckId: "crimson-court",
    challengeDeckId: "crimson-court-challenge",
    difficulty: "hard",
    aiLevel: 3,
    requiresBoss: 2,
    cardRewards: ['thrall', 'bloodfamiliar', 'nightstalker', 'cryptkeeper', 'vampirespawn', 'bloodpriest', 'soulcollector', 'nosferatu', 'coffin', 'bloodcountess', 'eldervampire', 'vampirelord', 'bloodpact', 'bloodtransfusion', 'crimsonrevival', 'sanguinefeast'],
    unlocks: {
      music: 'crimson-court',
      background: 'crimson-court'
    },
    eventType: 'blood_chalice',
    eventConfig: {
      turnInterval: 3,    // Every 3 boss turns
      startCount: 3,      // Starts with 3 chalices
      maxCount: 6,        // Max 6 chalices
      growthRate: 1       // Grows by 1 each occurrence
    }
  },
  {
    id: 4,
    name: "The Garnet Queen",
    description: "A dazzling fairy monarch who commands the power of precious gems",
    deckId: "jeweled-court",
    challengeDeckId: "jeweled-court-challenge",
    difficulty: "hard",
    aiLevel: 3,
    requiresBoss: 3,
    cardRewards: ['rubysprite', 'emeraldforager', 'sapphiredancer', 'topazminer', 'amethystenchanter', 'diamondguardian', 'opaldevourer', 'pearlblessing', 'garnetqueen', 'moonstonewitch', 'prismaticfairy', 'gemstonecurse', 'fairyring'],
    unlocks: {
      music: 'jeweled-court',
      background: 'jeweled-court'
    },
    eventType: 'gem_rain',
    eventConfig: {
      turnInterval: 3,    // Every 3 boss turns
      startCount: 3,      // Starts with 3 gems
      maxCount: 7,        // Max 7 gems
      growthRate: 1       // Grows by 1 each occurrence
    }
  },
  {
    id: 5,
    name: "Moon Shadow Sentinel",
    description: "An ancient guardian empowered by Elune's blessing, commanding the forces of the night",
    deckId: "elunes-chosen",
    challengeDeckId: "elunes-chosen-challenge",
    difficulty: "hard",
    aiLevel: 3,
    requiresBoss: 4,
    cardRewards: ['moonsentinel', 'starweavearcher', 'moonlitbladedancer', 'lunarpriestess', 'twilightsrespite', 'huntinggodsblessing', 'stonegiant', 'nightshadeambusher', 'moonshadowwarden', 'elunesmoonwell', 'lunarprayer', 'moonflaresorceress', 'starlitchampion', 'starinvoker', 'templeofthemoon', 'lunarbarrage'],
    unlocks: {
      music: 'elunes-chosen',
      background: 'elunes-chosen'
    },
    eventType: 'eclipse',
    eventConfig: {
      turnInterval: 3    // Every 3 boss turns
    }
  },
  {
    id: 6,
    name: "The Arcane Dragonlord",
    description: "A legendary wizard who has bonded with ancient dragons, wielding devastating spell-fire",
    deckId: "dragon-wizard",
    challengeDeckId: "dragon-wizard-challenge",
    difficulty: "hard",
    aiLevel: 3,
    requiresBoss: 5,
    cardRewards: ['meditationmonk', 'wyrmwhelp', 'runescribe', 'cinderwing', 'manasiphonmage', 'arcanetether', 'stormdrake', 'mirrorwizard', 'volcanicdragon', 'redwizard', 'bluewizard', 'chronodrake', 'polymorph', 'manadrain', 'overchargebolt', 'arcanerift', 'dragonsfury'],
    unlocks: {
      music: 'dragon-wizard',
      background: 'dragon-wizard'
    },
    eventType: 'polymorph',
    eventConfig: {
      turnInterval: 3,    // Every 3 boss turns, polymorph activates
      duration: 2         // Lasts for 2 turns
    }
  },
  {
    id: 7,
    name: "The Seraph of Judgment",
    description: "A divine archangel who commands the celestial host with righteous fury and holy protection",
    deckId: "celestial-host",
    challengeDeckId: "celestial-host-challenge",
    difficulty: "hard",
    aiLevel: 3,
    requiresBoss: 6,
    cardRewards: ['cherubhymnist', 'angelicattendant', 'maidenofvirtue', 'angelofdestruction', 'seraphichunter', 'archangelmichael', 'archangeluriel', 'archangelgabriel', 'archangelraphael', 'luciferfallenangel', 'gardenofeden', 'blessingofmight', 'blessingofvigor', 'blessingofprotection', 'blessingofkings', 'angelicdescent', 'heavenlyrescue', 'layonhands', 'resurrection', 'wrathofgod'],
    unlocks: {
      music: 'celestial-host',
      background: 'celestial-host'
    },
    eventType: 'divine_judgment',
    eventConfig: {
      turnInterval: 3,    // Every 3 boss turns
      duration: 2,        // Pride/Violence effects last 2 turns
      wrathDamage: 2,     // Damage dealt to Wrathful units (4+ ATK)
      atkThreshold: 4     // ATK threshold for Wrath
    }
  },
  {
    id: 8,
    name: "The Final Boss",
    description: "A glitched-out retro nightmare that gets stronger the more you hurt it. Good luck!",
    deckId: "8bit-battalion",
    challengeDeckId: "8bit-battalion-challenge",
    difficulty: "hard",
    aiLevel: 3,
    requiresBoss: 7,
    cardRewards: ['slimesprite', 'skeletonwarrior8bit', 'barrel', 'healerfairy', 'bosskey', 'newgameplus', 'knighterrant', 'pixelproducer', 'cheatcode', 'savestate', 'wizardnpc', 'finalboss', 'resetbutton', 'ragequit'],
    unlocks: {
      music: '8bit-battalion',
      background: '8bit-battalion'
    },
    eventType: 'cheat_code',
    eventConfig: {
      turnInterval: 3,    // Every 3 boss turns
      duration: 2         // Duration for HESOYAM and GREEDISGOOD effects
    }
  }
];

// Admin credentials (for playtesting)
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'gridmaster2024';

// Auth helper functions
const authHelpers = {
  async register(username, password) {
    // Validate
    if (!username || username.length < 3 || username.length > 20) {
      throw new Error('Username must be 3-20 characters');
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      throw new Error('Username can only contain letters, numbers, and underscores');
    }
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }
    
    // Check if trying to register as admin
    if (username.toLowerCase() === ADMIN_USERNAME) {
      throw new Error('Username not available');
    }
    
    // Check if username exists
    const existing = await User.findOne({ username: username.toLowerCase() });
    if (existing) {
      throw new Error('Username already taken');
    }
    
    // Hash password and create user
    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({
      username: username.toLowerCase(),
      passwordHash
    });
    
    await user.save();
    return user.toPublicJSON();
  },
  
  async login(username, password) {
    // Check for admin login
    if (username.toLowerCase() === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      return {
        id: 'admin',
        username: 'Admin',
        isAdmin: true,
        campaign: {
          currentLevel: 999,
          completedLevels: [1, 2, 3, 4, 5, 6, 7, 8],
          stars: { '1': 3, '2': 3, '3': 3, '4': 3, '5': 3, '6': 3, '7': 3, '8': 3 },
          defeatedBosses: ['void-alien', 'western-skeleton', 'crimson-court', 'jeweled-court', 'elunes-chosen', 'dragon-wizard', 'celestial-host', '8bit-battalion'],
          challengeCompleted: { '1': true, '2': true, '3': true, '4': true, '5': true, '6': true, '7': true, '8': true }
        },
        cardCollection: getAllCards(),
        holoCollection: getAllHolos(),
        unlockedDecks: ['medieval', 'void-alien', 'western-skeleton', 'crimson-court', 'jeweled-court', 'elunes-chosen', 'dragon-wizard', 'celestial-host', '8bit-battalion'],
        unlockedMusic: ['medieval', 'void-alien', 'western-skeleton', 'crimson-court', 'jeweled-court', 'elunes-chosen', 'dragon-wizard', 'celestial-host', '8bit-battalion'],
        unlockedBackgrounds: ['medieval', 'void-alien', 'western-skeleton', 'crimson-court', 'jeweled-court', 'elunes-chosen', 'dragon-wizard', 'celestial-host', '8bit-battalion'],
        customDecks: [],
        preferences: { selectedDeck: 'medieval' },
        stats: { gamesPlayed: 999, gamesWon: 999, campaignWins: 999, challengeWins: 24 },
        achievements: getAllAchievementsUnlocked(),
        gold: 99999
      };
    }
    
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      throw new Error('Invalid username or password');
    }
    
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new Error('Invalid username or password');
    }
    
    return user.toPublicJSON();
  },
  
  async changeUsername(userId, password, newUsername) {
    if (userId === 'admin') throw new Error('Cannot change admin username');
    if (!newUsername || newUsername.length < 3 || newUsername.length > 20) {
      throw new Error('Username must be 3-20 characters');
    }
    if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) {
      throw new Error('Username can only contain letters, numbers, and underscores');
    }
    if (newUsername.toLowerCase() === ADMIN_USERNAME) throw new Error('Username not available');

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const isMatch = await user.comparePassword(password);
    if (!isMatch) throw new Error('Incorrect password');

    const existing = await User.findOne({ username: newUsername.toLowerCase() });
    if (existing) throw new Error('Username already taken');

    user.username = newUsername.toLowerCase();
    await user.save();
    return user.toPublicJSON();
  },

  async changePassword(userId, currentPassword, newPassword) {
    if (userId === 'admin') throw new Error('Cannot change admin password');
    if (!newPassword || newPassword.length < 6) throw new Error('Password must be at least 6 characters');

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) throw new Error('Incorrect current password');

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    return true;
  },

  async deleteAccount(userId, password) {
    if (userId === 'admin') throw new Error('Cannot delete admin account');
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    const isMatch = await user.comparePassword(password);
    if (!isMatch) throw new Error('Incorrect password');
    await User.deleteOne({ _id: userId });
    return true;
  },

  async adminResetPassword(username, newPassword) {
    const user = await User.findOne({ username });
    if (!user) throw new Error(`No account found with username "${username}"`);
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    return { username: user.username, email: user.email || '(no email set)' };
  },

  async getUser(userId) {
    if (userId === 'admin') return null; // Admin doesn't persist
    const user = await User.findById(userId);
    if (!user) return null;
    return user.toPublicJSON();
  },
  
  async updateUser(userId, updates) {
    if (userId === 'admin') return null;
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    
    // Apply allowed updates
    if (updates.preferences) {
      user.preferences = { ...user.preferences, ...updates.preferences };
    }
    if (updates.customDecks !== undefined) {
      user.customDecks = updates.customDecks;
    }
    
    await user.save();
    return user.toPublicJSON();
  },
  
  async addCardToCollection(userId, cardKey) {
    if (userId === 'admin') return null;
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    
    const currentCount = user.cardCollection.get(cardKey) || 0;
    user.cardCollection.set(cardKey, currentCount + 1);
    
    await user.save();
    return user.toPublicJSON();
  },
  
  async completeBoss(userId, bossId, stars, aiLevel = 2, isChallenge = false) {
    // Rarity chances based on difficulty
    // Easy (1): 8% rare, 1% legendary
    // Medium (2): 12% rare, 3% legendary  
    // Hard (3): 18% rare, 5% legendary
    // Challenge (4): 25% rare, 10% legendary (best odds, but still max 10% legendary)
    const rarityChances = {
      1: { rare: 0.08, legendary: 0.01 },   // Easy
      2: { rare: 0.12, legendary: 0.03 },   // Medium
      3: { rare: 0.18, legendary: 0.05 },   // Hard
      4: { rare: 0.25, legendary: 0.10 }    // Challenge
    };
    
    const chances = rarityChances[aiLevel] || rarityChances[2];
    
    // Helper to pick a card based on rarity roll
    const pickCardByRarity = (availableCards) => {
      const roll = Math.random();
      let targetRarity;
      
      if (roll < chances.legendary) {
        targetRarity = 'legendary';
      } else if (roll < chances.legendary + chances.rare) {
        targetRarity = 'rare';
      } else {
        targetRarity = 'common';
      }
      
      // Filter cards by target rarity
      let pool = availableCards.filter(card => CARD_RARITIES[card] === targetRarity);
      
      // If no cards of that rarity available, fall back to any available card
      if (pool.length === 0) {
        // Try lower rarities
        if (targetRarity === 'legendary') {
          pool = availableCards.filter(card => CARD_RARITIES[card] === 'rare');
        }
        if (pool.length === 0) {
          pool = availableCards.filter(card => CARD_RARITIES[card] === 'common');
        }
        if (pool.length === 0) {
          pool = availableCards; // Just pick anything
        }
      }
      
      if (pool.length === 0) return null;
      return pool[Math.floor(Math.random() * pool.length)];
    };
    
    if (userId === 'admin') {
      // Admin still gets the reward display but nothing persists
      const boss = CAMPAIGN_BOSSES.find(b => b.id === bossId);
      const rewardCards = [];
      for (let i = 0; i < 3; i++) {
        const card = pickCardByRarity(boss.cardRewards);
        if (card) rewardCards.push({ card, isHolo: isChallenge });
      }
      return {
        user: null,
        rewards: {
          cards: rewardCards,
          isHolo: isChallenge,
          music: boss.unlocks.music,
          background: boss.unlocks.background
        }
      };
    }
    
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    
    const boss = CAMPAIGN_BOSSES.find(b => b.id === bossId);
    if (!boss) throw new Error('Boss not found');
    
    // Mark as completed
    if (!user.campaign.completedLevels.includes(bossId)) {
      user.campaign.completedLevels.push(bossId);
    }
    
    // Update stars if better (challenge mode = 4 stars)
    const currentStars = user.campaign.stars.get(String(bossId)) || 0;
    if (stars > currentStars) {
      user.campaign.stars.set(String(bossId), stars);
    }
    
    // Add to defeated bosses
    if (!user.campaign.defeatedBosses.includes(boss.deckId)) {
      user.campaign.defeatedBosses.push(boss.deckId);
    }
    
    // Unlock next level
    if (bossId >= user.campaign.currentLevel) {
      user.campaign.currentLevel = bossId + 1;
    }
    
    // Unlock music/background if boss has them
    if (boss.unlocks.music) {
      if (!user.unlockedMusic.includes(boss.unlocks.music)) {
        user.unlockedMusic.push(boss.unlocks.music);
      }
    }
    if (boss.unlocks.background) {
      if (!user.unlockedBackgrounds.includes(boss.unlocks.background)) {
        user.unlockedBackgrounds.push(boss.unlocks.background);
      }
    }
    
    // Unlock the deck
    if (!user.unlockedDecks.includes(boss.deckId)) {
      user.unlockedDecks.push(boss.deckId);
    }
    
    // Random card rewards (3 cards) - no cap on collection, always can get cards
    // Challenge mode gives HOLO cards instead of regular
    const rewardCards = [];
    
    // Initialize holoCollection if it doesn't exist
    if (!user.holoCollection) {
      user.holoCollection = new Map();
    }
    
    for (let i = 0; i < 3; i++) {
      // All cards from boss are available - no max cap on collection
      const availableCards = boss.cardRewards;
      
      if (availableCards.length > 0) {
        const selectedCard = pickCardByRarity(availableCards);
        if (selectedCard) {
          rewardCards.push({ card: selectedCard, isHolo: isChallenge });
          
          if (isChallenge) {
            // Add to holo collection
            const currentCount = user.holoCollection.get(selectedCard) || 0;
            user.holoCollection.set(selectedCard, currentCount + 1);
          } else {
            // Add to regular collection
            const currentCount = user.cardCollection.get(selectedCard) || 0;
            user.cardCollection.set(selectedCard, currentCount + 1);
          }
        }
      }
    }
    
    // Update stats
    user.stats.campaignWins++;

    // Award achievements
    const newAchievements = checkAndAwardAchievements(user);

    await user.save();

    return {
      user: user.toPublicJSON(),
      rewards: {
        cards: rewardCards,
        isHolo: isChallenge,
        music: boss.unlocks.music,
        background: boss.unlocks.background
      },
      newAchievements
    };
  }
};

// Helper to get all cards for admin
function getAllCards() {
  const allCards = {};
  // Medieval cards
  ['peasant', 'squire', 'archer', 'manatarms', 'shieldbearer', 'warhound', 'battlefieldmedic',
   'knight', 'crusader', 'royalguard', 'paladin', 'siegeram', 'warbanner', 'shrine', 'armory',
   'castlewalls', 'treasury', 'rally'].forEach(c => allCards[c] = 10);
  // Alien cards
  ['voiddrone', 'scavengerlarva', 'spittercrawler', 'phaseskirmisher', 'energyleech', 
   'burrowerbeast', 'psionicoverseer', 'neuralharvester', 'adaptivecolossus', 'sporetitan',
   'voidbroodmother', 'eclipsedevourer', 'ufoscraper', 'assimilation', 'voidcollapse', 
   'hiveascension'].forEach(c => allCards[c] = 10);
  // Western Skeleton cards
  ['bonedeputy', 'dustyrattler', 'graverobber', 'phantomscout', 'bonerevolver', 'undeadsheriff',
   'coffintrapper', 'undertaker', 'thehangedman', 'ghostlystampede', 'bonecolossus',
   'deadmanshand', 'mostwanted', 'shallowgrave', 'highnoon'].forEach(c => allCards[c] = 10);
  // Crimson Court cards
  ['thrall', 'bloodfamiliar', 'nightstalker', 'cryptkeeper', 'vampirespawn', 'bloodpriest',
   'soulcollector', 'nosferatu', 'coffin', 'bloodcountess', 'eldervampire', 'vampirelord',
   'bloodpact', 'bloodtransfusion', 'crimsonrevival', 'sanguinefeast'].forEach(c => allCards[c] = 10);
  // Jeweled Court cards
  ['rubysprite', 'emeraldforager', 'sapphiredancer', 'topazminer', 'amethystenchanter',
   'diamondguardian', 'opaldevourer', 'pearlblessing', 'garnetqueen', 'moonstonewitch',
   'prismaticfairy', 'gemstonecurse', 'fairyring'].forEach(c => allCards[c] = 10);
  // Elune's Chosen cards
  ['moonsentinel', 'starweavearcher', 'moonlitbladedancer', 'lunarpriestess', 'twilightsrespite',
   'huntinggodsblessing', 'stonegiant', 'nightshadeambusher', 'moonshadowwarden', 'elunesmoonwell',
   'lunarprayer', 'moonflaresorceress', 'starlitchampion', 'starinvoker', 'templeofthemoon',
   'lunarbarrage'].forEach(c => allCards[c] = 10);
  // Dragon Wizard cards
  ['wizardsrune', 'meditationmonk', 'wyrmwhelp', 'cinderwing', 'manasiphonmage', 'arcanetether',
   'stormdrake', 'mirrorwizard', 'volcanicdragon', 'redwizard', 'bluewizard', 'chronodrake',
   'polymorph', 'manadrain', 'arcanesurge'].forEach(c => allCards[c] = 10);
  // Celestial Host cards
  ['cherubhymnist', 'angelicattendant', 'maidenofvirtue', 'angelofdestruction', 'seraphichunter',
   'archangelmichael', 'archangeluriel', 'archangelgabriel', 'archangelraphael', 'luciferfallenangel',
   'gardenofeden', 'blessingofmight', 'blessingofvigor', 'blessingofprotection', 'blessingofkings',
   'angelicdescent', 'heavenlyrescue', 'layonhands', 'resurrection', 'wrathofgod'].forEach(c => allCards[c] = 10);
  // 8-Bit Battalion cards
  ['slimesprite', 'skeletonwarrior8bit', 'barrel', 'healerfairy', 'bosskey', 'newgameplus',
   'knighterrant', 'pixelproducer', 'cheatcode', 'savestate', 'wizardnpc', 'finalboss',
   'resetbutton', 'ragequit'].forEach(c => allCards[c] = 10);
  return allCards;
}

// Helper to get all holos for admin
function getAllHolos() {
  const allHolos = {};
  // Give admin 3 holos of every card
  Object.keys(getAllCards()).forEach(c => allHolos[c] = 3);
  return allHolos;
}

// ==================== ACHIEVEMENTS SYSTEM ====================

const ACHIEVEMENTS = {
  // ===== BOSS VICTORIES (6) =====
  boss_void: {
    id: 'boss_void',
    name: 'Void Vanquisher',
    description: 'Defeat The Void Scout',
    icon: '👽',
    category: 'boss'
  },
  boss_skeleton: {
    id: 'boss_skeleton',
    name: 'Sheriff Slayer',
    description: 'Defeat The Dead Sheriff',
    icon: '🤠',
    category: 'boss'
  },
  boss_vampire: {
    id: 'boss_vampire',
    name: 'Countess Crusher',
    description: 'Defeat The Blood Countess',
    icon: '🧛',
    category: 'boss'
  },
  boss_fairy: {
    id: 'boss_fairy',
    name: 'Gem Breaker',
    description: 'Defeat The Garnet Queen',
    icon: '🧚',
    category: 'boss'
  },
  boss_elf: {
    id: 'boss_elf',
    name: "Moon's Eclipse",
    description: 'Defeat Moon Shadow Sentinel',
    icon: '🌙',
    category: 'boss'
  },
  boss_dragon: {
    id: 'boss_dragon',
    name: 'Dragon Slayer',
    description: 'Defeat The Arcane Dragonlord',
    icon: '🐉',
    category: 'boss'
  },
  boss_seraph: {
    id: 'boss_seraph',
    name: 'Judgment Passed',
    description: 'Defeat The Seraph of Judgment',
    icon: '😇',
    category: 'boss'
  },
  boss_final: {
    id: 'boss_final',
    name: 'Game Over',
    description: 'Defeat The Final Boss',
    icon: '👾',
    category: 'boss'
  },

  // ===== CHALLENGE MODE (3) =====
  challenge_first: {
    id: 'challenge_first',
    name: 'Challenger',
    description: 'Beat your first Challenge Boss',
    icon: '⚔️',
    category: 'challenge'
  },
  challenge_three: {
    id: 'challenge_three',
    name: 'Challenge Accepted',
    description: 'Beat 3 Challenge Bosses',
    icon: '⚔️',
    category: 'challenge',
    threshold: 3
  },
  challenge_all: {
    id: 'challenge_all',
    name: 'Ultimate Champion',
    description: 'Beat ALL Challenge Bosses',
    icon: '👑',
    category: 'challenge',
    reward: { type: 'mat', id: 'golden' }
  },

  // ===== CAMPAIGN COMPLETION (3) =====
  campaign_half: {
    id: 'campaign_half',
    name: 'Halfway There',
    description: 'Beat 3 Campaign Bosses',
    icon: '🏆',
    category: 'campaign'
  },
  campaign_complete: {
    id: 'campaign_complete',
    name: 'Campaign Victor',
    description: 'Beat all 8 Campaign Bosses',
    icon: '🏆',
    category: 'campaign',
    reward: { type: 'background', id: 'champion' }
  },
  campaign_perfect: {
    id: 'campaign_perfect',
    name: 'Perfectionist',
    description: 'Get 3 stars on all Campaign Bosses',
    icon: '⭐',
    category: 'campaign',
    reward: { type: 'music', id: 'starlight' }
  },

  // ===== WINS (8) =====
  wins_1: {
    id: 'wins_1',
    name: 'First Blood',
    description: 'Win your first game',
    icon: '🎯',
    category: 'wins',
    threshold: 1
  },
  wins_10: {
    id: 'wins_10',
    name: 'Getting Started',
    description: 'Win 10 games',
    icon: '🎯',
    category: 'wins',
    threshold: 10
  },
  wins_25: {
    id: 'wins_25',
    name: 'Competitor',
    description: 'Win 25 games',
    icon: '🎯',
    category: 'wins',
    threshold: 25
  },
  wins_50: {
    id: 'wins_50',
    name: 'Veteran',
    description: 'Win 50 games',
    icon: '🎯',
    category: 'wins',
    threshold: 50
  },
  wins_100: {
    id: 'wins_100',
    name: 'Centurion',
    description: 'Win 100 games',
    icon: '🎯',
    category: 'wins',
    threshold: 100,
    reward: { type: 'background', id: 'warrior' }
  },
  wins_250: {
    id: 'wins_250',
    name: 'Elite',
    description: 'Win 250 games',
    icon: '🎯',
    category: 'wins',
    threshold: 250
  },
  wins_500: {
    id: 'wins_500',
    name: 'Legendary',
    description: 'Win 500 games',
    icon: '🎯',
    category: 'wins',
    threshold: 500,
    reward: { type: 'music', id: 'legend' }
  },
  wins_1000: {
    id: 'wins_1000',
    name: 'Immortal',
    description: 'Win 1000 games',
    icon: '🎯',
    category: 'wins',
    threshold: 1000
  },

  // ===== GAMES PLAYED (4) =====
  games_50: {
    id: 'games_50',
    name: 'Regular',
    description: 'Play 50 games',
    icon: '🎮',
    category: 'games',
    threshold: 50
  },
  games_100: {
    id: 'games_100',
    name: 'Dedicated',
    description: 'Play 100 games',
    icon: '🎮',
    category: 'games',
    threshold: 100
  },
  games_250: {
    id: 'games_250',
    name: 'Committed',
    description: 'Play 250 games',
    icon: '🎮',
    category: 'games',
    threshold: 250
  },
  games_500: {
    id: 'games_500',
    name: 'Devoted',
    description: 'Play 500 games',
    icon: '🎮',
    category: 'games',
    threshold: 500,
    reward: { type: 'background', id: 'veteran' }
  },

  // ===== KILLS (8) =====
  kills_10: {
    id: 'kills_10',
    name: 'First Kills',
    description: 'Kill 10 enemy units',
    icon: '💀',
    category: 'kills',
    threshold: 10
  },
  kills_50: {
    id: 'kills_50',
    name: 'Soldier',
    description: 'Kill 50 enemy units',
    icon: '💀',
    category: 'kills',
    threshold: 50
  },
  kills_100: {
    id: 'kills_100',
    name: 'Warrior',
    description: 'Kill 100 enemy units',
    icon: '💀',
    category: 'kills',
    threshold: 100
  },
  kills_250: {
    id: 'kills_250',
    name: 'Slayer',
    description: 'Kill 250 enemy units',
    icon: '💀',
    category: 'kills',
    threshold: 250
  },
  kills_500: {
    id: 'kills_500',
    name: 'Destroyer',
    description: 'Kill 500 enemy units',
    icon: '💀',
    category: 'kills',
    threshold: 500
  },
  kills_1000: {
    id: 'kills_1000',
    name: 'Annihilator',
    description: 'Kill 1000 enemy units',
    icon: '💀',
    category: 'kills',
    threshold: 1000
  },
  kills_2500: {
    id: 'kills_2500',
    name: 'Death Incarnate',
    description: 'Kill 2500 enemy units',
    icon: '💀',
    category: 'kills',
    threshold: 2500
  },
  kills_5000: {
    id: 'kills_5000',
    name: 'Genocide',
    description: 'Kill 5000 enemy units',
    icon: '💀',
    category: 'kills',
    threshold: 5000,
    reward: { type: 'background', id: 'crimson' }
  },

  // ===== DAMAGE (4) =====
  damage_500: {
    id: 'damage_500',
    name: 'Damage Dealer',
    description: 'Deal 500 total damage',
    icon: '💥',
    category: 'damage',
    threshold: 500
  },
  damage_1000: {
    id: 'damage_1000',
    name: 'Heavy Hitter',
    description: 'Deal 1000 total damage',
    icon: '💥',
    category: 'damage',
    threshold: 1000
  },
  damage_2500: {
    id: 'damage_2500',
    name: 'Devastator',
    description: 'Deal 2500 total damage',
    icon: '💥',
    category: 'damage',
    threshold: 2500
  },
  damage_5000: {
    id: 'damage_5000',
    name: 'Cataclysm',
    description: 'Deal 5000 total damage',
    icon: '💥',
    category: 'damage',
    threshold: 5000,
    reward: { type: 'mat', id: 'inferno' }
  },

  // ===== CARDS PLAYED (4) =====
  cards_100: {
    id: 'cards_100',
    name: 'Card Slinger',
    description: 'Play 100 cards',
    icon: '🃏',
    category: 'cards',
    threshold: 100
  },
  cards_250: {
    id: 'cards_250',
    name: 'Card Shark',
    description: 'Play 250 cards',
    icon: '🃏',
    category: 'cards',
    threshold: 250
  },
  cards_500: {
    id: 'cards_500',
    name: 'Card Master',
    description: 'Play 500 cards',
    icon: '🃏',
    category: 'cards',
    threshold: 500
  },
  cards_1000: {
    id: 'cards_1000',
    name: 'Card Legend',
    description: 'Play 1000 cards',
    icon: '🃏',
    category: 'cards',
    threshold: 1000,
    reward: { type: 'mat', id: 'arcane' }
  },

  // ===== COLLECTION (5) =====
  collect_25: {
    id: 'collect_25',
    name: 'Card Collector',
    description: 'Collect 25 unique cards',
    icon: '📚',
    category: 'collection',
    threshold: 25
  },
  collect_50: {
    id: 'collect_50',
    name: 'Archivist',
    description: 'Collect 50 unique cards',
    icon: '📚',
    category: 'collection',
    threshold: 50
  },
  collect_all: {
    id: 'collect_all',
    name: 'Complete Collection',
    description: 'Collect all cards in the game',
    icon: '📚',
    category: 'collection'
  },
  holo_first: {
    id: 'holo_first',
    name: 'Shiny!',
    description: 'Get your first holographic card',
    icon: '✨',
    category: 'collection'
  },
  holo_10: {
    id: 'holo_10',
    name: 'Holo Hunter',
    description: 'Collect 10 holographic cards',
    icon: '✨',
    category: 'collection',
    threshold: 10,
    reward: { type: 'mat', id: 'prismatic' }
  },

  // ===== PVP (4) =====
  pvp_first: {
    id: 'pvp_first',
    name: 'Duelist',
    description: 'Win your first PvP game',
    icon: '🤺',
    category: 'pvp'
  },
  pvp_10: {
    id: 'pvp_10',
    name: 'Gladiator',
    description: 'Win 10 PvP games',
    icon: '🤺',
    category: 'pvp',
    threshold: 10
  },
  pvp_25: {
    id: 'pvp_25',
    name: 'Champion',
    description: 'Win 25 PvP games',
    icon: '🤺',
    category: 'pvp',
    threshold: 25
  },
  pvp_50: {
    id: 'pvp_50',
    name: 'Arena Master',
    description: 'Win 50 PvP games',
    icon: '🤺',
    category: 'pvp',
    threshold: 50,
    reward: { type: 'background', id: 'arena' }
  },

  // ===== SPECIAL FEATS (11) =====
  perfect_win: {
    id: 'perfect_win',
    name: 'Flawless Victory',
    description: 'Win a game without losing any row HP',
    icon: '🌟',
    category: 'special'
  },
  quick_win: {
    id: 'quick_win',
    name: 'Speed Demon',
    description: 'Win a game in under 10 turns',
    icon: '⚡',
    category: 'special'
  },
  comeback: {
    id: 'comeback',
    name: 'Comeback King',
    description: 'Win a game after being reduced to 5 or less Heart HP',
    icon: '🔥',
    category: 'special'
  },
  overkill: {
    id: 'overkill',
    name: 'Overkill',
    description: 'Deal 20+ damage to the enemy heart in a single turn',
    icon: '💢',
    category: 'special'
  },
  board_clear: {
    id: 'board_clear',
    name: 'Board Wipe',
    description: 'Destroy 5 or more enemy units in a single turn',
    icon: '🧹',
    category: 'special'
  },
  big_unit: {
    id: 'big_unit',
    name: 'Juggernaut',
    description: 'Have a unit with 15+ ATK',
    icon: '💪',
    category: 'special'
  },
  survivor: {
    id: 'survivor',
    name: 'Survivor',
    description: 'Have a unit with 20+ HP',
    icon: '🛡️',
    category: 'special'
  },
  energy_hoarder: {
    id: 'energy_hoarder',
    name: 'Energy Hoarder',
    description: 'End a turn with 10 energy',
    icon: '⚡',
    category: 'special'
  },
  win_streak_5: {
    id: 'win_streak_5',
    name: 'Hot Streak',
    description: 'Win 5 games in a row',
    icon: '🔥',
    category: 'special',
    threshold: 5
  },
  win_streak_10: {
    id: 'win_streak_10',
    name: 'Unstoppable',
    description: 'Win 10 games in a row',
    icon: '🔥',
    category: 'special',
    threshold: 10,
    reward: { type: 'mat', id: 'dominator' }
  },
  deck_builder: {
    id: 'deck_builder',
    name: 'Architect',
    description: 'Create a custom deck',
    icon: '🏗️',
    category: 'special'
  },

  // ===== UNIQUE FEATS (with rewards) =====
  phoenix_win: {
    id: 'phoenix_win',
    name: 'Phoenix',
    description: 'Win with exactly 1 Heart HP remaining',
    icon: '🔥',
    category: 'special',
    reward: { type: 'mat', id: 'phoenix' }
  },
  executioner: {
    id: 'executioner',
    name: 'Executioner',
    description: 'One-shot the enemy heart (30+ damage in one attack)',
    icon: '⚔️',
    category: 'special',
    reward: { type: 'background', id: 'executioner' }
  },
  spell_only_win: {
    id: 'spell_only_win',
    name: 'Mystic',
    description: 'Win a game using only spells (no unit attacks)',
    icon: '🔮',
    category: 'special',
    reward: { type: 'music', id: 'mystic' }
  }
};

const BOSS_ID_TO_ACHIEVEMENT = {
  1: 'boss_void',
  2: 'boss_skeleton',
  3: 'boss_vampire',
  4: 'boss_fairy',
  5: 'boss_elf',
  6: 'boss_dragon',
  7: 'boss_seraph',
  8: 'boss_final'
};

function checkAndAwardAchievements(user) {
  const newlyUnlocked = [];

  function award(key) {
    if (ACHIEVEMENTS[key] && !user.achievements.get(key)) {
      user.achievements.set(key, true);
      newlyUnlocked.push({ id: key, name: ACHIEVEMENTS[key].name, icon: ACHIEVEMENTS[key].icon });
    }
  }

  // Boss victories
  for (const [bossId, achievKey] of Object.entries(BOSS_ID_TO_ACHIEVEMENT)) {
    if (user.campaign.completedLevels.includes(Number(bossId))) {
      award(achievKey);
    }
  }

  // Campaign progress
  const completedCount = user.campaign.completedLevels.length;
  if (completedCount >= 3) award('campaign_half');
  if (completedCount >= 8) award('campaign_complete');

  // Campaign perfect — all 8 bosses with 3+ stars
  const allPerfect = [1,2,3,4,5,6,7,8].every(id => (user.campaign.stars.get(String(id)) || 0) >= 3);
  if (allPerfect) award('campaign_perfect');

  // Challenge mode — count bosses beaten on challenge (4 stars = challenge)
  const challengeWins = [1,2,3,4,5,6,7,8].filter(id => (user.campaign.stars.get(String(id)) || 0) >= 4).length;
  if (challengeWins >= 1) award('challenge_first');
  if (challengeWins >= 3) award('challenge_three');
  if (challengeWins >= 8) award('challenge_all');

  return newlyUnlocked;
}

// Helper to get all achievements as array
function getAllAchievements() {
  return Object.values(ACHIEVEMENTS);
}

// Helper to get all achievements unlocked (for admin)
function getAllAchievementsUnlocked() {
  return Object.keys(ACHIEVEMENTS).reduce((acc, key) => {
    acc[key] = { unlockedAt: new Date().toISOString() };
    return acc;
  }, {});
}

// Helper to get achievements by category
function getAchievementsByCategory(category) {
  return Object.values(ACHIEVEMENTS).filter(a => a.category === category);
}

// Helper to check if achievement has reward
function getAchievementReward(achievementId) {
  const achievement = ACHIEVEMENTS[achievementId];
  return achievement ? achievement.reward : null;
}

// ==================== SHOP SYSTEM ====================

// Card prices by rarity (buy price)
const CARD_PRICES = {
  common: 50,
  rare: 150,
  legendary: 500
};

// Sell price = 40% of buy price
function getSellPrice(cardKey) {
  const rarity = CARD_RARITIES[cardKey] || 'common';
  return Math.floor(CARD_PRICES[rarity] * 0.4);
}

function getBuyPrice(cardKey) {
  const rarity = CARD_RARITIES[cardKey] || 'common';
  return CARD_PRICES[rarity];
}

// Pack definitions
const PACKS = {
  basic: {
    id: 'basic',
    name: 'Basic Pack',
    description: '3 random cards',
    price: 100,
    cardCount: 3,
    guarantees: {} // no guarantees
  },
  premium: {
    id: 'premium',
    name: 'Premium Pack',
    description: '5 cards, guaranteed 1 Rare+',
    price: 350,
    cardCount: 5,
    guarantees: { rare: 1 }
  },
  legendary: {
    id: 'legendary',
    name: 'Legendary Pack',
    description: '5 cards, guaranteed 1 Legendary',
    price: 1000,
    cardCount: 5,
    guarantees: { legendary: 1 }
  }
};

// Campaign gold rewards by difficulty
const CAMPAIGN_GOLD = {
  1: 5,   // Easy
  2: 10,  // Medium
  3: 20,  // Hard
  4: 50   // Challenge
};

// Campaign Rift Gem rewards by difficulty (roughly 60% of the gold reward)
const CAMPAIGN_GEMS = {
  1: 3,   // Easy
  2: 6,   // Medium
  3: 12,  // Hard
  4: 30   // Challenge
};

// Card Creator cost formula - effect tier sets a cost floor (so a powerful
// effect can't be cheesed by minimizing ATK/HP), stats add a smaller amount on top.
const TIER_FLOORS = {
  common:    { energy: 1, gems: 50 },
  rare:      { energy: 4, gems: 200 },
  legendary: { energy: 7, gems: 450 }
};
const GEM_PER_STAT_POINT = { common: 5, rare: 15, legendary: 30 };
const CUSTOM_CARD_ATK_RANGE = { min: 0, max: 8 };
const CUSTOM_CARD_HP_RANGE = { min: 1, max: 12 };
const RANDOM_CARD_DISCOUNT = 0.35; // gem-cost-only discount for the random generator

function calculateCustomCardCost(atk, hp, effectId) {
  const tier = (EFFECT_BANK[effectId] && EFFECT_BANK[effectId].tier) || 'common';
  const statPoints = atk + hp;
  const energyCost = Math.min(9, TIER_FLOORS[tier].energy + Math.floor(statPoints / 3));
  const gemCost = TIER_FLOORS[tier].gems + statPoints * GEM_PER_STAT_POINT[tier];
  return { energyCost, gemCost, tier };
}

// Simple deterministic hash so identical (atk, hp, effectId) combos always
// resolve to the same custom card key (building a duplicate just adds a copy).
function customCardKey(atk, hp, effectId) {
  const str = atk + '_' + hp + '_' + effectId;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return 'custom_' + Math.abs(hash).toString(36);
}

// Generate daily deals (3 cards at discounted prices) - seeded by date
function getDailyDeals() {
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  
  // Simple seeded random
  let rng = seed;
  function seededRandom() {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  }
  
  const allCards = Object.keys(CARD_RARITIES);
  const deals = [];
  const usedCards = new Set();
  
  // Pick 4 deals: 2 common, 1 rare, 1 legendary
  const slots = ['common', 'common', 'rare', 'legendary'];
  
  for (const targetRarity of slots) {
    const pool = allCards.filter(c => CARD_RARITIES[c] === targetRarity && !usedCards.has(c));
    if (pool.length === 0) continue;
    
    const idx = Math.floor(seededRandom() * pool.length);
    const card = pool[idx];
    usedCards.add(card);
    
    const fullPrice = getBuyPrice(card);
    const discount = Math.floor(seededRandom() * 20) + 20; // 20-40% off
    const salePrice = Math.floor(fullPrice * (1 - discount / 100));
    
    deals.push({
      cardKey: card,
      rarity: targetRarity,
      fullPrice: fullPrice,
      salePrice: salePrice,
      discount: discount
    });
  }
  
  return deals;
}

// Black market: 2 legendaries + 3 rares, rotates every 3 days, same for all players
function getBlackMarket() {
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysSinceEpoch = Math.floor(Date.now() / msPerDay);
  const period = Math.floor(daysSinceEpoch / 3);

  let rng = period * 7919 + 31337;
  function seededRandom() {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  }

  const allCards = Object.keys(CARD_RARITIES);
  const usedCards = new Set();
  const items = [];
  const slots = ['legendary', 'legendary', 'rare', 'rare', 'rare'];

  for (const rarity of slots) {
    const pool = allCards.filter(c => CARD_RARITIES[c] === rarity && !usedCards.has(c));
    if (!pool.length) continue;
    const card = pool[Math.floor(seededRandom() * pool.length)];
    usedCards.add(card);
    const basePrice = getBuyPrice(card);
    const markup = Math.floor(seededRandom() * 31) + 130; // 130–160% of normal
    items.push({ cardKey: card, rarity, price: Math.floor(basePrice * markup / 100), basePrice, period });
  }

  const expiresAt = (period + 1) * 3 * msPerDay;
  return { items, period, expiresAt };
}

// Holo upgrades: 15 random upgradeable cards from a user's own collection, daily per-user
function getHoloOfferings(userIdStr, cardCollection, holoCollection) {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10);

  const userSeed = userIdStr.split('').reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 0);
  const dateSeed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  let rng = Math.abs(userSeed + dateSeed) || 12345;

  function seededRandom() {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  }

  // Cards the player owns ≥1 copy of, and has fewer than 3 holo copies
  const eligible = Object.entries(cardCollection)
    .filter(([key, count]) => count > 0 && CARD_RARITIES[key] && (holoCollection[key] || 0) < 3)
    .map(([key]) => key);

  if (!eligible.length) return { offerings: [], date: dateStr };

  // Seeded shuffle
  const shuffled = [...eligible];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const picked = shuffled.slice(0, 15);
  const gemCosts = { common: 75, rare: 200, legendary: 500 };
  const featuredIdx = Math.floor(seededRandom() * picked.length);

  const offerings = picked.map((cardKey, i) => {
    const rarity = CARD_RARITIES[cardKey] || 'common';
    const base = gemCosts[rarity];
    const featured = i === featuredIdx;
    return { cardKey, rarity, gemCost: featured ? Math.floor(base * 0.8) : base, featured };
  });

  return { offerings, date: dateStr };
}

// Open a pack - returns array of card keys
function openPack(packId, deckId) {
  const pack = PACKS[packId];
  if (!pack) return null;

  const cardPool = (deckId && FACTION_CARDS[deckId]) ? FACTION_CARDS[deckId] : Object.keys(CARD_RARITIES);
  const allCards = cardPool.filter(k => CARD_RARITIES[k]);
  const cards = [];
  
  // Handle guarantees first
  const guaranteedSlots = { rare: 0, legendary: 0 };
  if (pack.guarantees.rare) guaranteedSlots.rare = pack.guarantees.rare;
  if (pack.guarantees.legendary) guaranteedSlots.legendary = pack.guarantees.legendary;
  
  // Add guaranteed legendaries
  for (let i = 0; i < guaranteedSlots.legendary; i++) {
    const pool = allCards.filter(c => CARD_RARITIES[c] === 'legendary');
    cards.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  
  // Add guaranteed rares
  for (let i = 0; i < guaranteedSlots.rare; i++) {
    const pool = allCards.filter(c => CARD_RARITIES[c] === 'rare');
    cards.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  
  // Fill remaining slots with weighted random
  const remaining = pack.cardCount - cards.length;
  for (let i = 0; i < remaining; i++) {
    const roll = Math.random();
    let targetRarity;
    if (roll < 0.05) targetRarity = 'legendary';
    else if (roll < 0.25) targetRarity = 'rare';
    else targetRarity = 'common';
    
    const pool = allCards.filter(c => CARD_RARITIES[c] === targetRarity);
    cards.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  
  return cards;
}

// Shop auth helpers
const shopHelpers = {
  async buyCard(userId, cardKey) {
    if (userId === 'admin') return { success: true, gold: 99999 };
    
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    
    const price = getBuyPrice(cardKey);
    if (user.gold < price) throw new Error('Not enough gold');
    
    user.gold -= price;
    const currentCount = user.cardCollection.get(cardKey) || 0;
    user.cardCollection.set(cardKey, currentCount + 1);
    
    await user.save();
    return { success: true, gold: user.gold, cardCollection: Object.fromEntries(user.cardCollection) };
  },
  
  async buyDailyDeal(userId, cardKey) {
    if (userId === 'admin') return { success: true, gold: 99999 };
    
    const deals = getDailyDeals();
    const deal = deals.find(d => d.cardKey === cardKey);
    if (!deal) throw new Error('Card is not in daily deals');
    
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    
    if (user.gold < deal.salePrice) throw new Error('Not enough gold');
    
    user.gold -= deal.salePrice;
    const currentCount = user.cardCollection.get(cardKey) || 0;
    user.cardCollection.set(cardKey, currentCount + 1);
    
    await user.save();
    return { success: true, gold: user.gold, cardCollection: Object.fromEntries(user.cardCollection) };
  },
  
  async buyPack(userId, packId, deckId) {
    if (userId === 'admin') return { success: true, gold: 99999, cards: openPack(packId, deckId) };

    const pack = PACKS[packId];
    if (!pack) throw new Error('Invalid pack');

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    if (user.gold < pack.price) throw new Error('Not enough gold');

    user.gold -= pack.price;

    const cards = openPack(packId, deckId);
    for (const cardKey of cards) {
      const currentCount = user.cardCollection.get(cardKey) || 0;
      user.cardCollection.set(cardKey, currentCount + 1);
    }
    
    await user.save();
    return { success: true, gold: user.gold, cards: cards, cardCollection: Object.fromEntries(user.cardCollection) };
  },
  
  async sellCard(userId, cardKey) {
    if (userId === 'admin') return { success: true, gold: 99999 };
    
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    
    const currentCount = user.cardCollection.get(cardKey) || 0;
    if (currentCount <= 0) throw new Error('You don\'t own this card');
    
    const sellPrice = getSellPrice(cardKey);
    user.gold += sellPrice;
    
    if (currentCount === 1) {
      user.cardCollection.delete(cardKey);
    } else {
      user.cardCollection.set(cardKey, currentCount - 1);
    }
    
    await user.save();
    return { success: true, gold: user.gold, sellPrice: sellPrice, cardCollection: Object.fromEntries(user.cardCollection) };
  },
  
  async buyBlackMarket(userId, cardKey) {
    if (userId === 'admin') return { success: true, gold: 99999, cardCollection: {} };

    const market = getBlackMarket();
    const item = market.items.find(i => i.cardKey === cardKey);
    if (!item) throw new Error('Card not available in black market this rotation');

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const periodKey = String(market.period);
    const purchased = user.blackMarketPurchases ? (user.blackMarketPurchases.get(periodKey) || []) : [];
    if (purchased.includes(cardKey)) throw new Error('Already purchased this card in the current rotation');

    if (user.gold < item.price) throw new Error('Not enough gold');

    user.gold -= item.price;
    user.cardCollection.set(cardKey, (user.cardCollection.get(cardKey) || 0) + 1);
    if (!user.blackMarketPurchases) user.blackMarketPurchases = new Map();
    user.blackMarketPurchases.set(periodKey, [...purchased, cardKey]);
    user.markModified('blackMarketPurchases');

    await user.save();
    return { success: true, gold: user.gold, cardCollection: Object.fromEntries(user.cardCollection) };
  },

  async buyHoloUpgrade(userId, cardKey) {
    if (userId === 'admin') return { success: true, riftGems: 99999, holoCollection: {}, gemCost: 0 };

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const cardCollObj = Object.fromEntries(user.cardCollection);
    const holoCollObj = Object.fromEntries(user.holoCollection || new Map());
    const { offerings, date } = getHoloOfferings(userId.toString(), cardCollObj, holoCollObj);

    const offering = offerings.find(o => o.cardKey === cardKey);
    if (!offering) throw new Error("Card not in today's holo offerings");

    const purchased = user.holoUpgradePurchases ? (user.holoUpgradePurchases.get(date) || []) : [];
    if (purchased.includes(cardKey)) throw new Error('Already upgraded this card today');

    if ((user.cardCollection.get(cardKey) || 0) < 1) throw new Error("You don't own this card");

    const holoCount = (user.holoCollection || new Map()).get(cardKey) || 0;
    if (holoCount >= 3) throw new Error('Already have max holo copies of this card');

    if ((user.riftGems || 0) < offering.gemCost) throw new Error('Not enough Rift Gems');

    user.riftGems -= offering.gemCost;
    if (!user.holoCollection) user.holoCollection = new Map();
    user.holoCollection.set(cardKey, holoCount + 1);
    if (!user.holoUpgradePurchases) user.holoUpgradePurchases = new Map();
    user.holoUpgradePurchases.set(date, [...purchased, cardKey]);
    user.markModified('holoUpgradePurchases');
    user.markModified('holoCollection');

    await user.save();
    return {
      success: true,
      riftGems: user.riftGems,
      holoCollection: Object.fromEntries(user.holoCollection),
      gemCost: offering.gemCost
    };
  },

  async addGold(userId, amount) {
    if (userId === 'admin') return { success: true, gold: 99999 };

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    user.gold += amount;
    await user.save();
    return { success: true, gold: user.gold };
  },

  async addGems(userId, amount) {
    if (userId === 'admin') return { success: true, riftGems: 99999 };

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    user.riftGems = (user.riftGems || 0) + amount;
    await user.save();
    return { success: true, riftGems: user.riftGems };
  }
};

// Card Creator helpers
const cardCreatorHelpers = {
  getEffectBank() {
    return EFFECT_BANK;
  },

  async _commitCard(user, atk, hp, effectId, name, gemCostOverride) {
    const { energyCost, gemCost: fullGemCost, tier } = calculateCustomCardCost(atk, hp, effectId);
    const gemCost = gemCostOverride != null ? gemCostOverride : fullGemCost;
    if ((user.riftGems || 0) < gemCost) throw new Error('Not enough Rift Gems');

    const bankEntry = EFFECT_BANK[effectId];
    const key = customCardKey(atk, hp, effectId);

    user.riftGems -= gemCost;
    const existing = user.customCards.get(key);
    if (existing) {
      existing.count = (existing.count || 1) + 1;
      user.customCards.set(key, existing);
    } else {
      user.customCards.set(key, {
        key, name, atk, hp, cost: energyCost,
        type: 'monster', archetype: 'custom',
        effect: bankEntry.trigger, effectId,
        effectDesc: bankEntry.desc, rarity: tier,
        ...(bankEntry.extraFields || {}),
        count: 1
      });
    }

    // Mongoose doesn't auto-detect in-place mutation of Mixed values inside a Map
    user.markModified('customCards');
    await user.save();
    return {
      success: true,
      riftGems: user.riftGems,
      gemCost, energyCost, tier, key,
      customCards: Object.fromEntries(user.customCards)
    };
  },

  async buildCard(userId, { name, atk, hp, effectId }) {
    if (userId === 'admin') return { success: true, riftGems: 99999 };

    if (!EFFECT_BANK[effectId]) throw new Error('Unknown effect');
    if (typeof atk !== 'number' || atk < CUSTOM_CARD_ATK_RANGE.min || atk > CUSTOM_CARD_ATK_RANGE.max) {
      throw new Error('ATK out of range');
    }
    if (typeof hp !== 'number' || hp < CUSTOM_CARD_HP_RANGE.min || hp > CUSTOM_CARD_HP_RANGE.max) {
      throw new Error('HP out of range');
    }
    const trimmedName = (name || '').trim().slice(0, 30);
    if (!trimmedName) throw new Error('Card name is required');

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    return cardCreatorHelpers._commitCard(user, atk, hp, effectId, trimmedName);
  },

  async buildRandomCard(userId) {
    if (userId === 'admin') return { success: true, riftGems: 99999 };

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const atk = CUSTOM_CARD_ATK_RANGE.min + Math.floor(Math.random() * (CUSTOM_CARD_ATK_RANGE.max - CUSTOM_CARD_ATK_RANGE.min + 1));
    const hp = CUSTOM_CARD_HP_RANGE.min + Math.floor(Math.random() * (CUSTOM_CARD_HP_RANGE.max - CUSTOM_CARD_HP_RANGE.min + 1));

    const roll = Math.random();
    const targetTier = roll < 0.6 ? 'common' : (roll < 0.9 ? 'rare' : 'legendary');
    const tierEffectIds = Object.keys(EFFECT_BANK).filter(id => EFFECT_BANK[id].tier === targetTier);
    const effectId = tierEffectIds[Math.floor(Math.random() * tierEffectIds.length)];

    const { gemCost } = calculateCustomCardCost(atk, hp, effectId);
    const discountedGemCost = Math.floor(gemCost * (1 - RANDOM_CARD_DISCOUNT));

    const flavorNames = ['Mystery Beast', 'Rift Anomaly', 'Wild Construct', 'Chance Creature', 'Unstable Spawn'];
    const name = flavorNames[Math.floor(Math.random() * flavorNames.length)];

    return cardCreatorHelpers._commitCard(user, atk, hp, effectId, name, discountedGemCost);
  }
};

module.exports = {
  connectDB,
  User,
  CAMPAIGN_BOSSES,
  CARD_RARITIES,
  CARD_PRICES,
  PACKS,
  FACTION_CARDS,
  FACTION_NAMES,
  CAMPAIGN_GOLD,
  CAMPAIGN_GEMS,
  EFFECT_BANK,
  ACHIEVEMENTS,
  getAllAchievements,
  getAchievementsByCategory,
  getAchievementReward,
  authHelpers,
  shopHelpers,
  cardCreatorHelpers,
  getDailyDeals,
  getBlackMarket,
  getHoloOfferings,
  getBuyPrice,
  getSellPrice
};