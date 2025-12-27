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
    campaignWins: { type: Number, default: 0 }
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
    unlockedDecks: this.unlockedDecks,
    unlockedMusic: this.unlockedMusic,
    unlockedBackgrounds: this.unlockedBackgrounds,
    customDecks: this.customDecks,
    preferences: this.preferences,
    stats: this.stats,
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
  'sanguinefeast': 'legendary'
};

// Campaign Bosses Definition
const CAMPAIGN_BOSSES = [
  {
    id: 1,
    name: "The Void Scout",
    description: "A lone alien scout testing Earth's defenses",
    deckId: "void-alien",
    difficulty: "easy",
    aiLevel: 1,
    cardRewards: ['voiddrone', 'scavengerlarva', 'spittercrawler', 'phaseskirmisher', 'energyleech', 'burrowerbeast', 'psionicoverseer', 'neuralharvester', 'adaptivecolossus', 'sporetitan', 'voidbroodmother', 'eclipsedevourer', 'ufoscraper', 'assimilation', 'voidcollapse', 'hiveascension'],
    unlocks: {
      music: 'void-alien',
      background: 'void-alien'
    }
  },
  {
    id: 2,
    name: "The Dead Sheriff",
    description: "An undead lawman risen from Boot Hill to enforce his own twisted justice",
    deckId: "western-skeleton",
    difficulty: "medium",
    aiLevel: 2,
    requiresBoss: 1,
    cardRewards: ['bonedeputy', 'dustyrattler', 'graverobber', 'phantomscout', 'bonerevolver', 'undeadsheriff', 'coffintrapper', 'undertaker', 'thehangedman', 'ghostlystampede', 'bonecolossus', 'deadmanshand', 'mostwanted', 'shallowgrave', 'highnoon'],
    unlocks: {
      music: 'western-skeleton',
      background: 'western-skeleton'
    }
  },
  {
    id: 3,
    name: "The Blood Countess",
    description: "An ancient vampire queen who has fed on countless souls",
    deckId: "crimson-court",
    difficulty: "hard",
    aiLevel: 3,
    requiresBoss: 2,
    cardRewards: ['thrall', 'bloodfamiliar', 'nightstalker', 'cryptkeeper', 'vampirespawn', 'bloodpriest', 'soulcollector', 'nosferatu', 'coffin', 'bloodcountess', 'eldervampire', 'vampirelord', 'bloodpact', 'bloodtransfusion', 'crimsonrevival', 'sanguinefeast'],
    unlocks: {
      music: 'crimson-court',
      background: 'crimson-court'
    }
  },
  {
    id: 4,
    name: "The Garnet Queen",
    description: "A dazzling fairy monarch who commands the power of precious gems",
    deckId: "jeweled-court",
    difficulty: "hard",
    aiLevel: 3,
    requiresBoss: 3,
    cardRewards: ['rubysprite', 'emeraldforager', 'sapphiredancer', 'topazminer', 'amethystenchanter', 'diamondguardian', 'opaldevourer', 'pearlblessing', 'garnetqueen', 'moonstonewitch', 'prismaticfairy', 'gemstonecurse', 'fairyring'],
    unlocks: {
      music: 'jeweled-court',
      background: 'jeweled-court'
    }
  },
  {
    id: 5,
    name: "Moon Shadow Sentinel",
    description: "An ancient guardian empowered by Elune's blessing, commanding the forces of the night",
    deckId: "elunes-chosen",
    difficulty: "hard",
    aiLevel: 3,
    requiresBoss: 4,
    cardRewards: ['moonsentinel', 'starweavearcher', 'moonlitbladedancer', 'lunarpriestess', 'twilightsrespite', 'huntinggodsblessing', 'stonegiant', 'nightshadeambusher', 'moonshadowwarden', 'elunesmoonwell', 'lunarprayer', 'moonflaresorceress', 'starlitchampion', 'starinvoker', 'templeofthemoon', 'lunarbarrage'],
    unlocks: {
      music: 'elunes-chosen',
      background: 'elunes-chosen'
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
          completedLevels: [1],
          stars: { '1': 3 },
          defeatedBosses: ['void-alien']
        },
        cardCollection: getAllCards(),
        unlockedDecks: ['medieval', 'void-alien'],
        unlockedMusic: ['medieval', 'void-alien'],
        unlockedBackgrounds: ['medieval', 'void-alien'],
        customDecks: [],
        preferences: { selectedDeck: 'medieval' },
        stats: { gamesPlayed: 999, gamesWon: 999, campaignWins: 999 }
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
  
  async completeBoss(userId, bossId, stars, aiLevel = 2) {
    // Rarity chances based on difficulty
    // Easy (1): 15% rare, 5% legendary
    // Medium (2): 35% rare, 15% legendary  
    // Hard (3): 50% rare, 30% legendary
    const rarityChances = {
      1: { rare: 0.15, legendary: 0.05 },   // Easy
      2: { rare: 0.35, legendary: 0.15 },   // Medium
      3: { rare: 0.50, legendary: 0.30 }    // Hard
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
        if (card) rewardCards.push(card);
      }
      return {
        user: null,
        rewards: {
          cards: rewardCards,
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
    
    // Update stars if better
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
    
    // Random card rewards (3 cards) - max 3 copies of any card, rarity based on difficulty
    const rewardCards = [];
    for (let i = 0; i < 3; i++) {
      // Find cards that aren't maxed out yet (respect rarity limits: common 3, rare 2, legendary 1)
      const availableCards = boss.cardRewards.filter(card => {
        const currentCount = user.cardCollection.get(card) || 0;
        const rarity = CARD_RARITIES[card] || 'common';
        const maxCopies = rarity === 'legendary' ? 1 : (rarity === 'rare' ? 2 : 3);
        return currentCount < maxCopies;
      });
      
      if (availableCards.length > 0) {
        const selectedCard = pickCardByRarity(availableCards);
        if (selectedCard) {
          rewardCards.push(selectedCard);
          const currentCount = user.cardCollection.get(selectedCard) || 0;
          const rarity = CARD_RARITIES[selectedCard] || 'common';
          const maxCopies = rarity === 'legendary' ? 1 : (rarity === 'rare' ? 2 : 3);
          user.cardCollection.set(selectedCard, Math.min(currentCount + 1, maxCopies));
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
  return allCards;
}

module.exports = {
  connectDB,
  User,
  CAMPAIGN_BOSSES,
  authHelpers
};