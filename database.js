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
    selectedBackground: { type: String, default: 'medieval' }
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
  'ragequit': 'legendary'
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
    
    await user.save();
    
    return {
      user: user.toPublicJSON(),
      rewards: {
        cards: rewardCards,
        isHolo: isChallenge,
        music: boss.unlocks.music,
        background: boss.unlocks.background
      }
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
    description: 'Beat all 6 Campaign Bosses',
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

// Open a pack - returns array of card keys
function openPack(packId) {
  const pack = PACKS[packId];
  if (!pack) return null;
  
  const allCards = Object.keys(CARD_RARITIES);
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
  
  async buyPack(userId, packId) {
    if (userId === 'admin') return { success: true, gold: 99999, cards: openPack(packId) };
    
    const pack = PACKS[packId];
    if (!pack) throw new Error('Invalid pack');
    
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    
    if (user.gold < pack.price) throw new Error('Not enough gold');
    
    user.gold -= pack.price;
    
    const cards = openPack(packId);
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
  
  async addGold(userId, amount) {
    if (userId === 'admin') return { success: true, gold: 99999 };
    
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    
    user.gold += amount;
    await user.save();
    return { success: true, gold: user.gold };
  }
};

module.exports = {
  connectDB,
  User,
  CAMPAIGN_BOSSES,
  CARD_RARITIES,
  CARD_PRICES,
  PACKS,
  CAMPAIGN_GOLD,
  ACHIEVEMENTS,
  getAllAchievements,
  getAchievementsByCategory,
  getAchievementReward,
  authHelpers,
  shopHelpers,
  getDailyDeals,
  getBuyPrice,
  getSellPrice
};