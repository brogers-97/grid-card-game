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
  
  async completeBoss(userId, bossId, stars) {
    if (userId === 'admin') {
      // Admin still gets the reward display but nothing persists
      const boss = CAMPAIGN_BOSSES.find(b => b.id === bossId);
      const rewardCards = [];
      for (let i = 0; i < 3; i++) {
        const randomCard = boss.cardRewards[Math.floor(Math.random() * boss.cardRewards.length)];
        rewardCards.push(randomCard);
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
    
    // Random card rewards (3 cards)
    const rewardCards = [];
    for (let i = 0; i < 3; i++) {
      const randomCard = boss.cardRewards[Math.floor(Math.random() * boss.cardRewards.length)];
      rewardCards.push(randomCard);
      const currentCount = user.cardCollection.get(randomCard) || 0;
      user.cardCollection.set(randomCard, currentCount + 1);
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