require('dotenv').config();
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { connectDB, User, CAMPAIGN_BOSSES, CARD_RARITIES, CARD_PRICES, PACKS, FACTION_NAMES, CAMPAIGN_GOLD, CAMPAIGN_GEMS, authHelpers, shopHelpers, cardCreatorHelpers, getDailyDeals, getBuyPrice, getSellPrice } = require("./database");
const GameAI = require("./gameAI");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Connect to MongoDB
connectDB();

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json()); // For parsing JSON bodies

// Redirect root to home page
app.get("/", (req, res) => {
  res.redirect("/home.html");
});

// REST API endpoints for auth
app.post("/api/register", async (req, res) => {
  try {
    const { username, password, email } = req.body;
    const user = await authHelpers.register(username, password);
    // Save optional email if provided
    if (email && email.trim()) {
      const { User } = require('./database');
      await User.findByIdAndUpdate(user.id, { email: email.trim().toLowerCase() });
      user.email = email.trim().toLowerCase();
    }
    res.json({ success: true, user });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post("/api/admin/reset-password", async (req, res) => {
  try {
    const { adminKey, username, newPassword } = req.body;
    if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    if (!username || !newPassword || newPassword.length < 4) {
      return res.status(400).json({ success: false, error: 'Username and newPassword (min 4 chars) required' });
    }
    const result = await authHelpers.adminResetPassword(username, newPassword);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await authHelpers.login(username, password);
    res.json({ success: true, user });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post("/api/change-username", async (req, res) => {
  try {
    const { userId, password, newUsername } = req.body;
    const user = await authHelpers.changeUsername(userId, password, newUsername);
    res.json({ success: true, user });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post("/api/change-password", async (req, res) => {
  try {
    const { userId, currentPassword, newPassword } = req.body;
    await authHelpers.changePassword(userId, currentPassword, newPassword);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post("/api/delete-account", async (req, res) => {
  try {
    const { userId, password } = req.body;
    await authHelpers.deleteAccount(userId, password);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post("/api/tutorial-status", async (req, res) => {
  try {
    const { userId, completed } = req.body;
    console.log(`[TUTORIAL] /api/tutorial-status userId=${userId} completed=${completed}`);
    if (!userId || userId === 'admin') return res.json({ success: true });
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    user.set('preferences.tutorialCompleted', !!completed);
    user.markModified('preferences');
    await user.save();
    console.log(`[TUTORIAL] Saved tutorialCompleted=${user.preferences.tutorialCompleted} for user ${user.username}`);
    res.json({ success: true, tutorialCompleted: user.preferences.tutorialCompleted });
  } catch (err) {
    console.error('[TUTORIAL] Save error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// One-time admin password reset - DELETE THIS AFTER USE
app.get("/api/reset-admin-password", async (req, res) => {
  try {
    const newPassword = req.query.newpass || "admin123";
    
    // Delete existing admin user
    await User.deleteOne({ username: "admin" });
    
    // Create new admin user with specified password
    const user = await authHelpers.register("admin", newPassword);
    
    res.json({ 
      success: true, 
      message: "Admin password reset to: " + newPassword,
      note: "DELETE THIS ENDPOINT FROM server.js AFTER USE!"
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/campaign/bosses", (req, res) => {
  res.json({ bosses: CAMPAIGN_BOSSES });
});

// Get all cards for admin playtest
app.get("/api/all-cards", (req, res) => {
  try {
    const allCards = [];
    const decksByName = {};
    
    for (const deckId in DECKS) {
      const deck = DECKS[deckId];
      decksByName[deck.name] = deck.cards;
      
      for (const card of deck.cards) {
        // Add deck info to card
        allCards.push({
          ...card,
          deckId: deckId,
          deckName: deck.name
        });
      }
    }
    
    res.json({ 
      cards: allCards,
      decks: decksByName
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fix medieval card collection - ensure user has 3 copies of each medieval card, cap all at 3
app.post("/api/fixCollection", async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId || userId === 'admin') {
      return res.status(400).json({ success: false, error: 'Invalid user' });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Card rarity definitions
    const cardRarity = {
      // Medieval - Common
      peasant: 'common', squire: 'common', archer: 'common', manatarms: 'common',
      battlefieldmedic: 'common', knight: 'common', castlewalls: 'common', 
      treasury: 'common', rally: 'common',
      // Medieval - Rare
      shieldbearer: 'rare', warhound: 'rare', royalguard: 'rare', siegeram: 'rare',
      warbanner: 'rare', shrine: 'rare', armory: 'rare',
      // Medieval - Legendary
      crusader: 'legendary', paladin: 'legendary',
      // Void Alien - Common
      voiddrone: 'common', scavengerlarva: 'common', spittercrawler: 'common',
      energyleech: 'common', neuralharvester: 'common',
      // Void Alien - Rare
      phaseskirmisher: 'rare', burrowerbeast: 'rare', psionicoverseer: 'rare',
      sporetitan: 'rare', assimilation: 'rare', voidcollapse: 'rare',
      // Void Alien - Legendary
      adaptivecolossus: 'legendary', voidbroodmother: 'legendary', 
      eclipsedevourer: 'legendary', ufoscraper: 'legendary', hiveascension: 'legendary',
      // Western Skeleton - Common
      bonedeputy: 'common', dustyrattler: 'common', phantomscout: 'common', deadmanshand: 'common',
      // Western Skeleton - Rare
      graverobber: 'rare', bonerevolver: 'rare', undeadsheriff: 'rare', 
      coffintrapper: 'rare', undertaker: 'rare', mostwanted: 'rare',
      // Western Skeleton - Legendary
      thehangedman: 'legendary', ghostlystampede: 'legendary', 
      bonecolossus: 'legendary', shallowgrave: 'legendary', highnoon: 'legendary',
      // Crimson Court - Common
      bloodfamiliar: 'common', nightstalker: 'common', vampirespawn: 'common',
      // Crimson Court - Rare
      nosferatu: 'rare', coffin: 'rare', bloodpact: 'rare', bloodtransfusion: 'rare', soulcollector: 'rare',
      // Crimson Court - Legendary
      eldervampire: 'legendary', bloodcountess: 'legendary', vampirelord: 'legendary',
      crimsonrevival: 'legendary', sanguinefeast: 'legendary',
      // Jeweled Court - Common
      rubysprite: 'common', emeraldforager: 'common', sapphiredancer: 'common', topazminer: 'common',
      // Jeweled Court - Rare
      amethystenchanter: 'rare', diamondguardian: 'rare', opaldevourer: 'rare', pearlblessing: 'rare',
      // Jeweled Court - Legendary
      garnetqueen: 'legendary', moonstonewitch: 'legendary', prismaticfairy: 'legendary',
      gemstonecurse: 'legendary', fairyring: 'legendary',
      // Elune's Chosen - Common
      moonsentinel: 'common', starweavearcher: 'common', moonlitbladedancer: 'common', 
      lunarpriestess: 'common', twilightsrespite: 'common', huntinggodsblessing: 'common',
      // Elune's Chosen - Rare
      stonegiant: 'rare', nightshadeambusher: 'rare', moonshadowwarden: 'rare',
      elunesmoonwell: 'rare', lunarprayer: 'rare', moonflaresorceress: 'rare',
      // Elune's Chosen - Legendary
      starlitchampion: 'legendary', starinvoker: 'legendary', templeofthemoon: 'legendary', lunarbarrage: 'legendary',
      // Token/Spawnable
      gemshard: 'common',
      // 8-Bit Battalion - Common
      slimesprite: 'common', skeletonwarrior8bit: 'common', barrel: 'common', healerfairy: 'common',
      bosskey: 'common', newgameplus: 'rare',
      // 8-Bit Battalion - Rare
      knighterrant: 'rare', pixelproducer: 'rare', cheatcode: 'rare', savestate: 'rare',
      // 8-Bit Battalion - Legendary
      wizardnpc: 'legendary', finalboss: 'legendary', resetbutton: 'legendary', ragequit: 'legendary',
      // 8-Bit Battalion - Tokens
      pixel: 'common', slimeling: 'common'
    };
    
    // Get max copies based on rarity - all rarities can have 3 in deck
    const getMaxCopies = (card) => {
      return 3; // All rarities max 3 in deck
    };
    
    // Medieval cards that every player should have (ensure at least 3 of each)
    const medievalCards = [
      'peasant', 'squire', 'archer', 'manatarms', 'shieldbearer', 
      'warhound', 'battlefieldmedic', 'knight', 'crusader', 
      'royalguard', 'paladin', 'siegeram', 'warbanner', 
      'shrine', 'armory', 'castlewalls', 'treasury', 'rally'
    ];
    
    // Set each medieval card to at least 3 (don't reduce if they have more)
    medievalCards.forEach(card => {
      const current = user.cardCollection.get(card) || 0;
      if (current < 3) {
        user.cardCollection.set(card, 3);
      }
    });
    
    // Don't cap other cards - collection is unlimited now
    
    await user.save();
    res.json({ success: true, user: user.toPublicJSON() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save deck endpoint - saves to medieval or void-alien slot
// Admin custom decks storage (in-memory, persists while server runs)
const adminCustomDecks = [];

app.post("/api/saveDeck", async (req, res) => {
  try {
    const { userId, deckType, deckName, cards, music, background } = req.body;
    
    // Handle admin deck saving
    if (userId === 'admin') {
      if (!deckType || !['medieval', 'void-alien', 'western-skeleton', 'crimson-court', 'jeweled-court', 'elunes-chosen', 'dragon-wizard', 'celestial-host', '8bit-battalion'].includes(deckType)) {
        return res.status(400).json({ success: false, error: 'Invalid deck type' });
      }
      if (!cards || !Array.isArray(cards) || cards.length < 25 || cards.length > 35) {
        return res.status(400).json({ success: false, error: 'Deck must have 25-35 cards' });
      }
      
      const existingIdx = adminCustomDecks.findIndex(d => d.id === deckType);
      const deckData = { id: deckType, name: deckName.trim(), cards: cards, music: music || 'default', background: background || 'default' };
      if (existingIdx >= 0) { adminCustomDecks[existingIdx] = deckData; }
      else { adminCustomDecks.push(deckData); }
      
      // Return updated admin user object
      return res.json({ 
        success: true, 
        user: {
          id: 'admin',
          username: 'Admin',
          isAdmin: true,
          campaign: { currentLevel: 999, completedLevels: [1,2,3,4,5,6,7,8], stars: {'1':3,'2':3,'3':3,'4':3,'5':3,'6':3,'7':3,'8':3}, defeatedBosses: ['void-alien','western-skeleton','crimson-court','jeweled-court','elunes-chosen','dragon-wizard','celestial-host','8bit-battalion'], challengeCompleted: {'1':true,'2':true,'3':true,'4':true,'5':true,'6':true,'7':true,'8':true} },
          unlockedDecks: ['medieval','void-alien','western-skeleton','crimson-court','jeweled-court','elunes-chosen','dragon-wizard','celestial-host','8bit-battalion'],
          unlockedMusic: ['medieval','void-alien','western-skeleton','crimson-court','jeweled-court','elunes-chosen','dragon-wizard','celestial-host','8bit-battalion'],
          unlockedBackgrounds: ['medieval','void-alien','western-skeleton','crimson-court','jeweled-court','elunes-chosen','dragon-wizard','celestial-host','8bit-battalion'],
          customDecks: adminCustomDecks,
          stats: { gamesPlayed: 999, gamesWon: 999, campaignWins: 999 }
        }
      });
    }
    
    if (!userId) {
      return res.status(400).json({ success: false, error: 'Invalid user' });
    }
    
    if (!deckType || !['medieval', 'void-alien', 'western-skeleton', 'crimson-court', 'jeweled-court', 'elunes-chosen', 'dragon-wizard', 'celestial-host', '8bit-battalion'].includes(deckType)) {
      return res.status(400).json({ success: false, error: 'Invalid deck type' });
    }
    
    if (!cards || !Array.isArray(cards) || cards.length < 25 || cards.length > 35) {
      return res.status(400).json({ success: false, error: 'Deck must have 25-35 cards' });
    }
    
    if (!deckName || deckName.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Deck name is required' });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Check if void-alien is unlocked
    if (deckType === 'void-alien' && !user.unlockedDecks.includes('void-alien')) {
      return res.status(400).json({ success: false, error: 'Void Alien deck not unlocked' });
    }
    
    // Validate music selection is unlocked
    if (music && music !== 'default' && music !== 'medieval') {
      const unlockedMusic = user.unlockedMusic || ['medieval'];
      if (!unlockedMusic.includes(music)) {
        return res.status(400).json({ success: false, error: 'Music not unlocked' });
      }
    }
    
    // Validate background selection is unlocked
    if (background && background !== 'default' && background !== 'medieval') {
      const unlockedBackgrounds = user.unlockedBackgrounds || ['medieval'];
      if (!unlockedBackgrounds.includes(background)) {
        return res.status(400).json({ success: false, error: 'Background not unlocked' });
      }
    }
    
    // Validate that user owns all cards in deck
    const cardCounts = {};
    const holoCardCounts = {};
    const customCardCounts = {};
    cards.forEach(key => {
      if (key.startsWith('custom_')) {
        customCardCounts[key] = (customCardCounts[key] || 0) + 1;
      } else if (key.endsWith('_holo')) {
        const baseKey = key.replace('_holo', '');
        holoCardCounts[baseKey] = (holoCardCounts[baseKey] || 0) + 1;
      } else {
        cardCounts[key] = (cardCounts[key] || 0) + 1;
      }
    });

    // Check regular cards
    for (const [key, count] of Object.entries(cardCounts)) {
      const owned = user.cardCollection.get(key) || 0;
      if (count > owned) {
        return res.status(400).json({
          success: false,
          error: `You don't own enough copies of ${key}`
        });
      }
    }

    // Check custom (Card Creator) cards
    for (const [key, count] of Object.entries(customCardCounts)) {
      const customCard = user.customCards.get(key);
      const owned = customCard ? (customCard.count || 0) : 0;
      if (count > owned) {
        return res.status(400).json({
          success: false,
          error: `You don't own enough copies of custom card ${key}`
        });
      }
    }
    
    // Check holo cards
    for (const [key, count] of Object.entries(holoCardCounts)) {
      const owned = user.holoCollection.get(key) || 0;
      if (count > owned) {
        return res.status(400).json({ 
          success: false, 
          error: `You don't own enough holo copies of ${key}` 
        });
      }
    }
    
    // Find or create custom deck for this type
    const existingDeckIndex = user.customDecks.findIndex(d => d.id === deckType);
    
    if (existingDeckIndex >= 0) {
      user.customDecks[existingDeckIndex].name = deckName.trim();
      user.customDecks[existingDeckIndex].cards = cards;
      user.customDecks[existingDeckIndex].music = music || 'default';
      user.customDecks[existingDeckIndex].background = background || 'default';
      user.customDecks[existingDeckIndex].updatedAt = new Date();
    } else {
      user.customDecks.push({
        id: deckType,
        name: deckName.trim(),
        cards: cards,
        music: music || 'default',
        background: background || 'default',
        createdAt: new Date()
      });
    }
    
    await user.save();
    
    res.json({ success: true, user: user.toPublicJSON() });
  } catch (err) {
    console.error('Save deck error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Delete deck endpoint - resets to default
app.post("/api/deleteDeck", async (req, res) => {
  try {
    const { userId, deckType } = req.body;
    
    if (!userId || userId === 'admin') {
      return res.status(400).json({ success: false, error: 'Invalid user' });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Remove custom deck for this type (will revert to default)
    const deckIndex = user.customDecks.findIndex(d => d.id === deckType);
    if (deckIndex >= 0) {
      user.customDecks.splice(deckIndex, 1);
      await user.save();
    }
    
    res.json({ success: true, user: user.toPublicJSON() });
  } catch (err) {
    console.error('Delete deck error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ==================== SHOP API ROUTES ====================

// Get shop data (daily deals, packs, prices, unlocked factions)
app.get("/api/shop", async (req, res) => {
  try {
    const { userId } = req.query;
    let unlockedDecks = ['medieval'];

    if (userId === 'admin') {
      unlockedDecks = Object.keys(FACTION_NAMES);
    } else if (userId) {
      const user = await User.findById(userId);
      if (user) unlockedDecks = user.unlockedDecks || ['medieval'];
    }

    res.json({
      dailyDeals: getDailyDeals(),
      packs: PACKS,
      prices: CARD_PRICES,
      unlockedDecks,
      factionNames: FACTION_NAMES
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Buy a card from the market
app.post("/api/shop/buy-card", async (req, res) => {
  try {
    const { userId, cardKey } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'Not logged in' });
    if (!CARD_RARITIES[cardKey]) return res.status(400).json({ success: false, error: 'Invalid card' });
    
    const result = await shopHelpers.buyCard(userId, cardKey);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Buy a daily deal
app.post("/api/shop/buy-deal", async (req, res) => {
  try {
    const { userId, cardKey } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'Not logged in' });
    
    const result = await shopHelpers.buyDailyDeal(userId, cardKey);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Buy a pack
app.post("/api/shop/buy-pack", async (req, res) => {
  try {
    const { userId, packId, deckId } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'Not logged in' });
    if (!PACKS[packId]) return res.status(400).json({ success: false, error: 'Invalid pack' });

    const result = await shopHelpers.buyPack(userId, packId, deckId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Sell a card
app.post("/api/shop/sell-card", async (req, res) => {
  try {
    const { userId, cardKey } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'Not logged in' });
    if (!CARD_RARITIES[cardKey]) return res.status(400).json({ success: false, error: 'Invalid card' });
    
    const result = await shopHelpers.sellCard(userId, cardKey);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Card Creator: get the curated effect bank for the builder UI
app.get("/api/cardcreator/effects", (req, res) => {
  res.json({ effects: cardCreatorHelpers.getEffectBank() });
});

// Card Creator: build a deliberate custom card
app.post("/api/cardcreator/build", async (req, res) => {
  try {
    const { userId, name, atk, hp, effectId } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'Not logged in' });

    const result = await cardCreatorHelpers.buildCard(userId, { name, atk, hp, effectId });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Card Creator: build a discounted random card
app.post("/api/cardcreator/random", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'Not logged in' });

    const result = await cardCreatorHelpers.buildRandomCard(userId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
const ROWS = 7;
const COLS = 6;
const START_ROW_HP = [15, 15, 0, 0, 0, 15, 15]; // 2 home rows each side, 3 neutral middle rows
const START_HEART_HP = 30;
const START_ENERGY = 8;
const MAX_ENERGY = 10;
const START_HAND_SIZE = 5;
const MAX_HAND_SIZE = 7;

// Wizard unit keys for Wizard's Rune effect (cards that can be drawn/summoned free)
const WIZARD_CARDS = ['redwizard', 'bluewizard', 'mirrorwizard', 'arcanetether'];

// Buff tile definitions
const BUFF_TYPES = [
  { id: "energy_buff", name: "Energy Well", desc: "Gain +1 energy each turn", icon: "⚡" },
  { id: "hp_buff", name: "Fortified Ground", desc: "All your units gain +1 HP", icon: "🛡️" },
  { id: "atk_row_buff", name: "War Shrine", desc: "Units in this row gain +1 ATK", icon: "⚔️" },
  { id: "draw_buff", name: "Ancient Library", desc: "Draw 2 cards instead of 1", icon: "📚" },
  { id: "heal_buff", name: "Healing Spring", desc: "Unit here heals 1 HP each turn", icon: "💧" },
  { id: "move_buff", name: "Swift Boots", desc: "Unit here can move twice", icon: "👢" },
];

const DECKS = {
  medieval: {
    name: "Medieval Kingdom",
    description: "Classic knights, archers, and siege warfare",
    archetype: "medieval",
    cards: [
      { key: "peasant", name: "Peasant", atk: 1, hp: 2, cost: 1, type: "monster", effect: "passive", effectId: "diagonal_attack", effectDesc: "PASSIVE: Can attack diagonally.", art: "/images/Peasant.png", rarity: "common" },
      { key: "peasant", name: "Peasant", atk: 1, hp: 2, cost: 1, type: "monster", effect: "passive", effectId: "diagonal_attack", effectDesc: "PASSIVE: Can attack diagonally.", art: "/images/Peasant.png", rarity: "common" },
      { key: "squire", name: "Squire", atk: 2, hp: 2, cost: 1, type: "monster", effect: "passive", effectId: "knight_leap", effectDesc: "PASSIVE: Can move to any Knight.", art: "/images/Squire.png", rarity: "common" },
      { key: "squire", name: "Squire", atk: 2, hp: 2, cost: 1, type: "monster", effect: "passive", effectId: "knight_leap", effectDesc: "PASSIVE: Can move to any Knight.", art: "/images/Squire.png", rarity: "common" },
      { key: "archer", name: "Archer", atk: 3, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "ranged", effectDesc: "PASSIVE: Can attack 2 tiles away.", art: "/images/Archer.png", rarity: "common" },
      { key: "archer", name: "Archer", atk: 3, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "ranged", effectDesc: "PASSIVE: Can attack 2 tiles away.", art: "/images/Archer.png", rarity: "common" },
      { key: "manatarms", name: "Man-at-Arms", atk: 2, hp: 4, cost: 2, type: "monster", art: "/images/Man-at-Arms.png", rarity: "common" },
      { key: "manatarms", name: "Man-at-Arms", atk: 2, hp: 4, cost: 2, type: "monster", art: "/images/Man-at-Arms.png", rarity: "common" },
      { key: "shieldbearer", name: "Shield Bearer", atk: 1, hp: 5, cost: 2, type: "monster", effect: "passive", effectId: "shield_aura", effectDesc: "PASSIVE: Adjacent allies take -1 damage.", art: "/images/Shield Bearer.png", rarity: "rare" },
      { key: "warhound", name: "War Hound", atk: 3, hp: 3, cost: 2, type: "monster", effect: "passive", effectId: "double_move", effectDesc: "PASSIVE: Can move twice per turn.", art: "/images/War Hound.png", rarity: "rare" },
      { key: "battlefieldmedic", name: "Battlefield Medic", atk: 1, hp: 3, cost: 2, type: "monster", effect: "endOfTurn", effectId: "heal_adjacent", effectDesc: "END OF TURN: Heal adjacent allies 1 HP.", art: "/images/Battlefield Medic.png", rarity: "common" },
      { key: "knight", name: "Knight", atk: 4, hp: 4, cost: 3, type: "monster", art: "/images/Knight.png", rarity: "common" },
      { key: "knight", name: "Knight", atk: 4, hp: 4, cost: 3, type: "monster", art: "/images/Knight.png", rarity: "common" },
      { key: "crusader", name: "Crusader", atk: 5, hp: 4, cost: 4, type: "monster", effect: "onKill", effectId: "heal_on_kill", effectDesc: "ON KILL: Heal 2 HP (can exceed max).", art: "/images/Crusader.png", rarity: "legendary" },
      { key: "royalguard", name: "Royal Guard", atk: 3, hp: 6, cost: 4, type: "monster", effect: "passive", effectId: "cleave", effectDesc: "PASSIVE: Deals half damage to adjacent enemies.", art: "/images/Royal Guard.png", rarity: "rare" },
      { key: "paladin", name: "Paladin", atk: 6, hp: 5, cost: 4, type: "monster", effect: "onKill", effectId: "energy_on_kill", effectDesc: "ON KILL: Gain 1 energy.", art: "/images/Paladin.png", rarity: "legendary" },
      { key: "siegeram", name: "Battering Ram", atk: 2, hp: 6, cost: 3, type: "monster", effect: "passive", effectId: "siege", effectDesc: "PASSIVE: 2x damage to rows.", art: "/images/Battering Ram.png", rarity: "rare" },
      { key: "warbanner", name: "War Banner", atk: 0, hp: 4, cost: 2, type: "structure", effect: "passive", effectId: "attack_aura", effectDesc: "PASSIVE: Adjacent allies +1 ATK.", art: "/images/War Banner.png", rarity: "rare" },
      { key: "shrine", name: "Healing Shrine", atk: 0, hp: 5, cost: 3, type: "structure", effect: "startOfTurn", effectId: "shrine_heal", effectDesc: "START: Heal row allies 1 HP.", art: "/images/Healing Shrine.png", rarity: "rare" },
      { key: "armory", name: "Armory", atk: 0, hp: 4, cost: 3, type: "structure", effect: "passive", effectId: "armory_buff", effectDesc: "PASSIVE: All friendly units +1 HP. Stacks.", art: "/images/Armory.png", rarity: "rare" },
      { key: "castlewalls", name: "Castle Walls", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "fortify_row", effectDesc: "INSTANT: This row +15 HP.", art: "/images/Castle Walls.png", requiresTarget: "row", rarity: "common" },
      { key: "treasury", name: "King's Treasury", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "draw_two", effectDesc: "INSTANT: Draw 2 cards.", art: "/images/Kings Treasury.png", rarity: "common" },
      { key: "rally", name: "Rallying Cry", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "double_attack", effectDesc: "INSTANT: Target unit can attack twice.", art: "/images/Rallying Cry.png", requiresTarget: "unit", rarity: "common" },
    ]
  },
  "void-alien": {
    name: "Void Alien",
    description: "Alien swarm with energy manipulation and adaptation",
    archetype: "alien",
    cards: [
      // Void Drone x3 (1 cost with death damage)
      { key: "voiddrone", name: "Void Drone", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeath", effectId: "drone_death_damage", effectDesc: "ON DEATH: Deal 1 damage to a random enemy.", art: "/images/Void Drone.png", rarity: "common" },
      { key: "voiddrone", name: "Void Drone", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeath", effectId: "drone_death_damage", effectDesc: "ON DEATH: Deal 1 damage to a random enemy.", art: "/images/Void Drone.png", rarity: "common" },
      { key: "voiddrone", name: "Void Drone", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeath", effectId: "drone_death_damage", effectDesc: "ON DEATH: Deal 1 damage to a random enemy.", art: "/images/Void Drone.png", rarity: "common" },
      // Scavenger Larva x3 (energy on death)
      { key: "scavengerlarva", name: "Scavenger Larva", atk: 1, hp: 1, cost: 1, type: "monster", effect: "onDeath", effectId: "energy_on_death", effectDesc: "ON DEATH: Gain 1 Energy.", art: "/images/Scavenger Larva.png", rarity: "common" },
      { key: "scavengerlarva", name: "Scavenger Larva", atk: 1, hp: 1, cost: 1, type: "monster", effect: "onDeath", effectId: "energy_on_death", effectDesc: "ON DEATH: Gain 1 Energy.", art: "/images/Scavenger Larva.png", rarity: "common" },
      { key: "scavengerlarva", name: "Scavenger Larva", atk: 1, hp: 1, cost: 1, type: "monster", effect: "onDeath", effectId: "energy_on_death", effectDesc: "ON DEATH: Gain 1 Energy.", art: "/images/Scavenger Larva.png", rarity: "common" },
      // Spitter Crawler x3 (vanilla 2 cost)
      { key: "spittercrawler", name: "Spitter Crawler", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "ranged", effectDesc: "PASSIVE: Can attack 2 tiles away.", art: "/images/Spitter Crawler.png", rarity: "common" },
      { key: "spittercrawler", name: "Spitter Crawler", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "ranged", effectDesc: "PASSIVE: Can attack 2 tiles away.", art: "/images/Spitter Crawler.png", rarity: "common" },
      { key: "spittercrawler", name: "Spitter Crawler", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "ranged", effectDesc: "PASSIVE: Can attack 2 tiles away.", art: "/images/Spitter Crawler.png", rarity: "common" },
      // Phase Skirmisher x2 (double move)
      { key: "phaseskirmisher", name: "Phase Skirmisher", atk: 2, hp: 3, cost: 2, type: "monster", effect: "passive", effectId: "double_move", effectDesc: "PASSIVE: Can move twice per turn.", art: "/images/Phase Skirmisher.png", rarity: "rare" },
      { key: "phaseskirmisher", name: "Phase Skirmisher", atk: 2, hp: 3, cost: 2, type: "monster", effect: "passive", effectId: "double_move", effectDesc: "PASSIVE: Can move twice per turn.", art: "/images/Phase Skirmisher.png", rarity: "rare" },
      // Energy Leech x2 (drain energy on kill)
      { key: "energyleech", name: "Energy Leech", atk: 2, hp: 2, cost: 2, type: "monster", effect: "onKill", effectId: "drain_energy", effectDesc: "ON KILL: Drain 1 Energy from opponent.", art: "/images/Energy Leech.png", rarity: "common" },
      { key: "energyleech", name: "Energy Leech", atk: 2, hp: 2, cost: 2, type: "monster", effect: "onKill", effectId: "drain_energy", effectDesc: "ON KILL: Drain 1 Energy from opponent.", art: "/images/Energy Leech.png", rarity: "common" },
      // Burrower Beast x2 (untargetable next turn, can deploy adjacent to allies)
      { key: "burrowerbeast", name: "Burrower Beast", atk: 3, hp: 3, cost: 3, type: "monster", effect: "passive", effectId: "burrow", effectDesc: "PASSIVE: Untargetable for 2 turns. Can deploy adjacent to allies.", art: "/images/Burrower Beast.png", rarity: "rare" },
      { key: "burrowerbeast", name: "Burrower Beast", atk: 3, hp: 3, cost: 3, type: "monster", effect: "passive", effectId: "burrow", effectDesc: "PASSIVE: Untargetable for 2 turns. Can deploy adjacent to allies.", art: "/images/Burrower Beast.png", rarity: "rare" },
      // Psionic Overseer x2 (attack aura)
      { key: "psionicoverseer", name: "Psionic Overseer", atk: 2, hp: 3, cost: 3, type: "monster", effect: "passive", effectId: "attack_aura", effectDesc: "PASSIVE: Adjacent allies gain +1 ATK.", art: "/images/Psionic Overseer.png", rarity: "rare" },
      { key: "psionicoverseer", name: "Psionic Overseer", atk: 2, hp: 3, cost: 3, type: "monster", effect: "passive", effectId: "attack_aura", effectDesc: "PASSIVE: Adjacent allies gain +1 ATK.", art: "/images/Psionic Overseer.png", rarity: "rare" },
      // Neural Harvester x2 (energy on attack if target survives)
      { key: "neuralharvester", name: "Neural Harvester", atk: 3, hp: 3, cost: 3, type: "monster", effect: "onAttack", effectId: "energy_on_hit", effectDesc: "ON ATTACK: If target survives, gain 1 Energy.", art: "/images/Neural Harvester.png", rarity: "common" },
      { key: "neuralharvester", name: "Neural Harvester", atk: 3, hp: 3, cost: 3, type: "monster", effect: "onAttack", effectId: "energy_on_hit", effectDesc: "ON ATTACK: If target survives, gain 1 Energy.", art: "/images/Neural Harvester.png", rarity: "common" },
      // Adaptive Colossus x1 (gains max HP when damaged)
      { key: "adaptivecolossus", name: "Adaptive Colossus", atk: 4, hp: 5, cost: 4, type: "monster", effect: "passive", effectId: "adapt_hp", effectDesc: "PASSIVE: Gains +1 Max HP when surviving damage.", art: "/images/Adaptive Colossus.png", rarity: "legendary" },
      // Spore Titan x1 (1 damage splash to enemies adjacent to target)
      { key: "sporetitan", name: "Spore Titan", atk: 3, hp: 6, cost: 4, type: "monster", effect: "passive", effectId: "half_damage_aura", effectDesc: "PASSIVE: Attacks deal 1 splash damage to enemies adjacent to target.", art: "/images/Spore Titan.png", rarity: "rare" },
      // Void Broodmother x1 (spawn drone on kill, gains ATK per drone)
      { key: "voidbroodmother", name: "Void Broodmother", atk: 2, hp: 6, cost: 4, type: "monster", effect: "onKill", effectId: "spawn_drone", effectDesc: "ON KILL: Spawn a Void Drone. PASSIVE: +1 ATK for each Void Drone you control.", art: "/images/Void Broodmother.png", rarity: "legendary" },
      // Eclipse Devourer x1 (energy on kill)
      { key: "eclipsedevourer", name: "Eclipse Devourer", atk: 5, hp: 4, cost: 5, type: "monster", effect: "onKill", effectId: "energy_on_kill", effectDesc: "ON KILL: Gain 1 Energy.", art: "/images/Eclipse Devourer.png", rarity: "legendary" },
      // UFO Scraper x1 (absorb any friendly unit's stats)
      { key: "ufoscraper", name: "UFO Scraper", atk: 1, hp: 1, cost: 4, type: "monster", effect: "passive", effectId: "absorb_ally", effectDesc: "PASSIVE: Can attack any friendly unit to absorb their stats.", art: "/images/UFO Scraper.png", rarity: "legendary" },
      // Assimilation x2 (destroy enemy with <=2 HP)
      { key: "assimilation", name: "Assimilation", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "destroy_weak", effectDesc: "INSTANT: Destroy target enemy with 2 or less HP.", art: "/images/Assimilation.png", requiresTarget: "enemy_unit", rarity: "rare" },
      { key: "assimilation", name: "Assimilation", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "destroy_weak", effectDesc: "INSTANT: Destroy target enemy with 2 or less HP.", art: "/images/Assimilation.png", requiresTarget: "enemy_unit", rarity: "rare" },
      // Void Collapse x1 (damage all enemies in row)
      { key: "voidcollapse", name: "Void Collapse", atk: 0, hp: 0, cost: 5, type: "spell", effect: "instant", effectId: "row_damage", effectDesc: "INSTANT: Deal 1 damage to all enemies in target row.", art: "/images/Void Collapse.png", requiresTarget: "row", rarity: "rare" },
      // Hive Ascension x1 (buff all friendly units)
      { key: "hiveascension", name: "Hive Ascension", atk: 0, hp: 0, cost: 7, type: "spell", effect: "instant", effectId: "mass_buff", effectDesc: "INSTANT: All friendly units gain +1 ATK and +1 HP permanently.", art: "/images/Hive Ascension.png", rarity: "legendary" },
    ]
  },
  "western-skeleton": {
    name: "Western Skeleton",
    description: "Undead gunslingers from the ghost town of Boot Hill",
    archetype: "skeleton",
    cards: [
      // Bone Deputy x3 (deathrattle: spawn 1/1)
      { key: "bonedeputy", name: "Bone Deputy", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeath", effectId: "spawn_bone_pile", effectDesc: "ON DEATH: Summon a 1/1 Bone Pile.", art: "/images/Bone Deputy.png", rarity: "common" },
      { key: "bonedeputy", name: "Bone Deputy", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeath", effectId: "spawn_bone_pile", effectDesc: "ON DEATH: Summon a 1/1 Bone Pile.", art: "/images/Bone Deputy.png", rarity: "common" },
      { key: "bonedeputy", name: "Bone Deputy", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeath", effectId: "spawn_bone_pile", effectDesc: "ON DEATH: Summon a 1/1 Bone Pile.", art: "/images/Bone Deputy.png", rarity: "common" },
      // Dusty Rattler x3 (diagonal attack)
      { key: "dustyrattler", name: "Dusty Rattler", atk: 2, hp: 1, cost: 1, type: "monster", effect: "passive", effectId: "diagonal_attack", effectDesc: "PASSIVE: Can attack diagonally.", art: "/images/Dusty Rattler.png", rarity: "common" },
      { key: "dustyrattler", name: "Dusty Rattler", atk: 2, hp: 1, cost: 1, type: "monster", effect: "passive", effectId: "diagonal_attack", effectDesc: "PASSIVE: Can attack diagonally.", art: "/images/Dusty Rattler.png", rarity: "common" },
      { key: "dustyrattler", name: "Dusty Rattler", atk: 2, hp: 1, cost: 1, type: "monster", effect: "passive", effectId: "diagonal_attack", effectDesc: "PASSIVE: Can attack diagonally.", art: "/images/Dusty Rattler.png", rarity: "common" },
      // Grave Robber x2 (draw on kill)
      { key: "graverobber", name: "Grave Robber", atk: 2, hp: 2, cost: 2, type: "monster", effect: "onKill", effectId: "draw_on_kill", effectDesc: "ON KILL: Draw 1 card.", art: "/images/Grave Robber.png", rarity: "rare" },
      { key: "graverobber", name: "Grave Robber", atk: 2, hp: 2, cost: 2, type: "monster", effect: "onKill", effectId: "draw_on_kill", effectDesc: "ON KILL: Draw 1 card.", art: "/images/Grave Robber.png", rarity: "rare" },
      // Phantom Scout x2 (untargetable first turn)
      { key: "phantomscout", name: "Phantom Scout", atk: 1, hp: 3, cost: 2, type: "monster", effect: "passive", effectId: "phantom", effectDesc: "PASSIVE: Untargetable on opponent's first turn after deploy.", art: "/images/Phantom Scout.png", rarity: "common" },
      { key: "phantomscout", name: "Phantom Scout", atk: 1, hp: 3, cost: 2, type: "monster", effect: "passive", effectId: "phantom", effectDesc: "PASSIVE: Untargetable on opponent's first turn after deploy.", art: "/images/Phantom Scout.png", rarity: "common" },
      // Bone Revolver x2 (ranged, ignores shields)
      { key: "bonerevolver", name: "Bone Revolver", atk: 3, hp: 2, cost: 3, type: "monster", effect: "passive", effectId: "ranged_pierce", effectDesc: "PASSIVE: Ranged (2 tiles). Ignores shield effects.", art: "/images/Bone Revolver.png", rarity: "rare" },
      { key: "bonerevolver", name: "Bone Revolver", atk: 3, hp: 2, cost: 3, type: "monster", effect: "passive", effectId: "ranged_pierce", effectDesc: "PASSIVE: Ranged (2 tiles). Ignores shield effects.", art: "/images/Bone Revolver.png", rarity: "rare" },
      // Undead Sheriff x2 (weaken aura)
      { key: "undeadsheriff", name: "Undead Sheriff", atk: 3, hp: 3, cost: 3, type: "monster", effect: "passive", effectId: "weaken_aura", effectDesc: "PASSIVE: Adjacent enemies deal -1 damage.", art: "/images/Undead Sheriff.png", rarity: "rare" },
      { key: "undeadsheriff", name: "Undead Sheriff", atk: 3, hp: 3, cost: 3, type: "monster", effect: "passive", effectId: "weaken_aura", effectDesc: "PASSIVE: Adjacent enemies deal -1 damage.", art: "/images/Undead Sheriff.png", rarity: "rare" },
      // Coffin Trapper x2 (root adjacent enemies)
      { key: "coffintrapper", name: "Coffin Trapper", atk: 1, hp: 5, cost: 3, type: "monster", effect: "passive", effectId: "root_aura", effectDesc: "PASSIVE: Adjacent enemies cannot move.", art: "/images/Coffin Trapper.png", rarity: "rare" },
      { key: "coffintrapper", name: "Coffin Trapper", atk: 1, hp: 5, cost: 3, type: "monster", effect: "passive", effectId: "root_aura", effectDesc: "PASSIVE: Adjacent enemies cannot move.", art: "/images/Coffin Trapper.png", rarity: "rare" },
      // Undertaker x2 (grows when allies die)
      { key: "undertaker", name: "Undertaker", atk: 3, hp: 3, cost: 4, type: "monster", effect: "passive", effectId: "grow_on_ally_death", effectDesc: "PASSIVE: Gains +1/+1 when a friendly unit dies.", art: "/images/Undertaker.png", rarity: "rare" },
      { key: "undertaker", name: "Undertaker", atk: 3, hp: 3, cost: 4, type: "monster", effect: "passive", effectId: "grow_on_ally_death", effectDesc: "PASSIVE: Gains +1/+1 when a friendly unit dies.", art: "/images/Undertaker.png", rarity: "rare" },
      // The Hanged Man x1 (deathrattle: damage adjacent enemies)
      { key: "thehangedman", name: "The Hanged Man", atk: 4, hp: 5, cost: 5, type: "monster", effect: "onDeath", effectId: "death_explosion", effectDesc: "ON DEATH: Deal 2 damage to all adjacent enemies.", art: "/images/The Hanged Man.png", rarity: "legendary" },
      // Ghostly Stampede x1 (long move + siege)
      { key: "ghostlystampede", name: "Ghostly Stampede", atk: 5, hp: 4, cost: 5, type: "monster", effect: "passive", effectId: "stampede", effectDesc: "PASSIVE: Can move up to 2 tiles. +2 damage to structures.", art: "/images/Ghostly Stampede.png", rarity: "legendary" },
      // Bone Colossus x1 (damage reduction)
      { key: "bonecolossus", name: "Bone Colossus", atk: 6, hp: 7, cost: 6, type: "monster", effect: "passive", effectId: "thick_bones", effectDesc: "PASSIVE: Takes 1 less damage from all sources.", art: "/images/Bone Colossus.png", rarity: "legendary" },
      // Dead Man's Hand x2 (draw 2, discard 1)
      { key: "deadmanshand", name: "Dead Man's Hand", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "draw_discard", effectDesc: "INSTANT: Draw 2 cards, then discard 1.", art: "/images/Dead Mans Hand.png", rarity: "common" },
      { key: "deadmanshand", name: "Dead Man's Hand", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "draw_discard", effectDesc: "INSTANT: Draw 2 cards, then discard 1.", art: "/images/Dead Mans Hand.png", rarity: "common" },
      // Most Wanted x2 (mark enemy for +2 damage)
      { key: "mostwanted", name: "Most Wanted", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "mark_target", effectDesc: "INSTANT: Target enemy takes +2 damage from all attacks.", art: "/images/Most Wanted.png", requiresTarget: "enemy_unit", rarity: "rare" },
      { key: "mostwanted", name: "Most Wanted", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "mark_target", effectDesc: "INSTANT: Target enemy takes +2 damage from all attacks.", art: "/images/Most Wanted.png", requiresTarget: "enemy_unit", rarity: "rare" },
      // Shallow Grave x1 (return unit from discard)
      { key: "shallowgrave", name: "Shallow Grave", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "resurrect", effectDesc: "INSTANT: Return a random friendly unit from discard to hand.", art: "/images/Shallow Grave.png", rarity: "legendary" },
      // High Noon x1 (row damage)
      { key: "highnoon", name: "High Noon", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "high_noon", effectDesc: "INSTANT: Deal 2 damage to all enemies in target row.", art: "/images/High Noon.png", requiresTarget: "row", rarity: "legendary" },
    ]
  },
  "crimson-court": {
    name: "Crimson Court",
    description: "Aristocratic vampires who drain life and rise from the grave",
    archetype: "vampire",
    cards: [
      // Thrall x3 (basic unit)
      { key: "thrall", name: "Thrall", atk: 1, hp: 2, cost: 1, type: "monster", art: "/images/Thrall.png", rarity: "common" },
      { key: "thrall", name: "Thrall", atk: 1, hp: 2, cost: 1, type: "monster", art: "/images/Thrall.png", rarity: "common" },
      { key: "thrall", name: "Thrall", atk: 1, hp: 2, cost: 1, type: "monster", art: "/images/Thrall.png", rarity: "common" },
      // Blood Familiar x3 (attacks twice, second heals self)
      { key: "bloodfamiliar", name: "Blood Familiar", atk: 2, hp: 1, cost: 1, type: "monster", effect: "passive", effectId: "blood_bite", effectDesc: "PASSIVE: Attacks twice. Second attack deals 1 damage.", art: "/images/Blood Familiar.png", rarity: "common" },
      { key: "bloodfamiliar", name: "Blood Familiar", atk: 2, hp: 1, cost: 1, type: "monster", effect: "passive", effectId: "blood_bite", effectDesc: "PASSIVE: Attacks twice. Second attack deals 1 damage.", art: "/images/Blood Familiar.png", rarity: "common" },
      { key: "bloodfamiliar", name: "Blood Familiar", atk: 2, hp: 1, cost: 1, type: "monster", effect: "passive", effectId: "blood_bite", effectDesc: "PASSIVE: Attacks twice. Second attack deals 1 damage.", art: "/images/Blood Familiar.png", rarity: "common" },
      // Nightstalker x3 (lifesteal)
      { key: "nightstalker", name: "Nightstalker", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "lifesteal", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP on attack.", art: "/images/Nightstalker.png", rarity: "common" },
      { key: "nightstalker", name: "Nightstalker", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "lifesteal", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP on attack.", art: "/images/Nightstalker.png", rarity: "common" },
      { key: "nightstalker", name: "Nightstalker", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "lifesteal", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP on attack.", art: "/images/Nightstalker.png", rarity: "common" },
      // Crypt Keeper x2 (gains max HP on ally death)
      { key: "cryptkeeper", name: "Crypt Keeper", atk: 1, hp: 3, cost: 2, type: "monster", effect: "passive", effectId: "grow_max_hp_on_ally_death", effectDesc: "PASSIVE: Gains +1 Max HP when a friendly unit dies.", art: "/images/Crypt Keeper.png", rarity: "rare" },
      { key: "cryptkeeper", name: "Crypt Keeper", atk: 1, hp: 3, cost: 2, type: "monster", effect: "passive", effectId: "grow_max_hp_on_ally_death", effectDesc: "PASSIVE: Gains +1 Max HP when a friendly unit dies.", art: "/images/Crypt Keeper.png", rarity: "rare" },
      // Vampire Spawn x3 (lifesteal)
      { key: "vampirespawn", name: "Vampire Spawn", atk: 2, hp: 3, cost: 3, type: "monster", effect: "passive", effectId: "lifesteal", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP on attack.", art: "/images/Vampire Spawn.png", rarity: "common" },
      { key: "vampirespawn", name: "Vampire Spawn", atk: 2, hp: 3, cost: 3, type: "monster", effect: "passive", effectId: "lifesteal", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP on attack.", art: "/images/Vampire Spawn.png", rarity: "common" },
      { key: "vampirespawn", name: "Vampire Spawn", atk: 2, hp: 3, cost: 3, type: "monster", effect: "passive", effectId: "lifesteal", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP on attack.", art: "/images/Vampire Spawn.png", rarity: "common" },
      // Blood Priest x2 (heals adjacent allies end of turn)
      { key: "bloodpriest", name: "Blood Priest", atk: 2, hp: 4, cost: 3, type: "monster", effect: "endOfTurn", effectId: "heal_adjacent", effectDesc: "END OF TURN: Heal adjacent allies for 1.", art: "/images/Blood Priest.png", rarity: "rare" },
      { key: "bloodpriest", name: "Blood Priest", atk: 2, hp: 4, cost: 3, type: "monster", effect: "endOfTurn", effectId: "heal_adjacent", effectDesc: "END OF TURN: Heal adjacent allies for 1.", art: "/images/Blood Priest.png", rarity: "rare" },
      // Soul Collector x2 (on kill: steal card)
      { key: "soulcollector", name: "Soul Collector", atk: 3, hp: 2, cost: 3, type: "monster", effect: "onKill", effectId: "steal_card", effectDesc: "ON KILL: Add a copy of killed unit to your hand.", art: "/images/Soul Collector.png", rarity: "rare" },
      { key: "soulcollector", name: "Soul Collector", atk: 3, hp: 2, cost: 3, type: "monster", effect: "onKill", effectId: "steal_card", effectDesc: "ON KILL: Add a copy of killed unit to your hand.", art: "/images/Soul Collector.png", rarity: "rare" },
      // Nosferatu x2 (lifesteal + weaken aura)
      { key: "nosferatu", name: "Nosferatu", atk: 3, hp: 4, cost: 4, type: "monster", effect: "passive", effectId: "lifesteal_weaken", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP on attack. Adjacent enemies deal -1 damage.", art: "/images/Nosferatu.png", rarity: "rare" },
      { key: "nosferatu", name: "Nosferatu", atk: 3, hp: 4, cost: 4, type: "monster", effect: "passive", effectId: "lifesteal_weaken", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP on attack. Adjacent enemies deal -1 damage.", art: "/images/Nosferatu.png", rarity: "rare" },
      // Coffin x2 (resurrects self)
      { key: "coffin", name: "Coffin", atk: 0, hp: 6, cost: 4, type: "structure", effect: "passive", effectId: "resurrect_self", effectDesc: "PASSIVE: If destroyed, resummon at start of your next turn.", art: "/images/Coffin.png", rarity: "rare" },
      { key: "coffin", name: "Coffin", atk: 0, hp: 6, cost: 4, type: "structure", effect: "passive", effectId: "resurrect_self", effectDesc: "PASSIVE: If destroyed, resummon at start of your next turn.", art: "/images/Coffin.png", rarity: "rare" },
      // Blood Countess x1 (lifesteal + grows on kill)
      { key: "bloodcountess", name: "Blood Countess", atk: 4, hp: 5, cost: 5, type: "monster", effect: "passive", effectId: "lifesteal_grow", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP on attack. ON KILL: Gain +1/+1.", art: "/images/Blood Countess.png", rarity: "legendary" },
      // Elder Vampire x1 (immortal - heals to full once)
      { key: "eldervampire", name: "Elder Vampire", atk: 3, hp: 6, cost: 5, type: "monster", effect: "passive", effectId: "immortal", effectDesc: "PASSIVE: When this would die, instead heal to full HP (once per game).", art: "/images/Elder Vampire.png", rarity: "legendary" },
      // Vampire Lord x1 (diagonal + grants lifesteal to all)
      { key: "vampirelord", name: "Vampire Lord", atk: 5, hp: 7, cost: 6, type: "monster", effect: "passive", effectId: "lifesteal_lord", effectDesc: "PASSIVE: Can attack diagonally. All friendly units have Lifesteal.", art: "/images/Vampire Lord.png", rarity: "legendary" },
      // Blood Pact x2 (damage friendly, draw 2)
      { key: "bloodpact", name: "Blood Pact", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "blood_pact", effectDesc: "INSTANT: Deal 2 damage to target friendly unit. Draw 2 cards.", art: "/images/Blood Pact.png", requiresTarget: "unit", rarity: "rare" },
      { key: "bloodpact", name: "Blood Pact", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "blood_pact", effectDesc: "INSTANT: Deal 2 damage to target friendly unit. Draw 2 cards.", art: "/images/Blood Pact.png", requiresTarget: "unit", rarity: "rare" },
      // Blood Transfusion x2 (swap ATK and HP)
      { key: "bloodtransfusion", name: "Blood Transfusion", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "swap_stats", effectDesc: "INSTANT: Swap target unit's ATK and HP.", art: "/images/Blood Transfusion.png", requiresTarget: "any_unit", rarity: "rare" },
      { key: "bloodtransfusion", name: "Blood Transfusion", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "swap_stats", effectDesc: "INSTANT: Swap target unit's ATK and HP.", art: "/images/Blood Transfusion.png", requiresTarget: "any_unit", rarity: "rare" },
      // Crimson Revival x1 (return last 2 dead to hand)
      { key: "crimsonrevival", name: "Crimson Revival", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "mass_resurrect", effectDesc: "INSTANT: Return the last 2 units that died to your hand.", art: "/images/Crimson Revival.png", rarity: "rare" },
      // Sanguine Feast x1 (row damage + heal)
      { key: "sanguinefeast", name: "Sanguine Feast", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "sanguine_feast", effectDesc: "INSTANT: Deal 2 damage to all enemies in target row. Heal your Heart for each hit.", art: "/images/Sanguine Feast.png", requiresTarget: "row", rarity: "legendary" },
    ]
  },
  "jeweled-court": {
    name: "Jeweled Court",
    description: "Elegant fairies with gem magic - debuff enemies and swarm with sparkle",
    archetype: "fairy",
    cards: [
      // Ruby Sprite x3 (death retaliation)
      { key: "rubysprite", name: "Ruby Sprite", atk: 2, hp: 1, cost: 1, type: "monster", effect: "onDeath", effectId: "death_gem_card", effectDesc: "ON DEATH: Add a Gem Shard card to your hand.", art: "/images/Ruby Sprite.png", rarity: "common" },
      { key: "rubysprite", name: "Ruby Sprite", atk: 2, hp: 1, cost: 1, type: "monster", effect: "onDeath", effectId: "death_gem_card", effectDesc: "ON DEATH: Add a Gem Shard card to your hand.", art: "/images/Ruby Sprite.png", rarity: "common" },
      { key: "rubysprite", name: "Ruby Sprite", atk: 2, hp: 1, cost: 1, type: "monster", effect: "onDeath", effectId: "death_gem_card", effectDesc: "ON DEATH: Add a Gem Shard card to your hand.", art: "/images/Ruby Sprite.png", rarity: "common" },
      // Emerald Forager x3 (spawn gem on deploy)
      { key: "emeraldforager", name: "Emerald Forager", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeploy", effectId: "gem_spawn", effectDesc: "ON DEPLOY: Summon a 1/1 Gem Shard in an adjacent empty tile.", art: "/images/Emerald Forager.png", rarity: "common" },
      { key: "emeraldforager", name: "Emerald Forager", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeploy", effectId: "gem_spawn", effectDesc: "ON DEPLOY: Summon a 1/1 Gem Shard in an adjacent empty tile.", art: "/images/Emerald Forager.png", rarity: "common" },
      { key: "emeraldforager", name: "Emerald Forager", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeploy", effectId: "gem_spawn", effectDesc: "ON DEPLOY: Summon a 1/1 Gem Shard in an adjacent empty tile.", art: "/images/Emerald Forager.png", rarity: "common" },
      // Sapphire Dancer x3 (swap with fairy)
      { key: "sapphiredancer", name: "Sapphire Dancer", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "fairy_swap", effectDesc: "PASSIVE: Can swap positions with any friendly unit.", art: "/images/Sapphire Dancer.png", rarity: "common" },
      { key: "sapphiredancer", name: "Sapphire Dancer", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "fairy_swap", effectDesc: "PASSIVE: Can swap positions with any friendly unit.", art: "/images/Sapphire Dancer.png", rarity: "common" },
      { key: "sapphiredancer", name: "Sapphire Dancer", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "fairy_swap", effectDesc: "PASSIVE: Can swap positions with any friendly unit.", art: "/images/Sapphire Dancer.png", rarity: "common" },
      // Topaz Miner x3 (buff from adjacent gems)
      { key: "topazminer", name: "Topaz Miner", atk: 1, hp: 3, cost: 2, type: "monster", effect: "endOfTurn", effectId: "gem_adjacent_buff", effectDesc: "END OF TURN: If adjacent to a Gem Shard, gain +1 ATK.", art: "/images/Topaz Miner.png", rarity: "common" },
      { key: "topazminer", name: "Topaz Miner", atk: 1, hp: 3, cost: 2, type: "monster", effect: "endOfTurn", effectId: "gem_adjacent_buff", effectDesc: "END OF TURN: If adjacent to a Gem Shard, gain +1 ATK.", art: "/images/Topaz Miner.png", rarity: "common" },
      { key: "topazminer", name: "Topaz Miner", atk: 1, hp: 3, cost: 2, type: "monster", effect: "endOfTurn", effectId: "gem_adjacent_buff", effectDesc: "END OF TURN: If adjacent to a Gem Shard, gain +1 ATK.", art: "/images/Topaz Miner.png", rarity: "common" },
      // Amethyst Enchanter x2 (reflect damage)
      { key: "amethystenchanter", name: "Amethyst Enchanter", atk: 2, hp: 3, cost: 3, type: "monster", effect: "passive", effectId: "reflect_damage", effectDesc: "PASSIVE: Reflects 1 damage back to attackers.", art: "/images/Amethyst Enchanter.png", rarity: "rare" },
      { key: "amethystenchanter", name: "Amethyst Enchanter", atk: 2, hp: 3, cost: 3, type: "monster", effect: "passive", effectId: "reflect_damage", effectDesc: "PASSIVE: Reflects 1 damage back to attackers.", art: "/images/Amethyst Enchanter.png", rarity: "rare" },
      // Diamond Guardian x2 (bodyguard)
      { key: "diamondguardian", name: "Diamond Guardian", atk: 1, hp: 5, cost: 3, type: "monster", effect: "passive", effectId: "bodyguard", effectDesc: "PASSIVE: When an adjacent friendly takes damage, this unit takes 1 of that damage instead.", art: "/images/Diamond Guardian.png", rarity: "rare" },
      { key: "diamondguardian", name: "Diamond Guardian", atk: 1, hp: 5, cost: 3, type: "monster", effect: "passive", effectId: "bodyguard", effectDesc: "PASSIVE: When an adjacent friendly takes damage, this unit takes 1 of that damage instead.", art: "/images/Diamond Guardian.png", rarity: "rare" },
      // Opal Devourer x2 (consume gems)
      { key: "opaldevourer", name: "Opal Devourer", atk: 2, hp: 2, cost: 3, type: "monster", effect: "passive", effectId: "consume_gem", effectDesc: "PASSIVE: Can attack friendly Gem Shards to gain +2/+2.", art: "/images/Opal Devourer.png", rarity: "rare" },
      { key: "opaldevourer", name: "Opal Devourer", atk: 2, hp: 2, cost: 3, type: "monster", effect: "passive", effectId: "consume_gem", effectDesc: "PASSIVE: Can attack friendly Gem Shards to gain +2/+2.", art: "/images/Opal Devourer.png", rarity: "rare" },
      // Pearl Blessing x2 (mass buff spell)
      { key: "pearlblessing", name: "Pearl Blessing", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "fairy_blessing", effectDesc: "INSTANT: All friendly units gain +1 HP. Fairies also gain +1 ATK.", art: "/images/Pearl Blessing.png", rarity: "rare" },
      { key: "pearlblessing", name: "Pearl Blessing", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "fairy_blessing", effectDesc: "INSTANT: All friendly units gain +1 HP. Fairies also gain +1 ATK.", art: "/images/Pearl Blessing.png", rarity: "rare" },
      // Garnet Queen x1 (ATK suppress + ally buff)
      { key: "garnetqueen", name: "Garnet Queen", atk: 3, hp: 5, cost: 5, type: "monster", effect: "passive", effectId: "garnet_aura", effectDesc: "PASSIVE: Adjacent enemies have ATK reduced to max 2. Adjacent friendlies gain +1 ATK.", art: "/images/Garnet Queen.png", rarity: "legendary" },
      // Moonstone Witch x1 (transform kills + gem buff)
      { key: "moonstonewitch", name: "Moonstone Witch", atk: 2, hp: 4, cost: 4, type: "monster", effect: "onKill", effectId: "gem_transform", effectDesc: "ON KILL: Transform killed unit into a 1/1 Gem Shard. PASSIVE: +1 ATK per Gem Shard on field.", art: "/images/Moonstone Witch.png", rarity: "legendary" },
      // Prismatic Fairy x1 (gem death AOE)
      { key: "prismaticfairy", name: "Prismatic Fairy", atk: 3, hp: 4, cost: 5, type: "monster", effect: "passive", effectId: "gem_death_aoe", effectDesc: "PASSIVE: When a friendly Gem Shard dies, all enemies take 1 damage.", art: "/images/Prismatic Fairy.png", rarity: "legendary" },
      // Gemstone Curse x1 (halve ATK spell)
      { key: "gemstonecurse", name: "Gemstone Curse", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "halve_atk", effectDesc: "INSTANT: Reduce target enemy's ATK by half (rounded down, minimum 1).", art: "/images/Gemstone Curse.png", requiresTarget: "enemy_unit", rarity: "legendary" },
      // Fairy Ring x1 (summon gems spell)
      { key: "fairyring", name: "Fairy Ring", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "summon_gems", effectDesc: "INSTANT: Summon two 1/1 Gem Shards in your home rows.", art: "/images/Fairy Ring.png", rarity: "legendary" },
    ]
  },
  
  'elunes-chosen': {
    name: "Elune's Chosen",
    archetype: "night-elf",
    cards: [
      // === COMMON UNITS (12) ===
      // Moon Sentinel x3 (gains HP if adjacent to 2 allies)
      { key: "moonsentinel", name: "Moon Sentinel", atk: 2, hp: 1, cost: 1, type: "monster", effect: "startOfTurn", effectId: "sentinel_growth", effectDesc: "START OF TURN: Gain +1 HP if adjacent to 2+ allies.", art: "/images/Moon Sentinel.png", rarity: "common" },
      { key: "moonsentinel", name: "Moon Sentinel", atk: 2, hp: 1, cost: 1, type: "monster", effect: "startOfTurn", effectId: "sentinel_growth", effectDesc: "START OF TURN: Gain +1 HP if adjacent to 2+ allies.", art: "/images/Moon Sentinel.png", rarity: "common" },
      { key: "moonsentinel", name: "Moon Sentinel", atk: 2, hp: 1, cost: 1, type: "monster", effect: "startOfTurn", effectId: "sentinel_growth", effectDesc: "START OF TURN: Gain +1 HP if adjacent to 2+ allies.", art: "/images/Moon Sentinel.png", rarity: "common" },
      // Star Weave Archer x3 (ranged, gains ATK from adjacent allies)
      { key: "starweavearcher", name: "Star Weave Archer", atk: 1, hp: 1, cost: 1, type: "monster", effect: "passive", effectId: "starweave_ranged", effectDesc: "PASSIVE: Range 2. Gains +1 ATK for each adjacent ally.", art: "/images/Star Weave Archer.png", rarity: "common" },
      { key: "starweavearcher", name: "Star Weave Archer", atk: 1, hp: 1, cost: 1, type: "monster", effect: "passive", effectId: "starweave_ranged", effectDesc: "PASSIVE: Range 2. Gains +1 ATK for each adjacent ally.", art: "/images/Star Weave Archer.png", rarity: "common" },
      { key: "starweavearcher", name: "Star Weave Archer", atk: 1, hp: 1, cost: 1, type: "monster", effect: "passive", effectId: "starweave_ranged", effectDesc: "PASSIVE: Range 2. Gains +1 ATK for each adjacent ally.", art: "/images/Star Weave Archer.png", rarity: "common" },
      // Moonlit Blade Dancer x3 (move again on kill)
      { key: "moonlitbladedancer", name: "Moonlit Blade Dancer", atk: 3, hp: 1, cost: 2, type: "monster", effect: "onKill", effectId: "blade_dance", effectDesc: "ON KILL: Can move again this turn.", art: "/images/Moonlit Blade Dancer.png", rarity: "common" },
      { key: "moonlitbladedancer", name: "Moonlit Blade Dancer", atk: 3, hp: 1, cost: 2, type: "monster", effect: "onKill", effectId: "blade_dance", effectDesc: "ON KILL: Can move again this turn.", art: "/images/Moonlit Blade Dancer.png", rarity: "common" },
      { key: "moonlitbladedancer", name: "Moonlit Blade Dancer", atk: 3, hp: 1, cost: 2, type: "monster", effect: "onKill", effectId: "blade_dance", effectDesc: "ON KILL: Can move again this turn.", art: "/images/Moonlit Blade Dancer.png", rarity: "common" },
      // Lunar Priestess x3 (heal allies by attacking them)
      { key: "lunarpriestess", name: "Lunar Priestess", atk: 3, hp: 2, cost: 3, type: "monster", effect: "passive", effectId: "heal_attack", effectDesc: "PASSIVE: Can attack allies to heal them for ATK instead of damage.", art: "/images/Lunar Priestess.png", rarity: "common" },
      { key: "lunarpriestess", name: "Lunar Priestess", atk: 3, hp: 2, cost: 3, type: "monster", effect: "passive", effectId: "heal_attack", effectDesc: "PASSIVE: Can attack allies to heal them for ATK instead of damage.", art: "/images/Lunar Priestess.png", rarity: "common" },
      { key: "lunarpriestess", name: "Lunar Priestess", atk: 3, hp: 2, cost: 3, type: "monster", effect: "passive", effectId: "heal_attack", effectDesc: "PASSIVE: Can attack allies to heal them for ATK instead of damage.", art: "/images/Lunar Priestess.png", rarity: "common" },
      // === COMMON SPELLS (4) ===
      // Twilight's Respite x2 (damage reduction)
      { key: "twilightsrespite", name: "Twilight's Respite", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "damage_reduction", effectDesc: "INSTANT: Your units take -1 damage from all sources until your next turn.", art: "/images/Twilights Respite.png", rarity: "common" },
      { key: "twilightsrespite", name: "Twilight's Respite", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "damage_reduction", effectDesc: "INSTANT: Your units take -1 damage from all sources until your next turn.", art: "/images/Twilights Respite.png", rarity: "common" },
      // Hunting God's Blessing x2 (+1 ATK and range)
      { key: "huntinggodsblessing", name: "Hunting God's Blessing", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "hunter_blessing", effectDesc: "INSTANT: Target ally gains +1 ATK and +1 range this turn.", art: "/images/Hunting Gods Blessing.png", requiresTarget: "unit", rarity: "common" },
      { key: "huntinggodsblessing", name: "Hunting God's Blessing", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "hunter_blessing", effectDesc: "INSTANT: Target ally gains +1 ATK and +1 range this turn.", art: "/images/Hunting Gods Blessing.png", requiresTarget: "unit", rarity: "common" },
      // === RARE UNITS (6) ===
      // Stone Giant x2 (takes damage for adjacent allies)
      { key: "stonegiant", name: "Stone Giant", atk: 3, hp: 8, cost: 5, type: "monster", effect: "passive", effectId: "stone_shield", effectDesc: "PASSIVE: When an adjacent ally would take damage, this unit takes it instead.", art: "/images/Stone Giant.png", rarity: "rare" },
      { key: "stonegiant", name: "Stone Giant", atk: 3, hp: 8, cost: 5, type: "monster", effect: "passive", effectId: "stone_shield", effectDesc: "PASSIVE: When an adjacent ally would take damage, this unit takes it instead.", art: "/images/Stone Giant.png", rarity: "rare" },
      // Night Shade Ambusher x2 (deploy in neutral zones)
      { key: "nightshadeambusher", name: "Night Shade Ambusher", atk: 4, hp: 2, cost: 4, type: "monster", effect: "passive", effectId: "ambush_deploy", effectDesc: "PASSIVE: Can be deployed in neutral zones (rows 2-4).", art: "/images/Night Shade Ambusher.png", rarity: "rare" },
      { key: "nightshadeambusher", name: "Night Shade Ambusher", atk: 4, hp: 2, cost: 4, type: "monster", effect: "passive", effectId: "ambush_deploy", effectDesc: "PASSIVE: Can be deployed in neutral zones (rows 2-4).", art: "/images/Night Shade Ambusher.png", rarity: "rare" },
      // Moon Shadow Warden x2 (root enemies on attack)
      { key: "moonshadowwarden", name: "Moon Shadow Warden", atk: 4, hp: 2, cost: 3, type: "monster", effect: "onAttack", effectId: "shadow_root", effectDesc: "ON ATTACK: Target cannot move next turn.", art: "/images/Moon Shadow Warden.png", rarity: "rare" },
      { key: "moonshadowwarden", name: "Moon Shadow Warden", atk: 4, hp: 2, cost: 3, type: "monster", effect: "onAttack", effectId: "shadow_root", effectDesc: "ON ATTACK: Target cannot move next turn.", art: "/images/Moon Shadow Warden.png", rarity: "rare" },
      // === RARE STRUCTURES (2) ===
      // Elune's Moonwell x2 (energy + draw if adjacent to 2 allies)
      { key: "elunesmoonwell", name: "Elune's Moonwell", atk: 0, hp: 4, cost: 2, type: "structure", effect: "startOfTurn", effectId: "moonwell_power", effectDesc: "START OF TURN: If adjacent to 2+ allies, gain 1 energy and draw a card.", art: "/images/Elunes Moonwell.png", rarity: "rare" },
      { key: "elunesmoonwell", name: "Elune's Moonwell", atk: 0, hp: 4, cost: 2, type: "structure", effect: "startOfTurn", effectId: "moonwell_power", effectDesc: "START OF TURN: If adjacent to 2+ allies, gain 1 energy and draw a card.", art: "/images/Elunes Moonwell.png", rarity: "rare" },
      // === RARE SPELLS (2) ===
      // Lunar Prayer x2 (death ward)
      { key: "lunarprayer", name: "Lunar Prayer", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "death_ward", effectDesc: "INSTANT: Target ally gains Death Ward - the next time it would die, it survives with 1 HP instead.", art: "/images/Lunar Prayer.png", requiresTarget: "unit", rarity: "rare" },
      { key: "lunarprayer", name: "Lunar Prayer", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "death_ward", effectDesc: "INSTANT: Target ally gains Death Ward - the next time it would die, it survives with 1 HP instead.", art: "/images/Lunar Prayer.png", requiresTarget: "unit", rarity: "rare" },
      // === RARE UNITS (2 more) ===
      // Moon Flare Sorceress x2 (buff adjacent allies)
      { key: "moonflaresorceress", name: "Moon Flare Sorceress", atk: 2, hp: 6, cost: 4, type: "monster", effect: "passive", effectId: "moonflare_aura", effectDesc: "PASSIVE: Adjacent allies gain +1 ATK and +1 HP.", art: "/images/Moon Flare Sorceress.png", rarity: "rare" },
      { key: "moonflaresorceress", name: "Moon Flare Sorceress", atk: 2, hp: 6, cost: 4, type: "monster", effect: "passive", effectId: "moonflare_aura", effectDesc: "PASSIVE: Adjacent allies gain +1 ATK and +1 HP.", art: "/images/Moon Flare Sorceress.png", rarity: "rare" },
      // === LEGENDARY UNITS (3) ===
      // Starlit Champion x1 (energy + ATK on kill)
      { key: "starlitchampion", name: "Starlit Champion", atk: 4, hp: 6, cost: 6, type: "monster", effect: "onKill", effectId: "starlit_slayer", effectDesc: "ON KILL: Gain 1 energy and +1 ATK permanently.", art: "/images/Starlit Champion.png", rarity: "legendary" },
      // Star Invoker x1 (random damage at start of turn)
      { key: "starinvoker", name: "Star Invoker", atk: 2, hp: 5, cost: 6, type: "monster", effect: "startOfTurn", effectId: "star_strike", effectDesc: "START OF TURN: Deal 2 damage to a random enemy.", art: "/images/Star Invoker.png", rarity: "legendary" },
      // === LEGENDARY STRUCTURE (1) ===
      // Temple of the Moon x1 (permanent ATK buff to adjacent allies)
      { key: "templeofthemoon", name: "Temple of the Moon", atk: 0, hp: 4, cost: 4, type: "structure", effect: "startOfTurn", effectId: "temple_blessing", effectDesc: "START OF TURN: If adjacent to 2+ allies, give them +1 ATK permanently.", art: "/images/Temple of the Moon.png", rarity: "legendary" },
      // === LEGENDARY SPELL (1) ===
      // Lunar Barrage x1 (AOE damage)
      { key: "lunarbarrage", name: "Lunar Barrage", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "lunar_aoe", effectDesc: "INSTANT: Deal 2 damage to all enemies in and adjacent to target tile (not home rows).", art: "/images/Lunar Barrage.png", requiresTarget: "tile", rarity: "legendary" },
    ]
  },
  
  // ==================== CHALLENGE MODE DECKS ====================
  // These decks break normal rules - multiple legendaries, 4+ copies, etc.
  
  "void-alien-challenge": {
    name: "Void Alien (Challenge)",
    description: "CHALLENGE MODE: An overwhelming alien swarm with no limits",
    archetype: "alien",
    isChallenge: true,
    cards: [
      // === LEGENDARY SPAM (The unfair stuff) ===
      // Adaptive Colossus x3 (normally 1) - unkillable walls
      { key: "adaptivecolossus", name: "Adaptive Colossus", atk: 4, hp: 5, cost: 4, type: "monster", effect: "passive", effectId: "adapt_hp", effectDesc: "PASSIVE: Gains +1 Max HP when surviving damage.", art: "/images/Adaptive Colossus.png", rarity: "legendary" },
      { key: "adaptivecolossus", name: "Adaptive Colossus", atk: 4, hp: 5, cost: 4, type: "monster", effect: "passive", effectId: "adapt_hp", effectDesc: "PASSIVE: Gains +1 Max HP when surviving damage.", art: "/images/Adaptive Colossus.png", rarity: "legendary" },
      { key: "adaptivecolossus", name: "Adaptive Colossus", atk: 4, hp: 5, cost: 4, type: "monster", effect: "passive", effectId: "adapt_hp", effectDesc: "PASSIVE: Gains +1 Max HP when surviving damage.", art: "/images/Adaptive Colossus.png", rarity: "legendary" },
      // Eclipse Devourer x3 (normally 1) - energy monsters
      { key: "eclipsedevourer", name: "Eclipse Devourer", atk: 5, hp: 4, cost: 5, type: "monster", effect: "onKill", effectId: "energy_on_kill", effectDesc: "ON KILL: Gain 1 Energy.", art: "/images/Eclipse Devourer.png", rarity: "legendary" },
      { key: "eclipsedevourer", name: "Eclipse Devourer", atk: 5, hp: 4, cost: 5, type: "monster", effect: "onKill", effectId: "energy_on_kill", effectDesc: "ON KILL: Gain 1 Energy.", art: "/images/Eclipse Devourer.png", rarity: "legendary" },
      { key: "eclipsedevourer", name: "Eclipse Devourer", atk: 5, hp: 4, cost: 5, type: "monster", effect: "onKill", effectId: "energy_on_kill", effectDesc: "ON KILL: Gain 1 Energy.", art: "/images/Eclipse Devourer.png", rarity: "legendary" },
      // Hive Ascension x3 (normally 1) - mass buffs
      { key: "hiveascension", name: "Hive Ascension", atk: 0, hp: 0, cost: 7, type: "spell", effect: "instant", effectId: "mass_buff", effectDesc: "INSTANT: All friendly units gain +1 ATK and +1 HP permanently.", art: "/images/Hive Ascension.png", rarity: "legendary" },
      { key: "hiveascension", name: "Hive Ascension", atk: 0, hp: 0, cost: 7, type: "spell", effect: "instant", effectId: "mass_buff", effectDesc: "INSTANT: All friendly units gain +1 ATK and +1 HP permanently.", art: "/images/Hive Ascension.png", rarity: "legendary" },
      { key: "hiveascension", name: "Hive Ascension", atk: 0, hp: 0, cost: 7, type: "spell", effect: "instant", effectId: "mass_buff", effectDesc: "INSTANT: All friendly units gain +1 ATK and +1 HP permanently.", art: "/images/Hive Ascension.png", rarity: "legendary" },
      
      // === STRONG SYNERGY CARDS ===
      // Psionic Overseer x3 - attack aura stacking
      { key: "psionicoverseer", name: "Psionic Overseer", atk: 2, hp: 3, cost: 3, type: "monster", effect: "passive", effectId: "attack_aura", effectDesc: "PASSIVE: Adjacent allies gain +1 ATK.", art: "/images/Psionic Overseer.png", rarity: "rare" },
      { key: "psionicoverseer", name: "Psionic Overseer", atk: 2, hp: 3, cost: 3, type: "monster", effect: "passive", effectId: "attack_aura", effectDesc: "PASSIVE: Adjacent allies gain +1 ATK.", art: "/images/Psionic Overseer.png", rarity: "rare" },
      { key: "psionicoverseer", name: "Psionic Overseer", atk: 2, hp: 3, cost: 3, type: "monster", effect: "passive", effectId: "attack_aura", effectDesc: "PASSIVE: Adjacent allies gain +1 ATK.", art: "/images/Psionic Overseer.png", rarity: "rare" },
      // Burrower Beast x5 - untargetable threats
      { key: "burrowerbeast", name: "Burrower Beast", atk: 3, hp: 3, cost: 3, type: "monster", effect: "passive", effectId: "burrow", effectDesc: "PASSIVE: Untargetable for 2 turns. Can deploy adjacent to allies.", art: "/images/Burrower Beast.png", rarity: "rare" },
      { key: "burrowerbeast", name: "Burrower Beast", atk: 3, hp: 3, cost: 3, type: "monster", effect: "passive", effectId: "burrow", effectDesc: "PASSIVE: Untargetable for 2 turns. Can deploy adjacent to allies.", art: "/images/Burrower Beast.png", rarity: "rare" },
      { key: "burrowerbeast", name: "Burrower Beast", atk: 3, hp: 3, cost: 3, type: "monster", effect: "passive", effectId: "burrow", effectDesc: "PASSIVE: Untargetable for 2 turns. Can deploy adjacent to allies.", art: "/images/Burrower Beast.png", rarity: "rare" },
      { key: "burrowerbeast", name: "Burrower Beast", atk: 3, hp: 3, cost: 3, type: "monster", effect: "passive", effectId: "burrow", effectDesc: "PASSIVE: Untargetable for 2 turns. Can deploy adjacent to allies.", art: "/images/Burrower Beast.png", rarity: "rare" },
      { key: "burrowerbeast", name: "Burrower Beast", atk: 3, hp: 3, cost: 3, type: "monster", effect: "passive", effectId: "burrow", effectDesc: "PASSIVE: Untargetable for 2 turns. Can deploy adjacent to allies.", art: "/images/Burrower Beast.png", rarity: "rare" },
      
      // === REMOVAL SPAM ===
      // Assimilation x4 - destroy weak units
      { key: "assimilation", name: "Assimilation", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "destroy_weak", effectDesc: "INSTANT: Destroy target enemy with 2 or less HP.", art: "/images/Assimilation.png", requiresTarget: "enemy_unit", rarity: "rare" },
      { key: "assimilation", name: "Assimilation", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "destroy_weak", effectDesc: "INSTANT: Destroy target enemy with 2 or less HP.", art: "/images/Assimilation.png", requiresTarget: "enemy_unit", rarity: "rare" },
      { key: "assimilation", name: "Assimilation", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "destroy_weak", effectDesc: "INSTANT: Destroy target enemy with 2 or less HP.", art: "/images/Assimilation.png", requiresTarget: "enemy_unit", rarity: "rare" },
      { key: "assimilation", name: "Assimilation", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "destroy_weak", effectDesc: "INSTANT: Destroy target enemy with 2 or less HP.", art: "/images/Assimilation.png", requiresTarget: "enemy_unit", rarity: "rare" },
      // Void Collapse x3 - row damage
      { key: "voidcollapse", name: "Void Collapse", atk: 0, hp: 0, cost: 5, type: "spell", effect: "instant", effectId: "row_damage", effectDesc: "INSTANT: Deal 1 damage to all enemies in target row.", art: "/images/Void Collapse.png", requiresTarget: "row", rarity: "rare" },
      { key: "voidcollapse", name: "Void Collapse", atk: 0, hp: 0, cost: 5, type: "spell", effect: "instant", effectId: "row_damage", effectDesc: "INSTANT: Deal 1 damage to all enemies in target row.", art: "/images/Void Collapse.png", requiresTarget: "row", rarity: "rare" },
      { key: "voidcollapse", name: "Void Collapse", atk: 0, hp: 0, cost: 5, type: "spell", effect: "instant", effectId: "row_damage", effectDesc: "INSTANT: Deal 1 damage to all enemies in target row.", art: "/images/Void Collapse.png", requiresTarget: "row", rarity: "rare" },
      
      // === FODDER FOR SACRIFICE ===
      // Scavenger Larva x6 - energy on death
      { key: "scavengerlarva", name: "Scavenger Larva", atk: 1, hp: 1, cost: 1, type: "monster", effect: "onDeath", effectId: "energy_on_death", effectDesc: "ON DEATH: Gain 1 Energy.", art: "/images/Scavenger Larva.png", rarity: "common" },
      { key: "scavengerlarva", name: "Scavenger Larva", atk: 1, hp: 1, cost: 1, type: "monster", effect: "onDeath", effectId: "energy_on_death", effectDesc: "ON DEATH: Gain 1 Energy.", art: "/images/Scavenger Larva.png", rarity: "common" },
      { key: "scavengerlarva", name: "Scavenger Larva", atk: 1, hp: 1, cost: 1, type: "monster", effect: "onDeath", effectId: "energy_on_death", effectDesc: "ON DEATH: Gain 1 Energy.", art: "/images/Scavenger Larva.png", rarity: "common" },
      { key: "scavengerlarva", name: "Scavenger Larva", atk: 1, hp: 1, cost: 1, type: "monster", effect: "onDeath", effectId: "energy_on_death", effectDesc: "ON DEATH: Gain 1 Energy.", art: "/images/Scavenger Larva.png", rarity: "common" },
      { key: "scavengerlarva", name: "Scavenger Larva", atk: 1, hp: 1, cost: 1, type: "monster", effect: "onDeath", effectId: "energy_on_death", effectDesc: "ON DEATH: Gain 1 Energy.", art: "/images/Scavenger Larva.png", rarity: "common" },
      { key: "scavengerlarva", name: "Scavenger Larva", atk: 1, hp: 1, cost: 1, type: "monster", effect: "onDeath", effectId: "energy_on_death", effectDesc: "ON DEATH: Gain 1 Energy.", art: "/images/Scavenger Larva.png", rarity: "common" },
    ]
  },
  "western-skeleton-challenge": {
    name: "Western Skeleton (Challenge)",
    description: "CHALLENGE MODE: The Dead Sheriff's unstoppable posse from Boot Hill",
    archetype: "skeleton",
    isChallenge: true,
    cards: [
      // === LEGENDARY SPAM (The unfair stuff) ===
      // Bone Colossus x3 (normally 1) - damage reduction tanks
      { key: "bonecolossus", name: "Bone Colossus", atk: 6, hp: 7, cost: 6, type: "monster", effect: "passive", effectId: "thick_bones", effectDesc: "PASSIVE: Takes 1 less damage from all sources.", art: "/images/Bone Colossus.png", rarity: "legendary" },
      { key: "bonecolossus", name: "Bone Colossus", atk: 6, hp: 7, cost: 6, type: "monster", effect: "passive", effectId: "thick_bones", effectDesc: "PASSIVE: Takes 1 less damage from all sources.", art: "/images/Bone Colossus.png", rarity: "legendary" },
      { key: "bonecolossus", name: "Bone Colossus", atk: 6, hp: 7, cost: 6, type: "monster", effect: "passive", effectId: "thick_bones", effectDesc: "PASSIVE: Takes 1 less damage from all sources.", art: "/images/Bone Colossus.png", rarity: "legendary" },
      // The Hanged Man x3 (normally 1) - death explosions
      { key: "thehangedman", name: "The Hanged Man", atk: 4, hp: 5, cost: 5, type: "monster", effect: "onDeath", effectId: "death_explosion", effectDesc: "ON DEATH: Deal 2 damage to all adjacent enemies.", art: "/images/The Hanged Man.png", rarity: "legendary" },
      { key: "thehangedman", name: "The Hanged Man", atk: 4, hp: 5, cost: 5, type: "monster", effect: "onDeath", effectId: "death_explosion", effectDesc: "ON DEATH: Deal 2 damage to all adjacent enemies.", art: "/images/The Hanged Man.png", rarity: "legendary" },
      { key: "thehangedman", name: "The Hanged Man", atk: 4, hp: 5, cost: 5, type: "monster", effect: "onDeath", effectId: "death_explosion", effectDesc: "ON DEATH: Deal 2 damage to all adjacent enemies.", art: "/images/The Hanged Man.png", rarity: "legendary" },
      // Ghostly Stampede x3 (normally 1) - mobile siege monsters
      { key: "ghostlystampede", name: "Ghostly Stampede", atk: 5, hp: 4, cost: 5, type: "monster", effect: "passive", effectId: "stampede", effectDesc: "PASSIVE: Can move up to 2 tiles. +2 damage to structures.", art: "/images/Ghostly Stampede.png", rarity: "legendary" },
      { key: "ghostlystampede", name: "Ghostly Stampede", atk: 5, hp: 4, cost: 5, type: "monster", effect: "passive", effectId: "stampede", effectDesc: "PASSIVE: Can move up to 2 tiles. +2 damage to structures.", art: "/images/Ghostly Stampede.png", rarity: "legendary" },
      { key: "ghostlystampede", name: "Ghostly Stampede", atk: 5, hp: 4, cost: 5, type: "monster", effect: "passive", effectId: "stampede", effectDesc: "PASSIVE: Can move up to 2 tiles. +2 damage to structures.", art: "/images/Ghostly Stampede.png", rarity: "legendary" },
      // High Noon x3 (normally 1) - row damage
      { key: "highnoon", name: "High Noon", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "high_noon", effectDesc: "INSTANT: Deal 2 damage to all enemies in target row.", art: "/images/High Noon.png", requiresTarget: "row", rarity: "legendary" },
      { key: "highnoon", name: "High Noon", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "high_noon", effectDesc: "INSTANT: Deal 2 damage to all enemies in target row.", art: "/images/High Noon.png", requiresTarget: "row", rarity: "legendary" },
      { key: "highnoon", name: "High Noon", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "high_noon", effectDesc: "INSTANT: Deal 2 damage to all enemies in target row.", art: "/images/High Noon.png", requiresTarget: "row", rarity: "legendary" },
      
      // === CONTROL & LOCKDOWN ===
      // Coffin Trapper x5 - root enemies
      { key: "coffintrapper", name: "Coffin Trapper", atk: 1, hp: 5, cost: 3, type: "monster", effect: "passive", effectId: "root_aura", effectDesc: "PASSIVE: Adjacent enemies cannot move.", art: "/images/Coffin Trapper.png", rarity: "rare" },
      { key: "coffintrapper", name: "Coffin Trapper", atk: 1, hp: 5, cost: 3, type: "monster", effect: "passive", effectId: "root_aura", effectDesc: "PASSIVE: Adjacent enemies cannot move.", art: "/images/Coffin Trapper.png", rarity: "rare" },
      { key: "coffintrapper", name: "Coffin Trapper", atk: 1, hp: 5, cost: 3, type: "monster", effect: "passive", effectId: "root_aura", effectDesc: "PASSIVE: Adjacent enemies cannot move.", art: "/images/Coffin Trapper.png", rarity: "rare" },
      { key: "coffintrapper", name: "Coffin Trapper", atk: 1, hp: 5, cost: 3, type: "monster", effect: "passive", effectId: "root_aura", effectDesc: "PASSIVE: Adjacent enemies cannot move.", art: "/images/Coffin Trapper.png", rarity: "rare" },
      { key: "coffintrapper", name: "Coffin Trapper", atk: 1, hp: 5, cost: 3, type: "monster", effect: "passive", effectId: "root_aura", effectDesc: "PASSIVE: Adjacent enemies cannot move.", art: "/images/Coffin Trapper.png", rarity: "rare" },
      // Most Wanted x4 - mark targets for extra damage
      { key: "mostwanted", name: "Most Wanted", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "mark_target", effectDesc: "INSTANT: Target enemy takes +2 damage from all attacks.", art: "/images/Most Wanted.png", requiresTarget: "enemy_unit", rarity: "rare" },
      { key: "mostwanted", name: "Most Wanted", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "mark_target", effectDesc: "INSTANT: Target enemy takes +2 damage from all attacks.", art: "/images/Most Wanted.png", requiresTarget: "enemy_unit", rarity: "rare" },
      { key: "mostwanted", name: "Most Wanted", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "mark_target", effectDesc: "INSTANT: Target enemy takes +2 damage from all attacks.", art: "/images/Most Wanted.png", requiresTarget: "enemy_unit", rarity: "rare" },
      { key: "mostwanted", name: "Most Wanted", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "mark_target", effectDesc: "INSTANT: Target enemy takes +2 damage from all attacks.", art: "/images/Most Wanted.png", requiresTarget: "enemy_unit", rarity: "rare" },
      
      // === DEATH SYNERGY ===
      // Undertaker x5 - grows on death
      { key: "undertaker", name: "Undertaker", atk: 3, hp: 3, cost: 4, type: "monster", effect: "passive", effectId: "grow_on_ally_death", effectDesc: "PASSIVE: Gains +1/+1 when a friendly unit dies.", art: "/images/Undertaker.png", rarity: "rare" },
      { key: "undertaker", name: "Undertaker", atk: 3, hp: 3, cost: 4, type: "monster", effect: "passive", effectId: "grow_on_ally_death", effectDesc: "PASSIVE: Gains +1/+1 when a friendly unit dies.", art: "/images/Undertaker.png", rarity: "rare" },
      { key: "undertaker", name: "Undertaker", atk: 3, hp: 3, cost: 4, type: "monster", effect: "passive", effectId: "grow_on_ally_death", effectDesc: "PASSIVE: Gains +1/+1 when a friendly unit dies.", art: "/images/Undertaker.png", rarity: "rare" },
      { key: "undertaker", name: "Undertaker", atk: 3, hp: 3, cost: 4, type: "monster", effect: "passive", effectId: "grow_on_ally_death", effectDesc: "PASSIVE: Gains +1/+1 when a friendly unit dies.", art: "/images/Undertaker.png", rarity: "rare" },
      { key: "undertaker", name: "Undertaker", atk: 3, hp: 3, cost: 4, type: "monster", effect: "passive", effectId: "grow_on_ally_death", effectDesc: "PASSIVE: Gains +1/+1 when a friendly unit dies.", art: "/images/Undertaker.png", rarity: "rare" },
      
      // === RANGED THREATS ===
      // Bone Revolver x5 - ranged pierce
      { key: "bonerevolver", name: "Bone Revolver", atk: 3, hp: 2, cost: 3, type: "monster", effect: "passive", effectId: "ranged_pierce", effectDesc: "PASSIVE: Ranged (2 tiles). Ignores shield effects.", art: "/images/Bone Revolver.png", rarity: "rare" },
      { key: "bonerevolver", name: "Bone Revolver", atk: 3, hp: 2, cost: 3, type: "monster", effect: "passive", effectId: "ranged_pierce", effectDesc: "PASSIVE: Ranged (2 tiles). Ignores shield effects.", art: "/images/Bone Revolver.png", rarity: "rare" },
      { key: "bonerevolver", name: "Bone Revolver", atk: 3, hp: 2, cost: 3, type: "monster", effect: "passive", effectId: "ranged_pierce", effectDesc: "PASSIVE: Ranged (2 tiles). Ignores shield effects.", art: "/images/Bone Revolver.png", rarity: "rare" },
      { key: "bonerevolver", name: "Bone Revolver", atk: 3, hp: 2, cost: 3, type: "monster", effect: "passive", effectId: "ranged_pierce", effectDesc: "PASSIVE: Ranged (2 tiles). Ignores shield effects.", art: "/images/Bone Revolver.png", rarity: "rare" },
      { key: "bonerevolver", name: "Bone Revolver", atk: 3, hp: 2, cost: 3, type: "monster", effect: "passive", effectId: "ranged_pierce", effectDesc: "PASSIVE: Ranged (2 tiles). Ignores shield effects.", art: "/images/Bone Revolver.png", rarity: "rare" },
      
      // === FODDER (Death triggers) ===
      // Bone Deputy x8 - spawns bone pile on death
      { key: "bonedeputy", name: "Bone Deputy", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeath", effectId: "spawn_bone_pile", effectDesc: "ON DEATH: Summon a 1/1 Bone Pile.", art: "/images/Bone Deputy.png", rarity: "common" },
      { key: "bonedeputy", name: "Bone Deputy", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeath", effectId: "spawn_bone_pile", effectDesc: "ON DEATH: Summon a 1/1 Bone Pile.", art: "/images/Bone Deputy.png", rarity: "common" },
      { key: "bonedeputy", name: "Bone Deputy", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeath", effectId: "spawn_bone_pile", effectDesc: "ON DEATH: Summon a 1/1 Bone Pile.", art: "/images/Bone Deputy.png", rarity: "common" },
      { key: "bonedeputy", name: "Bone Deputy", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeath", effectId: "spawn_bone_pile", effectDesc: "ON DEATH: Summon a 1/1 Bone Pile.", art: "/images/Bone Deputy.png", rarity: "common" },
      { key: "bonedeputy", name: "Bone Deputy", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeath", effectId: "spawn_bone_pile", effectDesc: "ON DEATH: Summon a 1/1 Bone Pile.", art: "/images/Bone Deputy.png", rarity: "common" },
      { key: "bonedeputy", name: "Bone Deputy", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeath", effectId: "spawn_bone_pile", effectDesc: "ON DEATH: Summon a 1/1 Bone Pile.", art: "/images/Bone Deputy.png", rarity: "common" },
      { key: "bonedeputy", name: "Bone Deputy", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeath", effectId: "spawn_bone_pile", effectDesc: "ON DEATH: Summon a 1/1 Bone Pile.", art: "/images/Bone Deputy.png", rarity: "common" },
      { key: "bonedeputy", name: "Bone Deputy", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeath", effectId: "spawn_bone_pile", effectDesc: "ON DEATH: Summon a 1/1 Bone Pile.", art: "/images/Bone Deputy.png", rarity: "common" },
    ]
  },
  "crimson-court-challenge": {
    name: "Crimson Court (Challenge)",
    description: "CHALLENGE MODE: The Blood Countess's immortal vampire legion",
    archetype: "vampire",
    isChallenge: true,
    cards: [
      // === LEGENDARY SPAM (The unfair stuff) ===
      // Vampire Lord x3 (normally 1) - diagonal attack + global lifesteal
      { key: "vampirelord", name: "Vampire Lord", atk: 5, hp: 7, cost: 6, type: "monster", effect: "passive", effectId: "lifesteal_lord", effectDesc: "PASSIVE: Can attack diagonally. All friendly units have Lifesteal.", art: "/images/Vampire Lord.png", rarity: "legendary" },
      { key: "vampirelord", name: "Vampire Lord", atk: 5, hp: 7, cost: 6, type: "monster", effect: "passive", effectId: "lifesteal_lord", effectDesc: "PASSIVE: Can attack diagonally. All friendly units have Lifesteal.", art: "/images/Vampire Lord.png", rarity: "legendary" },
      { key: "vampirelord", name: "Vampire Lord", atk: 5, hp: 7, cost: 6, type: "monster", effect: "passive", effectId: "lifesteal_lord", effectDesc: "PASSIVE: Can attack diagonally. All friendly units have Lifesteal.", art: "/images/Vampire Lord.png", rarity: "legendary" },
      // Blood Countess x3 (normally 1) - lifesteal + grows on kill
      { key: "bloodcountess", name: "Blood Countess", atk: 4, hp: 5, cost: 5, type: "monster", effect: "passive", effectId: "lifesteal_grow", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP on attack. ON KILL: Gain +1/+1.", art: "/images/Blood Countess.png", rarity: "legendary" },
      { key: "bloodcountess", name: "Blood Countess", atk: 4, hp: 5, cost: 5, type: "monster", effect: "passive", effectId: "lifesteal_grow", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP on attack. ON KILL: Gain +1/+1.", art: "/images/Blood Countess.png", rarity: "legendary" },
      { key: "bloodcountess", name: "Blood Countess", atk: 4, hp: 5, cost: 5, type: "monster", effect: "passive", effectId: "lifesteal_grow", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP on attack. ON KILL: Gain +1/+1.", art: "/images/Blood Countess.png", rarity: "legendary" },
      // Elder Vampire x3 (normally 1) - immortal resurrection
      { key: "eldervampire", name: "Elder Vampire", atk: 3, hp: 6, cost: 5, type: "monster", effect: "passive", effectId: "immortal", effectDesc: "PASSIVE: When this would die, instead heal to full HP (once per game).", art: "/images/Elder Vampire.png", rarity: "legendary" },
      { key: "eldervampire", name: "Elder Vampire", atk: 3, hp: 6, cost: 5, type: "monster", effect: "passive", effectId: "immortal", effectDesc: "PASSIVE: When this would die, instead heal to full HP (once per game).", art: "/images/Elder Vampire.png", rarity: "legendary" },
      { key: "eldervampire", name: "Elder Vampire", atk: 3, hp: 6, cost: 5, type: "monster", effect: "passive", effectId: "immortal", effectDesc: "PASSIVE: When this would die, instead heal to full HP (once per game).", art: "/images/Elder Vampire.png", rarity: "legendary" },
      // Sanguine Feast x3 (normally 1) - row damage + heart heal
      { key: "sanguinefeast", name: "Sanguine Feast", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "sanguine_feast", effectDesc: "INSTANT: Deal 2 damage to all enemies in target row. Heal your Heart for each hit.", art: "/images/Sanguine Feast.png", requiresTarget: "row", rarity: "legendary" },
      { key: "sanguinefeast", name: "Sanguine Feast", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "sanguine_feast", effectDesc: "INSTANT: Deal 2 damage to all enemies in target row. Heal your Heart for each hit.", art: "/images/Sanguine Feast.png", requiresTarget: "row", rarity: "legendary" },
      { key: "sanguinefeast", name: "Sanguine Feast", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "sanguine_feast", effectDesc: "INSTANT: Deal 2 damage to all enemies in target row. Heal your Heart for each hit.", art: "/images/Sanguine Feast.png", requiresTarget: "row", rarity: "legendary" },
      
      // === IMMORTAL STRUCTURES ===
      // Coffin x5 - self-resurrect structures
      { key: "coffin", name: "Coffin", atk: 0, hp: 6, cost: 4, type: "structure", effect: "passive", effectId: "resurrect_self", effectDesc: "PASSIVE: If destroyed, resummon at start of your next turn.", art: "/images/Coffin.png", rarity: "rare" },
      { key: "coffin", name: "Coffin", atk: 0, hp: 6, cost: 4, type: "structure", effect: "passive", effectId: "resurrect_self", effectDesc: "PASSIVE: If destroyed, resummon at start of your next turn.", art: "/images/Coffin.png", rarity: "rare" },
      { key: "coffin", name: "Coffin", atk: 0, hp: 6, cost: 4, type: "structure", effect: "passive", effectId: "resurrect_self", effectDesc: "PASSIVE: If destroyed, resummon at start of your next turn.", art: "/images/Coffin.png", rarity: "rare" },
      { key: "coffin", name: "Coffin", atk: 0, hp: 6, cost: 4, type: "structure", effect: "passive", effectId: "resurrect_self", effectDesc: "PASSIVE: If destroyed, resummon at start of your next turn.", art: "/images/Coffin.png", rarity: "rare" },
      { key: "coffin", name: "Coffin", atk: 0, hp: 6, cost: 4, type: "structure", effect: "passive", effectId: "resurrect_self", effectDesc: "PASSIVE: If destroyed, resummon at start of your next turn.", art: "/images/Coffin.png", rarity: "rare" },
      
      // === LIFESTEAL SYNERGY ===
      // Nosferatu x4 - lifesteal + weaken aura
      { key: "nosferatu", name: "Nosferatu", atk: 3, hp: 4, cost: 4, type: "monster", effect: "passive", effectId: "lifesteal_weaken", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP on attack. Adjacent enemies deal -1 damage.", art: "/images/Nosferatu.png", rarity: "rare" },
      { key: "nosferatu", name: "Nosferatu", atk: 3, hp: 4, cost: 4, type: "monster", effect: "passive", effectId: "lifesteal_weaken", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP on attack. Adjacent enemies deal -1 damage.", art: "/images/Nosferatu.png", rarity: "rare" },
      { key: "nosferatu", name: "Nosferatu", atk: 3, hp: 4, cost: 4, type: "monster", effect: "passive", effectId: "lifesteal_weaken", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP on attack. Adjacent enemies deal -1 damage.", art: "/images/Nosferatu.png", rarity: "rare" },
      { key: "nosferatu", name: "Nosferatu", atk: 3, hp: 4, cost: 4, type: "monster", effect: "passive", effectId: "lifesteal_weaken", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP on attack. Adjacent enemies deal -1 damage.", art: "/images/Nosferatu.png", rarity: "rare" },
      // Blood Priest x4 - end of turn heals
      { key: "bloodpriest", name: "Blood Priest", atk: 2, hp: 4, cost: 3, type: "monster", effect: "endOfTurn", effectId: "heal_adjacent", effectDesc: "END OF TURN: Heal adjacent allies for 1.", art: "/images/Blood Priest.png", rarity: "rare" },
      { key: "bloodpriest", name: "Blood Priest", atk: 2, hp: 4, cost: 3, type: "monster", effect: "endOfTurn", effectId: "heal_adjacent", effectDesc: "END OF TURN: Heal adjacent allies for 1.", art: "/images/Blood Priest.png", rarity: "rare" },
      { key: "bloodpriest", name: "Blood Priest", atk: 2, hp: 4, cost: 3, type: "monster", effect: "endOfTurn", effectId: "heal_adjacent", effectDesc: "END OF TURN: Heal adjacent allies for 1.", art: "/images/Blood Priest.png", rarity: "rare" },
      { key: "bloodpriest", name: "Blood Priest", atk: 2, hp: 4, cost: 3, type: "monster", effect: "endOfTurn", effectId: "heal_adjacent", effectDesc: "END OF TURN: Heal adjacent allies for 1.", art: "/images/Blood Priest.png", rarity: "rare" },
      
      // === CARD STEALING ===
      // Soul Collector x4 - steal killed units
      { key: "soulcollector", name: "Soul Collector", atk: 3, hp: 2, cost: 3, type: "monster", effect: "onKill", effectId: "steal_card", effectDesc: "ON KILL: Add a copy of killed unit to your hand.", art: "/images/Soul Collector.png", rarity: "rare" },
      { key: "soulcollector", name: "Soul Collector", atk: 3, hp: 2, cost: 3, type: "monster", effect: "onKill", effectId: "steal_card", effectDesc: "ON KILL: Add a copy of killed unit to your hand.", art: "/images/Soul Collector.png", rarity: "rare" },
      { key: "soulcollector", name: "Soul Collector", atk: 3, hp: 2, cost: 3, type: "monster", effect: "onKill", effectId: "steal_card", effectDesc: "ON KILL: Add a copy of killed unit to your hand.", art: "/images/Soul Collector.png", rarity: "rare" },
      { key: "soulcollector", name: "Soul Collector", atk: 3, hp: 2, cost: 3, type: "monster", effect: "onKill", effectId: "steal_card", effectDesc: "ON KILL: Add a copy of killed unit to your hand.", art: "/images/Soul Collector.png", rarity: "rare" },
      
      // === RECURSION SPELLS ===
      // Crimson Revival x3 - return dead to hand
      { key: "crimsonrevival", name: "Crimson Revival", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "mass_resurrect", effectDesc: "INSTANT: Return the last 2 units that died to your hand.", art: "/images/Crimson Revival.png", rarity: "rare" },
      { key: "crimsonrevival", name: "Crimson Revival", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "mass_resurrect", effectDesc: "INSTANT: Return the last 2 units that died to your hand.", art: "/images/Crimson Revival.png", rarity: "rare" },
      { key: "crimsonrevival", name: "Crimson Revival", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "mass_resurrect", effectDesc: "INSTANT: Return the last 2 units that died to your hand.", art: "/images/Crimson Revival.png", rarity: "rare" },
      
      // === FODDER (Lifesteal bodies) ===
      // Nightstalker x6 - cheap lifesteal units
      { key: "nightstalker", name: "Nightstalker", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "lifesteal", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP on attack.", art: "/images/Nightstalker.png", rarity: "common" },
      { key: "nightstalker", name: "Nightstalker", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "lifesteal", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP on attack.", art: "/images/Nightstalker.png", rarity: "common" },
      { key: "nightstalker", name: "Nightstalker", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "lifesteal", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP on attack.", art: "/images/Nightstalker.png", rarity: "common" },
      { key: "nightstalker", name: "Nightstalker", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "lifesteal", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP on attack.", art: "/images/Nightstalker.png", rarity: "common" },
      { key: "nightstalker", name: "Nightstalker", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "lifesteal", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP on attack.", art: "/images/Nightstalker.png", rarity: "common" },
      { key: "nightstalker", name: "Nightstalker", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "lifesteal", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP on attack.", art: "/images/Nightstalker.png", rarity: "common" },
    ]
  },
  "jeweled-court-challenge": {
    name: "Jeweled Court (Challenge)",
    description: "CHALLENGE MODE: Endless gem shards with devastating chain reactions",
    archetype: "fairy",
    isChallenge: true,
    cards: [
      // === LEGENDARY SPAM (The gem shard payoffs) ===
      // Prismatic Fairy x4 (normally 1) - AOE damage when gems die
      { key: "prismaticfairy", name: "Prismatic Fairy", atk: 3, hp: 4, cost: 5, type: "monster", effect: "passive", effectId: "gem_death_aoe", effectDesc: "PASSIVE: When a friendly Gem Shard dies, all enemies take 1 damage.", art: "/images/Prismatic Fairy.png", rarity: "legendary" },
      { key: "prismaticfairy", name: "Prismatic Fairy", atk: 3, hp: 4, cost: 5, type: "monster", effect: "passive", effectId: "gem_death_aoe", effectDesc: "PASSIVE: When a friendly Gem Shard dies, all enemies take 1 damage.", art: "/images/Prismatic Fairy.png", rarity: "legendary" },
      { key: "prismaticfairy", name: "Prismatic Fairy", atk: 3, hp: 4, cost: 5, type: "monster", effect: "passive", effectId: "gem_death_aoe", effectDesc: "PASSIVE: When a friendly Gem Shard dies, all enemies take 1 damage.", art: "/images/Prismatic Fairy.png", rarity: "legendary" },
      { key: "prismaticfairy", name: "Prismatic Fairy", atk: 3, hp: 4, cost: 5, type: "monster", effect: "passive", effectId: "gem_death_aoe", effectDesc: "PASSIVE: When a friendly Gem Shard dies, all enemies take 1 damage.", art: "/images/Prismatic Fairy.png", rarity: "legendary" },
      // Garnet Queen x3 (normally 1) - ATK suppress + ally buff
      { key: "garnetqueen", name: "Garnet Queen", atk: 3, hp: 5, cost: 5, type: "monster", effect: "passive", effectId: "garnet_aura", effectDesc: "PASSIVE: Adjacent enemies have ATK reduced to max 2. Adjacent friendlies gain +1 ATK.", art: "/images/Garnet Queen.png", rarity: "legendary" },
      { key: "garnetqueen", name: "Garnet Queen", atk: 3, hp: 5, cost: 5, type: "monster", effect: "passive", effectId: "garnet_aura", effectDesc: "PASSIVE: Adjacent enemies have ATK reduced to max 2. Adjacent friendlies gain +1 ATK.", art: "/images/Garnet Queen.png", rarity: "legendary" },
      { key: "garnetqueen", name: "Garnet Queen", atk: 3, hp: 5, cost: 5, type: "monster", effect: "passive", effectId: "garnet_aura", effectDesc: "PASSIVE: Adjacent enemies have ATK reduced to max 2. Adjacent friendlies gain +1 ATK.", art: "/images/Garnet Queen.png", rarity: "legendary" },
      // Moonstone Witch x3 (normally 1) - transform kills + gem buff
      { key: "moonstonewitch", name: "Moonstone Witch", atk: 2, hp: 4, cost: 4, type: "monster", effect: "onKill", effectId: "gem_transform", effectDesc: "ON KILL: Transform killed unit into a 1/1 Gem Shard. PASSIVE: +1 ATK per Gem Shard on field.", art: "/images/Moonstone Witch.png", rarity: "legendary" },
      { key: "moonstonewitch", name: "Moonstone Witch", atk: 2, hp: 4, cost: 4, type: "monster", effect: "onKill", effectId: "gem_transform", effectDesc: "ON KILL: Transform killed unit into a 1/1 Gem Shard. PASSIVE: +1 ATK per Gem Shard on field.", art: "/images/Moonstone Witch.png", rarity: "legendary" },
      { key: "moonstonewitch", name: "Moonstone Witch", atk: 2, hp: 4, cost: 4, type: "monster", effect: "onKill", effectId: "gem_transform", effectDesc: "ON KILL: Transform killed unit into a 1/1 Gem Shard. PASSIVE: +1 ATK per Gem Shard on field.", art: "/images/Moonstone Witch.png", rarity: "legendary" },
      
      // === GEM DEVOURING THREATS ===
      // Opal Devourer x5 - consume gems for +2/+2
      { key: "opaldevourer", name: "Opal Devourer", atk: 2, hp: 2, cost: 3, type: "monster", effect: "passive", effectId: "consume_gem", effectDesc: "PASSIVE: Can attack friendly Gem Shards to gain +2/+2.", art: "/images/Opal Devourer.png", rarity: "rare" },
      { key: "opaldevourer", name: "Opal Devourer", atk: 2, hp: 2, cost: 3, type: "monster", effect: "passive", effectId: "consume_gem", effectDesc: "PASSIVE: Can attack friendly Gem Shards to gain +2/+2.", art: "/images/Opal Devourer.png", rarity: "rare" },
      { key: "opaldevourer", name: "Opal Devourer", atk: 2, hp: 2, cost: 3, type: "monster", effect: "passive", effectId: "consume_gem", effectDesc: "PASSIVE: Can attack friendly Gem Shards to gain +2/+2.", art: "/images/Opal Devourer.png", rarity: "rare" },
      { key: "opaldevourer", name: "Opal Devourer", atk: 2, hp: 2, cost: 3, type: "monster", effect: "passive", effectId: "consume_gem", effectDesc: "PASSIVE: Can attack friendly Gem Shards to gain +2/+2.", art: "/images/Opal Devourer.png", rarity: "rare" },
      { key: "opaldevourer", name: "Opal Devourer", atk: 2, hp: 2, cost: 3, type: "monster", effect: "passive", effectId: "consume_gem", effectDesc: "PASSIVE: Can attack friendly Gem Shards to gain +2/+2.", art: "/images/Opal Devourer.png", rarity: "rare" },
      
      // === GEM SHARD SPAWNERS ===
      // Emerald Forager x6 - spawn gem on deploy
      { key: "emeraldforager", name: "Emerald Forager", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeploy", effectId: "gem_spawn", effectDesc: "ON DEPLOY: Summon a 1/1 Gem Shard in an adjacent empty tile.", art: "/images/Emerald Forager.png", rarity: "common" },
      { key: "emeraldforager", name: "Emerald Forager", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeploy", effectId: "gem_spawn", effectDesc: "ON DEPLOY: Summon a 1/1 Gem Shard in an adjacent empty tile.", art: "/images/Emerald Forager.png", rarity: "common" },
      { key: "emeraldforager", name: "Emerald Forager", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeploy", effectId: "gem_spawn", effectDesc: "ON DEPLOY: Summon a 1/1 Gem Shard in an adjacent empty tile.", art: "/images/Emerald Forager.png", rarity: "common" },
      { key: "emeraldforager", name: "Emerald Forager", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeploy", effectId: "gem_spawn", effectDesc: "ON DEPLOY: Summon a 1/1 Gem Shard in an adjacent empty tile.", art: "/images/Emerald Forager.png", rarity: "common" },
      { key: "emeraldforager", name: "Emerald Forager", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeploy", effectId: "gem_spawn", effectDesc: "ON DEPLOY: Summon a 1/1 Gem Shard in an adjacent empty tile.", art: "/images/Emerald Forager.png", rarity: "common" },
      { key: "emeraldforager", name: "Emerald Forager", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeploy", effectId: "gem_spawn", effectDesc: "ON DEPLOY: Summon a 1/1 Gem Shard in an adjacent empty tile.", art: "/images/Emerald Forager.png", rarity: "common" },
      // Ruby Sprite x6 - death adds gem card to hand
      { key: "rubysprite", name: "Ruby Sprite", atk: 2, hp: 1, cost: 1, type: "monster", effect: "onDeath", effectId: "death_gem_card", effectDesc: "ON DEATH: Add a Gem Shard card to your hand.", art: "/images/Ruby Sprite.png", rarity: "common" },
      { key: "rubysprite", name: "Ruby Sprite", atk: 2, hp: 1, cost: 1, type: "monster", effect: "onDeath", effectId: "death_gem_card", effectDesc: "ON DEATH: Add a Gem Shard card to your hand.", art: "/images/Ruby Sprite.png", rarity: "common" },
      { key: "rubysprite", name: "Ruby Sprite", atk: 2, hp: 1, cost: 1, type: "monster", effect: "onDeath", effectId: "death_gem_card", effectDesc: "ON DEATH: Add a Gem Shard card to your hand.", art: "/images/Ruby Sprite.png", rarity: "common" },
      { key: "rubysprite", name: "Ruby Sprite", atk: 2, hp: 1, cost: 1, type: "monster", effect: "onDeath", effectId: "death_gem_card", effectDesc: "ON DEATH: Add a Gem Shard card to your hand.", art: "/images/Ruby Sprite.png", rarity: "common" },
      { key: "rubysprite", name: "Ruby Sprite", atk: 2, hp: 1, cost: 1, type: "monster", effect: "onDeath", effectId: "death_gem_card", effectDesc: "ON DEATH: Add a Gem Shard card to your hand.", art: "/images/Ruby Sprite.png", rarity: "common" },
      { key: "rubysprite", name: "Ruby Sprite", atk: 2, hp: 1, cost: 1, type: "monster", effect: "onDeath", effectId: "death_gem_card", effectDesc: "ON DEATH: Add a Gem Shard card to your hand.", art: "/images/Ruby Sprite.png", rarity: "common" },
      
      // === GEM SUMMON SPELLS ===
      // Fairy Ring x4 (normally 1) - summon 2 gems
      { key: "fairyring", name: "Fairy Ring", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "summon_gems", effectDesc: "INSTANT: Summon two 1/1 Gem Shards in your home rows.", art: "/images/Fairy Ring.png", rarity: "legendary" },
      { key: "fairyring", name: "Fairy Ring", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "summon_gems", effectDesc: "INSTANT: Summon two 1/1 Gem Shards in your home rows.", art: "/images/Fairy Ring.png", rarity: "legendary" },
      { key: "fairyring", name: "Fairy Ring", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "summon_gems", effectDesc: "INSTANT: Summon two 1/1 Gem Shards in your home rows.", art: "/images/Fairy Ring.png", rarity: "legendary" },
      { key: "fairyring", name: "Fairy Ring", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "summon_gems", effectDesc: "INSTANT: Summon two 1/1 Gem Shards in your home rows.", art: "/images/Fairy Ring.png", rarity: "legendary" },
      
      // === SUPPORT & BUFFS ===
      // Diamond Guardian x4 - bodyguard protects gems
      { key: "diamondguardian", name: "Diamond Guardian", atk: 1, hp: 5, cost: 3, type: "monster", effect: "passive", effectId: "bodyguard", effectDesc: "PASSIVE: When an adjacent friendly takes damage, this unit takes 1 of that damage instead.", art: "/images/Diamond Guardian.png", rarity: "rare" },
      { key: "diamondguardian", name: "Diamond Guardian", atk: 1, hp: 5, cost: 3, type: "monster", effect: "passive", effectId: "bodyguard", effectDesc: "PASSIVE: When an adjacent friendly takes damage, this unit takes 1 of that damage instead.", art: "/images/Diamond Guardian.png", rarity: "rare" },
      { key: "diamondguardian", name: "Diamond Guardian", atk: 1, hp: 5, cost: 3, type: "monster", effect: "passive", effectId: "bodyguard", effectDesc: "PASSIVE: When an adjacent friendly takes damage, this unit takes 1 of that damage instead.", art: "/images/Diamond Guardian.png", rarity: "rare" },
      { key: "diamondguardian", name: "Diamond Guardian", atk: 1, hp: 5, cost: 3, type: "monster", effect: "passive", effectId: "bodyguard", effectDesc: "PASSIVE: When an adjacent friendly takes damage, this unit takes 1 of that damage instead.", art: "/images/Diamond Guardian.png", rarity: "rare" },
      // Pearl Blessing x3 - mass buff all units
      { key: "pearlblessing", name: "Pearl Blessing", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "fairy_blessing", effectDesc: "INSTANT: All friendly units gain +1 HP. Fairies also gain +1 ATK.", art: "/images/Pearl Blessing.png", rarity: "rare" },
      { key: "pearlblessing", name: "Pearl Blessing", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "fairy_blessing", effectDesc: "INSTANT: All friendly units gain +1 HP. Fairies also gain +1 ATK.", art: "/images/Pearl Blessing.png", rarity: "rare" },
      { key: "pearlblessing", name: "Pearl Blessing", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "fairy_blessing", effectDesc: "INSTANT: All friendly units gain +1 HP. Fairies also gain +1 ATK.", art: "/images/Pearl Blessing.png", rarity: "rare" },
      
      // === ATK DEBUFFS ===
      // Gemstone Curse x3 - halve enemy ATK
      { key: "gemstonecurse", name: "Gemstone Curse", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "halve_atk", effectDesc: "INSTANT: Reduce target enemy's ATK by half (rounded down, minimum 1).", art: "/images/Gemstone Curse.png", requiresTarget: "enemy_unit", rarity: "legendary" },
      { key: "gemstonecurse", name: "Gemstone Curse", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "halve_atk", effectDesc: "INSTANT: Reduce target enemy's ATK by half (rounded down, minimum 1).", art: "/images/Gemstone Curse.png", requiresTarget: "enemy_unit", rarity: "legendary" },
      { key: "gemstonecurse", name: "Gemstone Curse", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "halve_atk", effectDesc: "INSTANT: Reduce target enemy's ATK by half (rounded down, minimum 1).", art: "/images/Gemstone Curse.png", requiresTarget: "enemy_unit", rarity: "legendary" },
      
      // === POSITIONING & MOBILITY ===
      // Sapphire Dancer x4 - swap with fairies
      { key: "sapphiredancer", name: "Sapphire Dancer", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "fairy_swap", effectDesc: "PASSIVE: Can swap positions with any friendly unit.", art: "/images/Sapphire Dancer.png", rarity: "common" },
      { key: "sapphiredancer", name: "Sapphire Dancer", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "fairy_swap", effectDesc: "PASSIVE: Can swap positions with any friendly unit.", art: "/images/Sapphire Dancer.png", rarity: "common" },
      { key: "sapphiredancer", name: "Sapphire Dancer", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "fairy_swap", effectDesc: "PASSIVE: Can swap positions with any friendly unit.", art: "/images/Sapphire Dancer.png", rarity: "common" },
      { key: "sapphiredancer", name: "Sapphire Dancer", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "fairy_swap", effectDesc: "PASSIVE: Can swap positions with any friendly unit.", art: "/images/Sapphire Dancer.png", rarity: "common" },
    ]
  },
  "elunes-chosen-challenge": {
    name: "Elune's Chosen (Challenge)",
    description: "CHALLENGE MODE: Overwhelming lunar synergies with mass healing and devastating AOE",
    archetype: "night-elf",
    isChallenge: true,
    cards: [
      // === LEGENDARY SPAM (The powerhouses) ===
      // Starlit Champion x3 - energy + ATK on kill, snowballs hard
      { key: "starlitchampion", name: "Starlit Champion", atk: 4, hp: 6, cost: 6, type: "monster", effect: "onKill", effectId: "starlit_slayer", effectDesc: "ON KILL: Gain 1 energy and +1 ATK permanently.", art: "/images/Starlit Champion.png", rarity: "legendary" },
      { key: "starlitchampion", name: "Starlit Champion", atk: 4, hp: 6, cost: 6, type: "monster", effect: "onKill", effectId: "starlit_slayer", effectDesc: "ON KILL: Gain 1 energy and +1 ATK permanently.", art: "/images/Starlit Champion.png", rarity: "legendary" },
      { key: "starlitchampion", name: "Starlit Champion", atk: 4, hp: 6, cost: 6, type: "monster", effect: "onKill", effectId: "starlit_slayer", effectDesc: "ON KILL: Gain 1 energy and +1 ATK permanently.", art: "/images/Starlit Champion.png", rarity: "legendary" },
      // Star Invoker x3 - random 2 damage each turn
      { key: "starinvoker", name: "Star Invoker", atk: 2, hp: 5, cost: 6, type: "monster", effect: "startOfTurn", effectId: "star_strike", effectDesc: "START OF TURN: Deal 2 damage to a random enemy.", art: "/images/Star Invoker.png", rarity: "legendary" },
      { key: "starinvoker", name: "Star Invoker", atk: 2, hp: 5, cost: 6, type: "monster", effect: "startOfTurn", effectId: "star_strike", effectDesc: "START OF TURN: Deal 2 damage to a random enemy.", art: "/images/Star Invoker.png", rarity: "legendary" },
      { key: "starinvoker", name: "Star Invoker", atk: 2, hp: 5, cost: 6, type: "monster", effect: "startOfTurn", effectId: "star_strike", effectDesc: "START OF TURN: Deal 2 damage to a random enemy.", art: "/images/Star Invoker.png", rarity: "legendary" },
      // Temple of the Moon x3 - permanent ATK buffs
      { key: "templeofthemoon", name: "Temple of the Moon", atk: 0, hp: 4, cost: 4, type: "structure", effect: "startOfTurn", effectId: "temple_blessing", effectDesc: "START OF TURN: If adjacent to 2+ allies, give them +1 ATK permanently.", art: "/images/Temple of the Moon.png", rarity: "legendary" },
      { key: "templeofthemoon", name: "Temple of the Moon", atk: 0, hp: 4, cost: 4, type: "structure", effect: "startOfTurn", effectId: "temple_blessing", effectDesc: "START OF TURN: If adjacent to 2+ allies, give them +1 ATK permanently.", art: "/images/Temple of the Moon.png", rarity: "legendary" },
      { key: "templeofthemoon", name: "Temple of the Moon", atk: 0, hp: 4, cost: 4, type: "structure", effect: "startOfTurn", effectId: "temple_blessing", effectDesc: "START OF TURN: If adjacent to 2+ allies, give them +1 ATK permanently.", art: "/images/Temple of the Moon.png", rarity: "legendary" },
      
      // === AOE DAMAGE ===
      // Lunar Barrage x4 - mass AOE damage
      { key: "lunarbarrage", name: "Lunar Barrage", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "lunar_aoe", effectDesc: "INSTANT: Deal 2 damage to all enemies in and adjacent to target tile (not home rows).", art: "/images/Lunar Barrage.png", requiresTarget: "tile", rarity: "legendary" },
      { key: "lunarbarrage", name: "Lunar Barrage", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "lunar_aoe", effectDesc: "INSTANT: Deal 2 damage to all enemies in and adjacent to target tile (not home rows).", art: "/images/Lunar Barrage.png", requiresTarget: "tile", rarity: "legendary" },
      { key: "lunarbarrage", name: "Lunar Barrage", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "lunar_aoe", effectDesc: "INSTANT: Deal 2 damage to all enemies in and adjacent to target tile (not home rows).", art: "/images/Lunar Barrage.png", requiresTarget: "tile", rarity: "legendary" },
      { key: "lunarbarrage", name: "Lunar Barrage", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "lunar_aoe", effectDesc: "INSTANT: Deal 2 damage to all enemies in and adjacent to target tile (not home rows).", art: "/images/Lunar Barrage.png", requiresTarget: "tile", rarity: "legendary" },
      
      // === HEALING & SUSTAIN ===
      // Lunar Priestess x5 - heal allies
      { key: "lunarpriestess", name: "Lunar Priestess", atk: 3, hp: 2, cost: 3, type: "monster", effect: "passive", effectId: "heal_attack", effectDesc: "PASSIVE: Can attack allies to heal them for ATK instead of damage.", art: "/images/Lunar Priestess.png", rarity: "common" },
      { key: "lunarpriestess", name: "Lunar Priestess", atk: 3, hp: 2, cost: 3, type: "monster", effect: "passive", effectId: "heal_attack", effectDesc: "PASSIVE: Can attack allies to heal them for ATK instead of damage.", art: "/images/Lunar Priestess.png", rarity: "common" },
      { key: "lunarpriestess", name: "Lunar Priestess", atk: 3, hp: 2, cost: 3, type: "monster", effect: "passive", effectId: "heal_attack", effectDesc: "PASSIVE: Can attack allies to heal them for ATK instead of damage.", art: "/images/Lunar Priestess.png", rarity: "common" },
      { key: "lunarpriestess", name: "Lunar Priestess", atk: 3, hp: 2, cost: 3, type: "monster", effect: "passive", effectId: "heal_attack", effectDesc: "PASSIVE: Can attack allies to heal them for ATK instead of damage.", art: "/images/Lunar Priestess.png", rarity: "common" },
      { key: "lunarpriestess", name: "Lunar Priestess", atk: 3, hp: 2, cost: 3, type: "monster", effect: "passive", effectId: "heal_attack", effectDesc: "PASSIVE: Can attack allies to heal them for ATK instead of damage.", art: "/images/Lunar Priestess.png", rarity: "common" },
      // Lunar Prayer x3 - death ward
      { key: "lunarprayer", name: "Lunar Prayer", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "death_ward", effectDesc: "INSTANT: Target ally gains Death Ward - the next time it would die, it survives with 1 HP instead.", art: "/images/Lunar Prayer.png", requiresTarget: "unit", rarity: "rare" },
      { key: "lunarprayer", name: "Lunar Prayer", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "death_ward", effectDesc: "INSTANT: Target ally gains Death Ward - the next time it would die, it survives with 1 HP instead.", art: "/images/Lunar Prayer.png", requiresTarget: "unit", rarity: "rare" },
      { key: "lunarprayer", name: "Lunar Prayer", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "death_ward", effectDesc: "INSTANT: Target ally gains Death Ward - the next time it would die, it survives with 1 HP instead.", art: "/images/Lunar Prayer.png", requiresTarget: "unit", rarity: "rare" },
      
      // === ADJACENCY SYNERGY ===
      // Moon Flare Sorceress x4 - +1 ATK/HP to adjacent allies
      { key: "moonflaresorceress", name: "Moon Flare Sorceress", atk: 2, hp: 6, cost: 4, type: "monster", effect: "passive", effectId: "moonflare_aura", effectDesc: "PASSIVE: Adjacent allies gain +1 ATK and +1 HP.", art: "/images/Moon Flare Sorceress.png", rarity: "rare" },
      { key: "moonflaresorceress", name: "Moon Flare Sorceress", atk: 2, hp: 6, cost: 4, type: "monster", effect: "passive", effectId: "moonflare_aura", effectDesc: "PASSIVE: Adjacent allies gain +1 ATK and +1 HP.", art: "/images/Moon Flare Sorceress.png", rarity: "rare" },
      { key: "moonflaresorceress", name: "Moon Flare Sorceress", atk: 2, hp: 6, cost: 4, type: "monster", effect: "passive", effectId: "moonflare_aura", effectDesc: "PASSIVE: Adjacent allies gain +1 ATK and +1 HP.", art: "/images/Moon Flare Sorceress.png", rarity: "rare" },
      { key: "moonflaresorceress", name: "Moon Flare Sorceress", atk: 2, hp: 6, cost: 4, type: "monster", effect: "passive", effectId: "moonflare_aura", effectDesc: "PASSIVE: Adjacent allies gain +1 ATK and +1 HP.", art: "/images/Moon Flare Sorceress.png", rarity: "rare" },
      // Star Weave Archer x4 - ranged + ATK from adjacent allies
      { key: "starweavearcher", name: "Star Weave Archer", atk: 1, hp: 1, cost: 1, type: "monster", effect: "passive", effectId: "starweave_ranged", effectDesc: "PASSIVE: Range 2. Gains +1 ATK for each adjacent ally.", art: "/images/Star Weave Archer.png", rarity: "common" },
      { key: "starweavearcher", name: "Star Weave Archer", atk: 1, hp: 1, cost: 1, type: "monster", effect: "passive", effectId: "starweave_ranged", effectDesc: "PASSIVE: Range 2. Gains +1 ATK for each adjacent ally.", art: "/images/Star Weave Archer.png", rarity: "common" },
      { key: "starweavearcher", name: "Star Weave Archer", atk: 1, hp: 1, cost: 1, type: "monster", effect: "passive", effectId: "starweave_ranged", effectDesc: "PASSIVE: Range 2. Gains +1 ATK for each adjacent ally.", art: "/images/Star Weave Archer.png", rarity: "common" },
      { key: "starweavearcher", name: "Star Weave Archer", atk: 1, hp: 1, cost: 1, type: "monster", effect: "passive", effectId: "starweave_ranged", effectDesc: "PASSIVE: Range 2. Gains +1 ATK for each adjacent ally.", art: "/images/Star Weave Archer.png", rarity: "common" },
      // Moon Sentinel x4 - gains HP if adjacent to 2 allies
      { key: "moonsentinel", name: "Moon Sentinel", atk: 2, hp: 1, cost: 1, type: "monster", effect: "startOfTurn", effectId: "sentinel_growth", effectDesc: "START OF TURN: Gain +1 HP if adjacent to 2+ allies.", art: "/images/Moon Sentinel.png", rarity: "common" },
      { key: "moonsentinel", name: "Moon Sentinel", atk: 2, hp: 1, cost: 1, type: "monster", effect: "startOfTurn", effectId: "sentinel_growth", effectDesc: "START OF TURN: Gain +1 HP if adjacent to 2+ allies.", art: "/images/Moon Sentinel.png", rarity: "common" },
      { key: "moonsentinel", name: "Moon Sentinel", atk: 2, hp: 1, cost: 1, type: "monster", effect: "startOfTurn", effectId: "sentinel_growth", effectDesc: "START OF TURN: Gain +1 HP if adjacent to 2+ allies.", art: "/images/Moon Sentinel.png", rarity: "common" },
      { key: "moonsentinel", name: "Moon Sentinel", atk: 2, hp: 1, cost: 1, type: "monster", effect: "startOfTurn", effectId: "sentinel_growth", effectDesc: "START OF TURN: Gain +1 HP if adjacent to 2+ allies.", art: "/images/Moon Sentinel.png", rarity: "common" },
      
      // === AGGRESSIVE UNITS ===
      // Moonlit Blade Dancer x4 - move again on kill
      { key: "moonlitbladedancer", name: "Moonlit Blade Dancer", atk: 3, hp: 1, cost: 2, type: "monster", effect: "onKill", effectId: "blade_dance", effectDesc: "ON KILL: Can move again this turn.", art: "/images/Moonlit Blade Dancer.png", rarity: "common" },
      { key: "moonlitbladedancer", name: "Moonlit Blade Dancer", atk: 3, hp: 1, cost: 2, type: "monster", effect: "onKill", effectId: "blade_dance", effectDesc: "ON KILL: Can move again this turn.", art: "/images/Moonlit Blade Dancer.png", rarity: "common" },
      { key: "moonlitbladedancer", name: "Moonlit Blade Dancer", atk: 3, hp: 1, cost: 2, type: "monster", effect: "onKill", effectId: "blade_dance", effectDesc: "ON KILL: Can move again this turn.", art: "/images/Moonlit Blade Dancer.png", rarity: "common" },
      { key: "moonlitbladedancer", name: "Moonlit Blade Dancer", atk: 3, hp: 1, cost: 2, type: "monster", effect: "onKill", effectId: "blade_dance", effectDesc: "ON KILL: Can move again this turn.", art: "/images/Moonlit Blade Dancer.png", rarity: "common" },
      // Night Shade Ambusher x3 - deploy in neutral zones
      { key: "nightshadeambusher", name: "Night Shade Ambusher", atk: 4, hp: 2, cost: 4, type: "monster", effect: "passive", effectId: "ambush_deploy", effectDesc: "PASSIVE: Can be deployed in neutral zones (rows 2-4).", art: "/images/Night Shade Ambusher.png", rarity: "rare" },
      { key: "nightshadeambusher", name: "Night Shade Ambusher", atk: 4, hp: 2, cost: 4, type: "monster", effect: "passive", effectId: "ambush_deploy", effectDesc: "PASSIVE: Can be deployed in neutral zones (rows 2-4).", art: "/images/Night Shade Ambusher.png", rarity: "rare" },
      { key: "nightshadeambusher", name: "Night Shade Ambusher", atk: 4, hp: 2, cost: 4, type: "monster", effect: "passive", effectId: "ambush_deploy", effectDesc: "PASSIVE: Can be deployed in neutral zones (rows 2-4).", art: "/images/Night Shade Ambusher.png", rarity: "rare" },
      
      // === TANKS & PROTECTION ===
      // Stone Giant x3 - absorbs damage for allies
      { key: "stonegiant", name: "Stone Giant", atk: 3, hp: 8, cost: 5, type: "monster", effect: "passive", effectId: "stone_shield", effectDesc: "PASSIVE: When an adjacent ally would take damage, this unit takes it instead.", art: "/images/Stone Giant.png", rarity: "rare" },
      { key: "stonegiant", name: "Stone Giant", atk: 3, hp: 8, cost: 5, type: "monster", effect: "passive", effectId: "stone_shield", effectDesc: "PASSIVE: When an adjacent ally would take damage, this unit takes it instead.", art: "/images/Stone Giant.png", rarity: "rare" },
      { key: "stonegiant", name: "Stone Giant", atk: 3, hp: 8, cost: 5, type: "monster", effect: "passive", effectId: "stone_shield", effectDesc: "PASSIVE: When an adjacent ally would take damage, this unit takes it instead.", art: "/images/Stone Giant.png", rarity: "rare" },
      
      // === RESOURCE GENERATION ===
      // Elune's Moonwell x3 - energy + draw
      { key: "elunesmoonwell", name: "Elune's Moonwell", atk: 0, hp: 4, cost: 2, type: "structure", effect: "startOfTurn", effectId: "moonwell_power", effectDesc: "START OF TURN: If adjacent to 2+ allies, gain 1 energy and draw a card.", art: "/images/Elunes Moonwell.png", rarity: "rare" },
      { key: "elunesmoonwell", name: "Elune's Moonwell", atk: 0, hp: 4, cost: 2, type: "structure", effect: "startOfTurn", effectId: "moonwell_power", effectDesc: "START OF TURN: If adjacent to 2+ allies, gain 1 energy and draw a card.", art: "/images/Elunes Moonwell.png", rarity: "rare" },
      { key: "elunesmoonwell", name: "Elune's Moonwell", atk: 0, hp: 4, cost: 2, type: "structure", effect: "startOfTurn", effectId: "moonwell_power", effectDesc: "START OF TURN: If adjacent to 2+ allies, gain 1 energy and draw a card.", art: "/images/Elunes Moonwell.png", rarity: "rare" },
      
      // === CROWD CONTROL ===
      // Moon Shadow Warden x3 - root on attack
      { key: "moonshadowwarden", name: "Moon Shadow Warden", atk: 4, hp: 2, cost: 3, type: "monster", effect: "onAttack", effectId: "shadow_root", effectDesc: "ON ATTACK: Target cannot move next turn.", art: "/images/Moon Shadow Warden.png", rarity: "rare" },
      { key: "moonshadowwarden", name: "Moon Shadow Warden", atk: 4, hp: 2, cost: 3, type: "monster", effect: "onAttack", effectId: "shadow_root", effectDesc: "ON ATTACK: Target cannot move next turn.", art: "/images/Moon Shadow Warden.png", rarity: "rare" },
      { key: "moonshadowwarden", name: "Moon Shadow Warden", atk: 4, hp: 2, cost: 3, type: "monster", effect: "onAttack", effectId: "shadow_root", effectDesc: "ON ATTACK: Target cannot move next turn.", art: "/images/Moon Shadow Warden.png", rarity: "rare" },
    ]
  },
  "dragon-wizard-challenge": {
    name: "Dragon Wizard (Challenge)",
    description: "CHALLENGE MODE: The Arcane Dragonlord unleashes devastating spell-fire and polymorph chaos",
    archetype: "dragon",
    isChallenge: true,
    cards: [
      // === LEGENDARY SPAM (The unfair stuff) ===
      // Chrono Drake x3 (normally 1) - resurrection from discard
      { key: "chronodrake", name: "Chrono Drake", atk: 3, hp: 5, cost: 5, type: "monster", effect: "onDeploy", effectId: "time_rift", effectDesc: "ON DEPLOY: Choose a unit from your discard to resurrect adjacent to Chrono Drake with full stats.", art: "/images/Chrono Drake.png", rarity: "legendary" },
      { key: "chronodrake", name: "Chrono Drake", atk: 3, hp: 5, cost: 5, type: "monster", effect: "onDeploy", effectId: "time_rift", effectDesc: "ON DEPLOY: Choose a unit from your discard to resurrect adjacent to Chrono Drake with full stats.", art: "/images/Chrono Drake.png", rarity: "legendary" },
      { key: "chronodrake", name: "Chrono Drake", atk: 3, hp: 5, cost: 5, type: "monster", effect: "onDeploy", effectId: "time_rift", effectDesc: "ON DEPLOY: Choose a unit from your discard to resurrect adjacent to Chrono Drake with full stats.", art: "/images/Chrono Drake.png", rarity: "legendary" },
      // Red Wizard x3 (normally 1) - gains HP when any unit gains HP
      { key: "redwizard", name: "Red Wizard", atk: 4, hp: 4, cost: 5, type: "monster", effect: "passive", effectId: "red_wizard", effectDesc: "PASSIVE: Whenever ANY unit on the field gains HP, this unit gains +1 HP.", art: "/images/Red Wizard.png", rarity: "legendary" },
      { key: "redwizard", name: "Red Wizard", atk: 4, hp: 4, cost: 5, type: "monster", effect: "passive", effectId: "red_wizard", effectDesc: "PASSIVE: Whenever ANY unit on the field gains HP, this unit gains +1 HP.", art: "/images/Red Wizard.png", rarity: "legendary" },
      { key: "redwizard", name: "Red Wizard", atk: 4, hp: 4, cost: 5, type: "monster", effect: "passive", effectId: "red_wizard", effectDesc: "PASSIVE: Whenever ANY unit on the field gains HP, this unit gains +1 HP.", art: "/images/Red Wizard.png", rarity: "legendary" },
      // Blue Wizard x3 (normally 1) - gains ATK when any unit gains ATK
      { key: "bluewizard", name: "Blue Wizard", atk: 4, hp: 4, cost: 5, type: "monster", effect: "passive", effectId: "blue_wizard", effectDesc: "PASSIVE: Whenever ANY unit on the field gains ATK, this unit gains +1 ATK.", art: "/images/Blue Wizard.png", rarity: "legendary" },
      { key: "bluewizard", name: "Blue Wizard", atk: 4, hp: 4, cost: 5, type: "monster", effect: "passive", effectId: "blue_wizard", effectDesc: "PASSIVE: Whenever ANY unit on the field gains ATK, this unit gains +1 ATK.", art: "/images/Blue Wizard.png", rarity: "legendary" },
      { key: "bluewizard", name: "Blue Wizard", atk: 4, hp: 4, cost: 5, type: "monster", effect: "passive", effectId: "blue_wizard", effectDesc: "PASSIVE: Whenever ANY unit on the field gains ATK, this unit gains +1 ATK.", art: "/images/Blue Wizard.png", rarity: "legendary" },
      // Dragon's Fury x3 (normally 1) - mass dragon buff
      { key: "dragonsfury", name: "Dragon's Fury", atk: 0, hp: 0, cost: 5, type: "spell", effect: "instant", effectId: "dragons_fury", effectDesc: "INSTANT: All friendly Dragons gain +2 ATK permanently.", art: "/images/Dragons Fury.png", rarity: "legendary" },
      { key: "dragonsfury", name: "Dragon's Fury", atk: 0, hp: 0, cost: 5, type: "spell", effect: "instant", effectId: "dragons_fury", effectDesc: "INSTANT: All friendly Dragons gain +2 ATK permanently.", art: "/images/Dragons Fury.png", rarity: "legendary" },
      { key: "dragonsfury", name: "Dragon's Fury", atk: 0, hp: 0, cost: 5, type: "spell", effect: "instant", effectId: "dragons_fury", effectDesc: "INSTANT: All friendly Dragons gain +2 ATK permanently.", art: "/images/Dragons Fury.png", rarity: "legendary" },
      
      // === SPELL DAMAGE SYNERGY ===
      // Storm Drake x4 - spell echo damage
      { key: "stormdrake", name: "Storm Drake", atk: 3, hp: 4, cost: 4, type: "monster", effect: "passive", effectId: "spell_echo", effectDesc: "SPELL ECHO: When you cast a spell, deal 1 damage to a random enemy.", art: "/images/Storm Drake.png", rarity: "rare" },
      { key: "stormdrake", name: "Storm Drake", atk: 3, hp: 4, cost: 4, type: "monster", effect: "passive", effectId: "spell_echo", effectDesc: "SPELL ECHO: When you cast a spell, deal 1 damage to a random enemy.", art: "/images/Storm Drake.png", rarity: "rare" },
      { key: "stormdrake", name: "Storm Drake", atk: 3, hp: 4, cost: 4, type: "monster", effect: "passive", effectId: "spell_echo", effectDesc: "SPELL ECHO: When you cast a spell, deal 1 damage to a random enemy.", art: "/images/Storm Drake.png", rarity: "rare" },
      { key: "stormdrake", name: "Storm Drake", atk: 3, hp: 4, cost: 4, type: "monster", effect: "passive", effectId: "spell_echo", effectDesc: "SPELL ECHO: When you cast a spell, deal 1 damage to a random enemy.", art: "/images/Storm Drake.png", rarity: "rare" },
      
      // === DAMAGE REFLECTION ===
      // Mirror Wizard x4 - reflect all damage taken
      { key: "mirrorwizard", name: "Mirror Wizard", atk: 2, hp: 4, cost: 3, type: "monster", effect: "passive", effectId: "arcane_reflection", effectDesc: "PASSIVE: When this takes damage, deal that damage back to the attacker.", art: "/images/Mirror Wizard.png", rarity: "rare" },
      { key: "mirrorwizard", name: "Mirror Wizard", atk: 2, hp: 4, cost: 3, type: "monster", effect: "passive", effectId: "arcane_reflection", effectDesc: "PASSIVE: When this takes damage, deal that damage back to the attacker.", art: "/images/Mirror Wizard.png", rarity: "rare" },
      { key: "mirrorwizard", name: "Mirror Wizard", atk: 2, hp: 4, cost: 3, type: "monster", effect: "passive", effectId: "arcane_reflection", effectDesc: "PASSIVE: When this takes damage, deal that damage back to the attacker.", art: "/images/Mirror Wizard.png", rarity: "rare" },
      { key: "mirrorwizard", name: "Mirror Wizard", atk: 2, hp: 4, cost: 3, type: "monster", effect: "passive", effectId: "arcane_reflection", effectDesc: "PASSIVE: When this takes damage, deal that damage back to the attacker.", art: "/images/Mirror Wizard.png", rarity: "rare" },
      
      // === POLYMORPH SPAM ===
      // Polymorph x5 - turn enemies into sheep
      { key: "polymorph", name: "Polymorph", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "polymorph", effectDesc: "INSTANT: Transform target enemy with 3 or less HP into a 1/1 Sheep.", art: "/images/Polymorph.png", requiresTarget: "enemy_unit", rarity: "rare" },
      { key: "polymorph", name: "Polymorph", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "polymorph", effectDesc: "INSTANT: Transform target enemy with 3 or less HP into a 1/1 Sheep.", art: "/images/Polymorph.png", requiresTarget: "enemy_unit", rarity: "rare" },
      { key: "polymorph", name: "Polymorph", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "polymorph", effectDesc: "INSTANT: Transform target enemy with 3 or less HP into a 1/1 Sheep.", art: "/images/Polymorph.png", requiresTarget: "enemy_unit", rarity: "rare" },
      { key: "polymorph", name: "Polymorph", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "polymorph", effectDesc: "INSTANT: Transform target enemy with 3 or less HP into a 1/1 Sheep.", art: "/images/Polymorph.png", requiresTarget: "enemy_unit", rarity: "rare" },
      { key: "polymorph", name: "Polymorph", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "polymorph", effectDesc: "INSTANT: Transform target enemy with 3 or less HP into a 1/1 Sheep.", art: "/images/Polymorph.png", requiresTarget: "enemy_unit", rarity: "rare" },
      
      // === MANA DRAIN ===
      // Mana Drain x4 - damage + energy steal
      { key: "manadrain", name: "Mana Drain", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "mana_drain", effectDesc: "INSTANT: Deal 2 damage to target enemy. Enemy loses 1 energy.", art: "/images/Mana Drain.png", requiresTarget: "enemy_unit", rarity: "rare" },
      { key: "manadrain", name: "Mana Drain", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "mana_drain", effectDesc: "INSTANT: Deal 2 damage to target enemy. Enemy loses 1 energy.", art: "/images/Mana Drain.png", requiresTarget: "enemy_unit", rarity: "rare" },
      { key: "manadrain", name: "Mana Drain", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "mana_drain", effectDesc: "INSTANT: Deal 2 damage to target enemy. Enemy loses 1 energy.", art: "/images/Mana Drain.png", requiresTarget: "enemy_unit", rarity: "rare" },
      { key: "manadrain", name: "Mana Drain", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "mana_drain", effectDesc: "INSTANT: Deal 2 damage to target enemy. Enemy loses 1 energy.", art: "/images/Mana Drain.png", requiresTarget: "enemy_unit", rarity: "rare" },
      // Mana Siphon Mage x3 - energy drain on kill
      { key: "manasiphonmage", name: "Mana Siphon Mage", atk: 4, hp: 3, cost: 3, type: "monster", effect: "onKill", effectId: "mana_drain_kill", effectDesc: "ON KILL: Enemy loses 1 energy.", art: "/images/Mana Siphon Mage.png", rarity: "rare" },
      { key: "manasiphonmage", name: "Mana Siphon Mage", atk: 4, hp: 3, cost: 3, type: "monster", effect: "onKill", effectId: "mana_drain_kill", effectDesc: "ON KILL: Enemy loses 1 energy.", art: "/images/Mana Siphon Mage.png", rarity: "rare" },
      { key: "manasiphonmage", name: "Mana Siphon Mage", atk: 4, hp: 3, cost: 3, type: "monster", effect: "onKill", effectId: "mana_drain_kill", effectDesc: "ON KILL: Enemy loses 1 energy.", art: "/images/Mana Siphon Mage.png", rarity: "rare" },
      
      // === VOLCANIC DESTRUCTION ===
      // Volcanic Dragon x3 - chain HP reset on death
      { key: "volcanicdragon", name: "Volcanic Dragon", atk: 4, hp: 3, cost: 4, type: "monster", effect: "onDeath", effectId: "volcanic_death", effectDesc: "ON DEATH: Set all adjacent units to 1 HP. Chains to their adjacent units too.", art: "/images/Volcanic Dragon.png", rarity: "rare" },
      { key: "volcanicdragon", name: "Volcanic Dragon", atk: 4, hp: 3, cost: 4, type: "monster", effect: "onDeath", effectId: "volcanic_death", effectDesc: "ON DEATH: Set all adjacent units to 1 HP. Chains to their adjacent units too.", art: "/images/Volcanic Dragon.png", rarity: "rare" },
      { key: "volcanicdragon", name: "Volcanic Dragon", atk: 4, hp: 3, cost: 4, type: "monster", effect: "onDeath", effectId: "volcanic_death", effectDesc: "ON DEATH: Set all adjacent units to 1 HP. Chains to their adjacent units too.", art: "/images/Volcanic Dragon.png", rarity: "rare" },
      
      // === FODDER FOR BUFFING ===
      // Wizard's Rune x4 - draws wizards, summons on death
      { key: "wizardsrune", name: "Wizards Rune", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeployDeath", effectId: "wizard_rune", effectDesc: "DEPLOY: Draw a random Wizard. DEATH: Summon a Wizard from hand for free.", art: "/images/Wizards Rune.png", rarity: "common" },
      { key: "wizardsrune", name: "Wizards Rune", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeployDeath", effectId: "wizard_rune", effectDesc: "DEPLOY: Draw a random Wizard. DEATH: Summon a Wizard from hand for free.", art: "/images/Wizards Rune.png", rarity: "common" },
      { key: "wizardsrune", name: "Wizards Rune", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeployDeath", effectId: "wizard_rune", effectDesc: "DEPLOY: Draw a random Wizard. DEATH: Summon a Wizard from hand for free.", art: "/images/Wizards Rune.png", rarity: "common" },
      { key: "wizardsrune", name: "Wizards Rune", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeployDeath", effectId: "wizard_rune", effectDesc: "DEPLOY: Draw a random Wizard. DEATH: Summon a Wizard from hand for free.", art: "/images/Wizards Rune.png", rarity: "common" },
      // Cinderwing x4 - splash damage on attack
      { key: "cinderwing", name: "Cinderwing", atk: 3, hp: 1, cost: 2, type: "monster", effect: "onAttack", effectId: "splash_random", effectDesc: "ON ATTACK: Deal 1 damage to another random enemy.", art: "/images/Cinderwing.png", rarity: "common" },
      { key: "cinderwing", name: "Cinderwing", atk: 3, hp: 1, cost: 2, type: "monster", effect: "onAttack", effectId: "splash_random", effectDesc: "ON ATTACK: Deal 1 damage to another random enemy.", art: "/images/Cinderwing.png", rarity: "common" },
      { key: "cinderwing", name: "Cinderwing", atk: 3, hp: 1, cost: 2, type: "monster", effect: "onAttack", effectId: "splash_random", effectDesc: "ON ATTACK: Deal 1 damage to another random enemy.", art: "/images/Cinderwing.png", rarity: "common" },
      { key: "cinderwing", name: "Cinderwing", atk: 3, hp: 1, cost: 2, type: "monster", effect: "onAttack", effectId: "splash_random", effectDesc: "ON ATTACK: Deal 1 damage to another random enemy.", art: "/images/Cinderwing.png", rarity: "common" },
    ]
  },
  "dragon-wizard": {
    name: "Arcane Dragonflight",
    description: "Wizards and dragons unite with spell synergy and anti-buff tech",
    archetype: "dragon",
    cards: [
      // Meditation Monk x3 (channeling energy ramp) - stationary unit
      { key: "meditationmonk", name: "Meditation Monk", atk: 1, hp: 3, cost: 1, type: "monster", effect: "startOfTurn", effectId: "meditation_buff", effectDesc: "START OF TURN: Give a random friendly unit +1 ATK or +1 HP. Cannot move.", art: "/images/Meditation Monk.png", rarity: "common", stationary: true },
      { key: "meditationmonk", name: "Meditation Monk", atk: 1, hp: 3, cost: 1, type: "monster", effect: "startOfTurn", effectId: "meditation_buff", effectDesc: "START OF TURN: Give a random friendly unit +1 ATK or +1 HP. Cannot move.", art: "/images/Meditation Monk.png", rarity: "common", stationary: true },
      { key: "meditationmonk", name: "Meditation Monk", atk: 1, hp: 3, cost: 1, type: "monster", effect: "startOfTurn", effectId: "meditation_buff", effectDesc: "START OF TURN: Give a random friendly unit +1 ATK or +1 HP. Cannot move.", art: "/images/Meditation Monk.png", rarity: "common", stationary: true },
      // Wyrm Whelp x3 (anti-effect tech)
      { key: "wyrmwhelp", name: "Wyrm Whelp", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "anti_effect", effectDesc: "PASSIVE: +1 ATK when attacking units with effects.", art: "/images/Wyrm Whelp.png", rarity: "common" },
      { key: "wyrmwhelp", name: "Wyrm Whelp", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "anti_effect", effectDesc: "PASSIVE: +1 ATK when attacking units with effects.", art: "/images/Wyrm Whelp.png", rarity: "common" },
      { key: "wyrmwhelp", name: "Wyrm Whelp", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "anti_effect", effectDesc: "PASSIVE: +1 ATK when attacking units with effects.", art: "/images/Wyrm Whelp.png", rarity: "common" },
      // Wizard's Rune x3 (draw wizard on deploy, free wizard summon from hand on death)
      { key: "wizardsrune", name: "Wizards Rune", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeployDeath", effectId: "wizard_rune", effectDesc: "DEPLOY: Draw a random Wizard. DEATH: Summon a Wizard from hand for free.", art: "/images/Wizards Rune.png", rarity: "common" },
      { key: "wizardsrune", name: "Wizards Rune", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeployDeath", effectId: "wizard_rune", effectDesc: "DEPLOY: Draw a random Wizard. DEATH: Summon a Wizard from hand for free.", art: "/images/Wizards Rune.png", rarity: "common" },
      { key: "wizardsrune", name: "Wizards Rune", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeployDeath", effectId: "wizard_rune", effectDesc: "DEPLOY: Draw a random Wizard. DEATH: Summon a Wizard from hand for free.", art: "/images/Wizards Rune.png", rarity: "common" },
      // Cinderwing x3 (splash damage on attack)
      { key: "cinderwing", name: "Cinderwing", atk: 3, hp: 1, cost: 2, type: "monster", effect: "onAttack", effectId: "splash_random", effectDesc: "ON ATTACK: Deal 1 damage to another random enemy.", art: "/images/Cinderwing.png", rarity: "common" },
      { key: "cinderwing", name: "Cinderwing", atk: 3, hp: 1, cost: 2, type: "monster", effect: "onAttack", effectId: "splash_random", effectDesc: "ON ATTACK: Deal 1 damage to another random enemy.", art: "/images/Cinderwing.png", rarity: "common" },
      { key: "cinderwing", name: "Cinderwing", atk: 3, hp: 1, cost: 2, type: "monster", effect: "onAttack", effectId: "splash_random", effectDesc: "ON ATTACK: Deal 1 damage to another random enemy.", art: "/images/Cinderwing.png", rarity: "common" },
      // Mana Siphon Mage x2 (energy drain on kill)
      { key: "manasiphonmage", name: "Mana Siphon Mage", atk: 4, hp: 3, cost: 3, type: "monster", effect: "onKill", effectId: "mana_drain_kill", effectDesc: "ON KILL: Enemy loses 1 energy.", art: "/images/Mana Siphon Mage.png", rarity: "rare" },
      { key: "manasiphonmage", name: "Mana Siphon Mage", atk: 4, hp: 3, cost: 3, type: "monster", effect: "onKill", effectId: "mana_drain_kill", effectDesc: "ON KILL: Enemy loses 1 energy.", art: "/images/Mana Siphon Mage.png", rarity: "rare" },
      // Arcane Tether x2 (damage reflection)
      { key: "arcanetether", name: "Arcane Tether", atk: 2, hp: 4, cost: 3, type: "monster", effect: "passive", effectId: "arcane_link", effectDesc: "ARCANE LINK: When this takes damage, deal 1 damage to the nearest enemy.", art: "/images/Arcane Tether.png", rarity: "rare" },
      { key: "arcanetether", name: "Arcane Tether", atk: 2, hp: 4, cost: 3, type: "monster", effect: "passive", effectId: "arcane_link", effectDesc: "ARCANE LINK: When this takes damage, deal 1 damage to the nearest enemy.", art: "/images/Arcane Tether.png", rarity: "rare" },
      // Storm Drake x2 (spell echo damage)
      { key: "stormdrake", name: "Storm Drake", atk: 3, hp: 4, cost: 4, type: "monster", effect: "passive", effectId: "spell_echo", effectDesc: "SPELL ECHO: When you cast a spell, deal 1 damage to a random enemy.", art: "/images/Storm Drake.png", rarity: "rare" },
      { key: "stormdrake", name: "Storm Drake", atk: 3, hp: 4, cost: 4, type: "monster", effect: "passive", effectId: "spell_echo", effectDesc: "SPELL ECHO: When you cast a spell, deal 1 damage to a random enemy.", art: "/images/Storm Drake.png", rarity: "rare" },
      // Mirror Wizard x2 (copy buffs)
      { key: "mirrorwizard", name: "Mirror Wizard", atk: 2, hp: 4, cost: 3, type: "monster", effect: "passive", effectId: "arcane_reflection", effectDesc: "PASSIVE: When this takes damage, deal that damage back to the attacker.", art: "/images/Mirror Wizard.png", rarity: "rare" },
      { key: "mirrorwizard", name: "Mirror Wizard", atk: 2, hp: 4, cost: 3, type: "monster", effect: "passive", effectId: "arcane_reflection", effectDesc: "PASSIVE: When this takes damage, deal that damage back to the attacker.", art: "/images/Mirror Wizard.png", rarity: "rare" },
      // Volcanic Dragon x2 (death HP reset)
      { key: "volcanicdragon", name: "Volcanic Dragon", atk: 4, hp: 3, cost: 4, type: "monster", effect: "onDeath", effectId: "volcanic_death", effectDesc: "ON DEATH: Set all adjacent units to 1 HP. Chains to their adjacent units too.", art: "/images/Volcanic Dragon.png", rarity: "rare" },
      { key: "volcanicdragon", name: "Volcanic Dragon", atk: 4, hp: 3, cost: 4, type: "monster", effect: "onDeath", effectId: "volcanic_death", effectDesc: "ON DEATH: Set all adjacent units to 1 HP. Chains to their adjacent units too.", art: "/images/Volcanic Dragon.png", rarity: "rare" },
      // Red Wizard x1 (gains HP when any unit gains HP)
      { key: "redwizard", name: "Red Wizard", atk: 4, hp: 4, cost: 5, type: "monster", effect: "passive", effectId: "red_wizard", effectDesc: "PASSIVE: Whenever ANY unit on the field gains HP, this unit gains +1 HP.", art: "/images/Red Wizard.png", rarity: "legendary" },
      // Blue Wizard x1 (gains ATK when any unit gains ATK)
      { key: "bluewizard", name: "Blue Wizard", atk: 4, hp: 4, cost: 5, type: "monster", effect: "passive", effectId: "blue_wizard", effectDesc: "PASSIVE: Whenever ANY unit on the field gains ATK, this unit gains +1 ATK.", art: "/images/Blue Wizard.png", rarity: "legendary" },
      // Chrono Drake x1 (time rift resurrection)
      { key: "chronodrake", name: "Chrono Drake", atk: 3, hp: 5, cost: 5, type: "monster", effect: "onDeploy", effectId: "time_rift", effectDesc: "ON DEPLOY: Choose a unit from your discard to resurrect adjacent to Chrono Drake with full stats.", art: "/images/Chrono Drake.png", rarity: "legendary" },
      // Polymorph x2
      { key: "polymorph", name: "Polymorph", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "polymorph", effectDesc: "INSTANT: Transform target enemy with 3 or less HP into a 1/1 Sheep.", art: "/images/Polymorph.png", requiresTarget: "enemy_unit", rarity: "rare" },
      { key: "polymorph", name: "Polymorph", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "polymorph", effectDesc: "INSTANT: Transform target enemy with 3 or less HP into a 1/1 Sheep.", art: "/images/Polymorph.png", requiresTarget: "enemy_unit", rarity: "rare" },
      // Mana Drain x2
      { key: "manadrain", name: "Mana Drain", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "mana_drain", effectDesc: "INSTANT: Deal 2 damage to target enemy. Enemy loses 1 energy.", art: "/images/Mana Drain.png", requiresTarget: "enemy_unit", rarity: "rare" },
      { key: "manadrain", name: "Mana Drain", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "mana_drain", effectDesc: "INSTANT: Deal 2 damage to target enemy. Enemy loses 1 energy.", art: "/images/Mana Drain.png", requiresTarget: "enemy_unit", rarity: "rare" },
      // Overcharge Bolt x2
      { key: "overchargebolt", name: "Overcharge Bolt", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "overcharge", effectDesc: "INSTANT: Deal damage equal to half the energy spent (min 4). Can spend extra energy.", art: "/images/Overcharge Bolt.png", requiresTarget: "enemy_unit", rarity: "rare", overcharge: true },
      { key: "overchargebolt", name: "Overcharge Bolt", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "overcharge", effectDesc: "INSTANT: Deal damage equal to half the energy spent (min 4). Can spend extra energy.", art: "/images/Overcharge Bolt.png", requiresTarget: "enemy_unit", rarity: "rare", overcharge: true },
      // Arcane Rift x1
      { key: "arcanerift", name: "Arcane Rift", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "swap_positions", effectDesc: "INSTANT: Swap positions of any two units on the field.", art: "/images/Arcane Rift.png", requiresTarget: "any_unit", rarity: "legendary" },
      // Dragon's Fury x1
      { key: "dragonsfury", name: "Dragon's Fury", atk: 0, hp: 0, cost: 5, type: "spell", effect: "instant", effectId: "dragons_fury", effectDesc: "INSTANT: All friendly Dragons gain +2 ATK permanently.", art: "/images/Dragons Fury.png", rarity: "legendary" },
    ]
  },
  
  "celestial-host-challenge": {
    name: "Celestial Host (Challenge)",
    description: "CHALLENGE MODE: The Seraph unleashes an army of archangels with overwhelming divine power",
    archetype: "celestial",
    isChallenge: true,
    cards: [
      // === ARCHANGEL SPAM (4x of each legendary archangel) ===
      // Archangel Michael x4 - rampage on kill
      { key: "archangelmichael", name: "Archangel Michael", atk: 5, hp: 5, cost: 5, type: "monster", effect: "onKill", effectId: "michael_rampage", effectDesc: "ON KILL: The first kill each turn, can move and attack again.", art: "/images/Archangel Michael.png", rarity: "legendary" },
      { key: "archangelmichael", name: "Archangel Michael", atk: 5, hp: 5, cost: 5, type: "monster", effect: "onKill", effectId: "michael_rampage", effectDesc: "ON KILL: The first kill each turn, can move and attack again.", art: "/images/Archangel Michael.png", rarity: "legendary" },
      { key: "archangelmichael", name: "Archangel Michael", atk: 5, hp: 5, cost: 5, type: "monster", effect: "onKill", effectId: "michael_rampage", effectDesc: "ON KILL: The first kill each turn, can move and attack again.", art: "/images/Archangel Michael.png", rarity: "legendary" },
      { key: "archangelmichael", name: "Archangel Michael", atk: 5, hp: 5, cost: 5, type: "monster", effect: "onKill", effectId: "michael_rampage", effectDesc: "ON KILL: The first kill each turn, can move and attack again.", art: "/images/Archangel Michael.png", rarity: "legendary" },
      // Archangel Gabriel x3 - row damage on attack
      { key: "archangelgabriel", name: "Archangel Gabriel", atk: 6, hp: 5, cost: 6, type: "monster", effect: "onAttack", effectId: "gabriel_wrath", effectDesc: "ON ATTACK: Deal 1 damage to all enemies in the same row as the target.", art: "/images/Archangel Gabriel.png", rarity: "legendary" },
      { key: "archangelgabriel", name: "Archangel Gabriel", atk: 6, hp: 5, cost: 6, type: "monster", effect: "onAttack", effectId: "gabriel_wrath", effectDesc: "ON ATTACK: Deal 1 damage to all enemies in the same row as the target.", art: "/images/Archangel Gabriel.png", rarity: "legendary" },
      { key: "archangelgabriel", name: "Archangel Gabriel", atk: 6, hp: 5, cost: 6, type: "monster", effect: "onAttack", effectId: "gabriel_wrath", effectDesc: "ON ATTACK: Deal 1 damage to all enemies in the same row as the target.", art: "/images/Archangel Gabriel.png", rarity: "legendary" },
      // Archangel Raphael x3 - immune on deploy, shields allies behind
      { key: "archangelraphael", name: "Archangel Raphael", atk: 3, hp: 7, cost: 6, type: "monster", effect: "passive", effectId: "raphael_shield", effectDesc: "IMMUNE when played. Allies in 3 tiles behind me take no damage.", art: "/images/Archangel Raphael.png", rarity: "legendary" },
      { key: "archangelraphael", name: "Archangel Raphael", atk: 3, hp: 7, cost: 6, type: "monster", effect: "passive", effectId: "raphael_shield", effectDesc: "IMMUNE when played. Allies in 3 tiles behind me take no damage.", art: "/images/Archangel Raphael.png", rarity: "legendary" },
      { key: "archangelraphael", name: "Archangel Raphael", atk: 3, hp: 7, cost: 6, type: "monster", effect: "passive", effectId: "raphael_shield", effectDesc: "IMMUNE when played. Allies in 3 tiles behind me take no damage.", art: "/images/Archangel Raphael.png", rarity: "legendary" },
      // Archangel Uriel x2 - energy on draw, draw on kill
      { key: "archangeluriel", name: "Archangel Uriel", atk: 2, hp: 7, cost: 5, type: "monster", effect: "passive", effectId: "uriel_wisdom", effectDesc: "PASSIVE: Gain 1 energy when you draw. Draw a card when I kill an enemy.", art: "/images/Archangel Uriel.png", rarity: "legendary" },
      { key: "archangeluriel", name: "Archangel Uriel", atk: 2, hp: 7, cost: 5, type: "monster", effect: "passive", effectId: "uriel_wisdom", effectDesc: "PASSIVE: Gain 1 energy when you draw. Draw a card when I kill an enemy.", art: "/images/Archangel Uriel.png", rarity: "legendary" },
      
      // === RESURRECTION SPAM ===
      // Resurrection x4 - resummon from discard anywhere with immune
      { key: "resurrection", name: "Resurrection", atk: 0, hp: 0, cost: 8, type: "spell", effect: "instant", effectId: "resurrection", effectDesc: "Resummon an ally from your discard to any space. It has Immune this turn.", art: "/images/Resurrection.png", rarity: "legendary" },
      { key: "resurrection", name: "Resurrection", atk: 0, hp: 0, cost: 8, type: "spell", effect: "instant", effectId: "resurrection", effectDesc: "Resummon an ally from your discard to any space. It has Immune this turn.", art: "/images/Resurrection.png", rarity: "legendary" },
      { key: "resurrection", name: "Resurrection", atk: 0, hp: 0, cost: 8, type: "spell", effect: "instant", effectId: "resurrection", effectDesc: "Resummon an ally from your discard to any space. It has Immune this turn.", art: "/images/Resurrection.png", rarity: "legendary" },
      { key: "resurrection", name: "Resurrection", atk: 0, hp: 0, cost: 8, type: "spell", effect: "instant", effectId: "resurrection", effectDesc: "Resummon an ally from your discard to any space. It has Immune this turn.", art: "/images/Resurrection.png", rarity: "legendary" },
      
      // === BLESSING BUFFS ===
      // Blessing of Might x4 - +ATK that scales on attack
      { key: "blessingofmight", name: "Blessing of Might", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "blessing_might", effectDesc: "Target ally gains +1 ATK. Gains +1 ATK every time they attack.", art: "/images/Blessing of Might.png", requiresTarget: "friendly_unit", rarity: "common" },
      { key: "blessingofmight", name: "Blessing of Might", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "blessing_might", effectDesc: "Target ally gains +1 ATK. Gains +1 ATK every time they attack.", art: "/images/Blessing of Might.png", requiresTarget: "friendly_unit", rarity: "common" },
      { key: "blessingofmight", name: "Blessing of Might", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "blessing_might", effectDesc: "Target ally gains +1 ATK. Gains +1 ATK every time they attack.", art: "/images/Blessing of Might.png", requiresTarget: "friendly_unit", rarity: "common" },
      { key: "blessingofmight", name: "Blessing of Might", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "blessing_might", effectDesc: "Target ally gains +1 ATK. Gains +1 ATK every time they attack.", art: "/images/Blessing of Might.png", requiresTarget: "friendly_unit", rarity: "common" },
      // Blessing of Protection x4 - damage prevention
      { key: "blessingofprotection", name: "Blessing of Protection", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "blessing_protection", effectDesc: "Target ally: The next time this would take damage, prevent it.", art: "/images/Blessing of Protection.png", requiresTarget: "friendly_unit", rarity: "rare" },
      { key: "blessingofprotection", name: "Blessing of Protection", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "blessing_protection", effectDesc: "Target ally: The next time this would take damage, prevent it.", art: "/images/Blessing of Protection.png", requiresTarget: "friendly_unit", rarity: "rare" },
      { key: "blessingofprotection", name: "Blessing of Protection", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "blessing_protection", effectDesc: "Target ally: The next time this would take damage, prevent it.", art: "/images/Blessing of Protection.png", requiresTarget: "friendly_unit", rarity: "rare" },
      { key: "blessingofprotection", name: "Blessing of Protection", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "blessing_protection", effectDesc: "Target ally: The next time this would take damage, prevent it.", art: "/images/Blessing of Protection.png", requiresTarget: "friendly_unit", rarity: "rare" },
      
      // === HEALING SPAM ===
      // Garden of Eden x3 - structure that heals and buffs max HP
      { key: "gardenofeden", name: "Garden of Eden", atk: 0, hp: 5, cost: 4, type: "structure", effect: "startOfTurn", effectId: "eden_blessing", effectDesc: "START OF TURN: Adjacent units heal 2 HP and gain +1 max HP.", art: "/images/Garden of Eden.png", rarity: "legendary" },
      { key: "gardenofeden", name: "Garden of Eden", atk: 0, hp: 5, cost: 4, type: "structure", effect: "startOfTurn", effectId: "eden_blessing", effectDesc: "START OF TURN: Adjacent units heal 2 HP and gain +1 max HP.", art: "/images/Garden of Eden.png", rarity: "legendary" },
      { key: "gardenofeden", name: "Garden of Eden", atk: 0, hp: 5, cost: 4, type: "structure", effect: "startOfTurn", effectId: "eden_blessing", effectDesc: "START OF TURN: Adjacent units heal 2 HP and gain +1 max HP.", art: "/images/Garden of Eden.png", rarity: "legendary" },
      // Lay on Hands x4 - full heal
      { key: "layonhands", name: "Lay on Hands", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "lay_on_hands", effectDesc: "Heal target unit to full HP.", art: "/images/Lay on Hands.png", requiresTarget: "any_unit", rarity: "rare" },
      { key: "layonhands", name: "Lay on Hands", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "lay_on_hands", effectDesc: "Heal target unit to full HP.", art: "/images/Lay on Hands.png", requiresTarget: "any_unit", rarity: "rare" },
      { key: "layonhands", name: "Lay on Hands", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "lay_on_hands", effectDesc: "Heal target unit to full HP.", art: "/images/Lay on Hands.png", requiresTarget: "any_unit", rarity: "rare" },
      { key: "layonhands", name: "Lay on Hands", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "lay_on_hands", effectDesc: "Heal target unit to full HP.", art: "/images/Lay on Hands.png", requiresTarget: "any_unit", rarity: "rare" },
      
      // === AGGRESSIVE UNITS ===
      // Angel of Destruction x4 - heart damage on kill
      { key: "angelofdestruction", name: "Angel of Destruction", atk: 3, hp: 4, cost: 3, type: "monster", effect: "onKill", effectId: "destruction_heart", effectDesc: "ON KILL: Deal 1 damage to the enemy heart.", art: "/images/Angel of Destruction.png", rarity: "rare" },
      { key: "angelofdestruction", name: "Angel of Destruction", atk: 3, hp: 4, cost: 3, type: "monster", effect: "onKill", effectId: "destruction_heart", effectDesc: "ON KILL: Deal 1 damage to the enemy heart.", art: "/images/Angel of Destruction.png", rarity: "rare" },
      { key: "angelofdestruction", name: "Angel of Destruction", atk: 3, hp: 4, cost: 3, type: "monster", effect: "onKill", effectId: "destruction_heart", effectDesc: "ON KILL: Deal 1 damage to the enemy heart.", art: "/images/Angel of Destruction.png", rarity: "rare" },
      { key: "angelofdestruction", name: "Angel of Destruction", atk: 3, hp: 4, cost: 3, type: "monster", effect: "onKill", effectId: "destruction_heart", effectDesc: "ON KILL: Deal 1 damage to the enemy heart.", art: "/images/Angel of Destruction.png", rarity: "rare" },
      // Seraphic Hunter x3 - ranged attacker
      { key: "seraphichunter", name: "Seraphic Hunter", atk: 4, hp: 3, cost: 4, type: "monster", effect: "passive", effectId: "seraphic_range", effectDesc: "RANGE 3. Can only move OR attack each turn, not both.", art: "/images/Seraphic Hunter.png", rarity: "rare", range: 3 },
      { key: "seraphichunter", name: "Seraphic Hunter", atk: 4, hp: 3, cost: 4, type: "monster", effect: "passive", effectId: "seraphic_range", effectDesc: "RANGE 3. Can only move OR attack each turn, not both.", art: "/images/Seraphic Hunter.png", rarity: "rare", range: 3 },
      { key: "seraphichunter", name: "Seraphic Hunter", atk: 4, hp: 3, cost: 4, type: "monster", effect: "passive", effectId: "seraphic_range", effectDesc: "RANGE 3. Can only move OR attack each turn, not both.", art: "/images/Seraphic Hunter.png", rarity: "rare", range: 3 },
      
      // === WRATH OF GOD ===
      // Wrath of God x2 - board wipe
      { key: "wrathofgod", name: "Wrath of God", atk: 0, hp: 0, cost: 10, type: "spell", effect: "instant", effectId: "wrath_of_god", effectDesc: "Destroy ALL units on the board.", art: "/images/Wrath of God.png", rarity: "legendary" },
      { key: "wrathofgod", name: "Wrath of God", atk: 0, hp: 0, cost: 10, type: "spell", effect: "instant", effectId: "wrath_of_god", effectDesc: "Destroy ALL units on the board.", art: "/images/Wrath of God.png", rarity: "legendary" },
    ]
  },
  "celestial-host": {
    name: "Celestial Host",
    description: "Angelic forces with powerful healing, protection, and divine wrath",
    archetype: "celestial",
    cards: [
      // Cherub Hymnist x3 (draw on deploy)
      { key: "cherubhymnist", name: "Cherub Hymnist", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeploy", effectId: "cherub_draw", effectDesc: "ON DEPLOY: Draw a card.", art: "/images/Cherub Hymnist.png", rarity: "common" },
      { key: "cherubhymnist", name: "Cherub Hymnist", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeploy", effectId: "cherub_draw", effectDesc: "ON DEPLOY: Draw a card.", art: "/images/Cherub Hymnist.png", rarity: "common" },
      { key: "cherubhymnist", name: "Cherub Hymnist", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeploy", effectId: "cherub_draw", effectDesc: "ON DEPLOY: Draw a card.", art: "/images/Cherub Hymnist.png", rarity: "common" },
      // Angelic Attendant x3 (heal adjacent allies each turn)
      { key: "angelicattendant", name: "Angelic Attendant", atk: 1, hp: 3, cost: 2, type: "monster", effect: "startOfTurn", effectId: "attendant_heal", effectDesc: "START OF TURN: Heal adjacent allies 1 HP.", art: "/images/Angelic Attendant.png", rarity: "common" },
      { key: "angelicattendant", name: "Angelic Attendant", atk: 1, hp: 3, cost: 2, type: "monster", effect: "startOfTurn", effectId: "attendant_heal", effectDesc: "START OF TURN: Heal adjacent allies 1 HP.", art: "/images/Angelic Attendant.png", rarity: "common" },
      { key: "angelicattendant", name: "Angelic Attendant", atk: 1, hp: 3, cost: 2, type: "monster", effect: "startOfTurn", effectId: "attendant_heal", effectDesc: "START OF TURN: Heal adjacent allies 1 HP.", art: "/images/Angelic Attendant.png", rarity: "common" },
      // Maiden of Virtue x3 (heal heart each turn)
      { key: "maidenofvirtue", name: "Maiden of Virtue", atk: 1, hp: 3, cost: 2, type: "monster", effect: "startOfTurn", effectId: "maiden_heal", effectDesc: "START OF TURN: Heal your heart 1 HP.", art: "/images/Maiden of Virtue.png", rarity: "common" },
      { key: "maidenofvirtue", name: "Maiden of Virtue", atk: 1, hp: 3, cost: 2, type: "monster", effect: "startOfTurn", effectId: "maiden_heal", effectDesc: "START OF TURN: Heal your heart 1 HP.", art: "/images/Maiden of Virtue.png", rarity: "common" },
      { key: "maidenofvirtue", name: "Maiden of Virtue", atk: 1, hp: 3, cost: 2, type: "monster", effect: "startOfTurn", effectId: "maiden_heal", effectDesc: "START OF TURN: Heal your heart 1 HP.", art: "/images/Maiden of Virtue.png", rarity: "common" },
      // Angel of Destruction x2 (damage heart on kill)
      { key: "angelofdestruction", name: "Angel of Destruction", atk: 3, hp: 4, cost: 3, type: "monster", effect: "onKill", effectId: "destruction_heart", effectDesc: "ON KILL: Deal 1 damage to the enemy heart.", art: "/images/Angel of Destruction.png", rarity: "rare" },
      { key: "angelofdestruction", name: "Angel of Destruction", atk: 3, hp: 4, cost: 3, type: "monster", effect: "onKill", effectId: "destruction_heart", effectDesc: "ON KILL: Deal 1 damage to the enemy heart.", art: "/images/Angel of Destruction.png", rarity: "rare" },
      // Seraphic Hunter x2 (ranged 3, can only move OR attack)
      { key: "seraphichunter", name: "Seraphic Hunter", atk: 4, hp: 3, cost: 4, type: "monster", effect: "passive", effectId: "seraphic_range", effectDesc: "RANGE 3. Can only move OR attack each turn, not both.", art: "/images/Seraphic Hunter.png", rarity: "rare", range: 3 },
      { key: "seraphichunter", name: "Seraphic Hunter", atk: 4, hp: 3, cost: 4, type: "monster", effect: "passive", effectId: "seraphic_range", effectDesc: "RANGE 3. Can only move OR attack each turn, not both.", art: "/images/Seraphic Hunter.png", rarity: "rare", range: 3 },
      // Archangel Michael x1 (move+attack again on first kill each turn)
      { key: "archangelmichael", name: "Archangel Michael", atk: 5, hp: 5, cost: 5, type: "monster", effect: "onKill", effectId: "michael_rampage", effectDesc: "ON KILL: The first kill each turn, can move and attack again.", art: "/images/Archangel Michael.png", rarity: "legendary" },
      // Archangel Uriel x1 (energy on draw, draw on kill)
      { key: "archangeluriel", name: "Archangel Uriel", atk: 2, hp: 7, cost: 5, type: "monster", effect: "passive", effectId: "uriel_wisdom", effectDesc: "PASSIVE: Gain 1 energy when you draw. Draw a card when I kill an enemy.", art: "/images/Archangel Uriel.png", rarity: "legendary" },
      // Archangel Gabriel x1 (row damage on attack)
      { key: "archangelgabriel", name: "Archangel Gabriel", atk: 6, hp: 5, cost: 6, type: "monster", effect: "onAttack", effectId: "gabriel_wrath", effectDesc: "ON ATTACK: Deal 1 damage to all enemies in the same row as the target.", art: "/images/Archangel Gabriel.png", rarity: "legendary" },
      // Archangel Raphael x1 (immune on deploy, allies behind take no damage)
      { key: "archangelraphael", name: "Archangel Raphael", atk: 3, hp: 7, cost: 6, type: "monster", effect: "passive", effectId: "raphael_shield", effectDesc: "IMMUNE when played. Allies in 3 tiles behind me take no damage.", art: "/images/Archangel Raphael.png", rarity: "legendary" },
      // Lucifer Fallen Angel x1 (deploy anywhere, damages own heart)
      { key: "luciferfallenangel", name: "Lucifer Fallen Angel", atk: 10, hp: 8, cost: 6, type: "monster", effect: "startOfTurn", effectId: "lucifer_curse", effectDesc: "Can deploy to any space. START OF TURN: Deal 3 damage to your heart.", art: "/images/Lucifer Fallen Angel.png", rarity: "legendary", deployAnywhere: true },
      // Garden of Eden x1 (structure - heal and +max hp to adjacent)
      { key: "gardenofeden", name: "Garden of Eden", atk: 0, hp: 5, cost: 4, type: "structure", effect: "startOfTurn", effectId: "eden_blessing", effectDesc: "START OF TURN: Adjacent units heal 2 HP and gain +1 max HP.", art: "/images/Garden of Eden.png", rarity: "legendary" },
      // Blessing of Might x3 (permanent +1 ATK, +1 ATK on attack)
      { key: "blessingofmight", name: "Blessing of Might", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "blessing_might", effectDesc: "Target ally gains +1 ATK. Gains +1 ATK every time they attack.", art: "/images/Blessing of Might.png", requiresTarget: "friendly_unit", rarity: "common" },
      { key: "blessingofmight", name: "Blessing of Might", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "blessing_might", effectDesc: "Target ally gains +1 ATK. Gains +1 ATK every time they attack.", art: "/images/Blessing of Might.png", requiresTarget: "friendly_unit", rarity: "common" },
      { key: "blessingofmight", name: "Blessing of Might", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "blessing_might", effectDesc: "Target ally gains +1 ATK. Gains +1 ATK every time they attack.", art: "/images/Blessing of Might.png", requiresTarget: "friendly_unit", rarity: "common" },
      // Blessing of Vigor x3 (gain energy on attack/attacked)
      { key: "blessingofvigor", name: "Blessing of Vigor", atk: 0, hp: 0, cost: 1, type: "spell", effect: "instant", effectId: "blessing_vigor", effectDesc: "Target ally gains: Whenever I attack or am attacked, gain 1 energy.", art: "/images/Blessing of Vigor.png", requiresTarget: "friendly_unit", rarity: "common" },
      { key: "blessingofvigor", name: "Blessing of Vigor", atk: 0, hp: 0, cost: 1, type: "spell", effect: "instant", effectId: "blessing_vigor", effectDesc: "Target ally gains: Whenever I attack or am attacked, gain 1 energy.", art: "/images/Blessing of Vigor.png", requiresTarget: "friendly_unit", rarity: "common" },
      { key: "blessingofvigor", name: "Blessing of Vigor", atk: 0, hp: 0, cost: 1, type: "spell", effect: "instant", effectId: "blessing_vigor", effectDesc: "Target ally gains: Whenever I attack or am attacked, gain 1 energy.", art: "/images/Blessing of Vigor.png", requiresTarget: "friendly_unit", rarity: "common" },
      // Blessing of Protection x2 (prevent next damage)
      { key: "blessingofprotection", name: "Blessing of Protection", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "blessing_protection", effectDesc: "Target ally: The next time this would take damage, prevent it.", art: "/images/Blessing of Protection.png", requiresTarget: "friendly_unit", rarity: "rare" },
      { key: "blessingofprotection", name: "Blessing of Protection", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "blessing_protection", effectDesc: "Target ally: The next time this would take damage, prevent it.", art: "/images/Blessing of Protection.png", requiresTarget: "friendly_unit", rarity: "rare" },
      // Blessing of Kings x2 (draw on attack/attacked)
      { key: "blessingofkings", name: "Blessing of Kings", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "blessing_kings", effectDesc: "Target ally gains: Whenever I attack or am attacked, draw a card.", art: "/images/Blessing of Kings.png", requiresTarget: "friendly_unit", rarity: "rare" },
      { key: "blessingofkings", name: "Blessing of Kings", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "blessing_kings", effectDesc: "Target ally gains: Whenever I attack or am attacked, draw a card.", art: "/images/Blessing of Kings.png", requiresTarget: "friendly_unit", rarity: "rare" },
      // Angelic Descent x2 (next unit deploys anywhere, deal 1 to adjacent on summon)
      { key: "angelicdescent", name: "Angelic Descent", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "angelic_descent", effectDesc: "Your next unit can deploy to any row. Deal 1 damage to adjacent enemies when summoned.", art: "/images/Angelic Descent.png", rarity: "rare" },
      { key: "angelicdescent", name: "Angelic Descent", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "angelic_descent", effectDesc: "Your next unit can deploy to any row. Deal 1 damage to adjacent enemies when summoned.", art: "/images/Angelic Descent.png", rarity: "rare" },
      // Heavenly Rescue x2 (move ally to back row)
      { key: "heavenlyrescue", name: "Heavenly Rescue", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "heavenly_rescue", effectDesc: "Move target ally to any empty tile in your back row.", art: "/images/Heavenly Rescue.png", requiresTarget: "friendly_unit", rarity: "rare" },
      { key: "heavenlyrescue", name: "Heavenly Rescue", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "heavenly_rescue", effectDesc: "Move target ally to any empty tile in your back row.", art: "/images/Heavenly Rescue.png", requiresTarget: "friendly_unit", rarity: "rare" },
      // Lay on Hands x2 (heal to full)
      { key: "layonhands", name: "Lay on Hands", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "lay_on_hands", effectDesc: "Heal target unit to full HP.", art: "/images/Lay on Hands.png", requiresTarget: "any_unit", rarity: "rare" },
      { key: "layonhands", name: "Lay on Hands", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "lay_on_hands", effectDesc: "Heal target unit to full HP.", art: "/images/Lay on Hands.png", requiresTarget: "any_unit", rarity: "rare" },
      // Resurrection x1 (resummon from discard anywhere with immune)
      { key: "resurrection", name: "Resurrection", atk: 0, hp: 0, cost: 8, type: "spell", effect: "instant", effectId: "resurrection", effectDesc: "Resummon an ally from your discard to any space. It has Immune this turn.", art: "/images/Resurrection.png", rarity: "legendary" },
      // Wrath of God x1 (destroy all units)
      { key: "wrathofgod", name: "Wrath of God", atk: 0, hp: 0, cost: 10, type: "spell", effect: "instant", effectId: "wrath_of_god", effectDesc: "Destroy ALL units on the board.", art: "/images/Wrath of God.png", rarity: "legendary" },
    ]
  },
  "8bit-battalion-challenge": {
    name: "8-Bit Battalion (Challenge)",
    description: "CHALLENGE MODE: Infinite lives, endless respawns, and rage-fueled chaos",
    archetype: "8bit",
    isChallenge: true,
    cards: [
      // === FINAL BOSS SPAM (4x) - Multiple rage machines ===
      { key: "finalboss", name: "Final Boss", atk: 2, hp: 8, cost: 6, type: "monster", effect: "passive", effectId: "rage_mode", effectDesc: "PASSIVE: Gains +1 ATK for each HP lost.", art: "/images/Final Boss.png", rarity: "legendary" },
      { key: "finalboss", name: "Final Boss", atk: 2, hp: 8, cost: 6, type: "monster", effect: "passive", effectId: "rage_mode", effectDesc: "PASSIVE: Gains +1 ATK for each HP lost.", art: "/images/Final Boss.png", rarity: "legendary" },
      { key: "finalboss", name: "Final Boss", atk: 2, hp: 8, cost: 6, type: "monster", effect: "passive", effectId: "rage_mode", effectDesc: "PASSIVE: Gains +1 ATK for each HP lost.", art: "/images/Final Boss.png", rarity: "legendary" },
      { key: "finalboss", name: "Final Boss", atk: 2, hp: 8, cost: 6, type: "monster", effect: "passive", effectId: "rage_mode", effectDesc: "PASSIVE: Gains +1 ATK for each HP lost.", art: "/images/Final Boss.png", rarity: "legendary" },
      
      // === NEW GAME+ SPAM (5x) - Keep recycling Final Bosses ===
      { key: "newgameplus", name: "New Game+", atk: 3, hp: 3, cost: 2, type: "monster", effect: "onDeath", effectId: "recycle_final_boss", effectDesc: "ON DEATH: Shuffle Final Boss from discard into deck.", art: "/images/New Game+.png", rarity: "rare" },
      { key: "newgameplus", name: "New Game+", atk: 3, hp: 3, cost: 2, type: "monster", effect: "onDeath", effectId: "recycle_final_boss", effectDesc: "ON DEATH: Shuffle Final Boss from discard into deck.", art: "/images/New Game+.png", rarity: "rare" },
      { key: "newgameplus", name: "New Game+", atk: 3, hp: 3, cost: 2, type: "monster", effect: "onDeath", effectId: "recycle_final_boss", effectDesc: "ON DEATH: Shuffle Final Boss from discard into deck.", art: "/images/New Game+.png", rarity: "rare" },
      { key: "newgameplus", name: "New Game+", atk: 3, hp: 3, cost: 2, type: "monster", effect: "onDeath", effectId: "recycle_final_boss", effectDesc: "ON DEATH: Shuffle Final Boss from discard into deck.", art: "/images/New Game+.png", rarity: "rare" },
      { key: "newgameplus", name: "New Game+", atk: 3, hp: 3, cost: 2, type: "monster", effect: "onDeath", effectId: "recycle_final_boss", effectDesc: "ON DEATH: Shuffle Final Boss from discard into deck.", art: "/images/New Game+.png", rarity: "rare" },
      
      // === BOSS KEY SPAM (6x) - Draw and discount Final Boss constantly ===
      { key: "bosskey", name: "Boss Key", atk: 0, hp: 0, cost: 1, type: "spell", effect: "instant", effectId: "draw_final_boss", effectDesc: "INSTANT: Draw Final Boss from your deck. If already in hand, it costs 2 less this turn.", art: "/images/Boss Key.png", rarity: "common" },
      { key: "bosskey", name: "Boss Key", atk: 0, hp: 0, cost: 1, type: "spell", effect: "instant", effectId: "draw_final_boss", effectDesc: "INSTANT: Draw Final Boss from your deck. If already in hand, it costs 2 less this turn.", art: "/images/Boss Key.png", rarity: "common" },
      { key: "bosskey", name: "Boss Key", atk: 0, hp: 0, cost: 1, type: "spell", effect: "instant", effectId: "draw_final_boss", effectDesc: "INSTANT: Draw Final Boss from your deck. If already in hand, it costs 2 less this turn.", art: "/images/Boss Key.png", rarity: "common" },
      { key: "bosskey", name: "Boss Key", atk: 0, hp: 0, cost: 1, type: "spell", effect: "instant", effectId: "draw_final_boss", effectDesc: "INSTANT: Draw Final Boss from your deck. If already in hand, it costs 2 less this turn.", art: "/images/Boss Key.png", rarity: "common" },
      { key: "bosskey", name: "Boss Key", atk: 0, hp: 0, cost: 1, type: "spell", effect: "instant", effectId: "draw_final_boss", effectDesc: "INSTANT: Draw Final Boss from your deck. If already in hand, it costs 2 less this turn.", art: "/images/Boss Key.png", rarity: "common" },
      { key: "bosskey", name: "Boss Key", atk: 0, hp: 0, cost: 1, type: "spell", effect: "instant", effectId: "draw_final_boss", effectDesc: "INSTANT: Draw Final Boss from your deck. If already in hand, it costs 2 less this turn.", art: "/images/Boss Key.png", rarity: "common" },
      
      // === SAVE STATE SPAM (5x) - Auto-resurrect key units ===
      { key: "savestate", name: "Save State", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "save_state", effectDesc: "INSTANT: Mark a unit. If it dies, restore it to full HP (debuffs removed) at its position.", art: "/images/Save State.png", requiresTarget: "friendly_unit", rarity: "rare" },
      { key: "savestate", name: "Save State", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "save_state", effectDesc: "INSTANT: Mark a unit. If it dies, restore it to full HP (debuffs removed) at its position.", art: "/images/Save State.png", requiresTarget: "friendly_unit", rarity: "rare" },
      { key: "savestate", name: "Save State", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "save_state", effectDesc: "INSTANT: Mark a unit. If it dies, restore it to full HP (debuffs removed) at its position.", art: "/images/Save State.png", requiresTarget: "friendly_unit", rarity: "rare" },
      { key: "savestate", name: "Save State", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "save_state", effectDesc: "INSTANT: Mark a unit. If it dies, restore it to full HP (debuffs removed) at its position.", art: "/images/Save State.png", requiresTarget: "friendly_unit", rarity: "rare" },
      { key: "savestate", name: "Save State", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "save_state", effectDesc: "INSTANT: Mark a unit. If it dies, restore it to full HP (debuffs removed) at its position.", art: "/images/Save State.png", requiresTarget: "friendly_unit", rarity: "rare" },
      
      // === PIXEL PRODUCER SPAM (4x) - Flood the board with tokens ===
      { key: "pixelproducer", name: "Pixel Producer", atk: 0, hp: 5, cost: 3, type: "monster", effect: "endOfTurn", effectId: "spawn_pixel", effectDesc: "END OF TURN: Spawn a 1/1 Pixel in a random adjacent empty tile.", art: "/images/Pixel Producer.png", rarity: "rare" },
      { key: "pixelproducer", name: "Pixel Producer", atk: 0, hp: 5, cost: 3, type: "monster", effect: "endOfTurn", effectId: "spawn_pixel", effectDesc: "END OF TURN: Spawn a 1/1 Pixel in a random adjacent empty tile.", art: "/images/Pixel Producer.png", rarity: "rare" },
      { key: "pixelproducer", name: "Pixel Producer", atk: 0, hp: 5, cost: 3, type: "monster", effect: "endOfTurn", effectId: "spawn_pixel", effectDesc: "END OF TURN: Spawn a 1/1 Pixel in a random adjacent empty tile.", art: "/images/Pixel Producer.png", rarity: "rare" },
      { key: "pixelproducer", name: "Pixel Producer", atk: 0, hp: 5, cost: 3, type: "monster", effect: "endOfTurn", effectId: "spawn_pixel", effectDesc: "END OF TURN: Spawn a 1/1 Pixel in a random adjacent empty tile.", art: "/images/Pixel Producer.png", rarity: "rare" },
      
      // === SLIME SPRITE SPAM (5x) - Deaths spawn more units ===
      { key: "slimesprite", name: "Slime Sprite", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeath", effectId: "spawn_slimelings", effectDesc: "ON DEATH: Spawn two 1/1 Slimelings in adjacent empty tiles.", art: "/images/Slime Sprite.png", rarity: "common" },
      { key: "slimesprite", name: "Slime Sprite", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeath", effectId: "spawn_slimelings", effectDesc: "ON DEATH: Spawn two 1/1 Slimelings in adjacent empty tiles.", art: "/images/Slime Sprite.png", rarity: "common" },
      { key: "slimesprite", name: "Slime Sprite", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeath", effectId: "spawn_slimelings", effectDesc: "ON DEATH: Spawn two 1/1 Slimelings in adjacent empty tiles.", art: "/images/Slime Sprite.png", rarity: "common" },
      { key: "slimesprite", name: "Slime Sprite", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeath", effectId: "spawn_slimelings", effectDesc: "ON DEATH: Spawn two 1/1 Slimelings in adjacent empty tiles.", art: "/images/Slime Sprite.png", rarity: "common" },
      { key: "slimesprite", name: "Slime Sprite", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeath", effectId: "spawn_slimelings", effectDesc: "ON DEATH: Spawn two 1/1 Slimelings in adjacent empty tiles.", art: "/images/Slime Sprite.png", rarity: "common" },
      
      // === BARREL SPAM (6x) - Walking bombs everywhere ===
      { key: "barrel", name: "Barrel", atk: 1, hp: 1, cost: 1, type: "monster", effect: "onDeath", effectId: "explode_aoe", effectDesc: "ON DEATH: Deal 3 damage to all adjacent enemies.", art: "/images/Barrel.png", rarity: "common" },
      { key: "barrel", name: "Barrel", atk: 1, hp: 1, cost: 1, type: "monster", effect: "onDeath", effectId: "explode_aoe", effectDesc: "ON DEATH: Deal 3 damage to all adjacent enemies.", art: "/images/Barrel.png", rarity: "common" },
      { key: "barrel", name: "Barrel", atk: 1, hp: 1, cost: 1, type: "monster", effect: "onDeath", effectId: "explode_aoe", effectDesc: "ON DEATH: Deal 3 damage to all adjacent enemies.", art: "/images/Barrel.png", rarity: "common" },
      { key: "barrel", name: "Barrel", atk: 1, hp: 1, cost: 1, type: "monster", effect: "onDeath", effectId: "explode_aoe", effectDesc: "ON DEATH: Deal 3 damage to all adjacent enemies.", art: "/images/Barrel.png", rarity: "common" },
      { key: "barrel", name: "Barrel", atk: 1, hp: 1, cost: 1, type: "monster", effect: "onDeath", effectId: "explode_aoe", effectDesc: "ON DEATH: Deal 3 damage to all adjacent enemies.", art: "/images/Barrel.png", rarity: "common" },
      { key: "barrel", name: "Barrel", atk: 1, hp: 1, cost: 1, type: "monster", effect: "onDeath", effectId: "explode_aoe", effectDesc: "ON DEATH: Deal 3 damage to all adjacent enemies.", art: "/images/Barrel.png", rarity: "common" },
      
      // === RAGE QUIT SPAM (4x) - Punish for killing anything ===
      { key: "ragequit", name: "Rage Quit", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "rage_quit", effectDesc: "INSTANT: Deal damage to target enemy equal to the number of your units that died this game.", art: "/images/Rage Quit.png", requiresTarget: "enemy_unit", rarity: "legendary" },
      { key: "ragequit", name: "Rage Quit", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "rage_quit", effectDesc: "INSTANT: Deal damage to target enemy equal to the number of your units that died this game.", art: "/images/Rage Quit.png", requiresTarget: "enemy_unit", rarity: "legendary" },
      { key: "ragequit", name: "Rage Quit", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "rage_quit", effectDesc: "INSTANT: Deal damage to target enemy equal to the number of your units that died this game.", art: "/images/Rage Quit.png", requiresTarget: "enemy_unit", rarity: "legendary" },
      { key: "ragequit", name: "Rage Quit", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "rage_quit", effectDesc: "INSTANT: Deal damage to target enemy equal to the number of your units that died this game.", art: "/images/Rage Quit.png", requiresTarget: "enemy_unit", rarity: "legendary" },
      
      // === RESET BUTTON (2x) - Board wipe when losing ===
      { key: "resetbutton", name: "Reset Button", atk: 0, hp: 0, cost: 5, type: "spell", effect: "instant", effectId: "reset_board", effectDesc: "INSTANT: ALL units on the board are shuffled back into their owner's deck.", art: "/images/Reset Button.png", rarity: "legendary" },
      { key: "resetbutton", name: "Reset Button", atk: 0, hp: 0, cost: 5, type: "spell", effect: "instant", effectId: "reset_board", effectDesc: "INSTANT: ALL units on the board are shuffled back into their owner's deck.", art: "/images/Reset Button.png", rarity: "legendary" },
      
      // === WIZARD NPC (2x) - Stacking buff aura ===
      { key: "wizardnpc", name: "Wizard NPC", atk: 1, hp: 5, cost: 4, type: "monster", effect: "passive", effectId: "stacking_aura", effectDesc: "PASSIVE: Buffs adjacent allies. Starts +1/+1, increases by +1/+1 each turn it doesn't move (max +4/+4). Resets if moved.", art: "/images/Wizard NPC.png", rarity: "legendary" },
      { key: "wizardnpc", name: "Wizard NPC", atk: 1, hp: 5, cost: 4, type: "monster", effect: "passive", effectId: "stacking_aura", effectDesc: "PASSIVE: Buffs adjacent allies. Starts +1/+1, increases by +1/+1 each turn it doesn't move (max +4/+4). Resets if moved.", art: "/images/Wizard NPC.png", rarity: "legendary" },
    ]
  },
  "8bit-battalion": {
    name: "8-Bit Battalion",
    description: "Retro pixel warriors with obnoxious board control and endless respawns",
    archetype: "8bit",
    cards: [
      // ===== COMMONS (3 copies each) =====
      // Slime Sprite x3 (spawns 2 Slimelings on death)
      { key: "slimesprite", name: "Slime Sprite", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeath", effectId: "spawn_slimelings", effectDesc: "ON DEATH: Spawn two 1/1 Slimelings in adjacent empty tiles.", art: "/images/Slime Sprite.png", rarity: "common" },
      { key: "slimesprite", name: "Slime Sprite", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeath", effectId: "spawn_slimelings", effectDesc: "ON DEATH: Spawn two 1/1 Slimelings in adjacent empty tiles.", art: "/images/Slime Sprite.png", rarity: "common" },
      { key: "slimesprite", name: "Slime Sprite", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeath", effectId: "spawn_slimelings", effectDesc: "ON DEATH: Spawn two 1/1 Slimelings in adjacent empty tiles.", art: "/images/Slime Sprite.png", rarity: "common" },
      // Skeleton Warrior x3 (respawns once)
      { key: "skeletonwarrior8bit", name: "Skeleton Warrior", atk: 2, hp: 2, cost: 2, type: "monster", effect: "onDeath", effectId: "respawn_once", effectDesc: "ON DEATH: Returns to your spawn once.", art: "/images/Skeleton Warrior 8bit.png", rarity: "common" },
      { key: "skeletonwarrior8bit", name: "Skeleton Warrior", atk: 2, hp: 2, cost: 2, type: "monster", effect: "onDeath", effectId: "respawn_once", effectDesc: "ON DEATH: Returns to your spawn once.", art: "/images/Skeleton Warrior 8bit.png", rarity: "common" },
      { key: "skeletonwarrior8bit", name: "Skeleton Warrior", atk: 2, hp: 2, cost: 2, type: "monster", effect: "onDeath", effectId: "respawn_once", effectDesc: "ON DEATH: Returns to your spawn once.", art: "/images/Skeleton Warrior 8bit.png", rarity: "common" },
      // Barrel x3 (explodes for 3 AOE damage)
      { key: "barrel", name: "Barrel", atk: 1, hp: 1, cost: 1, type: "monster", effect: "onDeath", effectId: "explode_aoe", effectDesc: "ON DEATH: Deal 3 damage to all adjacent enemies.", art: "/images/Barrel.png", rarity: "common" },
      { key: "barrel", name: "Barrel", atk: 1, hp: 1, cost: 1, type: "monster", effect: "onDeath", effectId: "explode_aoe", effectDesc: "ON DEATH: Deal 3 damage to all adjacent enemies.", art: "/images/Barrel.png", rarity: "common" },
      { key: "barrel", name: "Barrel", atk: 1, hp: 1, cost: 1, type: "monster", effect: "onDeath", effectId: "explode_aoe", effectDesc: "ON DEATH: Deal 3 damage to all adjacent enemies.", art: "/images/Barrel.png", rarity: "common" },
      // Healer Fairy x3 (heals adjacent each turn, heals all on death)
      { key: "healerfairy", name: "Healer Fairy", atk: 1, hp: 2, cost: 2, type: "monster", effect: "endOfTurn", effectId: "heal_adjacent_and_death", effectDesc: "END OF TURN: Heal adjacent allies +1. ON DEATH: Heal ALL allies +1.", art: "/images/Healer Fairy.png", rarity: "common" },
      { key: "healerfairy", name: "Healer Fairy", atk: 1, hp: 2, cost: 2, type: "monster", effect: "endOfTurn", effectId: "heal_adjacent_and_death", effectDesc: "END OF TURN: Heal adjacent allies +1. ON DEATH: Heal ALL allies +1.", art: "/images/Healer Fairy.png", rarity: "common" },
      { key: "healerfairy", name: "Healer Fairy", atk: 1, hp: 2, cost: 2, type: "monster", effect: "endOfTurn", effectId: "heal_adjacent_and_death", effectDesc: "END OF TURN: Heal adjacent allies +1. ON DEATH: Heal ALL allies +1.", art: "/images/Healer Fairy.png", rarity: "common" },
      // Boss Key x3 (draw Final Boss or reduce cost)
      { key: "bosskey", name: "Boss Key", atk: 0, hp: 0, cost: 1, type: "spell", effect: "instant", effectId: "draw_final_boss", effectDesc: "INSTANT: Draw Final Boss from your deck. If already in hand, it costs 2 less this turn.", art: "/images/Boss Key.png", rarity: "common" },
      { key: "bosskey", name: "Boss Key", atk: 0, hp: 0, cost: 1, type: "spell", effect: "instant", effectId: "draw_final_boss", effectDesc: "INSTANT: Draw Final Boss from your deck. If already in hand, it costs 2 less this turn.", art: "/images/Boss Key.png", rarity: "common" },
      { key: "bosskey", name: "Boss Key", atk: 0, hp: 0, cost: 1, type: "spell", effect: "instant", effectId: "draw_final_boss", effectDesc: "INSTANT: Draw Final Boss from your deck. If already in hand, it costs 2 less this turn.", art: "/images/Boss Key.png", rarity: "common" },
      // New Game+ x2 (on death shuffle Final Boss into deck)
      { key: "newgameplus", name: "New Game+", atk: 3, hp: 3, cost: 2, type: "monster", effect: "onDeath", effectId: "recycle_final_boss", effectDesc: "ON DEATH: Shuffle Final Boss from discard into deck.", art: "/images/New Game+.png", rarity: "rare" },
      { key: "newgameplus", name: "New Game+", atk: 3, hp: 3, cost: 2, type: "monster", effect: "onDeath", effectId: "recycle_final_boss", effectDesc: "ON DEATH: Shuffle Final Boss from discard into deck.", art: "/images/New Game+.png", rarity: "rare" },
      // ===== RARES (2 copies each) =====
      // Knight Errant x2 (triple move)
      { key: "knighterrant", name: "Knight Errant", atk: 2, hp: 3, cost: 3, type: "monster", effect: "passive", effectId: "triple_move", effectDesc: "PASSIVE: Can move three times per turn.", art: "/images/Knight Errant.png", rarity: "rare" },
      { key: "knighterrant", name: "Knight Errant", atk: 2, hp: 3, cost: 3, type: "monster", effect: "passive", effectId: "triple_move", effectDesc: "PASSIVE: Can move three times per turn.", art: "/images/Knight Errant.png", rarity: "rare" },
      // Pixel Producer x2 (spawns 1/1 Pixel each turn)
      { key: "pixelproducer", name: "Pixel Producer", atk: 0, hp: 5, cost: 3, type: "monster", effect: "endOfTurn", effectId: "spawn_pixel", effectDesc: "END OF TURN: Spawn a 1/1 Pixel in a random adjacent empty tile.", art: "/images/Pixel Producer.png", rarity: "rare" },
      { key: "pixelproducer", name: "Pixel Producer", atk: 0, hp: 5, cost: 3, type: "monster", effect: "endOfTurn", effectId: "spawn_pixel", effectDesc: "END OF TURN: Spawn a 1/1 Pixel in a random adjacent empty tile.", art: "/images/Pixel Producer.png", rarity: "rare" },
      // Cheat Code x2 (target +3/+3, others +1/+1 this turn)
      { key: "cheatcode", name: "Cheat Code", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "cheat_code_buff", effectDesc: "INSTANT: Target unit gets +3/+3 this turn. All other friendly units get +1/+1 this turn.", art: "/images/Cheat Code.png", requiresTarget: "friendly_unit", rarity: "rare" },
      { key: "cheatcode", name: "Cheat Code", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "cheat_code_buff", effectDesc: "INSTANT: Target unit gets +3/+3 this turn. All other friendly units get +1/+1 this turn.", art: "/images/Cheat Code.png", requiresTarget: "friendly_unit", rarity: "rare" },
      // Save State x2 (mark unit, if dies restore to full HP)
      { key: "savestate", name: "Save State", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "save_state", effectDesc: "INSTANT: Mark a unit. If it dies, restore it to full HP (debuffs removed) at its position.", art: "/images/Save State.png", requiresTarget: "friendly_unit", rarity: "rare" },
      { key: "savestate", name: "Save State", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "save_state", effectDesc: "INSTANT: Mark a unit. If it dies, restore it to full HP (debuffs removed) at its position.", art: "/images/Save State.png", requiresTarget: "friendly_unit", rarity: "rare" },
      // ===== LEGENDARIES (1 copy each) =====
      // Wizard NPC x1 (stacking adjacent buff)
      { key: "wizardnpc", name: "Wizard NPC", atk: 1, hp: 5, cost: 4, type: "monster", effect: "passive", effectId: "stacking_aura", effectDesc: "PASSIVE: Buffs adjacent allies. Starts +1/+1, increases by +1/+1 each turn it doesn't move (max +4/+4). Resets if moved.", art: "/images/Wizard NPC.png", rarity: "legendary" },
      // Final Boss x1 (gains ATK as HP drops)
      { key: "finalboss", name: "Final Boss", atk: 2, hp: 8, cost: 6, type: "monster", effect: "passive", effectId: "rage_mode", effectDesc: "PASSIVE: Gains +1 ATK for each HP lost.", art: "/images/Final Boss.png", rarity: "legendary" },
      // Reset Button x1 (all units back to deck)
      { key: "resetbutton", name: "Reset Button", atk: 0, hp: 0, cost: 5, type: "spell", effect: "instant", effectId: "reset_board", effectDesc: "INSTANT: ALL units on the board are shuffled back into their owner's deck.", art: "/images/Reset Button.png", rarity: "legendary" },
      // Rage Quit x1 (damage based on deaths)
      { key: "ragequit", name: "Rage Quit", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "rage_quit", effectDesc: "INSTANT: Deal damage to target enemy equal to the number of your units that died this game.", art: "/images/Rage Quit.png", requiresTarget: "enemy_unit", rarity: "legendary" },
    ]
  }
};

const lobbies = {};

function generateLobbyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return lobbies[code] ? generateLobbyCode() : code;
}

// Fetch a user's custom-built cards as a plain {key: template} lookup for getCardTemplate
async function getCustomCardDefs(userId) {
  if (!userId || userId === 'admin') return {};
  const user = await User.findById(userId);
  if (!user || !user.customCards) return {};
  const defs = {};
  for (const [key, card] of user.customCards) {
    const { count, ...template } = card;
    defs[key] = template;
  }
  return defs;
}

function genId() { return Math.random().toString(36).slice(2, 10); }
function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

// Get card template by key from any deck, or from a player's custom-built cards
function getCardTemplate(cardKey, customDefs) {
  if (customDefs && customDefs[cardKey]) return customDefs[cardKey];
  for (const deckId in DECKS) {
    const card = DECKS[deckId].cards.find(c => c.key === cardKey);
    if (card) return card;
  }
  return null;
}

// Create deck from array of card keys (for custom decks)
function createDeckFromKeys(cardKeys, customDefs) {
  const result = cardKeys.map(key => {
    // Check if this is a holo card
    const isHolo = key.endsWith('_holo');
    const baseKey = isHolo ? key.replace('_holo', '') : key;

    const template = getCardTemplate(baseKey, customDefs);
    if (!template) {
      console.warn(`Unknown card key: ${baseKey}`);
      return null;
    }
    const card = { ...template, id: genId(), maxHp: template.hp };
    if (isHolo) {
      card.isHolo = true;
    }
    return card;
  }).filter(c => c !== null);
  return result;
}

// Create deck from deck ID (default decks)
function createDeck(deckId) { 
  const d = DECKS[deckId]; 
  return d ? d.cards.map(c => ({ ...c, id: genId(), maxHp: c.hp })) : null; 
}

function enemyOf(o) { return o === "gold" ? "silver" : "gold"; }
function getUnitPos(state, uid) { for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (state.board[r][c] === uid) return { r, c }; return null; }
function isAdjacent(r1, c1, r2, c2) { return Math.abs(r1-r2) <= 1 && Math.abs(c1-c2) <= 1 && !(r1===r2 && c1===c2); }
// Cardinal adjacent = up, down, left, right only (no diagonal)
function isCardinalAdjacent(r1, c1, r2, c2) { return (Math.abs(r1-r2) === 1 && c1 === c2) || (Math.abs(c1-c2) === 1 && r1 === r2); }

// Check if a unit can be spawned at a tile (not in enemy home row with HP)
function canSpawnAtTile(state, row, col, owner) {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
  if (state.board[row][col]) return false; // Tile occupied
  const enemy = enemyOf(owner);
  const isEnemyHomeRow = (enemy === "gold" && row <= 1) || (enemy === "silver" && row >= 5);
  if (isEnemyHomeRow && state.rowHP[row] > 0) return false;
  return true;
}

// Add unit's card to owner's discard pile when it dies
function discardUnitCard(lobby, unit) {
  if (!unit || !unit.owner) return;
  const player = lobby.gameState.players[unit.owner];
  if (!player) return;
  
  // Don't discard tokens - they're not cards in the deck
  // Tokens: Gem Shard, Pixel, Slimeling
  const TOKEN_KEYS = ['gemshard', 'pixel', 'slimeling'];
  if (TOKEN_KEYS.includes(unit.key)) return;
  
  // Use originalCard if stored, otherwise reconstruct from unit data
  if (unit.originalCard) {
    player.discard.push(unit.originalCard);
  } else {
    // Reconstruct card from unit data (for backwards compatibility)
    const card = {
      key: unit.key,
      name: unit.name,
      atk: unit.atk,
      hp: unit.maxHp || unit.hp,
      cost: unit.cost,
      type: unit.type || "monster",
      effect: unit.effect,
      effectId: unit.effectId,
      effectDesc: unit.effectDesc,
      art: unit.art
    };
    player.discard.push(card);
  }
}

// Check if unit should die - returns false if deathWard saves it
function shouldUnitDie(lobby, unit) {
  if (!unit) return true;
  
  // Death Ward (Lunar Prayer) - survives lethal damage once with 1 HP
  if (unit.deathWard) {
    unit.hp = 1;
    unit.deathWard = false;
    logToLobby(lobby, unit.name + "'s Lunar Prayer activates! Survives with 1 HP!");
    return false; // Unit survives
  }
  
  // Elder Vampire immortal - heals to full instead of dying (once per game)
  if (unit.effectId === "immortal" && !unit.immortalUsed) {
    unit.hp = unit.maxHp || 6;
    unit.immortalUsed = true;
    logToLobby(lobby, unit.name + " refuses to die! Heals to full HP!");
    // Emit immortal animation
    const pos = getUnitPos(state, unit.id);
    if (pos) {
      const animData = { type: "effect", effectType: "immortal_rise", targetPos: pos };
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
      if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
    }
    return false; // Unit survives
  }
  
  // Save State (8-Bit Battalion) - restore to full HP with debuffs removed
  if (unit.saveState) {
    unit.hp = unit.saveState.maxHp;
    unit.atk = unit.saveState.atk;
    delete unit.marked;
    delete unit.frozen;
    delete unit.rooted;
    delete unit.saveState;
    logToLobby(lobby, unit.name + " restored by Save State!");
    
    // Emit resurrection animation
    const state = lobby.gameState.state;
    const unitPos = getUnitPos(state, unit.id);
    if (unitPos) {
      const animData = {
        type: "effect",
        effectType: "save_state_revive",
        targetPos: unitPos
      };
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
      if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
    }
    
    return false; // Unit survives
  }
  
  return true; // Unit dies
}

// Generate random buff tiles in middle rows (2, 3, 4)
function generateBuffTiles() {
  const middleRows = [2, 3, 4];
  const allPositions = [];
  for (const r of middleRows) {
    for (let c = 0; c < COLS; c++) {
      allPositions.push({ r, c });
    }
  }
  shuffle(allPositions);
  const selectedPositions = allPositions.slice(0, 2);
  const shuffledBuffs = shuffle([...BUFF_TYPES]);
  
  const buffTiles = {};
  selectedPositions.forEach((pos, i) => {
    const key = `${pos.r}-${pos.c}`;
    buffTiles[key] = { ...shuffledBuffs[i], row: pos.r, col: pos.c };
  });
  return buffTiles;
}

function createGameState(hostDeck, guestDeck, hostCustomCards = null, guestCustomCards = null, hostCustomDefs = null, guestCustomDefs = null) {
  const buffTiles = generateBuffTiles();
  const state = { 
    board: Array.from({length:ROWS}, () => Array(COLS).fill(null)), 
    rowHP: [...START_ROW_HP], 
    rowOwner: Array(ROWS).fill(null), 
    heartHP: {gold:START_HEART_HP,silver:START_HEART_HP}, 
    units: {}, 
    activeSide: "gold", 
    turnNumber: 1, 
    gameOver: false, 
    spawn: {gold:null,silver:null}, 
    movedThisTurn: new Set(), 
    attackedThisTurn: new Set(), 
    firstTurn: true,
    buffTiles: buffTiles,
    moveCountThisTurn: {}, // Track moves per unit for double_move
    attackCountThisTurn: {}, // Track attacks per unit for topaz gem buff
    pendingCoffinResurrects: { gold: [], silver: [] }, // For Coffin resurrect_self
    // Boss event tracking
    bossTurnCount: 0,           // Count of boss (silver) turns taken
    bossEventWarning: null,     // { tiles: [{r,c},...], size: 2 } - warning zone for next turn
    bossEventOccurrence: 0      // How many times the event has triggered (for size scaling)
  };
  
  // Create decks - use custom cards if provided, otherwise default deck
  
  const goldDeckCards = hostCustomCards && hostCustomCards.length >= 25
    ? shuffle(createDeckFromKeys(hostCustomCards, hostCustomDefs))
    : shuffle(createDeck(hostDeck));
  const silverDeckCards = guestCustomCards && guestCustomCards.length >= 25
    ? shuffle(createDeckFromKeys(guestCustomCards, guestCustomDefs))
    : shuffle(createDeck(guestDeck));
  
  
  const players = { 
    gold: {deck: goldDeckCards, hand:[], discard:[], energy:START_ENERGY, maxEnergy:START_ENERGY, hasDrawn:false}, 
    silver: {deck: silverDeckCards, hand:[], discard:[], energy:START_ENERGY, maxEnergy:START_ENERGY, hasDrawn:false} 
  };
  for (let i = 0; i < START_HAND_SIZE; i++) { 
    if (players.gold.deck.length) players.gold.hand.push(players.gold.deck.pop()); 
    if (players.silver.deck.length) players.silver.hand.push(players.silver.deck.pop()); 
  }
  return { state, players };
}

// Build a single card instance from a deck key (looks it up in the medieval deck)
function makeCardByKey(deckId, key) {
  const deck = DECKS[deckId];
  if (!deck) return null;
  const def = deck.cards.find(c => c.key === key);
  if (!def) return null;
  return { ...def, id: genId(), maxHp: def.hp };
}

// Build a unit instance on the board (returns the unit's id)
function placeTutorialUnit(state, deckId, key, owner, row, col) {
  const def = DECKS[deckId]?.cards.find(c => c.key === key);
  if (!def) return null;
  const id = genId();
  state.units[id] = { ...def, id, owner, maxHp: def.hp };
  state.board[row][col] = id;
  return id;
}

// =====================================================================================
// TUTORIAL SCRIPT — sequential steps the server walks through.
// Each step is one of:
//   { type: 'dialog', speaker, text, hint? }                      — show a dialog, wait for tutorialAdvance
//   { type: 'gate', action, ...params }                            — lock player UI to a specific action
//   { type: 'enemyAction', do: '...', ...params }                  — execute a scripted enemy action
//   { type: 'endEnemyTurn' }                                       — finish enemy turn, hand back to player
//   { type: 'finish', win: bool }                                  — outro then return to home / mark complete
// Coordinates use server rows: A=0 (gold back), B=1, C=2, D=3, E=4, F=5, G=6 (silver back).
// Columns 0-5 (display 1-6).
// =====================================================================================
const TUTORIAL_SCRIPT = [
  // === Intro ===
  { type: 'dialog', speaker: 'Lost King', text: "What a strange land have I been taken to?! No matter — fight me or die, traveler!" },
  { type: 'dialog', speaker: 'Trainer', text: "Each card costs Dimensional Energy to summon. You can see how much energy you have above your hand.", nextHighlight: 'energy' },
  { type: 'gate', action: 'drawCard' },

  // === Player Turn 1 ===
  { type: 'dialog', speaker: 'Trainer', text: "The cost of each card's energy is shown in the top right of the card. Cards also have ATK and HP. Now summon your Archer to A1.", nextHighlight: 'cardCost' },
  { type: 'gate', action: 'playCard', cardKey: 'archer', target: { type: 'spawn-row', row: 0, col: 0 } },

  { type: 'dialog', speaker: 'Lost King', text: "An Archer! That isn't enough to defeat me!" },
  { type: 'dialog', speaker: 'Trainer', text: "Some cards have special abilities. SHIFT + click the Archer to read its effect.", nextHighlight: 'archer' },
  { type: 'dialog', speaker: 'Trainer', text: "Select your Archer then click on the enemy card to strike!", nextHighlight: 'archer' },
  { type: 'gate', action: 'attack', fromKey: 'archer', toUnit: { row: 2, col: 0 } },

  { type: 'dialog', speaker: 'Trainer', text: "The Squire has a special ability — after being placed it can leap to any tile next to a Knight. First, summon it to A2 in your home row." },
  { type: 'gate', action: 'playCard', cardKey: 'squire', target: { type: 'spawn-row', row: 0, col: 1 } },
  { type: 'dialog', speaker: 'Trainer', text: "Now use the Squire's Knight Leap — move it to E6, right beside your Knight." },
  { type: 'gate', action: 'move', fromUnit: { row: 0, col: 1 }, toTile: { row: 4, col: 5 } },

  { type: 'dialog', speaker: 'Lost King', text: "No fair! Grrrrrrrr" },

  { type: 'dialog', speaker: 'Trainer', text: "In order to destroy the enemy heart you have to move your units closer.", nextHighlight: 'enemyHeart' },
  { type: 'dialog', speaker: 'Trainer', text: "But first you have to take down the enemy's defensive rows. They usually have 15 HP but his front wall is already cracked at 1. Attack row F with your Squire to bring it down." },
  { type: 'gate', action: 'attack', fromUnit: { row: 4, col: 5 }, toRow: 5 },

  { type: 'dialog', speaker: 'Trainer', text: "Move forward to press the attack! Advance your Knight to the broken row and attack row G!" },
  { type: 'gate', action: 'move', fromUnit: { row: 4, col: 4 }, toTile: { row: 5, col: 4 } },
  { type: 'gate', action: 'attack', fromUnit: { row: 5, col: 4 }, toRow: 6 },

  { type: 'dialog', speaker: 'Trainer', text: "When you have no more moves or energy, end your turn." },
  { type: 'gate', action: 'endTurn' },

  // === Enemy Turn 1 ===
  { type: 'dialog', speaker: 'Lost King', text: "I will destroy your heart and defend my land!" },
  { type: 'enemyAction', do: 'attack', fromUnit: { row: 2, col: 0 }, toUnit: { row: 0, col: 0 } },
  { type: 'enemyAction', do: 'attack', fromUnit: { row: 2, col: 1 }, toRow: 1 },
  { type: 'enemyAction', do: 'move', fromUnit: { row: 2, col: 0 }, toTile: { row: 1, col: 0 } },
  { type: 'enemyAction', do: 'move', fromUnit: { row: 2, col: 1 }, toTile: { row: 1, col: 1 } },
  { type: 'enemyAction', do: 'spawn', cardKey: 'warhound', tile: { row: 6, col: 1 } },
  { type: 'enemyAction', do: 'move', fromUnit: { row: 6, col: 1 }, toTile: { row: 5, col: 1 } },
  { type: 'enemyAction', do: 'move', fromUnit: { row: 5, col: 1 }, toTile: { row: 4, col: 0 } },
  { type: 'endEnemyTurn' },

  // === Player Turn 2 ===
  { type: 'dialog', speaker: 'Trainer', text: "Some units, like the War Hound, can move twice. Draw and counter-attack." },
  { type: 'gate', action: 'drawCard' },
  { type: 'dialog', speaker: 'Trainer', text: "You drew Royal Guard. It can only be summoned to your home rows — place it at A2, next to your Archer." },
  { type: 'gate', action: 'playCard', cardKey: 'royalguard', target: { type: 'spawn-row', row: 0, col: 1 } },
  { type: 'dialog', speaker: 'Trainer', text: "Strike down the Crusader before it pushes further!" },
  { type: 'gate', action: 'attack', fromUnit: { row: 0, col: 1 }, toUnit: { row: 1, col: 1 } },

  { type: 'dialog', speaker: 'Trainer', text: "Cards attack in all four directions — up, down, left, and right. Move your Archer to B1 and hit the weakened Crusader from the side!" },
  { type: 'gate', action: 'move', fromUnit: { row: 0, col: 0 }, toTile: { row: 1, col: 0 } },
  { type: 'gate', action: 'attack', fromUnit: { row: 1, col: 0 }, toUnit: { row: 1, col: 1 } },

  { type: 'dialog', speaker: 'Lost King', text: "You will never destroy my army!!" },
  { type: 'dialog', speaker: 'Trainer', text: "You've learned the basics! The rest is up to you — finish the fight and take down the Lost King!" },
  { type: 'freePlay' }
];

// Tutorial encounter — Lost King (medieval) with a pre-set board.
// Server row layout (gold viewFlipped, gold's home at bottom of their view):
//   server row 0 = A (gold back home, bottom of view)
//   server row 1 = B (gold front home)
//   server row 2 = C
//   server row 3 = D
//   server row 4 = E
//   server row 5 = F (silver front home)
//   server row 6 = G (silver back home, top of view)
// Player Knight at E5  -> row 4, col 4
// Enemy Archer at C1   -> row 2, col 0
// Enemy Crusader at C2 -> row 2, col 1
// Row HP: A=15, B=2, F=1, G=15
function createTutorialState() {
  const buffTiles = generateBuffTiles();
  const state = {
    board: Array.from({length:ROWS}, () => Array(COLS).fill(null)),
    rowHP: [15, 2, 0, 0, 0, 1, 15],
    rowOwner: Array(ROWS).fill(null),
    heartHP: { gold: START_HEART_HP, silver: 8 }, // Lost King has 8 HP for a quicker tutorial
    units: {},
    activeSide: "gold",
    turnNumber: 1,
    gameOver: false,
    spawn: { gold: null, silver: null },
    movedThisTurn: new Set(),
    attackedThisTurn: new Set(),
    firstTurn: false, // Skip first-turn restrictions; the tutorial gates moves itself
    buffTiles: buffTiles,
    moveCountThisTurn: {},
    attackCountThisTurn: {},
    pendingCoffinResurrects: { gold: [], silver: [] },
    bossTurnCount: 0,
    bossEventWarning: null,
    bossEventOccurrence: 0
  };

  // Place pre-set units (display positions in comments)
  placeTutorialUnit(state, "medieval", "knight", "gold", 4, 4);     // Player Knight at E5
  placeTutorialUnit(state, "medieval", "archer", "silver", 2, 0);   // Enemy Archer at C1
  placeTutorialUnit(state, "medieval", "crusader", "silver", 2, 1); // Enemy Crusader at C2

  // Player hand: 2x Squire + 1x Archer
  const playerHand = [
    makeCardByKey("medieval", "squire"),
    makeCardByKey("medieval", "squire"),
    makeCardByKey("medieval", "archer")
  ].filter(Boolean);

  // Player deck order (top of deck = end of array, since draws use .pop()):
  // First three draws should be Battering Ram, Royal Guard, Paladin.
  // Build the rest of the medieval deck for filler, then append the three scripted draws last.
  const fullDeck = createDeck("medieval"); // unshuffled
  const scriptedDrawKeys = ["paladin", "royalguard", "siegeram"]; // pop order: siegeram first
  const scriptedDraws = scriptedDrawKeys.map(k => makeCardByKey("medieval", k)).filter(Boolean);
  // Remove ONE copy of each scripted card from the filler so they're not duplicated
  const filler = [];
  const usedKeys = { paladin: 1, royalguard: 1, siegeram: 1 };
  for (const c of fullDeck) {
    if (usedKeys[c.key] > 0) { usedKeys[c.key]--; continue; }
    // Also strip cards we put in hand
    if (c.key === "squire" && (usedKeys.squire = (usedKeys.squire || 2)) > 0) { usedKeys.squire--; continue; }
    if (c.key === "archer" && (usedKeys.archer = (usedKeys.archer || 1)) > 0) { usedKeys.archer--; continue; }
    filler.push(c);
  }
  shuffle(filler);
  const playerDeck = [...filler, ...scriptedDraws]; // pop() gets siegeram first, then royalguard, then paladin

  // Enemy (silver) deck — basic medieval, shuffled. The scripted AI ignores it but it has to exist.
  const enemyDeck = shuffle(createDeck("medieval"));
  const enemyHand = [];
  for (let i = 0; i < START_HAND_SIZE; i++) if (enemyDeck.length) enemyHand.push(enemyDeck.pop());

  const players = {
    gold:   { deck: playerDeck, hand: playerHand, discard: [], energy: START_ENERGY, maxEnergy: START_ENERGY, hasDrawn: false },
    silver: { deck: enemyDeck,  hand: enemyHand,  discard: [], energy: START_ENERGY, maxEnergy: START_ENERGY, hasDrawn: false }
  };

  return { state, players };
}

// Create a playtest game state with infinite energy and empty hands (cards spawn from library)
function createPlaytestGameState() {
  const buffTiles = generateBuffTiles();
  const state = { 
    board: Array.from({length:ROWS}, () => Array(COLS).fill(null)), 
    rowHP: [...START_ROW_HP], 
    rowOwner: Array(ROWS).fill(null), 
    heartHP: {gold:START_HEART_HP,silver:START_HEART_HP}, 
    units: {}, 
    activeSide: "gold", 
    turnNumber: 1, 
    gameOver: false, 
    spawn: {gold:null,silver:null}, 
    movedThisTurn: new Set(), 
    attackedThisTurn: new Set(), 
    firstTurn: false, // Skip first turn restrictions in playtest
    buffTiles: buffTiles,
    moveCountThisTurn: {},
    attackCountThisTurn: {},
    pendingCoffinResurrects: { gold: [], silver: [] }
  };
  
  // Playtest mode: empty decks, infinite energy (99)
  const players = { 
    gold: {deck: [], hand: [], discard: [], energy: 99, maxEnergy: 99, hasDrawn: true}, 
    silver: {deck: [], hand: [], discard: [], energy: 99, maxEnergy: 99, hasDrawn: true} 
  };
  
  return { state, players };
}

// Get all cards for playtest card library
function getAllCardsForPlaytest() {
  const allCards = [];
  const seen = new Set();
  
  for (const deckKey in DECKS) {
    const deck = DECKS[deckKey];
    // Skip challenge decks from playtest library
    if (deck.isChallenge) continue;
    
    for (const card of deck.cards) {
      if (!seen.has(card.key)) {
        seen.add(card.key);
        allCards.push({
          ...card,
          deck: deckKey,
          deckName: deck.name
        });
      }
    }
  }
  
  return allCards;
}

// Emit playtest state (both players to same socket)
function emitPlaytestState(lobby) {
  if (!lobby.gameState) return;
  const { state, players } = lobby.gameState;
  
  // Calculate hp buffs for each player (from buff tiles)
  const goldHpBuff = getHpBuffBonus(state, "gold");
  const silverHpBuff = getHpBuffBonus(state, "silver");
  
  // Calculate Armory bonus for each player (passive aura - affects all units)
  const goldArmoryBonus = getArmoryBonus(state, "gold");
  const silverArmoryBonus = getArmoryBonus(state, "silver");

  // Create units with effective stats
  const unitsWithBuffs = {};
  for (const uid in state.units) {
    const u = state.units[uid];
    
    // Volcanic scorched units don't benefit from HP buffs
    if (u.volcanicScorched) {
      unitsWithBuffs[uid] = { 
        ...u, 
        displayHp: u.hp,
        displayMaxHp: u.maxHp || u.hp,
        hpBuffed: false
      };
      continue;
    }
    
    const tileHpBuff = u.owner === "gold" ? goldHpBuff : silverHpBuff;
    const armoryBuff = u.owner === "gold" ? goldArmoryBonus : silverArmoryBonus;
    
    // Check for Moon Flare Sorceress aura (+1 HP to adjacent allies)
    let moonflareHpBuff = 0;
    const pos = getUnitPos(state, uid);
    if (pos) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = pos.r + dr, nc = pos.c + dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
          const aid = state.board[nr][nc];
          if (aid && state.units[aid] && state.units[aid].owner === u.owner && state.units[aid].effectId === "moonflare_aura") {
            moonflareHpBuff = 1;
            break;
          }
        }
        if (moonflareHpBuff > 0) break;
      }
    }
    
    // Don't give Armory buff to the Armory itself
    const armoryBuffForUnit = (u.effectId === "armory_buff") ? 0 : armoryBuff;
    
    const totalHpBuff = tileHpBuff + moonflareHpBuff + armoryBuffForUnit;
    
    let displayAtk = u.atk;
    if (pos) {
      if (u.effectId === "gem_transform") {
        for (const gid in state.units) {
          if (state.units[gid].key === "gemshard") displayAtk += 1;
        }
      }
      if (u.effectId === "spawn_drone") {
        for (const gid in state.units) {
          if (state.units[gid].key === "voiddrone" && state.units[gid].owner === u.owner) displayAtk += 1;
        }
      }
      if (u.effectId === "starweave_ranged") {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = pos.r + dr, nc = pos.c + dc;
            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
            const aid = state.board[nr][nc];
            if (aid && state.units[aid] && state.units[aid].owner === u.owner) displayAtk += 1;
          }
        }
      }
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = pos.r + dr, nc = pos.c + dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
          const aid = state.board[nr][nc];
          if (aid && state.units[aid] && state.units[aid].owner === u.owner && state.units[aid].effectId === "attack_aura") displayAtk += 1;
          if (aid && state.units[aid] && state.units[aid].owner === u.owner && state.units[aid].effectId === "moonflare_aura") displayAtk += 1;
          if (aid && state.units[aid] && state.units[aid].owner === u.owner && state.units[aid].effectId === "garnet_aura") displayAtk += 1;
          if (aid && state.units[aid] && state.units[aid].owner !== u.owner && state.units[aid].effectId === "garnet_aura") {
            displayAtk = Math.min(displayAtk, 2);
          }
          if (aid && state.units[aid] && state.units[aid].owner !== u.owner && 
              (state.units[aid].effectId === "weaken_aura" || state.units[aid].effectId === "lifesteal_weaken")) {
            displayAtk = Math.max(0, displayAtk - 1);
          }
        }
      }
    }
    
    unitsWithBuffs[uid] = { 
      ...u, 
      displayAtk: displayAtk,
      displayHp: u.hp + totalHpBuff,
      displayMaxHp: (u.maxHp || u.hp) + totalHpBuff,
      hpBuffed: totalHpBuff > 0,
      atkModified: displayAtk !== u.atk,
      armoryBuffed: armoryBuffForUnit > 0 ? armoryBuffForUnit : undefined
    };
  }
  
  // Calculate Raphael protected tiles, War Banner aura tiles, and Coffin Trapper tiles for client-side glow
  const raphaelProtectedTiles = [];
  const warBannerAuraTiles = [];
  const coffinTrapperTiles = [];
  const sheriffAuraTiles = [];
  const nosferatuAuraTiles = [];
  const garnetAuraTiles = [];
  const diamondGuardianTiles = [];
  for (const uid in state.units) {
    const u = state.units[uid];
    if (u.effectId === "raphael_shield") {
      const raphaelPos = getUnitPos(state, uid);
      if (raphaelPos) {
        const behindDir = u.owner === "gold" ? -1 : 1;
        for (let i = 1; i <= 3; i++) {
          const pr = raphaelPos.r + behindDir * i;
          if (pr >= 0 && pr < ROWS) {
            raphaelProtectedTiles.push({ r: pr, c: raphaelPos.c, owner: u.owner });
          }
        }
      }
    }
    if (u.effectId === "attack_aura") {
      const bannerPos = getUnitPos(state, uid);
      if (bannerPos) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = bannerPos.r + dr, nc = bannerPos.c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
              warBannerAuraTiles.push({ r: nr, c: nc, owner: u.owner });
            }
          }
        }
      }
    }
    if (u.effectId === "root_aura") {
      const trapPos = getUnitPos(state, uid);
      if (trapPos) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = trapPos.r + dr, nc = trapPos.c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
              coffinTrapperTiles.push({ r: nr, c: nc, owner: u.owner });
            }
          }
        }
      }
    }
    if (u.effectId === "weaken_aura") {
      const sheriffPos = getUnitPos(state, uid);
      if (sheriffPos) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = sheriffPos.r + dr, nc = sheriffPos.c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
              sheriffAuraTiles.push({ r: nr, c: nc, owner: u.owner });
            }
          }
        }
      }
    }
    if (u.effectId === "lifesteal_weaken") {
      const nosPos = getUnitPos(state, uid);
      if (nosPos) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = nosPos.r + dr, nc = nosPos.c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
              nosferatuAuraTiles.push({ r: nr, c: nc, owner: u.owner });
            }
          }
        }
      }
    }
    if (u.effectId === "garnet_aura") {
      const garnetPos = getUnitPos(state, uid);
      if (garnetPos) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = garnetPos.r + dr, nc = garnetPos.c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
              garnetAuraTiles.push({ r: nr, c: nc, owner: u.owner });
            }
          }
        }
      }
    }
    if (u.effectId === "bodyguard") {
      const dgPos = getUnitPos(state, uid);
      if (dgPos) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = dgPos.r + dr, nc = dgPos.c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
              diamondGuardianTiles.push({ r: nr, c: nc, owner: u.owner });
            }
          }
        }
      }
    }
  }

  const base = { 
    board: state.board, 
    rowHP: state.rowHP, 
    rowOwner: state.rowOwner, 
    heartHP: state.heartHP, 
    units: unitsWithBuffs, 
    activeSide: state.activeSide, 
    turnNumber: state.turnNumber, 
    gameOver: state.gameOver, 
    spawn: state.spawn, 
    movedThisTurn: [...state.movedThisTurn], 
    attackedThisTurn: [...state.attackedThisTurn], 
    firstTurn: state.firstTurn,
    buffTiles: state.buffTiles,
    moveCountThisTurn: state.moveCountThisTurn,
    raphaelProtectedTiles: raphaelProtectedTiles,
    warBannerAuraTiles: warBannerAuraTiles,
    coffinTrapperTiles: coffinTrapperTiles,
    sheriffAuraTiles: sheriffAuraTiles,
    nosferatuAuraTiles: nosferatuAuraTiles,
    garnetAuraTiles: garnetAuraTiles,
    diamondGuardianTiles: diamondGuardianTiles,
    isPlaytest: true
  };
  
  // Send both gold and silver perspectives to the same socket
  if (lobby.hostSocket) {
    lobby.hostSocket.emit("state", { 
      ...base, 
      hand: players.gold.hand, 
      deckCount: players.gold.deck.length, 
      discardCount: players.gold.discard.length,
      discard: players.gold.discard, 
      energy: players.gold.energy, 
      maxEnergy: players.gold.maxEnergy, 
      canDraw: false, // Can't draw in playtest - use card library
      // Also include silver hand for playtest
      silverHand: players.silver.hand,
      silverEnergy: players.silver.energy,
      enemyHandCount: players.silver.hand.length,
      enemyDeckCount: players.silver.deck.length,
      enemyEnergy: players.silver.energy,
      enemyMaxEnergy: players.silver.maxEnergy,
      enemyDiscard: players.silver.discard
    });
  }
}

// Check if a unit is on a buff tile and return the buff
function getUnitBuffTile(state, unitId) {
  const pos = getUnitPos(state, unitId);
  if (!pos) return null;
  const key = `${pos.r}-${pos.c}`;
  return state.buffTiles[key] || null;
}

// Check if player has a unit on a specific buff type
function playerHasBuff(state, role, buffId) {
  for (const key in state.buffTiles) {
    const buff = state.buffTiles[key];
    if (buff.id !== buffId) continue;
    const unitId = state.board[buff.row][buff.col];
    if (unitId && state.units[unitId] && state.units[unitId].owner === role) {
      return true;
    }
  }
  return false;
}

function recomputeOwners(state) {
  for (let r = 0; r < ROWS; r++) {
    let g = 0, s = 0;
    for (let c = 0; c < COLS; c++) { 
      const id = state.board[r][c]; 
      if (id && state.units[id]) { 
        if (state.units[id].owner === "gold") g++; else s++; 
      } 
    }
    // Set owner based on who has units in the row
    if (g > 0 && s === 0) state.rowOwner[r] = "gold"; 
    else if (s > 0 && g === 0) state.rowOwner[r] = "silver"; 
    else if (g === 0 && s === 0) state.rowOwner[r] = null;
    // Mixed units (both sides) - keep previous owner or null
  }
}

// Get effective row owner, considering home row defaults and HP
// 7 rows: 0-1 = gold home, 2-3-4 = neutral middle, 5-6 = silver home
function getEffectiveRowOwner(state, row) {
  // If there are units in the row, that determines ownership
  if (state.rowOwner[row]) return state.rowOwner[row];
  
  // If row has no units, check if it's a home row with HP remaining
  // Home rows with HP > 0 belong to their original owner
  // Home rows with HP = 0 and no units are neutral (conquered)
  if (row <= 1) {
    return state.rowHP[row] > 0 ? "gold" : null;
  }
  if (row >= 5) {
    return state.rowHP[row] > 0 ? "silver" : null;
  }
  return null; // Middle rows (2-3-4) with no units
}

// Check if a player can deploy on a row
function canDeployOnRow(state, row, role) {
  // Can ONLY deploy on your own home rows
  if (role === "gold") {
    return row <= 1; // Gold can only deploy on rows 0 and 1 (A and B)
  }
  if (role === "silver") {
    return row >= 5; // Silver can only deploy on rows 5 and 6 (F and G)
  }
  return false;
}

function getAdjacentAllies(state, uid) {
  const pos = getUnitPos(state, uid); if (!pos) return []; const u = state.units[uid]; if (!u) return []; const allies = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (dr === 0 && dc === 0) continue; const nr = pos.r + dr, nc = pos.c + dc; if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue; const aid = state.board[nr][nc]; if (aid && state.units[aid] && state.units[aid].owner === u.owner) allies.push(aid); }
  return allies;
}

function getEffectiveAtk(state, uid, targetId) {
  const u = state.units[uid]; if (!u) return 0; let atk = u.atk; const pos = getUnitPos(state, uid); if (!pos) return atk;
  // War Banner buff
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (dr === 0 && dc === 0) continue; const nr = pos.r + dr, nc = pos.c + dc; if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue; const aid = state.board[nr][nc]; if (aid && state.units[aid] && state.units[aid].owner === u.owner && state.units[aid].effectId === "attack_aura") atk += 1; }
  // Garnet Queen - adjacent friendlies gain +1 ATK
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (dr === 0 && dc === 0) continue; const nr = pos.r + dr, nc = pos.c + dc; if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue; const aid = state.board[nr][nc]; if (aid && state.units[aid] && state.units[aid].owner === u.owner && state.units[aid].effectId === "garnet_aura") atk += 1; }
  // Moon Flare Sorceress - adjacent allies gain +1 ATK
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (dr === 0 && dc === 0) continue; const nr = pos.r + dr, nc = pos.c + dc; if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue; const aid = state.board[nr][nc]; if (aid && state.units[aid] && state.units[aid].owner === u.owner && state.units[aid].effectId === "moonflare_aura") atk += 1; }
  // Star Weave Archer - gains +1 ATK per adjacent ally
  if (u.effectId === "starweave_ranged") {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { 
      if (dr === 0 && dc === 0) continue; 
      const nr = pos.r + dr, nc = pos.c + dc; 
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue; 
      const aid = state.board[nr][nc]; 
      if (aid && state.units[aid] && state.units[aid].owner === u.owner) atk += 1; 
    }
  }
  // Moonstone Witch - gains +1 ATK per Gem Shard on field
  if (u.effectId === "gem_transform") {
    for (const gid in state.units) {
      if (state.units[gid].key === "gemshard") atk += 1;
    }
  }
  // Void Broodmother - gains +1 ATK per Void Drone on field (owned by same player)
  if (u.effectId === "spawn_drone") {
    for (const gid in state.units) {
      if (state.units[gid].key === "voiddrone" && state.units[gid].owner === u.owner) atk += 1;
    }
  }
  // War Shrine buff tile (atk_row_buff) - applies to ALL units in that row if owner has unit on tile
  for (const key in state.buffTiles) {
    const buff = state.buffTiles[key];
    if (buff.id === "atk_row_buff" && buff.row === pos.r) {
      const unitOnTile = state.board[buff.row][buff.col];
      if (unitOnTile && state.units[unitOnTile] && state.units[unitOnTile].owner === u.owner) {
        atk += 1;
        break;
      }
    }
  }
  // Weaken aura - attacker deals -1 damage if adjacent to Undead Sheriff or Nosferatu
  const tp = targetId ? getUnitPos(state, targetId) : null;
  if (tp) {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { 
      if (dr === 0 && dc === 0) continue; 
      const nr = pos.r + dr, nc = pos.c + dc; 
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue; 
      const aid = state.board[nr][nc]; 
      if (aid && state.units[aid] && state.units[aid].owner !== u.owner && 
          (state.units[aid].effectId === "weaken_aura" || state.units[aid].effectId === "lifesteal_weaken")) {
        atk = Math.max(0, atk - 1);
        break;
      }
    }
  }
  // Garnet Queen - adjacent enemies have ATK reduced to max 2 (doesn't increase ATK)
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { 
    if (dr === 0 && dc === 0) continue; 
    const nr = pos.r + dr, nc = pos.c + dc; 
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue; 
    const aid = state.board[nr][nc]; 
    if (aid && state.units[aid] && state.units[aid].owner !== u.owner && state.units[aid].effectId === "garnet_aura") {
      atk = Math.min(atk, 2); // Reduce ATK to max 2, but don't increase if already lower
      break;
    }
  }
  // Most Wanted mark - target takes +2 damage
  if (targetId && state.units[targetId] && state.units[targetId].marked) {
    atk += 2;
  }
  // Wyrm Whelp - +1 ATK when attacking units with effects
  if (u.effectId === "anti_effect" && targetId && state.units[targetId]) {
    const target = state.units[targetId];
    if (target.effectId) {
      atk += 1;
    }
  }
  // Ember Drake (Cinderwing) - bonus ATK when adjacent to Wizard (reserved for future)
  
  // Eclipse ATK effect is now applied directly to unit.atk, no need for calculation here
  
  // ===== 8-BIT BATTALION PASSIVE EFFECTS =====
  
  // Final Boss - rage_mode: gains +1 ATK for each HP lost
  if (u.effectId === "rage_mode") {
    const hpLost = (u.maxHp || 8) - u.hp;
    atk += hpLost;
  }
  
  // Wizard NPC - stacking_aura: adjacent allies gain +N/+N based on wizard stacks
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { 
    if (dr === 0 && dc === 0) continue; 
    const nr = pos.r + dr, nc = pos.c + dc; 
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue; 
    const aid = state.board[nr][nc]; 
    if (aid && state.units[aid] && state.units[aid].owner === u.owner && state.units[aid].effectId === "stacking_aura") {
      const wizard = state.units[aid];
      atk += (wizard.wizardStacks || 1);
    }
  }
  
  return atk;
}

// Helper to check and consume divine shield for any damage source
// Returns true if damage should be blocked, false if damage should proceed
function checkDivineShield(state, unit, lobby = null) {
  if (unit && unit.divineShield) {
    delete unit.divineShield;
    logToLobby(lobby, unit.name + "'s Divine Shield absorbs the damage!");
    return true; // Block damage
  }
  return false; // Allow damage
}

function applyDamageReduction(state, tid, dmg, attackerId, lobby = null) {
  const t = state.units[tid]; if (!t) return dmg; const pos = getUnitPos(state, tid); if (!pos) return dmg;
  const attacker = attackerId ? state.units[attackerId] : null;
  
  // Bone Revolver - ranged_pierce ignores shield effects
  const ignoresShields = attacker && attacker.effectId === "ranged_pierce";
  
  // Divine Shield (Blessing of Protection) - prevent next damage completely
  if (t.divineShield) {
    delete t.divineShield;
    logToLobby(lobby, t.name + "'s Divine Shield absorbs the damage!");
    return 0;
  }
  
  // Archangel Raphael - allies in 3 tiles straight behind take no damage
  // "Behind" means toward the owner's heart (same column, up to 3 rows back)
  // Gold's heart is at row 0 (so behind = lower row numbers)
  // Silver's heart is at row 6 (so behind = higher row numbers)
  const raphaelOwner = t.owner;
  const behindDirection = raphaelOwner === "gold" ? -1 : 1;
  for (const uid in state.units) {
    const u = state.units[uid];
    if (u.owner === raphaelOwner && u.effectId === "raphael_shield") {
      const raphaelPos = getUnitPos(state, uid);
      if (raphaelPos) {
        // Check if target is in the 3 tiles straight behind Raphael (same column, 1-3 rows back)
        const protectedTiles = [
          { r: raphaelPos.r + behindDirection * 1, c: raphaelPos.c },
          { r: raphaelPos.r + behindDirection * 2, c: raphaelPos.c },
          { r: raphaelPos.r + behindDirection * 3, c: raphaelPos.c }
        ];
        for (const tile of protectedTiles) {
          if (tile.r < 0 || tile.r >= ROWS) continue; // Skip out-of-bounds
          if (pos.r === tile.r && pos.c === tile.c) {
            logToLobby(lobby, u.name + " shields " + t.name + " from damage!");
            return 0;
          }
        }
      }
    }
  }
  
  // Twilight's Respite - all player's units take -1 damage
  if (state.damageReduction && state.damageReduction[t.owner]) {
    dmg = Math.max(0, dmg - 1);
  }
  
  // Shield Bearer shield_aura
  if (!ignoresShields) {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { 
      if (dr === 0 && dc === 0) continue; 
      const nr = pos.r + dr, nc = pos.c + dc; 
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue; 
      const aid = state.board[nr][nc]; 
      if (aid && state.units[aid] && state.units[aid].owner === t.owner && state.units[aid].effectId === "shield_aura") {
        dmg = Math.max(0, dmg - 1);
        break;
      }
    }
  }
  
  // Stone Giant - stone_shield takes ALL damage for adjacent allies
  if (!ignoresShields) {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { 
      if (dr === 0 && dc === 0) continue; 
      const nr = pos.r + dr, nc = pos.c + dc; 
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue; 
      const aid = state.board[nr][nc]; 
      if (aid && state.units[aid] && state.units[aid].owner === t.owner && state.units[aid].effectId === "stone_shield" && aid !== tid) {
        // Stone Giant takes the damage instead
        const stoneGiant = state.units[aid];
        stoneGiant.hp -= dmg;
        
        // Check if Stone Giant died from taking this damage
        if (stoneGiant.hp <= 0) {
          stoneGiant.hp = 0; // Ensure HP doesn't go negative
          // Remove Stone Giant from board
          state.board[nr][nc] = null;
          // Send to discard
          if (lobby) {
            discardUnitCard(lobby, stoneGiant);
          }
          delete state.units[aid];
          logToLobby(lobby, `💀 ${stoneGiant.name} died protecting an ally!`);
        }
        
        return 0; // Target takes no damage
      }
    }
  }
  
  // Bone Colossus - thick_bones takes 1 less damage from all sources
  if (t.effectId === "thick_bones") {
    dmg = Math.max(0, dmg - 1);
  }
  
  return dmg;
}

function getArmoryBonus(state, role) { 
  let bonus = 0;
  for (const id in state.units) {
    if (state.units[id].owner === role && state.units[id].effectId === "armory_buff") {
      bonus += 1;
      console.log(`[ARMORY DEBUG] Found Armory for ${role}, total bonus now: ${bonus}`);
    }
  }
  if (bonus > 0) {
    console.log(`[ARMORY DEBUG] getArmoryBonus returning ${bonus} for ${role}`);
  }
  return bonus;
}

// Check if player has Vampire Lord granting lifesteal to all friendly units
function hasVampireLordBuff(state, role) {
  for (const id in state.units) {
    if (state.units[id].owner === role && state.units[id].effectId === "lifesteal_lord") {
      return true;
    }
  }
  return false;
}

// Check if unit has lifesteal_weaken or nosferatu aura (adjacent enemies deal -1)
function hasNosferatuWeakenAura(state, unitId) {
  const pos = getUnitPos(state, unitId);
  if (!pos) return false;
  const u = state.units[unitId];
  if (!u) return false;
  
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = pos.r + dr, nc = pos.c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      const aid = state.board[nr][nc];
      if (aid && state.units[aid] && state.units[aid].owner !== u.owner && state.units[aid].effectId === "lifesteal_weaken") {
        return true;
      }
    }
  }
  return false;
}

// Check if player has hp_buff (Fortified Ground) - gives all units +1 HP
function getHpBuffBonus(state, role) {
  for (const key in state.buffTiles) {
    const buff = state.buffTiles[key];
    if (buff.id === "hp_buff") {
      const unitOnTile = state.board[buff.row][buff.col];
      if (unitOnTile && state.units[unitOnTile] && state.units[unitOnTile].owner === role) {
        return 1;
      }
    }
  }
  return 0;
}

// Get total HP bonus for a specific unit (includes hp_buff tile AND moonflare aura)
function getTotalHpBonus(state, uid) {
  const u = state.units[uid]; if (!u) return 0;
  let bonus = getHpBuffBonus(state, u.owner);
  
  // Moon Flare Sorceress aura - adjacent allies get +1 HP
  const pos = getUnitPos(state, uid);
  if (pos) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = pos.r + dr, nc = pos.c + dc;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
        const aid = state.board[nr][nc];
        if (aid && state.units[aid] && state.units[aid].owner === u.owner && state.units[aid].effectId === "moonflare_aura") {
          bonus += 1;
          break; // Only count once
        }
      }
      if (bonus > getHpBuffBonus(state, u.owner)) break; // Found moonflare, stop looking
    }
  }
  
  return bonus;
}

// Get effective max HP for a unit (includes hp_buff and adjacent auras)
function getEffectiveMaxHp(state, uid) {
  const u = state.units[uid]; if (!u) return 0;
  let maxHp = u.maxHp || u.hp;
  maxHp += getHpBuffBonus(state, u.owner);
  
  // Moon Flare Sorceress aura - adjacent allies get +1 HP
  const pos = getUnitPos(state, uid);
  if (pos) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = pos.r + dr, nc = pos.c + dc;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
        const aid = state.board[nr][nc];
        if (aid && state.units[aid] && state.units[aid].owner === u.owner && state.units[aid].effectId === "moonflare_aura") {
          maxHp += 1;
          break; // Only count once even if multiple sorceresses
        }
      }
    }
  }
  
  return maxHp;
}

function logToLobby(lobby, msg, type = "system") { lobby.log = lobby.log || []; lobby.log.push(msg); if (lobby.hostSocket) lobby.hostSocket.emit("log", { msg, type }); if (lobby.guestSocket) lobby.guestSocket.emit("log", { msg, type }); }

// Emit sound effect to both players
// Get archetype for a card key by searching all decks
function getCardArchetype(cardKey) {
  for (const [deckId, deck] of Object.entries(DECKS)) {
    if (deck.cards && deck.cards.some(c => c.key === cardKey)) {
      return deck.archetype || deckId;
    }
  }
  return null;
}

function emitSFX(lobby, cardKey, action) {
  const archetype = getCardArchetype(cardKey);
  if (lobby.hostSocket) lobby.hostSocket.emit("sfx", { cardKey, action, archetype });
  if (lobby.guestSocket) lobby.guestSocket.emit("sfx", { cardKey, action, archetype });
}

// Emit AOE/effect animation - source unit glows, targets shake
function emitEffectAnimation(lobby, sourceUnitId, targetPositions, effectType = "aoe") {
  const state = lobby.gameState.state;
  const sourcePos = getUnitPos(state, sourceUnitId);
  
  const animData = {
    type: "effect",
    effectType: effectType,
    sourcePos: sourcePos,
    sourceUnitId: sourceUnitId,
    targets: targetPositions // Array of {r, c} positions
  };
  
  if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
  if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
}

// Combat log for detailed damage calculations
function combatLogToLobby(lobby, msg, type = "combat-step") { 
  if (lobby.hostSocket) lobby.hostSocket.emit("combatLog", { msg, type }); 
  if (lobby.guestSocket) lobby.guestSocket.emit("combatLog", { msg, type }); 
}

function drawCards(lobby, role, count) {
  const p = lobby.gameState.players[role];
  const state = lobby.gameState.state;
  for (let i = 0; i < count; i++) { 
    if (p.hand.length >= MAX_HAND_SIZE) break; 
    if (p.deck.length === 0) { 
      if (p.discard.length === 0) break; 
      p.deck = shuffle([...p.discard]); 
      p.discard = []; 
      logToLobby(lobby, role.toUpperCase() + " reshuffles"); 
    } 
    if (p.deck.length > 0) {
      p.hand.push(p.deck.pop());
      
      // Archangel Uriel - gain 1 energy when drawing
      for (const uid in state.units) {
        const u = state.units[uid];
        if (u.owner === role && u.effectId === "uriel_wisdom") {
          p.energy = Math.min(p.energy + 1, p.maxEnergy);
          logToLobby(lobby, u.name + " grants 1 energy on draw!");
        }
      }
    }
  }
}

function processOnKillEffect(lobby, aid, role, killedUnitPos, killedUnit) {
  const state = lobby.gameState.state;
  const a = state.units[aid]; if (!a) return;
  
  // Blood Countess lifesteal_grow - gains +1/+1 on kill (has passive effect type but also on-kill)
  if (a.effectId === "lifesteal_grow") {
    a.atk += 1;
    a.hp += 1;
    a.maxHp = (a.maxHp || a.hp) + 1;
    if (!a.permBuffs) a.permBuffs = [];
    a.permBuffs.push({ atk: 1, hp: 1, source: "Blood Countess (on kill)" });
    logToLobby(lobby, a.name + " grows stronger! Now " + a.atk + "/" + a.hp);
    // Emit blood vortex animation
    const countessPos = getUnitPos(state, aid);
    if (countessPos && killedUnitPos) {
      const animData = { type: "effect", effectType: "blood_vortex", sourcePos: killedUnitPos, targetPos: countessPos };
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
      if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
    }
  }
  
  // Archangel Michael - first kill each turn, can move and attack again (passive but triggers on kill)
  if (a.effectId === "michael_rampage") {
    if (!a.michaelUsedThisTurn) {
      a.michaelUsedThisTurn = true;
      state.movedThisTurn.delete(aid);
      state.moveCountThisTurn[aid] = 0;
      state.attackedThisTurn.delete(aid);
      state.attackCountThisTurn[aid] = 0;
      logToLobby(lobby, a.name + "'s divine fury! Can move and attack again!");
    }
  }
  
  // Archangel Uriel - draw a card on kill (passive but triggers on kill)
  if (a.effectId === "uriel_wisdom") {
    drawCards(lobby, role, 1);
    logToLobby(lobby, a.name + "'s wisdom reveals a card!");
  }
  
  // Other on-kill effects require effect === "onKill"
  if (a.effect !== "onKill") return;
  
  if (a.effectId === "heal_on_kill") { 
    // Crusader heals 2 HP on kill, even past max HP
    a.hp += 2;
    a.maxHp = Math.max(a.maxHp || a.hp, a.hp); // Increase max if needed
    // Track as perm buff so client shows purple HP
    if (!a.permBuffs) a.permBuffs = [];
    a.permBuffs.push({ hp: 2, source: "Crusader (on kill)" });
    logToLobby(lobby, a.name + " heals 2 HP! Now " + a.hp + "/" + a.maxHp);
    // Emit big heal cross animation on the Crusader
    const crusaderPos = getUnitPos(state, aid);
    if (crusaderPos) {
      console.log("[CRUSADER] Heal on kill animation at", crusaderPos.r, crusaderPos.c);
      const animData = { type: "effect", effectType: "heal_on_kill", sourcePos: crusaderPos };
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
      if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
    }
  }
  if (a.effectId === "energy_on_kill") { 
    lobby.gameState.players[role].energy = Math.min(lobby.gameState.players[role].energy + 1, MAX_ENERGY); 
    logToLobby(lobby, role.toUpperCase() + " gains 1 energy");
    // Emit energy bolt animation from the unit to energy bar
    const unitPos = getUnitPos(state, aid);
    if (unitPos) {
      const animData = { type: "effect", effectType: "energy_bolt", sourcePos: unitPos, role: role };
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
      if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
    }
  }
  if (a.effectId === "drain_energy") {
    const enemy = enemyOf(role);
    if (lobby.gameState.players[enemy].energy > 0) {
      lobby.gameState.players[enemy].energy = Math.max(0, lobby.gameState.players[enemy].energy - 1);
      logToLobby(lobby, a.name + " drains 1 energy from " + enemy.toUpperCase());
      const unitPos = getUnitPos(state, aid);
      if (unitPos) {
        const animData = { type: "effect", effectType: "energy_drain", sourcePos: unitPos, drainer: role, victim: enemy };
        if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
        if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
      }
    }
  }
  // Mana Siphon Mage - enemy loses 1 energy on kill
  if (a.effectId === "mana_drain_kill") {
    const enemy = enemyOf(role);
    if (lobby.gameState.players[enemy].energy > 0) {
      lobby.gameState.players[enemy].energy = Math.max(0, lobby.gameState.players[enemy].energy - 1);
      logToLobby(lobby, a.name + " siphons mana! Enemy loses 1 energy!");
      const unitPos = getUnitPos(state, aid);
      if (unitPos) {
        const animData = { type: "effect", effectType: "energy_drain", sourcePos: unitPos, drainer: role, victim: enemy };
        if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
        if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
      }
    }
  }
  if (a.effectId === "spawn_drone" && killedUnitPos) {
    // Emit drop-in animation before spawning
    const animData = { type: "effect", effectType: "drone_drop", targetPos: killedUnitPos, droneArt: "/images/Void Drone.png" };
    if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
    if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
    // Spawn a Void Drone in the killed unit's tile
    const droneId = genId();
    state.units[droneId] = { 
      id: droneId, 
      owner: role, 
      key: "voiddrone", 
      name: "Void Drone", 
      atk: 1, 
      hp: 2, 
      maxHp: 2, 
      type: "monster",
      effect: "onDeath",
      effectId: "drone_death_damage",
      effectDesc: "ON DEATH: Deal 1 damage to a random enemy.",
      art: "/images/Void Drone.png"
    };
    state.board[killedUnitPos.r][killedUnitPos.c] = droneId;
    logToLobby(lobby, a.name + " spawns a Void Drone!");
  }
  // Grave Robber - draw a card on kill
  if (a.effectId === "draw_on_kill") {
    drawCards(lobby, role, 1);
    logToLobby(lobby, a.name + " draws a card!");
    // Emit ghost green glow on the grave robber
    const grPos = getUnitPos(state, aid);
    if (grPos) {
      const animData = { type: "effect", effectType: "grave_glow", sourcePos: grPos };
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
      if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
    }
  }
  // Soul Collector - add copy of killed unit to hand
  if (a.effectId === "steal_card" && killedUnit) {
    const p = lobby.gameState.players[role];
    if (p.hand.length < MAX_HAND_SIZE) {
      // Emit soul steal animation
      const scPos = getUnitPos(state, aid);
      if (scPos && killedUnitPos) {
        const animData = { type: "effect", effectType: "soul_steal", sourcePos: killedUnitPos, targetPos: scPos, stolenArt: killedUnit.art, stolenName: killedUnit.name, role: role };
        if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
        if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
      }
      // Create a copy of the killed unit as a card
      const stolenCard = {
        id: genId(),
        key: killedUnit.key,
        name: killedUnit.name,
        atk: killedUnit.atk || 1,
        hp: killedUnit.maxHp || killedUnit.hp || 1,
        cost: killedUnit.cost || Math.max(1, Math.floor((killedUnit.atk || 0) + (killedUnit.maxHp || killedUnit.hp || 0)) / 2),
        type: killedUnit.type || "monster",
        effect: killedUnit.effect,
        effectId: killedUnit.effectId,
        effectDesc: killedUnit.effectDesc,
        art: killedUnit.art,
        stolen: true // Mark as stolen for grayscale effect
      };
      p.hand.push(stolenCard);
      logToLobby(lobby, a.name + " steals " + killedUnit.name + "'s soul!");
    } else {
      logToLobby(lobby, a.name + "'s hand is full - soul escapes!");
    }
  }
  // Moonstone Witch - transform killed unit into a Gem Shard
  if (a.effectId === "gem_transform" && killedUnitPos) {
    const gemId = genId();
    state.units[gemId] = {
      id: gemId,
      owner: role,
      key: "gemshard",
      name: "Gem Shard",
      atk: 1,
      hp: 1,
      maxHp: 1,
      type: "structure",
      art: "/images/Gem Shard.png"
    };
    state.board[killedUnitPos.r][killedUnitPos.c] = gemId;
    
    // Apply polymorph to spawned gem if polymorph is active
    if (state.polymorphActive) {
      polymorphUnit(state, gemId);
    }
    
    logToLobby(lobby, a.name + " transforms " + killedUnit.name + " into a Gem Shard!");
  }
  
  // Moonlit Blade Dancer - can move again this turn after kill
  if (a.effectId === "blade_dance") {
    state.movedThisTurn.delete(aid);
    state.moveCountThisTurn[aid] = 0;
    logToLobby(lobby, a.name + " dances through the battle! Can move again.");
  }
  
  // Starlit Champion - gains 1 energy and +1 ATK permanently on kill
  if (a.effectId === "starlit_slayer") {
    a.atk += 1;
    // Track the buff
    if (!a.permBuffs) a.permBuffs = [];
    a.permBuffs.push({ atk: 1, hp: 0, source: "Starlit Champion (on kill)" });
    lobby.gameState.players[role].energy = Math.min(lobby.gameState.players[role].energy + 1, MAX_ENERGY);
    logToLobby(lobby, a.name + " is empowered by the stars! +1 ATK, +1 energy (now " + a.atk + " ATK)");
  }
  
  // Angel of Destruction - deal 1 damage to enemy heart on kill (directly, bypasses walls)
  if (a.effectId === "destruction_heart") {
    const enemy = enemyOf(role);
    state.heartHP[enemy] = Math.max(0, state.heartHP[enemy] - 1);
    logToLobby(lobby, a.name + " damages the enemy heart directly!");
    combatLogToLobby(lobby, `💔 ${a.name} deals 1 damage to ${enemy.toUpperCase()} heart! (${state.heartHP[enemy]} HP left)`, "combat-damage");
    if (state.heartHP[enemy] <= 0) {
      state.gameOver = true;
      state.winner = role;
      logToLobby(lobby, "💀 " + enemy.toUpperCase() + "'s heart is destroyed!");
    }
  }
}

// Process on-death effects (for the dying unit's owner)
// attackerId is optional - used for death_retaliate to damage the killer
function processOnDeathEffect(lobby, deadUnit, deadUnitOwner, deadPos, attackerId = null) {
  if (!deadUnit) return;
  const state = lobby.gameState.state;
  
  // Ruby Sprite - deal 1 damage to attacker on death
  if (deadUnit.effectId === "death_retaliate" && attackerId && state.units[attackerId]) {
    const attacker = state.units[attackerId];
    const retDmg = applyDamageReduction(state, attackerId, 1, null, lobby);
    attacker.hp -= retDmg;
    logToLobby(lobby, deadUnit.name + " retaliates! " + attacker.name + " takes " + retDmg + " damage!");
    if (attacker.hp <= 0) {
      const attackerPos = getUnitPos(state, attackerId);
      if (attackerPos) {
        processOnDeathEffect(lobby, attacker, attacker.owner, attackerPos);
        processAllyDeathTriggers(lobby, attacker.owner, attacker, attackerPos);
        state.board[attackerPos.r][attackerPos.c] = null;
      }
      discardUnitCard(lobby, attacker);
      delete state.units[attackerId];
      logToLobby(lobby, attacker.name + " destroyed by retaliation!");
    }
  }
  
  if (deadUnit.effect !== "onDeath" && deadUnit.effect !== "onDeployDeath") return;
  
  if (deadUnit.effectId === "energy_on_death") {
    lobby.gameState.players[deadUnitOwner].energy = Math.min(lobby.gameState.players[deadUnitOwner].energy + 1, MAX_ENERGY);
    logToLobby(lobby, deadUnit.name + " grants " + deadUnitOwner.toUpperCase() + " 1 energy on death");
    // Emit energy bolt animation from where the unit died
    if (deadPos) {
      const animData = { type: "effect", effectType: "energy_bolt", sourcePos: deadPos, role: deadUnitOwner };
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
      if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
    }
  }
  
  // Void Drone - deal 1 damage to a random enemy on death
  if (deadUnit.effectId === "drone_death_damage") {
    const enemyRole = deadUnitOwner === "gold" ? "silver" : "gold";
    
    // Find all enemy units
    const enemyUnits = [];
    for (const uid in state.units) {
      const u = state.units[uid];
      if (u.owner === enemyRole && !u.untargetable) {
        enemyUnits.push({ id: uid, unit: u });
      }
    }
    
    if (enemyUnits.length > 0) {
      // Pick a random enemy
      const targetData = enemyUnits[Math.floor(Math.random() * enemyUnits.length)];
      const target = targetData.unit;
      const targetPos = getUnitPos(state, targetData.id);
      
      // Emit void zap animation on the target
      if (targetPos) {
        const preCheckDmg = applyDamageReduction(state, targetData.id, 1, null);
        const willDie = (target.hp - preCheckDmg <= 0) && shouldUnitDie(lobby, target);
        const animData = { type: "effect", effectType: "void_zap", targetPos: targetPos, willDie: willDie, targetArt: target.art, targetName: target.name };
        if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
        if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
      }
      
      const droneDmg = applyDamageReduction(state, targetData.id, 1, null, lobby);
      target.hp -= droneDmg;
      logToLobby(lobby, `${deadUnit.name} explodes! ${target.name} takes ${droneDmg} damage!`);
      
      if (target.hp <= 0 && shouldUnitDie(lobby, target)) {
        if (targetPos) {
          processOnDeathEffect(lobby, target, target.owner, targetPos);
          processAllyDeathTriggers(lobby, target.owner, target, targetPos);
          state.board[targetPos.r][targetPos.c] = null;
        }
        discardUnitCard(lobby, target);
        delete state.units[targetData.id];
        logToLobby(lobby, target.name + " destroyed!");
      }
    } else {
      logToLobby(lobby, deadUnit.name + " explodes but finds no targets!");
    }
  }
  
  // New Game+ - shuffle Final Boss from discard into deck
  if (deadUnit.effectId === "recycle_final_boss") {
    const player = lobby.gameState.players[deadUnitOwner];
    
    const discardIndex = player.discard.findIndex(c => c.key === "finalboss");
    if (discardIndex !== -1) {
      const bossCard = player.discard.splice(discardIndex, 1)[0];
      if (bossCard.originalCost) {
        bossCard.cost = bossCard.originalCost;
        delete bossCard.originalCost;
        delete bossCard.costReduced;
      }
      player.deck.push(bossCard);
      for (let i = player.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [player.deck[i], player.deck[j]] = [player.deck[j], player.deck[i]];
      }
      logToLobby(lobby, deadUnit.name + " shuffles Final Boss back into deck!");
    } else {
      logToLobby(lobby, deadUnit.name + ": No Final Boss in discard pile!");
    }
  }
  
  // Bone Deputy - spawn a 1/1 Bone Pile
  if (deadUnit.effectId === "spawn_bone_pile" && deadPos) {
    // Emit crossfade animation - bone deputy fades out while bone pile fades in
    const animData = { 
      type: "effect", 
      effectType: "death_transform", 
      targetPos: deadPos, 
      fromArt: deadUnit.art, 
      toArt: "/images/Bone Pile.png" 
    };
    if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
    if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
    
    const pileId = genId();
    state.units[pileId] = {
      id: pileId,
      owner: deadUnitOwner,
      key: "bonepile",
      name: "Bone Pile",
      atk: 1,
      hp: 1,
      maxHp: 1,
      type: "monster",
      art: "/images/Bone Pile.png"
    };
    state.board[deadPos.r][deadPos.c] = pileId;
    logToLobby(lobby, deadUnit.name + " leaves behind a Bone Pile!");
  }
  
  // The Hanged Man - deal 2 damage to all adjacent enemies (all 8 tiles)
  if (deadUnit.effectId === "death_explosion" && deadPos) {
    const adjacentPositions = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        adjacentPositions.push({ r: deadPos.r + dr, c: deadPos.c + dc });
      }
    }
    let damaged = 0;
    const toRemove = [];
    const targetPositions = [];
    
    // Combat log header
    combatLogToLobby(lobby, `💥 ${deadUnit.name} - Death Explosion`, "combat-header");
    
    for (const pos of adjacentPositions) {
      if (pos.r < 0 || pos.r >= ROWS || pos.c < 0 || pos.c >= COLS) continue;
      const targetId = state.board[pos.r][pos.c];
      if (targetId && state.units[targetId] && state.units[targetId].owner !== deadUnitOwner) {
        const target = state.units[targetId];
        if (target.untargetable) continue;
        targetPositions.push({ r: pos.r, c: pos.c });
        const before = target.hp;
        const explodeDmg = applyDamageReduction(state, targetId, 2, null, lobby);
        target.hp -= explodeDmg;
        combatLogToLobby(lobby, `${target.name}: ${before} HP - ${explodeDmg} = ${target.hp} HP`, "combat-result");
        damaged++;
        if (target.hp <= 0 && shouldUnitDie(lobby, target)) {
          toRemove.push({ id: targetId, r: pos.r, c: pos.c });
        }
      }
    }
    
    // Emit explosion animation (source is dead position, targets are adjacent enemies)
    if (targetPositions.length > 0) {
      const animData = {
        type: "effect",
        effectType: "death_explosion",
        sourcePos: deadPos,
        sourceUnitId: null, // Unit is already dead
        targets: targetPositions
      };
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
      if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
    }
    
    for (const item of toRemove) {
      const deadTarget = state.units[item.id];
      if (!deadTarget) continue; // May have been saved by deathWard
      // Process death effects for the killed unit (enemy's ally death triggers)
      processOnDeathEffect(lobby, deadTarget, deadTarget.owner, { r: item.r, c: item.c });
      processAllyDeathTriggers(lobby, deadTarget.owner, deadTarget, { r: item.r, c: item.c });
      // Only clear the board cell if it still holds the dead unit (death effects may have spawned something new there)
      if (state.board[item.r][item.c] === item.id) {
        state.board[item.r][item.c] = null;
      }
      discardUnitCard(lobby, deadTarget);
      delete state.units[item.id];
      combatLogToLobby(lobby, `💀 ${deadTarget.name} DESTROYED`, "combat-death");
    }
    if (damaged > 0) {
      logToLobby(lobby, deadUnit.name + " explodes, dealing 2 damage to " + damaged + " enemies!");
    }
  }
  
  // Ruby Sprite - add a Gem Shard card to hand
  if (deadUnit.effectId === "death_gem_card") {
    const player = lobby.gameState.players[deadUnitOwner];
    if (player.hand.length < MAX_HAND_SIZE) {
      const gemShardCard = {
        id: genId(),
        key: "gemshard",
        name: "Gem Shard",
        atk: 1,
        hp: 1,
        maxHp: 1,
        cost: 0,
        type: "structure",
        effect: null,
        effectId: null,
        effectDesc: "A crystallized shard of magical energy.",
        art: "/images/Gem Shard.png",
        rarity: "common"
      };
      player.hand.push(gemShardCard);
      logToLobby(lobby, deadUnit.name + " adds a Gem Shard to " + deadUnitOwner.toUpperCase() + "'s hand!");
    } else {
      logToLobby(lobby, deadUnit.name + "'s Gem Shard is lost - hand is full!");
    }
  }
  
  // Volcanic Dragon - set all adjacent units to 1 HP on death
  if (deadUnit.effectId === "volcanic_death" && deadPos) {
    // Chain effect - start from dead position and spread to adjacent units
    const affectedUnits = new Set();
    const toProcess = [deadPos];
    const processed = new Set();
    processed.add(`${deadPos.r}-${deadPos.c}`);
    
    while (toProcess.length > 0) {
      const currentPos = toProcess.shift();
      
      // Get all 8 adjacent positions
      const adjacentPositions = [
        { r: currentPos.r - 1, c: currentPos.c - 1 }, { r: currentPos.r - 1, c: currentPos.c }, { r: currentPos.r - 1, c: currentPos.c + 1 },
        { r: currentPos.r, c: currentPos.c - 1 }, { r: currentPos.r, c: currentPos.c + 1 },
        { r: currentPos.r + 1, c: currentPos.c - 1 }, { r: currentPos.r + 1, c: currentPos.c }, { r: currentPos.r + 1, c: currentPos.c + 1 }
      ];
      
      for (const pos of adjacentPositions) {
        const key = `${pos.r}-${pos.c}`;
        if (processed.has(key)) continue;
        processed.add(key);
        
        if (pos.r < 0 || pos.r >= ROWS || pos.c < 0 || pos.c >= COLS) continue;
        const targetId = state.board[pos.r][pos.c];
        if (targetId && state.units[targetId]) {
          const target = state.units[targetId];
          if (target.untargetable) continue;
          // Always chain to this unit's adjacent units (even if already at 1 HP)
          toProcess.push(pos);
          // Only reduce HP if above 1
          if (target.hp > 1) {
            target.hp = 1;
            target.volcanicScorched = true; // Mark as scorched - suppresses HP buffs
            affectedUnits.add(targetId);
          }
        }
      }
    }
    
    // Emit effect animation for all affected units
    if (affectedUnits.size > 0) {
      const targetPositions = [];
      for (const uid of affectedUnits) {
        const pos = getUnitPos(state, uid);
        if (pos) targetPositions.push({ r: pos.r, c: pos.c });
      }
      if (targetPositions.length > 0) {
        const animData = {
          type: "effect",
          effectType: "volcanic_chain",
          sourcePos: deadPos,
          sourceUnitId: null,
          targets: targetPositions
        };
        if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
        if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
      }
      
      logToLobby(lobby, deadUnit.name + "'s volcanic eruption chains through " + affectedUnits.size + " units, scorching them to 1 HP!");
      combatLogToLobby(lobby, `🌋 ${deadUnit.name} - Volcanic Chain`, "combat-header");
      for (const uid of affectedUnits) {
        const u = state.units[uid];
        if (u) combatLogToLobby(lobby, `${u.name} scorched to 1 HP!`, "combat-result");
      }
    }
  }
  
  // ===== 8-BIT BATTALION DEATH EFFECTS =====
  
  // Slime Sprite - spawn two 1/1 Slimelings in adjacent empty tiles
  if (deadUnit.effectId === "spawn_slimelings" && deadPos) {
    const adjacentTiles = [
      { r: deadPos.r - 1, c: deadPos.c },
      { r: deadPos.r + 1, c: deadPos.c },
      { r: deadPos.r, c: deadPos.c - 1 },
      { r: deadPos.r, c: deadPos.c + 1 },
      { r: deadPos.r - 1, c: deadPos.c - 1 },
      { r: deadPos.r - 1, c: deadPos.c + 1 },
      { r: deadPos.r + 1, c: deadPos.c - 1 },
      { r: deadPos.r + 1, c: deadPos.c + 1 }
    ];
    
    let spawned = 0;
    for (const tile of adjacentTiles) {
      if (spawned >= 2) break;
      // Use canSpawnAtTile to prevent spawning in enemy home rows with HP
      if (!canSpawnAtTile(state, tile.r, tile.c, deadUnitOwner)) continue;
      
      const slimelingId = genId();
      state.units[slimelingId] = {
        id: slimelingId,
        owner: deadUnitOwner,
        key: "slimeling",
        name: "Slimeling",
        atk: 1,
        hp: 1,
        maxHp: 1,
        type: "monster",
        effect: "onDeath",
        effectId: "draw_on_death",
        effectDesc: "ON DEATH: Draw a card.",
        art: "/images/Slimeling.png"
      };
      state.board[tile.r][tile.c] = slimelingId;
      spawned++;
    }
    if (spawned > 0) {
      logToLobby(lobby, deadUnit.name + " splits into " + spawned + " Slimeling(s)!");
    }
  }
  
  // Slimeling - draw a card on death
  if (deadUnit.effectId === "draw_on_death") {
    drawCards(lobby, deadUnitOwner, 1);
    logToLobby(lobby, deadUnit.name + " grants a card on death!");
  }
  
  // Skeleton Warrior 8bit - respawn once
  if (deadUnit.effectId === "respawn_once" && !deadUnit.hasRespawned) {
    const spawnId = genId();
    const respawnUnit = {
      id: spawnId,
      owner: deadUnitOwner,
      key: deadUnit.key,
      name: deadUnit.name,
      atk: deadUnit.atk,
      hp: 2,
      maxHp: 2,
      type: "monster",
      effect: "onDeath",
      effectId: "respawn_once",
      effectDesc: deadUnit.effectDesc,
      art: deadUnit.art,
      hasRespawned: true
    };
    
    if (!state.spawn[deadUnitOwner]) {
      state.spawn[deadUnitOwner] = spawnId;
      state.units[spawnId] = respawnUnit;
      logToLobby(lobby, deadUnit.name + " respawns in the spawn area!");
    } else {
      const homeRows = deadUnitOwner === "gold" ? [0, 1] : [5, 6];
      let placed = false;
      for (const row of homeRows) {
        for (let c = 0; c < COLS; c++) {
          if (!state.board[row][c]) {
            state.units[spawnId] = respawnUnit;
            state.board[row][c] = spawnId;
            logToLobby(lobby, deadUnit.name + " respawns on the battlefield!");
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
      if (!placed) {
        logToLobby(lobby, deadUnit.name + " tried to respawn but no room!");
      }
    }
  }
  
  // Barrel - explode for 3 damage to adjacent enemies
  // Use a flag to prevent infinite chain explosions
  if (deadUnit.effectId === "explode_aoe" && deadPos && !deadUnit.hasExploded) {
    deadUnit.hasExploded = true; // Mark as exploded to prevent re-triggering
    
    const adjacentPositions = [
      { r: deadPos.r - 1, c: deadPos.c },
      { r: deadPos.r + 1, c: deadPos.c },
      { r: deadPos.r, c: deadPos.c - 1 },
      { r: deadPos.r, c: deadPos.c + 1 },
      { r: deadPos.r - 1, c: deadPos.c - 1 },
      { r: deadPos.r - 1, c: deadPos.c + 1 },
      { r: deadPos.r + 1, c: deadPos.c - 1 },
      { r: deadPos.r + 1, c: deadPos.c + 1 }
    ];
    let damaged = 0;
    const toRemove = [];
    const targetPositions = [];
    
    combatLogToLobby(lobby, `💥 ${deadUnit.name} - EXPLOSION!`, "combat-header");
    
    for (const pos of adjacentPositions) {
      if (pos.r < 0 || pos.r >= ROWS || pos.c < 0 || pos.c >= COLS) continue;
      const targetId = state.board[pos.r][pos.c];
      if (targetId && state.units[targetId] && state.units[targetId].owner !== deadUnitOwner) {
        const target = state.units[targetId];
        if (target.untargetable) continue;
        targetPositions.push({ r: pos.r, c: pos.c });
        const before = target.hp;
        const barrelDmg = applyDamageReduction(state, targetId, 3, null, lobby);
        target.hp -= barrelDmg;
        combatLogToLobby(lobby, `${target.name}: ${before} HP - ${barrelDmg} = ${target.hp} HP`, "combat-result");
        damaged++;
        if (target.hp <= 0 && shouldUnitDie(lobby, target)) {
          toRemove.push({ id: targetId, r: pos.r, c: pos.c });
        }
      }
    }
    
    if (targetPositions.length > 0) {
      const animData = {
        type: "effect",
        effectType: "barrel_explosion",
        sourcePos: deadPos,
        sourceUnitId: null,
        targets: targetPositions
      };
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
      if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
    } else {
      // Still show explosion effect even with no targets hit
      const animData = {
        type: "effect",
        effectType: "barrel_explosion",
        sourcePos: deadPos,
        sourceUnitId: null,
        targets: [deadPos] // Use barrel's position as target for visual
      };
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
      if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
    }
    
    // Process deaths but skip explosion effects for barrels killed by this explosion
    // to prevent infinite chain reactions
    for (const item of toRemove) {
      const deadTarget = state.units[item.id];
      if (!deadTarget) continue;
      
      // Mark barrels killed by explosion so they don't chain-explode
      if (deadTarget.effectId === "explode_aoe") {
        deadTarget.hasExploded = true;
      }
      
      processOnDeathEffect(lobby, deadTarget, deadTarget.owner, { r: item.r, c: item.c });
      processAllyDeathTriggers(lobby, deadTarget.owner, deadTarget, { r: item.r, c: item.c });
      if (state.board[item.r][item.c] === item.id) {
        state.board[item.r][item.c] = null;
      }
      discardUnitCard(lobby, deadTarget);
      delete state.units[item.id];
      combatLogToLobby(lobby, `💀 ${deadTarget.name} DESTROYED`, "combat-death");
    }
    if (damaged > 0) {
      logToLobby(lobby, deadUnit.name + " explodes, dealing 3 damage to " + damaged + " enemies!");
    }
  }
  
  // Healer Fairy - on death heal ALL allies +1
  if (deadUnit.effectId === "heal_adjacent_and_death") {
    let healed = 0;
    for (const uid in state.units) {
      const u = state.units[uid];
      if (u.owner === deadUnitOwner) {
        const maxHp = u.maxHp || u.hp; // If no maxHp set, current HP is max (can't heal)
        if (u.hp < maxHp) {
          u.hp = Math.min(u.hp + 1, maxHp);
          healed++;
        }
      }
    }
    if (healed > 0) {
      logToLobby(lobby, deadUnit.name + "'s final blessing heals " + healed + " allies!");
    }
  }
  
  // Wizard's Rune - allow player to summon a wizard from hand for free
  if (deadUnit.effectId === "wizard_rune") {
    const player = lobby.gameState.players[deadUnitOwner];
    // Find wizard cards in hand
    const wizardsInHand = player.hand.filter(card => WIZARD_CARDS.includes(card.key));
    
    if (wizardsInHand.length > 0) {
      // Check if this is AI - auto-select a wizard to summon
      if (lobby.isAIGame && deadUnitOwner === "silver") {
        // AI auto-selects the highest cost wizard
        const sortedWizards = wizardsInHand.sort((a, b) => (b.cost || 0) - (a.cost || 0));
        const bestWizard = sortedWizards[0];
        
        // Summon the wizard at the death position or adjacent
        let spawnRow = deadPos.row;
        let spawnCol = deadPos.col;
        
        // If death position is occupied, find adjacent empty tile
        if (state.board[spawnRow][spawnCol]) {
          const adjacentTiles = [
            { r: spawnRow - 1, c: spawnCol },
            { r: spawnRow + 1, c: spawnCol },
            { r: spawnRow, c: spawnCol - 1 },
            { r: spawnRow, c: spawnCol + 1 }
          ];
          for (const tile of adjacentTiles) {
            if (tile.r >= 0 && tile.r < 7 && tile.c >= 0 && tile.c < 5 && !state.board[tile.r][tile.c]) {
              spawnRow = tile.r;
              spawnCol = tile.c;
              break;
            }
          }
        }
        
        // Check if we found a valid spot
        if (!state.board[spawnRow][spawnCol]) {
          // Remove wizard from hand
          const idx = player.hand.findIndex(c => c.id === bestWizard.id);
          if (idx !== -1) {
            player.hand.splice(idx, 1);
            
            // Summon the wizard
            const id = genId();
            const fullHp = bestWizard.hp;
            state.units[id] = {
              id,
              owner: deadUnitOwner,
              key: bestWizard.key,
              name: bestWizard.name,
              atk: bestWizard.atk,
              hp: fullHp,
              maxHp: fullHp,
              cost: bestWizard.cost,
              type: bestWizard.type,
              effect: bestWizard.effect,
              effectId: bestWizard.effectId,
              effectDesc: bestWizard.effectDesc,
              art: bestWizard.art,
              originalCard: bestWizard
            };
            state.board[spawnRow][spawnCol] = id;
            state.movedThisTurn.add(id);
            
            logToLobby(lobby, "Wizards Rune shatters! " + deadUnitOwner.toUpperCase() + " summons " + bestWizard.name + " for free!");
          }
        } else {
          logToLobby(lobby, "Wizards Rune shatters but no space to summon!");
        }
      } else {
        // Human player - wait for selection
        if (!state.pendingWizardSummon) state.pendingWizardSummon = {};
        state.pendingWizardSummon[deadUnitOwner] = {
          active: true,
          deathPos: deadPos // Store where the rune died for potential spawn location
        };
        logToLobby(lobby, "Wizards Rune shatters! " + deadUnitOwner.toUpperCase() + " may summon a Wizard from hand for free!");
        
        // Emit event to client to show wizard selection
        const socket = deadUnitOwner === "gold" ? lobby.hostSocket : lobby.guestSocket;
        if (socket) {
          socket.emit("wizardRuneTrigger", { 
            wizards: wizardsInHand.map(c => ({ id: c.id, key: c.key, name: c.name })),
            deathPos: deadPos
          });
        }
      }
    } else {
      logToLobby(lobby, "Wizards Rune shatters but no Wizards in hand!");
    }
  }
}

// Check if dying unit is a Coffin - queue for resurrection
function processCoffinDeath(lobby, deadUnit, deadUnitOwner, deadPos) {
  if (!deadUnit || deadUnit.effectId !== "resurrect_self") return;
  const state = lobby.gameState.state;
  
  // Queue the coffin for resurrection at start of owner's next turn
  if (!state.pendingCoffinResurrects) {
    state.pendingCoffinResurrects = { gold: [], silver: [] };
  }
  
  state.pendingCoffinResurrects[deadUnitOwner].push({
    key: deadUnit.key,
    name: deadUnit.name,
    atk: deadUnit.atk,
    hp: deadUnit.maxHp || deadUnit.hp,
    maxHp: deadUnit.maxHp || deadUnit.hp,
    type: deadUnit.type,
    effect: deadUnit.effect,
    effectId: deadUnit.effectId,
    effectDesc: deadUnit.effectDesc,
    art: deadUnit.art,
    pos: deadPos ? { r: deadPos.r, c: deadPos.c } : null
  });
  logToLobby(lobby, deadUnit.name + " will resurrect next turn!");
}

// Process friendly unit death for Undertaker and Crypt Keeper
function processAllyDeathTriggers(lobby, deadUnitOwner, deadUnit = null, deadPos = null) {
  const state = lobby.gameState.state;
  
  // Check for Coffin resurrection
  if (deadUnit && deadUnit.effectId === "resurrect_self") {
    processCoffinDeath(lobby, deadUnit, deadUnitOwner, deadPos);
  }
  
  // Prismatic Fairy - when a friendly Gem Shard dies, all enemies take 1 damage
  if (deadUnit && deadUnit.key === "gemshard") {
    for (const uid in state.units) {
      const u = state.units[uid];
      if (u.owner === deadUnitOwner && u.effectId === "gem_death_aoe") {
        // Collect all enemy positions for animation
        const targetPositions = [];
        const toRemove = [];
        
        // Combat log header
        combatLogToLobby(lobby, `✨ ${u.name} - Gem Shatter`, "combat-header");
        
        // Deal 1 damage to all enemies
        for (const eid in state.units) {
          const enemy = state.units[eid];
          if (enemy.owner !== deadUnitOwner && !enemy.untargetable) {
            const enemyPos = getUnitPos(state, eid);
            if (enemyPos) targetPositions.push({ r: enemyPos.r, c: enemyPos.c });
            const before = enemy.hp;
            const gemDmg = applyDamageReduction(state, eid, 1, null, lobby);
            enemy.hp -= gemDmg;
            combatLogToLobby(lobby, `${enemy.name}: ${before} HP - ${gemDmg} = ${enemy.hp} HP`, "combat-result");
            if (enemy.hp <= 0) {
              toRemove.push({ id: eid, pos: enemyPos });
            }
          }
        }
        
        // Emit prismatic shatter animation - fairy glows, enemies get crystallized
        const fairyPos = getUnitPos(state, uid);
        const animData = { type: "effect", effectType: "prismatic_shatter", sourcePos: fairyPos, targets: targetPositions };
        if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
        if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
        
        logToLobby(lobby, u.name + "'s gem shatters! All enemies take 1 damage!");
        for (const item of toRemove) {
          const deadEnemy = state.units[item.id];
          processOnDeathEffect(lobby, deadEnemy, deadEnemy.owner, item.pos);
          processAllyDeathTriggers(lobby, deadEnemy.owner, deadEnemy, item.pos);
          if (item.pos && state.board[item.pos.r][item.pos.c] === item.id) {
            state.board[item.pos.r][item.pos.c] = null;
          }
          discardUnitCard(lobby, deadEnemy);
          delete state.units[item.id];
          combatLogToLobby(lobby, `💀 ${deadEnemy.name} DESTROYED`, "combat-death");
        }
        break; // Only trigger once even if multiple Prismatic Fairies
      }
    }
  }
  
  for (const uid in state.units) {
    const u = state.units[uid];
    // Skip the dead unit itself
    if (deadUnit && uid === deadUnit.id) continue;
    // Undertaker - gains +1/+1 on ally death
    if (u.owner === deadUnitOwner && u.effectId === "grow_on_ally_death") {
      u.atk += 1;
      u.hp += 1;
      u.maxHp = (u.maxHp || u.hp) + 1;
      // Track the buff
      if (!u.permBuffs) u.permBuffs = [];
      u.permBuffs.push({ atk: 1, hp: 1, source: "Undertaker (ally death)" });
      logToLobby(lobby, u.name + " grows from ally death! Now " + u.atk + "/" + u.hp);
      triggerStatGainEffects(lobby, 'atk', 1, uid);
      triggerStatGainEffects(lobby, 'hp', 1, uid);
      // Emit soul absorption animation
      const undertakerPos = getUnitPos(state, uid);
      if (undertakerPos && deadPos) {
        const animData = { type: "effect", effectType: "soul_absorb", sourcePos: deadPos, targetPos: undertakerPos };
        if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
        if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
      }
    }
    // Crypt Keeper - gains +1 max HP on ally death (does NOT heal)
    if (u.owner === deadUnitOwner && u.effectId === "grow_max_hp_on_ally_death") {
      u.maxHp = (u.maxHp || u.hp) + 1;
      // Track the buff
      if (!u.permBuffs) u.permBuffs = [];
      u.permBuffs.push({ atk: 0, hp: 1, source: "Crypt Keeper (ally death)" });
      logToLobby(lobby, u.name + " absorbs death essence! Max HP now " + u.maxHp);
      triggerStatGainEffects(lobby, 'hp', 1, uid);
      // Emit glow animation
      const ckPos = getUnitPos(state, uid);
      if (ckPos) {
        const animData = { type: "effect", effectType: "crypt_glow", sourcePos: ckPos };
        if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
        if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
      }
    }
  }
}

// Trigger Red/Blue Wizard when any unit gains stats
function triggerStatGainEffects(lobby, statType, amount, sourceUnitId) {
  const state = lobby.gameState.state;
  
  for (const uid in state.units) {
    if (uid === sourceUnitId) continue; // Don't trigger on self
    const u = state.units[uid];
    
    // Red Wizard - gains HP when any unit gains HP
    if (u.effectId === "red_wizard" && statType === 'hp') {
      u.hp += amount;
      u.maxHp = (u.maxHp || u.hp) + amount;
      logToLobby(lobby, u.name + " absorbs life energy! +" + amount + " HP (now " + u.hp + ")");
    }
    
    // Blue Wizard - gains ATK when any unit gains ATK
    if (u.effectId === "blue_wizard" && statType === 'atk') {
      u.atk += amount;
      logToLobby(lobby, u.name + " absorbs arcane power! +" + amount + " ATK (now " + u.atk + ")");
    }
  }
}

function processEndOfTurnEffects(lobby, role) {
  const state = lobby.gameState.state;
  
  // Clear Hunter's Blessing bonus range at end of turn
  for (const id in state.units) {
    const u = state.units[id];
    if (u.owner === role && u.hunterBlessed) {
      u.bonusRange = 0;
      delete u.hunterBlessed;
    }
    // Clear rooted status for enemy units (it was applied on their turn, wears off on our turn)
    if (u.owner !== role && u.rooted) {
      delete u.rooted;
    }
  }
  
  for (const id in state.units) { 
    const u = state.units[id]; 
    if (u.owner !== role || u.effect !== "endOfTurn") continue; 
    if (u.effectId === "heal_adjacent") { 
      const allies = getAdjacentAllies(state, id); 
      let healedCount = 0;
      const healedPositions = [];
      const sourcePos = getUnitPos(state, id);
      allies.forEach(aid => { 
        const ally = state.units[aid];
        if (ally && ally.hp < (ally.maxHp || ally.hp + 1)) {
          ally.hp = Math.min(ally.hp + 1, ally.maxHp || ally.hp + 1);
          healedCount++;
          const allyPos = getUnitPos(state, aid);
          if (allyPos) healedPositions.push({ r: allyPos.r, c: allyPos.c });
        }
      }); 
      if (healedCount > 0) {
        logToLobby(lobby, u.name + " heals " + healedCount + " allies");
        // Emit heal animation
        const animData = { type: "effect", effectType: "heal_pulse", sourcePos: sourcePos, targets: healedPositions };
        if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
        if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
      }
    }
    // Topaz Miner - gains +1 ATK if adjacent to a Gem Shard
    if (u.effectId === "gem_adjacent_buff") {
      const pos = getUnitPos(state, id);
      if (pos) {
        let adjacentToGem = false;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = pos.r + dr, nc = pos.c + dc;
            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
            const aid = state.board[nr][nc];
            if (aid && state.units[aid] && state.units[aid].key === "gemshard") {
              adjacentToGem = true;
              break;
            }
          }
          if (adjacentToGem) break;
        }
        if (adjacentToGem) {
          u.atk += 1;
          logToLobby(lobby, u.name + " mines gem energy! +1 ATK (now " + u.atk + ")");
        }
      }
    }
    
    // ===== 8-BIT BATTALION END OF TURN EFFECTS =====
    
    // Healer Fairy - heal adjacent allies each turn
    if (u.effectId === "heal_adjacent_and_death") {
      const allies = getAdjacentAllies(state, id);
      let healedCount = 0;
      allies.forEach(aid => {
        const ally = state.units[aid];
        if (ally) {
          const maxHp = ally.maxHp || ally.hp; // If no maxHp set, current HP is max (can't heal)
          if (ally.hp < maxHp) {
            ally.hp = Math.min(ally.hp + 1, maxHp);
            healedCount++;
          }
        }
      });
      if (healedCount > 0) logToLobby(lobby, u.name + " heals " + healedCount + " adjacent allies");
    }
    
    // Pixel Producer - spawn a 1/1 Pixel in adjacent empty tile
    if (u.effectId === "spawn_pixel") {
      const pos = getUnitPos(state, id);
      if (pos) {
        const adjacentTiles = [
          { r: pos.r - 1, c: pos.c },
          { r: pos.r + 1, c: pos.c },
          { r: pos.r, c: pos.c - 1 },
          { r: pos.r, c: pos.c + 1 },
          { r: pos.r - 1, c: pos.c - 1 },
          { r: pos.r - 1, c: pos.c + 1 },
          { r: pos.r + 1, c: pos.c - 1 },
          { r: pos.r + 1, c: pos.c + 1 }
        ].filter(t => canSpawnAtTile(state, t.r, t.c, u.owner));
        
        if (adjacentTiles.length > 0) {
          const tile = adjacentTiles[Math.floor(Math.random() * adjacentTiles.length)];
          const pixelId = genId();
          state.units[pixelId] = {
            id: pixelId,
            owner: u.owner,
            key: "pixel",
            name: "Pixel",
            atk: 1,
            hp: 1,
            maxHp: 1,
            type: "monster",
            art: "/images/Pixel.png"
          };
          state.board[tile.r][tile.c] = pixelId;
          logToLobby(lobby, u.name + " generates a Pixel!");
        }
      }
    }
  }
  
  // Wizard NPC - track turns stationary and apply stacking buff (separate loop since it's passive, not endOfTurn)
  for (const id in state.units) {
    const u = state.units[id];
    if (u.owner !== role || u.effectId !== "stacking_aura") continue;
    
    const pos = getUnitPos(state, id);
    if (pos) {
      if (u.wizardStacks === undefined) u.wizardStacks = 1;
      if (u.lastPos === undefined) u.lastPos = { r: pos.r, c: pos.c };
      
      if (u.lastPos.r !== pos.r || u.lastPos.c !== pos.c) {
        u.wizardStacks = 1;
        u.lastPos = { r: pos.r, c: pos.c };
        logToLobby(lobby, u.name + " moved! Buff reset to +1/+1");
      } else {
        if (u.wizardStacks < 4) {
          u.wizardStacks += 1;
          logToLobby(lobby, u.name + " channels power! Now buffing +" + u.wizardStacks + "/+" + u.wizardStacks);
        }
      }
    }
  }
  
  // ===== CHEAT CODE BUFF CLEANUP =====
  if (state.cheatCodeBuffs && state.cheatCodeBuffs[role]) {
    for (const uid in state.units) {
      const u = state.units[uid];
      if (u.owner === role) {
        if (u.tempAtkBonus) {
          u.atk -= u.tempAtkBonus;
          delete u.tempAtkBonus;
        }
        if (u.tempHpBonus) {
          u.hp -= u.tempHpBonus;
          if (u.hp < 1) u.hp = 1;
          delete u.tempHpBonus;
        }
        delete u.cheatCodeTarget;
      }
    }
    delete state.cheatCodeBuffs[role];
  }
}

function processStartOfTurnEffects(lobby, role) {
  const state = lobby.gameState.state;
  
  // Clear Twilight's Respite damage reduction at start of the caster's next turn
  // (It lasts through opponent's turn)
  if (state.damageReduction && state.damageReduction[role]) {
    delete state.damageReduction[role];
    logToLobby(lobby, role.toUpperCase() + "'s Twilight's Respite fades.");
  }
  
  // Resurrect any pending Coffins
  if (state.pendingCoffinResurrects && state.pendingCoffinResurrects[role]) {
    const coffins = state.pendingCoffinResurrects[role];
    state.pendingCoffinResurrects[role] = []; // Clear the queue
    
    for (const coffin of coffins) {
      // Find an empty tile in home rows to spawn
      const homeRows = role === "gold" ? [0, 1] : [5, 6];
      let spawned = false;
      
      // First try original position if available
      if (coffin.pos && !state.board[coffin.pos.r][coffin.pos.c]) {
        const id = genId();
        state.units[id] = {
          id,
          owner: role,
          key: coffin.key,
          name: coffin.name,
          atk: coffin.atk,
          hp: coffin.hp,
          maxHp: coffin.maxHp,
          type: coffin.type,
          effect: coffin.effect,
          effectId: coffin.effectId,
          effectDesc: coffin.effectDesc,
          art: coffin.art
        };
        state.board[coffin.pos.r][coffin.pos.c] = id;
        logToLobby(lobby, coffin.name + " rises from the grave!");
        spawned = true;
      }
      
      // Otherwise find any empty home row tile
      if (!spawned) {
        for (const row of homeRows) {
          for (let c = 0; c < COLS; c++) {
            if (!state.board[row][c]) {
              const id = genId();
              state.units[id] = {
                id,
                owner: role,
                key: coffin.key,
                name: coffin.name,
                atk: coffin.atk,
                hp: coffin.hp,
                maxHp: coffin.maxHp,
                type: coffin.type,
                effect: coffin.effect,
                effectId: coffin.effectId,
                effectDesc: coffin.effectDesc,
                art: coffin.art
              };
              state.board[row][c] = id;
              logToLobby(lobby, coffin.name + " rises from the grave!");
              spawned = true;
              break;
            }
          }
          if (spawned) break;
        }
      }
      
      if (!spawned) {
        logToLobby(lobby, coffin.name + " has no room to resurrect!");
      }
    }
  }
  
  for (const id in state.units) { 
    const u = state.units[id]; 
    if (u.owner !== role || u.effect !== "startOfTurn") continue; 
    if (u.effectId === "shrine_heal") { 
      const pos = getUnitPos(state, id); 
      if (!pos) continue; 
      let healed = 0;
      const healedPositions = [];
      for (let c = 0; c < COLS; c++) { 
        const uid = state.board[pos.r][c]; 
        if (uid && state.units[uid] && state.units[uid].owner === role && uid !== id) { 
          const unit = state.units[uid];
          if (unit.hp < (unit.maxHp || unit.hp + 1)) {
            unit.hp = Math.min(unit.hp + 1, unit.maxHp || unit.hp + 1);
            healed++;
            healedPositions.push({ r: pos.r, c: c });
          }
        } 
      } 
      if (healed > 0) {
        logToLobby(lobby, "Shrine heals " + healed + " units");
        const animData = { type: "effect", effectType: "heal_pulse", sourcePos: pos, targets: healedPositions };
        if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
        if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
      }
    }
    
    // Moon Sentinel - gain +1 HP if adjacent to 2+ allies
    if (u.effectId === "sentinel_growth") {
      const pos = getUnitPos(state, id);
      if (!pos) continue;
      let adjacentAllies = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = pos.r + dr, nc = pos.c + dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
          const adjId = state.board[nr][nc];
          if (adjId && state.units[adjId] && state.units[adjId].owner === role) adjacentAllies++;
        }
      }
      if (adjacentAllies >= 2) {
        u.hp += 1;
        u.maxHp = (u.maxHp || u.hp) + 1;
        logToLobby(lobby, u.name + " grows stronger from allies! (+1 HP)");
      }
    }
    
    // Elune's Moonwell - if adjacent to 2+ allies, gain 1 energy and draw a card
    if (u.effectId === "moonwell_power") {
      const pos = getUnitPos(state, id);
      if (!pos) continue;
      let adjacentAllies = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = pos.r + dr, nc = pos.c + dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
          const adjId = state.board[nr][nc];
          if (adjId && state.units[adjId] && state.units[adjId].owner === role) adjacentAllies++;
        }
      }
      if (adjacentAllies >= 2) {
        const player = lobby.gameState.players[role];
        player.energy = Math.min(player.energy + 1, MAX_ENERGY);
        drawCards(lobby, role, 1);
        logToLobby(lobby, u.name + " channels lunar energy! (+1 energy, +1 card)");
      }
    }
    
    // Temple of the Moon - if adjacent to 2+ allies, give them +1 ATK permanently
    if (u.effectId === "temple_blessing") {
      const pos = getUnitPos(state, id);
      if (!pos) continue;
      const adjacentAllies = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = pos.r + dr, nc = pos.c + dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
          const adjId = state.board[nr][nc];
          if (adjId && state.units[adjId] && state.units[adjId].owner === role && state.units[adjId].type !== "structure") {
            adjacentAllies.push(adjId);
          }
        }
      }
      if (adjacentAllies.length >= 2) {
        for (const allyId of adjacentAllies) {
          state.units[allyId].atk += 1;
        }
        logToLobby(lobby, u.name + " blesses " + adjacentAllies.length + " allies with +1 ATK!");
      }
    }
    
    // Star Invoker - deal 2 damage to a random enemy
    if (u.effectId === "star_strike") {
      const enemies = [];
      for (const uid in state.units) {
        if (state.units[uid].owner !== role && !state.units[uid].untargetable) {
          enemies.push(uid);
        }
      }
      if (enemies.length > 0) {
        const targetId = enemies[Math.floor(Math.random() * enemies.length)];
        const target = state.units[targetId];
        const targetPos = getUnitPos(state, targetId);
        
        // Emit effect animation
        if (targetPos) {
          emitEffectAnimation(lobby, id, [{ r: targetPos.r, c: targetPos.c }], "star_strike");
        }
        
        // Combat log
        combatLogToLobby(lobby, `⭐ ${u.name} - Star Strike`, "combat-header");
        const before = target.hp;
        const starDmg = applyDamageReduction(state, targetId, 2, null, lobby);
        target.hp -= starDmg;
        combatLogToLobby(lobby, `${target.name}: ${before} HP - ${starDmg} = ${target.hp} HP`, "combat-result");
        
        logToLobby(lobby, u.name + " calls down starfire on " + target.name + "! (" + starDmg + " damage)");
        if (target.hp <= 0 && shouldUnitDie(lobby, target)) {
          processOnDeathEffect(lobby, target, target.owner, targetPos);
          processAllyDeathTriggers(lobby, target.owner, target, targetPos);
          if (targetPos) state.board[targetPos.r][targetPos.c] = null;
          discardUnitCard(lobby, target);
          delete state.units[targetId];
          combatLogToLobby(lobby, `💀 ${target.name} DESTROYED`, "combat-death");
        }
      }
    }
  }
  
  // Channeling effects (passive but with start-of-turn triggers)
  for (const id in state.units) {
    const u = state.units[id];
    if (u.owner !== role) continue;
    
    // Meditation Monk - give random friendly unit +1 ATK or +1 HP
    if (u.effectId === "meditation_buff") {
      // Find all friendly units on the board
      const friendlyUnits = [];
      for (const uid in state.units) {
        if (state.units[uid].owner === role) {
          friendlyUnits.push(uid);
        }
      }
      
      if (friendlyUnits.length > 0) {
        // Pick a random friendly unit
        const targetId = friendlyUnits[Math.floor(Math.random() * friendlyUnits.length)];
        const target = state.units[targetId];
        
        // 50/50 chance for ATK or HP
        if (Math.random() < 0.5) {
          target.atk += 1;
          logToLobby(lobby, u.name + " meditates... " + target.name + " gains +1 ATK!");
          // Trigger Blue Wizard
          triggerStatGainEffects(lobby, 'atk', 1, targetId);
        } else {
          target.hp += 1;
          target.maxHp = (target.maxHp || target.hp) + 1;
          logToLobby(lobby, u.name + " meditates... " + target.name + " gains +1 HP!");
          // Trigger Red Wizard
          triggerStatGainEffects(lobby, 'hp', 1, targetId);
        }
      }
    }
    
    // Angelic Attendant - heal adjacent allies 1 HP
    if (u.effectId === "attendant_heal") {
      const pos = getUnitPos(state, id);
      if (pos) {
        let healed = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = pos.r + dr, nc = pos.c + dc;
            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
            const adjId = state.board[nr][nc];
            if (adjId && state.units[adjId] && state.units[adjId].owner === role) {
              const ally = state.units[adjId];
              if (ally.hp < ally.maxHp) {
                ally.hp = Math.min(ally.hp + 1, ally.maxHp);
                healed++;
              }
            }
          }
        }
        if (healed > 0) logToLobby(lobby, u.name + " heals " + healed + " adjacent allies!");
      }
    }
    
    // Maiden of Virtue - heal heart 1 HP (heals the actual heart, not walls)
    if (u.effectId === "maiden_heal") {
      const maxHeart = 30; // Max heart HP is 30
      if (state.heartHP[role] < maxHeart) {
        state.heartHP[role] = Math.min(state.heartHP[role] + 1, maxHeart);
        logToLobby(lobby, u.name + " heals your heart for 1 HP! (${state.heartHP[role]}/${maxHeart})");
      }
    }
    
    // Lucifer Fallen Angel - deal 3 damage to own heart (directly, bypasses walls)
    if (u.effectId === "lucifer_curse") {
      state.heartHP[role] = Math.max(0, state.heartHP[role] - 3);
      logToLobby(lobby, "Lucifer's curse deals 3 damage directly to your heart!");
      combatLogToLobby(lobby, `💔 Lucifer deals 3 damage to ${role.toUpperCase()} heart! (${state.heartHP[role]} HP left)`, "combat-damage");
      if (state.heartHP[role] <= 0) {
        state.gameOver = true;
        state.winner = role === "gold" ? "silver" : "gold";
        logToLobby(lobby, "💀 " + role.toUpperCase() + " is destroyed by Lucifer's curse!");
      }
    }
    
    // Garden of Eden - heal adjacent units 2 HP and gain +1 max HP
    if (u.effectId === "eden_blessing") {
      const pos = getUnitPos(state, id);
      if (pos) {
        let blessed = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = pos.r + dr, nc = pos.c + dc;
            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
            const adjId = state.board[nr][nc];
            if (adjId && state.units[adjId] && state.units[adjId].type !== 'structure') {
              const ally = state.units[adjId];
              ally.maxHp = (ally.maxHp || ally.hp) + 1;
              ally.hp = Math.min(ally.hp + 2, ally.maxHp);
              blessed++;
              // Trigger Red Wizard for max HP gain
              triggerStatGainEffects(lobby, 'hp', 1, adjId);
            }
          }
        }
        if (blessed > 0) logToLobby(lobby, "Garden of Eden blesses " + blessed + " units!");
      }
    }
    
    // Decrement frozen counter (unit is blocked from acting THIS turn, then counter decreases)
    if (u.frozen && u.frozen > 0) {
      u.frozen -= 1;
      if (u.frozen <= 0) {
        delete u.frozen;
        logToLobby(lobby, u.name + " thaws from the obsidian freeze!");
      } else {
        logToLobby(lobby, `${u.name} is still frozen (${u.frozen} turn(s) remaining)`);
      }
    }
  }
}

function processInstantSpell(lobby, role, effectId, targetRow, targetUnitId, targetCol) {
  const state = lobby.gameState.state;
  if (effectId === "fortify_row") { 
    if (targetRow !== undefined && targetRow >= 0 && targetRow < ROWS) {
      state.rowHP[targetRow] = Math.min((state.rowHP[targetRow] || 0) + 15, 99); 
      logToLobby(lobby, role.toUpperCase() + " fortified row " + String.fromCharCode(65 + targetRow) + " +15 HP"); 
    }
  }
  if (effectId === "draw_two") { drawCards(lobby, role, 2); logToLobby(lobby, role.toUpperCase() + " draws 2"); }
  if (effectId === "double_attack") { 
    if (targetUnitId && state.units[targetUnitId]) {
      const unit = state.units[targetUnitId];
      unit.canDoubleAttack = true;
      // Remove from attackedThisTurn so it can attack again (if it already attacked once)
      state.attackedThisTurn.delete(targetUnitId);
      logToLobby(lobby, unit.name + " can attack twice!");
    }
  }
  // Void Alien spells
  if (effectId === "destroy_weak") {
    // Assimilation - destroy enemy with 2 or less HP
    if (targetUnitId && state.units[targetUnitId]) {
      const target = state.units[targetUnitId];
      if (target.owner !== role && target.hp <= 2) {
        const pos = getUnitPos(state, targetUnitId);
        if (pos) {
          // Check if target is untargetable (Burrower Beast on deploy turn)
          if (target.untargetable) {
            logToLobby(lobby, target.name + " is untargetable!");
            return false;
          }
          // Emit melt animation
          const animData = { type: "effect", effectType: "melt", targetPos: pos, targetArt: target.art };
          if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
          if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
          // Process on-death effect before removing
          processOnDeathEffect(lobby, target, target.owner, pos);
          processAllyDeathTriggers(lobby, target.owner, target, pos);
          state.board[pos.r][pos.c] = null;
          discardUnitCard(lobby, target);
          delete state.units[targetUnitId];
          logToLobby(lobby, "Assimilation destroys " + target.name + "!");
          return true;
        }
      }
    }
    return false;
  }
  if (effectId === "row_damage") {
    // Void Collapse - deal 1 damage to all enemies in target row
    if (targetRow !== undefined && targetRow >= 0 && targetRow < ROWS) {
      let damaged = 0;
      const toRemove = [];
      const targetPositions = [];
      
      // Combat log header
      const rowLetter = String.fromCharCode(65 + targetRow);
      combatLogToLobby(lobby, `🌀 Void Collapse - Row ${rowLetter}`, "combat-header");
      
      for (let c = 0; c < COLS; c++) {
        const uid = state.board[targetRow][c];
        if (uid && state.units[uid] && state.units[uid].owner !== role) {
          const target = state.units[uid];
          // Check untargetable
          if (target.untargetable) continue;
          // Check divine shield
          if (checkDivineShield(state, target, lobby)) continue;
          targetPositions.push({ r: targetRow, c: c });
          const before = target.hp;
          const vcDmg = applyDamageReduction(state, uid, 1, null, lobby);
          target.hp -= vcDmg;
          combatLogToLobby(lobby, `${target.name}: ${before} HP - ${vcDmg} = ${target.hp} HP`, "combat-result");
          damaged++;
          if (target.hp <= 0 && shouldUnitDie(lobby, target)) {
            toRemove.push({ id: uid, col: c });
          }
        }
      }
      
      // Emit row damage animation (spell effect, no source unit)
      if (targetPositions.length > 0 || damaged === 0) {
        const animData = {
          type: "effect",
          effectType: "void_collapse_spell",
          targetRow: targetRow,
          targets: targetPositions
        };
        if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
        if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
      }
      
      // Remove dead units
      for (const item of toRemove) {
        const deadUnit = state.units[item.id];
        if (!deadUnit) continue; // May have been saved by deathWard
        const deadPos = { r: targetRow, c: item.col };
        processOnDeathEffect(lobby, deadUnit, deadUnit.owner, deadPos);
        processAllyDeathTriggers(lobby, deadUnit.owner, deadUnit, deadPos);
        if (state.board[targetRow][item.col] === item.id) state.board[targetRow][item.col] = null;
        discardUnitCard(lobby, deadUnit);
        delete state.units[item.id];
        combatLogToLobby(lobby, `💀 ${deadUnit.name} DESTROYED`, "combat-death");
      }
      logToLobby(lobby, "Void Collapse hits " + damaged + " enemies in row " + rowLetter + "!");
    }
  }
  if (effectId === "mass_buff") {
    // Hive Ascension - all friendly units gain +1 ATK and +1 HP permanently
    let buffed = 0;
    const buffedPositions = [];
    for (const uid in state.units) {
      const u = state.units[uid];
      if (u.owner === role) {
        u.atk += 1;
        u.hp += 1;
        u.maxHp = (u.maxHp || u.hp) + 1;
        // Track the buff source
        if (!u.permBuffs) u.permBuffs = [];
        u.permBuffs.push({ atk: 1, hp: 1, source: "Hive Ascension" });
        const pos = getUnitPos(state, uid);
        if (pos) buffedPositions.push({ r: pos.r, c: pos.c });
        buffed++;
      }
    }
    // Emit buff float animation on all affected units
    if (buffedPositions.length > 0) {
      const animData = { type: "effect", effectType: "buff_float", targets: buffedPositions, buffAtk: 1, buffHp: 1 };
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
      if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
    }
    logToLobby(lobby, "Hive Ascension buffs " + buffed + " units with +1 ATK and +1 HP!");
  }
  
  // Western Skeleton spells
  if (effectId === "draw_discard") {
    // Dead Man's Hand - draw 2 cards, then discard 1 (for now, just draw 2 - discard happens client-side)
    drawCards(lobby, role, 2);
    // TODO: implement discard selection - for now just draw 2 as net +1
    logToLobby(lobby, role.toUpperCase() + " plays Dead Man's Hand - draws 2 cards!");
  }
  
  if (effectId === "mark_target") {
    // Most Wanted - target enemy takes +2 damage from all attacks
    if (targetUnitId && state.units[targetUnitId]) {
      const target = state.units[targetUnitId];
      if (target.owner !== role) {
        if (target.untargetable) {
          logToLobby(lobby, target.name + " is untargetable!");
          return false;
        }
        target.marked = true;
        // Emit most wanted poster animation
        const targetPos = getUnitPos(state, targetUnitId);
        if (targetPos) {
          const animData = { type: "effect", effectType: "most_wanted", targetPos: targetPos };
          if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
          if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
        }
        logToLobby(lobby, target.name + " is Most Wanted! Takes +2 damage from attacks.");
        return true;
      }
    }
    return false;
  }
  
  if (effectId === "resurrect") {
    // Shallow Grave - return a random friendly unit from discard to hand
    const p = lobby.gameState.players[role];
    if (p.discard.length > 0) {
      // Filter for unit cards only
      const unitCards = p.discard.filter(c => c.type === "monster");
      if (unitCards.length > 0) {
        const randomIdx = Math.floor(Math.random() * unitCards.length);
        const card = unitCards[randomIdx];
        // Remove from discard
        const discardIdx = p.discard.findIndex(c => c === card);
        if (discardIdx !== -1) {
          p.discard.splice(discardIdx, 1);
          p.hand.push(card);
          logToLobby(lobby, "Shallow Grave returns " + card.name + " to hand!");
        }
      } else {
        logToLobby(lobby, "No units in discard pile!");
      }
    } else {
      logToLobby(lobby, "Discard pile is empty!");
    }
  }
  
  if (effectId === "high_noon") {
    // High Noon - deal 2 damage to all enemies in target row
    if (targetRow !== undefined && targetRow >= 0 && targetRow < ROWS) {
      let damaged = 0;
      const toRemove = [];
      const targetPositions = [];
      
      // Combat log header
      const rowLetter = String.fromCharCode(65 + targetRow);
      combatLogToLobby(lobby, `🤠 High Noon - Row ${rowLetter}`, "combat-header");
      
      for (let c = 0; c < COLS; c++) {
        const uid = state.board[targetRow][c];
        if (uid && state.units[uid] && state.units[uid].owner !== role) {
          const target = state.units[uid];
          if (target.untargetable) continue;
          targetPositions.push({ r: targetRow, c: c });
          const before = target.hp;
          const rdmg1 = applyDamageReduction(state, uid, 2, null, lobby); target.hp -= rdmg1;
          combatLogToLobby(lobby, `${target.name}: ${before} HP - ${rdmg1} = ${target.hp} HP`, "combat-result");
          damaged++;
          if (target.hp <= 0 && shouldUnitDie(lobby, target)) {
            toRemove.push({ id: uid, col: c });
          }
        }
      }
      
      // Emit High Noon animation
      const animData = {
        type: "effect",
        effectType: "high_noon",
        targetRow: targetRow,
        targets: targetPositions
      };
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
      if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
      
      for (const item of toRemove) {
        const deadUnit = state.units[item.id];
        if (!deadUnit) continue;
        processOnDeathEffect(lobby, deadUnit, deadUnit.owner, { r: targetRow, c: item.col });
        processAllyDeathTriggers(lobby, deadUnit.owner, deadUnit, { r: targetRow, c: item.col });
        if (state.board[targetRow][item.col] === item.id) state.board[targetRow][item.col] = null;
        discardUnitCard(lobby, deadUnit);
        delete state.units[item.id];
        combatLogToLobby(lobby, `💀 ${deadUnit.name} DESTROYED`, "combat-death");
      }
      logToLobby(lobby, "High Noon! " + damaged + " enemies hit for 2 damage in row " + rowLetter + "!");
    }
  }
  
  // === CRIMSON COURT VAMPIRE SPELLS ===
  
  if (effectId === "blood_pact") {
    // Blood Pact - deal 2 damage to friendly unit, draw 2 cards
    if (targetUnitId && state.units[targetUnitId]) {
      const target = state.units[targetUnitId];
      if (target.owner === role) {
        // Emit blood pact animation
        const targetPos = getUnitPos(state, targetUnitId);
        if (targetPos) {
          const animData = { type: "effect", effectType: "blood_pact", targetPos: targetPos, role: role };
          if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
          if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
        }
        target.hp -= 2;
        logToLobby(lobby, "Blood Pact deals 2 damage to " + target.name);
        
        if (target.hp <= 0 && shouldUnitDie(lobby, target)) {
          const pos = getUnitPos(state, targetUnitId);
          processOnDeathEffect(lobby, target, target.owner, pos);
          processAllyDeathTriggers(lobby, target.owner, target, pos);
          if (pos) state.board[pos.r][pos.c] = null;
          discardUnitCard(lobby, target);
          delete state.units[targetUnitId];
          logToLobby(lobby, target.name + " destroyed!");
        }
        
        drawCards(lobby, role, 2);
        logToLobby(lobby, role.toUpperCase() + " draws 2 cards");
      }
    }
  }
  
  if (effectId === "swap_stats") {
    // Blood Transfusion - swap target's ATK and HP
    if (targetUnitId && state.units[targetUnitId]) {
      const target = state.units[targetUnitId];
      const oldAtk = target.atk;
      const oldHp = target.hp;
      
      // Emit animation before swapping
      const targetPos = getUnitPos(state, targetUnitId);
      if (targetPos) {
        const animData = { type: "effect", effectType: "blood_transfusion", targetPos: targetPos, oldAtk: oldAtk, oldHp: oldHp };
        if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
        if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
      }
      
      target.atk = oldHp;
      target.hp = oldAtk;
      target.maxHp = oldAtk; // Update max HP too
      logToLobby(lobby, "Blood Transfusion! " + target.name + " is now " + target.atk + "/" + target.hp);
      
      // If HP becomes 0 or less, unit dies
      if (target.hp <= 0 && shouldUnitDie(lobby, target)) {
        const pos = getUnitPos(state, targetUnitId);
        processOnDeathEffect(lobby, target, target.owner, pos);
        processAllyDeathTriggers(lobby, target.owner, target, pos);
        if (pos) state.board[pos.r][pos.c] = null;
        discardUnitCard(lobby, target);
        delete state.units[targetUnitId];
        logToLobby(lobby, target.name + " destroyed!");
      }
    }
  }
  
  if (effectId === "mass_resurrect") {
    // Crimson Revival - return last 2 dead units to hand
    const p = lobby.gameState.players[role];
    const unitCards = p.discard.filter(c => c.type !== "spell");
    const toReturn = unitCards.slice(-2); // Last 2 units
    
    if (toReturn.length > 0) {
      // Emit animation
      const animData = { type: "effect", effectType: "crimson_revival", role: role, cardNames: toReturn.map(c => c.name), cardArts: toReturn.map(c => c.art) };
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
      if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
      
      for (const card of toReturn) {
        const idx = p.discard.indexOf(card);
        if (idx !== -1) {
          p.discard.splice(idx, 1);
          p.hand.push({ ...card, id: genId() });
        }
      }
      logToLobby(lobby, "Crimson Revival returns " + toReturn.map(c => c.name).join(" and ") + " to hand!");
    } else {
      logToLobby(lobby, "No units in discard to revive!");
    }
  }
  
  if (effectId === "sanguine_feast") {
    // Sanguine Feast - deal 2 damage to all enemies in row, heal heart for each hit
    if (targetRow !== undefined && targetRow >= 0 && targetRow < ROWS) {
      let hitCount = 0;
      const toRemove = [];
      const targetPositions = [];
      
      // Combat log header
      const rowLetter = String.fromCharCode(65 + targetRow);
      combatLogToLobby(lobby, `🩸 Sanguine Feast - Row ${rowLetter}`, "combat-header");
      
      for (let c = 0; c < COLS; c++) {
        const uid = state.board[targetRow][c];
        if (uid && state.units[uid] && state.units[uid].owner !== role) {
          const target = state.units[uid];
          if (target.untargetable) continue;
          targetPositions.push({ r: targetRow, c: c });
          const before = target.hp;
          const rdmg2 = applyDamageReduction(state, uid, 2, null, lobby); target.hp -= rdmg2;
          combatLogToLobby(lobby, `${target.name}: ${before} HP - ${rdmg2} = ${target.hp} HP`, "combat-result");
          hitCount++;
          if (target.hp <= 0 && shouldUnitDie(lobby, target)) {
            toRemove.push({ id: uid, col: c });
          }
        }
      }
      
      // Emit Sanguine Feast animation
      const animData = {
        type: "effect",
        effectType: "sanguine_feast",
        targetRow: targetRow,
        targets: targetPositions,
        hitCount: hitCount,
        role: role
      };
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
      if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
      
      for (const item of toRemove) {
        const deadUnit = state.units[item.id];
        if (!deadUnit) continue;
        processOnDeathEffect(lobby, deadUnit, deadUnit.owner, { r: targetRow, c: item.col });
        processAllyDeathTriggers(lobby, deadUnit.owner, deadUnit, { r: targetRow, c: item.col });
        if (state.board[targetRow][item.col] === item.id) state.board[targetRow][item.col] = null;
        discardUnitCard(lobby, deadUnit);
        delete state.units[item.id];
        combatLogToLobby(lobby, `💀 ${deadUnit.name} DESTROYED`, "combat-death");
      }
      // Heal heart for each unit hit
      if (hitCount > 0) {
        state.heartHP[role] = Math.min(state.heartHP[role] + hitCount, 30);
        combatLogToLobby(lobby, `❤️ Heart heals for ${hitCount}`, "heal");
        logToLobby(lobby, "Sanguine Feast hits " + hitCount + " enemies! Heart heals for " + hitCount + "!");
      } else {
        logToLobby(lobby, "Sanguine Feast finds no victims!");
      }
    }
  }
  
  // === JEWELED COURT FAIRY SPELLS ===
  
  if (effectId === "fairy_blessing") {
    // Pearl Blessing - all friendly units +1 HP, fairies also +1 ATK
    let buffed = 0;
    const fairyKeys = ['rubysprite', 'emeraldforager', 'sapphiredancer', 'topazminer', 
                       'amethystenchanter', 'diamondguardian', 'opaldevourer',
                       'garnetqueen', 'moonstonewitch', 'prismaticfairy'];
    const buffedPositions = [];
    const fairyPositions = [];
    for (const uid in state.units) {
      const u = state.units[uid];
      if (u.owner === role) {
        const uPos = getUnitPos(state, uid);
        if (uPos) buffedPositions.push({ r: uPos.r, c: uPos.c });
        u.hp += 1;
        u.maxHp = (u.maxHp || u.hp) + 1;
        if (!u.permBuffs) u.permBuffs = [];
        if (fairyKeys.includes(u.key)) {
          u.atk += 1;
          u.permBuffs.push({ atk: 1, hp: 1, source: "Pearl Blessing" });
          if (uPos) fairyPositions.push({ r: uPos.r, c: uPos.c });
        } else {
          u.permBuffs.push({ atk: 0, hp: 1, source: "Pearl Blessing" });
        }
        buffed++;
      }
    }
    // Emit pearl rain animation
    const animData = { type: "effect", effectType: "pearl_blessing", targets: buffedPositions, fairyTargets: fairyPositions, role: role };
    if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
    if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
    logToLobby(lobby, "Pearl Blessing buffs " + buffed + " units!");
  }
  
  if (effectId === "halve_atk") {
    // Gemstone Curse - halve target enemy's ATK (min 1)
    if (targetUnitId && state.units[targetUnitId]) {
      const target = state.units[targetUnitId];
      if (target.owner !== role) {
        const oldAtk = target.atk;
        target.atk = Math.max(1, Math.floor(target.atk / 2));
        const reduction = oldAtk - target.atk;
        // Track the debuff
        if (!target.permBuffs) target.permBuffs = [];
        target.permBuffs.push({ atk: -reduction, hp: 0, source: "Gemstone Curse" });
        // Emit curse animation
        const targetPos = getUnitPos(state, targetUnitId);
        if (targetPos) {
          const animData = { type: "effect", effectType: "gemstone_curse", targetPos: targetPos, reduction: reduction };
          if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
          if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
        }
        logToLobby(lobby, "Gemstone Curse reduces " + target.name + "'s ATK from " + oldAtk + " to " + target.atk + "!");
      }
    }
  }
  
  if (effectId === "summon_gems") {
    // Fairy Ring - summon 2 Gem Shards in home rows
    const homeRows = role === "gold" ? [0, 1] : [5, 6];
    let spawned = 0;
    const spawnPositions = [];
    for (const row of homeRows) {
      if (spawned >= 2) break;
      for (let c = 0; c < COLS; c++) {
        if (spawned >= 2) break;
        if (!state.board[row][c]) {
          const gemId = genId();
          state.units[gemId] = {
            id: gemId,
            owner: role,
            key: "gemshard",
            name: "Gem Shard",
            atk: 1,
            hp: 1,
            maxHp: 1,
            type: "structure",
            art: "/images/Gem Shard.png"
          };
          state.board[row][c] = gemId;
          spawnPositions.push({ r: row, c: c });
          
          // Apply polymorph to spawned gem if polymorph is active
          if (state.polymorphActive) {
            polymorphUnit(state, gemId);
          }
          
          spawned++;
        }
      }
    }
    // Emit fairy ring spawn animation
    if (spawnPositions.length > 0) {
      const animData = { type: "effect", effectType: "fairy_ring_spawn", targets: spawnPositions };
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
      if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
    }
    logToLobby(lobby, "Fairy Ring summons " + spawned + " Gem Shards!");
  }
  
  // === ELUNE'S CHOSEN SPELLS ===
  
  if (effectId === "damage_reduction") {
    // Twilight's Respite - all allies take -1 damage from all sources until next turn
    if (!state.damageReduction) state.damageReduction = {};
    state.damageReduction[role] = true;
    logToLobby(lobby, "Twilight's Respite shields all " + role.toUpperCase() + " units! (-1 damage until next turn)");
  }
  
  if (effectId === "hunter_blessing") {
    // Hunting God's Blessing - target ally gains +1 ATK and +1 range this turn
    if (targetUnitId && state.units[targetUnitId]) {
      const target = state.units[targetUnitId];
      if (target.owner === role) {
        target.atk += 1;
        target.bonusRange = (target.bonusRange || 0) + 1;
        target.hunterBlessed = true; // Mark for end of turn cleanup
        logToLobby(lobby, target.name + " receives Hunting God's Blessing! (+1 ATK, +1 range this turn)");
      }
    }
  }
  
  if (effectId === "death_ward") {
    // Lunar Prayer - target ally gains death ward (survives lethal once)
    if (targetUnitId && state.units[targetUnitId]) {
      const target = state.units[targetUnitId];
      if (target.owner === role) {
        target.deathWard = true;
        logToLobby(lobby, target.name + " is blessed with Lunar Prayer! (Survives lethal damage once)");
      }
    }
  }
  
  if (effectId === "lunar_aoe") {
    // Lunar Barrage - deal 2 damage to all enemies in and adjacent to target tile
    if (targetRow !== undefined && targetCol !== undefined) {
      const hitPositions = [];
      // Center tile and all 8 adjacent tiles
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = targetRow + dr;
          const nc = targetCol + dc;
          if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
            hitPositions.push({ r: nr, c: nc });
          }
        }
      }
      
      // Combat log header
      combatLogToLobby(lobby, `🌙 Lunar Barrage`, "combat-header");
      
      let hitCount = 0;
      const toRemove = [];
      const targetPositions = [];
      
      for (const pos of hitPositions) {
        const uid = state.board[pos.r][pos.c];
        if (uid && state.units[uid] && state.units[uid].owner !== role) {
          const target = state.units[uid];
          if (target.untargetable) continue;
          // Check divine shield
          if (checkDivineShield(state, target, lobby)) continue;
          targetPositions.push({ r: pos.r, c: pos.c });
          const before = target.hp;
          const rdmg3 = applyDamageReduction(state, uid, 2, null, lobby); target.hp -= rdmg3;
          combatLogToLobby(lobby, `${target.name}: ${before} HP - ${rdmg3} = ${target.hp} HP`, "combat-result");
          hitCount++;
          if (target.hp <= 0 && shouldUnitDie(lobby, target)) {
            toRemove.push({ id: uid, pos: pos });
          }
        }
      }
      
      // Emit Lunar Barrage animation
      if (targetPositions.length > 0) {
        const animData = {
          type: "effect",
          effectType: "lunar_aoe",
          sourcePos: { r: targetRow, c: targetCol },
          sourceUnitId: null,
          targets: targetPositions
        };
        if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
        if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
      }
      
      for (const item of toRemove) {
        const deadUnit = state.units[item.id];
        if (!deadUnit) continue;
        processOnDeathEffect(lobby, deadUnit, deadUnit.owner, item.pos);
        processAllyDeathTriggers(lobby, deadUnit.owner, deadUnit, item.pos);
        if (state.board[item.pos.r][item.pos.c] === item.id) {
          state.board[item.pos.r][item.pos.c] = null;
        }
        discardUnitCard(lobby, deadUnit);
        delete state.units[item.id];
        combatLogToLobby(lobby, `💀 ${deadUnit.name} DESTROYED`, "combat-death");
      }
      logToLobby(lobby, "Lunar Barrage hits " + hitCount + " enemies for 2 damage!");
    }
  }
  
  // === DRAGON WIZARD SPELLS ===
  
  if (effectId === "polymorph") {
    // Polymorph - transform target enemy with 3 or less HP into a 1/1 Sheep
    if (targetUnitId && state.units[targetUnitId]) {
      const target = state.units[targetUnitId];
      if (target.owner !== role) {
        if (target.untargetable) {
          logToLobby(lobby, target.name + " is untargetable!");
          return false;
        }
        if (target.hp > 3) {
          logToLobby(lobby, target.name + " has too much HP to polymorph! (max 3 HP)");
          return false;
        }
        const oldName = target.name;
        // Transform into sheep - remove all effects
        target.name = "Sheep";
        target.key = "sheep";
        target.atk = 1;
        target.hp = 1;
        target.maxHp = 1;
        target.effectId = null;
        target.effectDesc = null;
        target.effect = null;
        target.art = "/images/Sheep.png";
        logToLobby(lobby, "Polymorph transforms " + oldName + " into a Sheep!");
        return true;
      }
    }
    return false;
  }
  
  if (effectId === "mana_drain") {
    // Mana Drain - deal 2 damage, enemy loses 1 energy
    if (targetUnitId && state.units[targetUnitId]) {
      const target = state.units[targetUnitId];
      if (target.owner !== role) {
        if (target.untargetable) {
          logToLobby(lobby, target.name + " is untargetable!");
          return false;
        }
        // Check divine shield
        if (!checkDivineShield(state, target, lobby)) {
          const mdDmg = applyDamageReduction(state, targetUnitId, 2, null, lobby);
          target.hp -= mdDmg;
        }
        const enemyRole = role === "gold" ? "silver" : "gold";
        const enemyPlayer = lobby.gameState.players[enemyRole];
        if (enemyPlayer.energy > 0) {
          enemyPlayer.energy = Math.max(0, enemyPlayer.energy - 1);
        }
        logToLobby(lobby, "Mana Drain hits " + target.name + " for 2 damage! Enemy loses 1 energy!");
        
        if (target.hp <= 0 && shouldUnitDie(lobby, target)) {
          const pos = getUnitPos(state, targetUnitId);
          processOnDeathEffect(lobby, target, target.owner, pos);
          processAllyDeathTriggers(lobby, target.owner, target, pos);
          if (pos) state.board[pos.r][pos.c] = null;
          discardUnitCard(lobby, target);
          delete state.units[targetUnitId];
        }
        return true;
      }
    }
    return false;
  }
  
  if (effectId === "overcharge") {
    // Overcharge Bolt - deal damage equal to half energy spent
    if (targetUnitId && state.units[targetUnitId]) {
      const target = state.units[targetUnitId];
      if (target.owner !== role) {
        if (target.untargetable) {
          logToLobby(lobby, target.name + " is untargetable!");
          return false;
        }
        // Check divine shield
        if (checkDivineShield(state, target, lobby)) {
          return true; // Shield consumed, spell "hit" but no damage
        }
        // energySpent is passed in from the spell cast - default to 4 (base cost)
        const energySpent = lobby.lastOverchargeEnergy || 4;
        const damage = Math.floor(energySpent / 2);
        target.hp -= damage;
        logToLobby(lobby, "Overcharge Bolt hits " + target.name + " for " + damage + " damage! (" + energySpent + " energy spent)");
        
        if (target.hp <= 0 && shouldUnitDie(lobby, target)) {
          const pos = getUnitPos(state, targetUnitId);
          processOnDeathEffect(lobby, target, target.owner, pos);
          processAllyDeathTriggers(lobby, target.owner, target, pos);
          if (pos) state.board[pos.r][pos.c] = null;
          discardUnitCard(lobby, target);
          delete state.units[targetUnitId];
        }
        return true;
      }
    }
    return false;
  }
  
  if (effectId === "swap_positions") {
    // Arcane Rift - swap positions of two units (needs special handling)
    // For now, swap target with nearest ally
    if (targetUnitId && state.units[targetUnitId]) {
      const target = state.units[targetUnitId];
      const targetPos = getUnitPos(state, targetUnitId);
      if (!targetPos) return false;
      
      // Find another unit to swap with (prefer enemy for strategic swaps)
      let swapTarget = null;
      let swapPos = null;
      
      // Look for any other unit on the board
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const uid = state.board[r][c];
          if (uid && uid !== targetUnitId && state.units[uid]) {
            // Prefer units far from their target position
            if (!swapTarget) {
              swapTarget = uid;
              swapPos = { r, c };
            }
          }
        }
      }
      
      if (swapTarget && swapPos) {
        // Swap positions
        state.board[targetPos.r][targetPos.c] = swapTarget;
        state.board[swapPos.r][swapPos.c] = targetUnitId;
        logToLobby(lobby, "Arcane Rift swaps " + target.name + " with " + state.units[swapTarget].name + "!");
        return true;
      }
    }
    return false;
  }
  
  if (effectId === "dragons_fury") {
    // Dragon's Fury - all friendly Dragons gain +2 ATK
    const dragonKeys = ['wyrmwhelp', 'cinderwing', 'stormdrake', 'volcanicdragon', 'chronodrake'];
    let buffed = 0;
    for (const uid in state.units) {
      const u = state.units[uid];
      if (u.owner === role && dragonKeys.includes(u.key)) {
        u.atk += 2;
        // Track the buff
        if (!u.permBuffs) u.permBuffs = [];
        u.permBuffs.push({ atk: 2, hp: 0, source: "Dragon's Fury" });
        buffed++;
        // Trigger stat gain effects (Red/Blue Wizard)
        triggerStatGainEffects(lobby, 'atk', 2, uid);
      }
    }
    logToLobby(lobby, "Dragon's Fury empowers " + buffed + " Dragons with +2 ATK!");
  }
  
  // === CELESTIAL HOST SPELLS ===
  
  if (effectId === "blessing_might") {
    // Blessing of Might - target ally gains +1 ATK, +1 ATK on every attack
    if (targetUnitId && state.units[targetUnitId]) {
      const target = state.units[targetUnitId];
      if (target.owner === role) {
        target.atk += 1;
        target.mightBlessing = true; // Track for on-attack buff
        // Track the initial buff
        if (!target.permBuffs) target.permBuffs = [];
        target.permBuffs.push({ atk: 1, hp: 0, source: "Blessing of Might" });
        logToLobby(lobby, target.name + " receives Blessing of Might! (+1 ATK, +1 ATK on attack)");
        triggerStatGainEffects(lobby, 'atk', 1, targetUnitId);
      }
    }
  }
  
  if (effectId === "blessing_vigor") {
    // Blessing of Vigor - gain 1 energy when attacking or attacked
    if (targetUnitId && state.units[targetUnitId]) {
      const target = state.units[targetUnitId];
      if (target.owner === role) {
        target.vigorBlessing = true;
        logToLobby(lobby, target.name + " receives Blessing of Vigor! (Gain 1 energy on attack/attacked)");
      }
    }
  }
  
  if (effectId === "blessing_protection") {
    // Blessing of Protection - prevent next damage
    if (targetUnitId && state.units[targetUnitId]) {
      const target = state.units[targetUnitId];
      if (target.owner === role) {
        target.divineShield = true;
        logToLobby(lobby, target.name + " receives Blessing of Protection! (Next damage prevented)");
      }
    }
  }
  
  if (effectId === "blessing_kings") {
    // Blessing of Kings - draw a card when attacking or attacked
    if (targetUnitId && state.units[targetUnitId]) {
      const target = state.units[targetUnitId];
      if (target.owner === role) {
        target.kingsBlessing = true;
        logToLobby(lobby, target.name + " receives Blessing of Kings! (Draw on attack/attacked)");
      }
    }
  }
  
  if (effectId === "angelic_descent") {
    // Angelic Descent - next unit can deploy anywhere, deal 1 to adjacent enemies
    if (!state.angelicDescent) state.angelicDescent = {};
    state.angelicDescent[role] = true;
    logToLobby(lobby, "Angelic Descent! Your next unit can deploy to any row and deals 1 to adjacent enemies!");
  }
  
  if (effectId === "heavenly_rescue") {
    // Heavenly Rescue - move target ally to back row
    if (targetUnitId && state.units[targetUnitId]) {
      const target = state.units[targetUnitId];
      if (target.owner === role) {
        const currentPos = getUnitPos(state, targetUnitId);
        if (currentPos) {
          // Find empty tile in back row
          const backRows = role === "gold" ? [0, 1] : [5, 6];
          let rescued = false;
          for (const row of backRows) {
            for (let c = 0; c < COLS; c++) {
              if (!state.board[row][c]) {
                state.board[currentPos.r][currentPos.c] = null;
                state.board[row][c] = targetUnitId;
                logToLobby(lobby, target.name + " is rescued to safety!");
                rescued = true;
                break;
              }
            }
            if (rescued) break;
          }
          if (!rescued) {
            logToLobby(lobby, "No empty tile in back row for Heavenly Rescue!");
          }
        }
      }
    }
  }
  
  if (effectId === "lay_on_hands") {
    // Lay on Hands - heal target unit to full HP
    if (targetUnitId && state.units[targetUnitId]) {
      const target = state.units[targetUnitId];
      const healed = target.maxHp - target.hp;
      target.hp = target.maxHp;
      logToLobby(lobby, "Lay on Hands heals " + target.name + " to full HP! (+" + healed + " HP)");
    }
  }
  
  if (effectId === "resurrection") {
    // Resurrection - handled separately like time_rift
    // Set pending resurrection state
    const players = lobby.gameState.players;
    const p = players[role];
    const unitsInDiscard = p.discard.filter(c => c.type === "monster" || c.type === "structure");
    
    if (unitsInDiscard.length > 0) {
      // Check if this is AI - auto-select the best unit
      if (lobby.isAIGame && role === "silver") {
        // AI auto-selects the highest cost unit (most valuable)
        const sortedUnits = unitsInDiscard.sort((a, b) => (b.cost || 0) - (a.cost || 0));
        const bestUnit = sortedUnits[0];
        
        // Find a valid spawn position (prefer spawn zone, then any empty tile)
        let spawnRow, spawnCol;
        const silverSpawnRows = [5, 6]; // Silver's home rows
        
        // Try spawn zone first
        for (const r of silverSpawnRows) {
          for (let c = 0; c < 5; c++) {
            if (!state.board[r][c]) {
              spawnRow = r;
              spawnCol = c;
              break;
            }
          }
          if (spawnRow !== undefined) break;
        }
        
        // If spawn zone full, find any empty tile
        if (spawnRow === undefined) {
          for (let r = 0; r < 7; r++) {
            for (let c = 0; c < 5; c++) {
              if (!state.board[r][c]) {
                spawnRow = r;
                spawnCol = c;
                break;
              }
            }
            if (spawnRow !== undefined) break;
          }
        }
        
        if (spawnRow !== undefined && bestUnit) {
          // Remove from discard
          const idx = p.discard.findIndex(c => c.id === bestUnit.id);
          if (idx !== -1) {
            p.discard.splice(idx, 1);
            
            // Resurrect the unit with full stats and immune
            const id = genId();
            const fullHp = bestUnit.maxHp || bestUnit.hp;
            state.units[id] = {
              id,
              owner: role,
              key: bestUnit.key,
              name: bestUnit.name,
              atk: bestUnit.atk,
              hp: fullHp,
              maxHp: fullHp,
              cost: bestUnit.cost,
              type: bestUnit.type,
              effect: bestUnit.effect,
              effectId: bestUnit.effectId,
              effectDesc: bestUnit.effectDesc,
              art: bestUnit.art,
              originalCard: bestUnit,
              immune: true,
              immuneUntilNextTurn: true
            };
            if (bestUnit.stationary) state.units[id].stationary = true;
            state.board[spawnRow][spawnCol] = id;
            state.movedThisTurn.add(id);
            
            logToLobby(lobby, role.toUpperCase() + " resurrects " + bestUnit.name + " with Immune!");
          }
        } else {
          logToLobby(lobby, "No space to resurrect unit!");
        }
      } else {
        // Human player - wait for selection
        if (!state.pendingResurrection) state.pendingResurrection = {};
        state.pendingResurrection[role] = { active: true };
        
        logToLobby(lobby, "Resurrection! Choose a unit from your discard to return!");
        
        const socket = role === "gold" ? lobby.hostSocket : lobby.guestSocket;
        if (socket) {
          socket.emit("resurrectionTrigger", { 
            units: unitsInDiscard.map(c => ({ id: c.id, key: c.key, name: c.name, atk: c.atk, hp: c.maxHp || c.hp, art: c.art }))
          });
        }
      }
    } else {
      logToLobby(lobby, "No units in discard to resurrect!");
    }
  }
  
  if (effectId === "wrath_of_god") {
    // Wrath of God - destroy ALL units
    const toRemove = [];
    for (const uid in state.units) {
      const u = state.units[uid];
      const pos = getUnitPos(state, uid);
      if (pos) {
        toRemove.push({ uid, unit: u, pos });
      }
    }
    
    combatLogToLobby(lobby, `⚡ WRATH OF GOD`, "combat-header");
    
    for (const { uid, unit, pos } of toRemove) {
      processOnDeathEffect(lobby, unit, unit.owner, pos);
      processAllyDeathTriggers(lobby, unit.owner, unit, pos);
      state.board[pos.r][pos.c] = null;
      discardUnitCard(lobby, unit);
      delete state.units[uid];
    }
    
    logToLobby(lobby, "Wrath of God destroys " + toRemove.length + " units!");
    
    // Also clear spawns
    if (state.spawn.gold) {
      const spawnUnit = state.units[state.spawn.gold];
      if (spawnUnit) {
        discardUnitCard(lobby, spawnUnit);
        delete state.units[state.spawn.gold];
      }
      state.spawn.gold = null;
    }
    if (state.spawn.silver) {
      const spawnUnit = state.units[state.spawn.silver];
      if (spawnUnit) {
        discardUnitCard(lobby, spawnUnit);
        delete state.units[state.spawn.silver];
      }
      state.spawn.silver = null;
    }
  }
  
  // ===== 8-BIT BATTALION SPELLS =====
  
  // Boss Key - draw Final Boss from deck, or reduce cost if in hand
  if (effectId === "draw_final_boss") {
    const player = lobby.gameState.players[role];
    
    const bossInHand = player.hand.find(c => c.key === "finalboss");
    if (bossInHand) {
      if (!bossInHand.originalCost) bossInHand.originalCost = bossInHand.cost;
      bossInHand.cost = Math.max(0, bossInHand.cost - 2);
      bossInHand.costReduced = true;
      logToLobby(lobby, "Boss Key reduces Final Boss cost by 2! (Now " + bossInHand.cost + ")");
    } else {
      const deckIndex = player.deck.findIndex(c => c.key === "finalboss");
      if (deckIndex !== -1) {
        const bossCard = player.deck.splice(deckIndex, 1)[0];
        if (player.hand.length < MAX_HAND_SIZE) {
          player.hand.push(bossCard);
          logToLobby(lobby, "Boss Key draws Final Boss from deck!");
        } else {
          logToLobby(lobby, "Boss Key found Final Boss but hand is full!");
          player.deck.push(bossCard);
        }
      } else {
        logToLobby(lobby, "Boss Key: No Final Boss in deck!");
      }
    }
  }
  
  // Cheat Code - target +3/+3 this turn, all others +1/+1 this turn
  if (effectId === "cheat_code_buff") {
    if (targetUnitId && state.units[targetUnitId]) {
      const targetUnit = state.units[targetUnitId];
      if (targetUnit.owner === role) {
        targetUnit.cheatCodeTarget = true;
        targetUnit.tempAtkBonus = (targetUnit.tempAtkBonus || 0) + 3;
        targetUnit.tempHpBonus = (targetUnit.tempHpBonus || 0) + 3;
        targetUnit.atk += 3;
        targetUnit.hp += 3;
        if (!targetUnit.maxHp) targetUnit.maxHp = targetUnit.hp;
        else targetUnit.maxHp += 3;
        
        logToLobby(lobby, targetUnit.name + " gets +3/+3 from Cheat Code!");
        
        let buffed = 0;
        for (const uid in state.units) {
          const u = state.units[uid];
          if (u.owner === role && uid !== targetUnitId) {
            u.tempAtkBonus = (u.tempAtkBonus || 0) + 1;
            u.tempHpBonus = (u.tempHpBonus || 0) + 1;
            u.atk += 1;
            u.hp += 1;
            if (!u.maxHp) u.maxHp = u.hp;
            else u.maxHp += 1;
            buffed++;
          }
        }
        if (buffed > 0) {
          logToLobby(lobby, buffed + " other units get +1/+1!");
        }
        
        if (!state.cheatCodeBuffs) state.cheatCodeBuffs = {};
        state.cheatCodeBuffs[role] = true;
      }
    }
  }
  
  // Save State - mark unit to restore if it dies
  if (effectId === "save_state") {
    if (targetUnitId && state.units[targetUnitId]) {
      const targetUnit = state.units[targetUnitId];
      if (targetUnit.owner === role) {
        targetUnit.saveState = {
          maxHp: targetUnit.maxHp || targetUnit.hp,
          atk: targetUnit.atk
        };
        logToLobby(lobby, targetUnit.name + " is marked with Save State!");
      }
    }
  }
  
  // Reset Button - ALL units on board shuffled back to owner's deck
  // Tokens (Pixel, Slimeling) are removed instead of shuffled back
  if (effectId === "reset_board") {
    const TOKEN_KEYS = ['pixel', 'slimeling']; // Tokens that should be removed, not returned
    let goldReturned = 0;
    let silverReturned = 0;
    let tokensRemoved = 0;
    
    const unitsToReturn = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const uid = state.board[r][c];
        if (uid && state.units[uid]) {
          unitsToReturn.push({ id: uid, r, c, owner: state.units[uid].owner, art: state.units[uid].art, name: state.units[uid].name });
        }
      }
    }
    
    // Emit animation event before removing units
    if (unitsToReturn.length > 0) {
      const animData = {
        type: "effect",
        effectType: "reset_button",
        units: unitsToReturn.map(u => ({ r: u.r, c: u.c, owner: u.owner, art: u.art, name: u.name }))
      };
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
      if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
    }
    
    for (const item of unitsToReturn) {
      const unit = state.units[item.id];
      if (!unit) continue;
      
      const owner = unit.owner;
      const player = lobby.gameState.players[owner];
      
      // Skip tokens - they just get removed, not returned to deck
      if (TOKEN_KEYS.includes(unit.key)) {
        state.board[item.r][item.c] = null;
        delete state.units[item.id];
        tokensRemoved++;
        continue;
      }
      
      // Use originalCard if available to get unbuffed stats, otherwise reconstruct
      const originalCard = unit.originalCard;
      const card = {
        id: genId(),
        key: unit.key,
        name: originalCard ? originalCard.name : unit.name,
        atk: originalCard ? originalCard.atk : unit.atk,
        hp: originalCard ? originalCard.hp : (unit.maxHp || unit.hp),
        maxHp: originalCard ? originalCard.hp : (unit.maxHp || unit.hp),
        cost: originalCard ? originalCard.cost : (unit.cost || 0),
        type: originalCard ? originalCard.type : unit.type,
        effect: originalCard ? originalCard.effect : unit.effect,
        effectId: originalCard ? originalCard.effectId : unit.effectId,
        effectDesc: originalCard ? originalCard.effectDesc : unit.effectDesc,
        art: originalCard ? originalCard.art : unit.art,
        rarity: originalCard ? originalCard.rarity : unit.rarity
      };
      
      // Copy over special properties from original card
      if (originalCard) {
        if (originalCard.range) card.range = originalCard.range;
        if (originalCard.stationary) card.stationary = originalCard.stationary;
      }
      
      player.deck.push(card);
      state.board[item.r][item.c] = null;
      delete state.units[item.id];
      
      if (owner === "gold") goldReturned++;
      else silverReturned++;
    }
    
    const goldPlayer = lobby.gameState.players.gold;
    const silverPlayer = lobby.gameState.players.silver;
    
    for (let i = goldPlayer.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [goldPlayer.deck[i], goldPlayer.deck[j]] = [goldPlayer.deck[j], goldPlayer.deck[i]];
    }
    for (let i = silverPlayer.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [silverPlayer.deck[i], silverPlayer.deck[j]] = [silverPlayer.deck[j], silverPlayer.deck[i]];
    }
    
    logToLobby(lobby, "🔄 RESET BUTTON! " + goldReturned + " gold units and " + silverReturned + " silver units returned to decks!");
    recomputeOwners(state);
  }
  
  // Rage Quit - deal damage equal to units that died this game
  if (effectId === "rage_quit") {
    if (targetUnitId && state.units[targetUnitId]) {
      const target = state.units[targetUnitId];
      if (target.owner !== role) {
        if (target.untargetable) {
          logToLobby(lobby, target.name + " is untargetable!");
          return false;
        }
        
        const player = lobby.gameState.players[role];
        const deathCount = player.discard ? player.discard.filter(c => c.type === "monster").length : 0;
        
        if (deathCount > 0) {
          const before = target.hp;
          target.hp -= deathCount;
          combatLogToLobby(lobby, `😤 RAGE QUIT!`, "combat-header");
          combatLogToLobby(lobby, `${target.name}: ${before} HP - ${deathCount} = ${target.hp} HP`, "combat-result");
          logToLobby(lobby, "Rage Quit deals " + deathCount + " damage to " + target.name + "!");
          
          if (target.hp <= 0 && shouldUnitDie(lobby, target)) {
            const pos = getUnitPos(state, targetUnitId);
            if (pos) {
              processOnDeathEffect(lobby, target, target.owner, pos);
              processAllyDeathTriggers(lobby, target.owner, target, pos);
              state.board[pos.r][pos.c] = null;
              discardUnitCard(lobby, target);
              delete state.units[targetUnitId];
              combatLogToLobby(lobby, `💀 ${target.name} DESTROYED`, "combat-death");
            }
          }
        } else {
          logToLobby(lobby, "Rage Quit: No units have died yet! (0 damage)");
        }
      }
    }
  }
}

// Handle campaign victory rewards
async function handleCampaignVictory(lobby) {
  try {
    const { state } = lobby.gameState;
    
    // Stars = difficulty level beaten (1=easy, 2=medium, 3=hard)
    // If you beat hard, you get all 3 stars
    // If you beat medium, you get 2 stars
    // If you beat easy, you get 1 star
    // Challenge mode = 4 stars
    const stars = lobby.isChallenge ? 4 : (lobby.aiLevel || 2);
    
    const result = await authHelpers.completeBoss(lobby.hostUserId, lobby.bossId, stars, lobby.aiLevel, lobby.isChallenge);
    
    // Award gold + Rift Gems based on difficulty
    const goldAmount = CAMPAIGN_GOLD[lobby.isChallenge ? 4 : (lobby.aiLevel || 1)] || 5;
    const gemAmount = CAMPAIGN_GEMS[lobby.isChallenge ? 4 : (lobby.aiLevel || 1)] || 3;
    let goldResult = null;
    let gemResult = null;
    if (lobby.hostUserId) {
      goldResult = await shopHelpers.addGold(lobby.hostUserId, goldAmount);
      gemResult = await shopHelpers.addGems(lobby.hostUserId, gemAmount);
    }

    // Send rewards to player
    if (lobby.hostSocket) {
      lobby.hostSocket.emit("campaignVictory", {
        bossId: lobby.bossId,
        stars: stars,
        rewards: result.rewards,
        goldEarned: goldAmount,
        newGold: goldResult ? goldResult.gold : 0,
        gemsEarned: gemAmount,
        newGems: gemResult ? gemResult.riftGems : 0,
        user: result.user,
        isChallenge: lobby.isChallenge,
        newAchievements: result.newAchievements || []
      });
    }

    const difficultyNames = { 1: 'Easy', 2: 'Medium', 3: 'Hard', 4: 'Challenge' };
    const diffLabel = lobby.isChallenge ? 'Challenge' : difficultyNames[stars];
    logToLobby(lobby, "🎉 Boss defeated on " + diffLabel + "!" + (lobby.isChallenge ? " ✨ HOLO CARDS!" : " Earned " + stars + " star(s)!") + " 🪙 +" + goldAmount + " gold! 🔮 +" + gemAmount + " Rift Gems!");
    
    // Format card names for log
    const cardNames = result.rewards.cards.map(c => {
      const name = typeof c === 'object' ? c.card : c;
      return lobby.isChallenge ? "✨" + name : name;
    });
    logToLobby(lobby, "Cards won: " + cardNames.join(", "));
    
    if (result.rewards.music) {
      logToLobby(lobby, "🎵 Unlocked: " + result.rewards.music + " music!");
    }
    if (result.rewards.background) {
      logToLobby(lobby, "🖼️ Unlocked: " + result.rewards.background + " background!");
    }
  } catch (err) {
    console.error("Campaign victory error:", err);
  }
}

// ==================== BOSS EVENT SYSTEM ====================

// Process boss event WARNING at END of boss turn (creates warning)
function processBossEventWarning(lobby) {
  
  if (!lobby.isAIGame || !lobby.bossId) return;
  
  const boss = CAMPAIGN_BOSSES.find(b => b.id === lobby.bossId);
  
  if (!boss || !boss.eventType) return;
  
  const { state } = lobby.gameState;
  const config = boss.eventConfig;
  
  
  // Check if it's time for an event (every N boss turns)
  if (state.bossTurnCount % config.turnInterval !== 0) return;
  
  
  // Process based on event type
  if (boss.eventType === 'void_collapse') {
    processVoidCollapseWarning(lobby, boss, config);
  } else if (boss.eventType === 'ghost_train') {
    processGhostTrainWarning(lobby, boss, config);
  } else if (boss.eventType === 'blood_chalice') {
    processBloodChaliceSpawn(lobby, boss, config);
  } else if (boss.eventType === 'gem_rain') {
    processGemRainWarning(lobby, boss, config);
  } else if (boss.eventType === 'eclipse') {
    processEclipseStart(lobby, boss, config);
  } else if (boss.eventType === 'polymorph') {
    processPolymorphStart(lobby, boss, config);
  } else if (boss.eventType === 'divine_judgment') {
    processDivineJudgmentStart(lobby, boss, config);
  } else if (boss.eventType === 'cheat_code') {
    processCheatCodeStart(lobby, boss, config);
  }
  // Add more event types here for other bosses
}

// Process boss event EXECUTION at START of boss turn (executes effect from previous warning)
function processBossEventExecute(lobby) {
  if (!lobby.isAIGame || !lobby.bossId) return;
  
  const boss = CAMPAIGN_BOSSES.find(b => b.id === lobby.bossId);
  if (!boss || !boss.eventType) return;
  
  const { state } = lobby.gameState;
  
  // If there's a warning zone, execute the effect
  if (!state.bossEventWarning) return;
  
  
  if (boss.eventType === 'void_collapse') {
    processVoidCollapseExecution(lobby);
  } else if (boss.eventType === 'ghost_train') {
    processGhostTrainExecution(lobby);
  } else if (boss.eventType === 'gem_rain') {
    processGemRainExecution(lobby);
  }
  // Add more event types here for other bosses
}

// Process boss event COUNTDOWN at START of player turn (shows countdown in event log)
function processBossEventCountdown(lobby) {
  if (!lobby.isAIGame || !lobby.bossId) return;
  
  const boss = CAMPAIGN_BOSSES.find(b => b.id === lobby.bossId);
  if (!boss || !boss.eventType || !boss.eventConfig) return;
  
  const { state } = lobby.gameState;
  const config = boss.eventConfig;
  
  // Don't show countdown if warning tiles are already on the board
  if (state.bossEventWarning) return;
  
  // Calculate turns until next event
  const turnsUntilEvent = config.turnInterval - (state.bossTurnCount % config.turnInterval);
  
  // Only show countdown for 3, 2, 1
  if (turnsUntilEvent <= 3 && turnsUntilEvent >= 1) {
    if (boss.eventType === 'void_collapse') {
      logToLobby(lobby, `⚠️ BLACK HOLE EVENT: ${turnsUntilEvent}`, "void-collapse-warning");
    } else if (boss.eventType === 'ghost_train') {
      logToLobby(lobby, `⚠️ GHOST TRAIN APPROACHING: ${turnsUntilEvent}`, "ghost-train-warning");
    } else if (boss.eventType === 'blood_chalice') {
      logToLobby(lobby, `🍷 BLOOD CHALICE RITUAL: ${turnsUntilEvent}`, "boss-benefit");
    } else if (boss.eventType === 'gem_rain') {
      logToLobby(lobby, `💎 GEM RAIN: ${turnsUntilEvent}`, "gem-rain-warning");
    } else if (boss.eventType === 'eclipse') {
      logToLobby(lobby, `🌑 ECLIPSE APPROACHING: ${turnsUntilEvent}`, "eclipse-warning");
    } else if (boss.eventType === 'polymorph') {
      logToLobby(lobby, `🐑 POLYMORPH WAVE: ${turnsUntilEvent}`, "polymorph-warning");
    } else if (boss.eventType === 'divine_judgment') {
      logToLobby(lobby, `⚖️ DIVINE JUDGMENT: ${turnsUntilEvent}`, "divine-judgment-warning");
    } else if (boss.eventType === 'cheat_code') {
      logToLobby(lobby, `🎮 CHEAT CODE: ${turnsUntilEvent}`, "cheat-code-warning");
    }
  }
}

// Void Collapse - Create warning zone
function processVoidCollapseWarning(lobby, boss, config) {
  const { state } = lobby.gameState;
  
  // Calculate size based on occurrence (starts at startSize, grows by growthRate each time, max at maxSize)
  const size = Math.min(config.startSize + (state.bossEventOccurrence * config.growthRate), config.maxSize);
  
  // Find valid positions for the box (must fit entirely on board)
  const maxRow = ROWS - size;
  const maxCol = COLS - size;
  
  // Random top-left corner
  const startRow = Math.floor(Math.random() * (maxRow + 1));
  const startCol = Math.floor(Math.random() * (maxCol + 1));
  
  // Create list of affected tiles
  const tiles = [];
  for (let r = startRow; r < startRow + size; r++) {
    for (let c = startCol; c < startCol + size; c++) {
      tiles.push({ r, c });
    }
  }
  
  // Store warning in state
  state.bossEventWarning = {
    type: 'void_collapse',
    tiles: tiles,
    size: size,
    startRow: startRow,
    startCol: startCol
  };
  
  // Increment occurrence counter
  state.bossEventOccurrence++;
  
  // Log warning - tiles are now visible
  logToLobby(lobby, `⚠️ VOID COLLAPSE WARNING! A ${size}x${size} black hole is forming!`, "void-collapse-warning");
  combatLogToLobby(lobby, `🌀 VOID COLLAPSE ZONE ACTIVE - MOVE YOUR UNITS!`, "boss-warning");
  
  // Emit event to client for visual effects
  if (lobby.hostSocket) {
    lobby.hostSocket.emit("bossEventWarning", {
      type: 'void_collapse',
      tiles: tiles,
      size: size
    });
  }
}

// Void Collapse - Execute destruction
function processVoidCollapseExecution(lobby) {
  processVoidCollapseExecuteEvent(lobby);
  processVoidCollapseRemoveUnits(lobby);
}

// Send the void collapse event to client (units still visible on board)
function processVoidCollapseExecuteEvent(lobby) {
  const { state } = lobby.gameState;
  const warning = state.bossEventWarning;
  
  if (!warning || warning.type !== 'void_collapse') return;
  
  // Collect units that will be destroyed (but don't remove yet)
  const destroyedUnits = [];
  
  for (const tile of warning.tiles) {
    const unitId = state.board[tile.r][tile.c];
    if (unitId && state.units[unitId]) {
      const unit = state.units[unitId];
      destroyedUnits.push({
        id: unitId,
        name: unit.name,
        owner: unit.owner,
        art: unit.art,
        r: tile.r,
        c: tile.c
      });
    }
  }
  
  // Store destroyed units for later removal
  state.pendingVoidDestroyedUnits = destroyedUnits;
  
  // Emit execution event with unit info for dramatic effect
  if (lobby.hostSocket) {
    lobby.hostSocket.emit("bossEventExecute", {
      type: 'void_collapse',
      tiles: warning.tiles,
      destroyed: destroyedUnits.length,
      destroyedUnits: destroyedUnits
    });
  }
  
  // Log results
  if (destroyedUnits.length > 0) {
    const destroyedNames = destroyedUnits.map(u => `${u.name} (${u.owner})`);
    logToLobby(lobby, `💀 VOID COLLAPSE! ${destroyedUnits.length} unit(s) consumed: ${destroyedNames.join(', ')}`);
  } else {
    logToLobby(lobby, `🌀 Void Collapse fizzles - no units caught!`);
  }
}

// Remove units from state after animation completes
function processVoidCollapseRemoveUnits(lobby) {
  const { state } = lobby.gameState;
  
  const destroyedUnits = state.pendingVoidDestroyedUnits || [];
  
  // Remove units from state
  for (const unitInfo of destroyedUnits) {
    const unit = state.units[unitInfo.id];
    if (unit) {
      discardUnitCard(lobby, unit);
      delete state.units[unitInfo.id];
      state.board[unitInfo.r][unitInfo.c] = null;
    }
  }
  
  // Clear pending and warning
  state.pendingVoidDestroyedUnits = null;
  state.bossEventWarning = null;
  
  // Recompute row ownership
  recomputeOwners(state);
  
  if (destroyedUnits.length > 0) {
    combatLogToLobby(lobby, `VOID COLLAPSE DETONATED! ${destroyedUnits.length} unit(s) obliterated!`, "boss-execute");
  } else {
    combatLogToLobby(lobby, `VOID COLLAPSE - All units escaped!`, "boss-execute");
  }
}

// ==================== GHOST TRAIN EVENT ====================

// Ghost Train - Create warning zone (marks rows/columns)
function processGhostTrainWarning(lobby, boss, config) {
  const { state } = lobby.gameState;
  
  // Calculate number of lines based on occurrence
  const lineCount = Math.min(config.startLines + (state.bossEventOccurrence * config.growthRate), config.maxLines);
  
  // Select random lines (mix of rows and columns)
  const lines = [];
  const usedRows = new Set();
  const usedCols = new Set();
  
  for (let i = 0; i < lineCount; i++) {
    // Randomly choose row or column
    const isRow = Math.random() < 0.5;
    
    if (isRow) {
      // Pick a random row not already used
      let row;
      let attempts = 0;
      do {
        row = Math.floor(Math.random() * ROWS);
        attempts++;
      } while (usedRows.has(row) && attempts < 20);
      
      if (!usedRows.has(row)) {
        usedRows.add(row);
        lines.push({ type: 'row', index: row });
      }
    } else {
      // Pick a random column not already used
      let col;
      let attempts = 0;
      do {
        col = Math.floor(Math.random() * COLS);
        attempts++;
      } while (usedCols.has(col) && attempts < 20);
      
      if (!usedCols.has(col)) {
        usedCols.add(col);
        lines.push({ type: 'col', index: col });
      }
    }
  }
  
  // Build list of affected tiles
  const tiles = [];
  for (const line of lines) {
    if (line.type === 'row') {
      for (let c = 0; c < COLS; c++) {
        tiles.push({ r: line.index, c: c, lineType: 'row', lineIndex: line.index });
      }
    } else {
      for (let r = 0; r < ROWS; r++) {
        tiles.push({ r: r, c: line.index, lineType: 'col', lineIndex: line.index });
      }
    }
  }
  
  
  // Store warning in state
  state.bossEventWarning = {
    type: 'ghost_train',
    lines: lines,
    tiles: tiles,
    lineCount: lineCount
  };
  
  // Increment occurrence counter
  state.bossEventOccurrence++;
  
  // Build warning message
  const lineDescriptions = lines.map(l => l.type === 'row' ? `Row ${l.index + 1}` : `Column ${l.index + 1}`);
  logToLobby(lobby, `🚂 GHOST TRAIN WARNING! Tracks appearing on: ${lineDescriptions.join(', ')}!`, "ghost-train-warning");
  combatLogToLobby(lobby, `🚂 GHOST TRAIN INCOMING - CLEAR THE TRACKS!`, "boss-warning");
  
  // Emit event to client for visual effects
  if (lobby.hostSocket) {
    lobby.hostSocket.emit("bossEventWarning", {
      type: 'ghost_train',
      lines: lines,
      tiles: tiles,
      lineCount: lineCount
    });
  }
}

// Ghost Train - Execute destruction
function processGhostTrainExecution(lobby) {
  const { state } = lobby.gameState;
  const warning = state.bossEventWarning;
  
  if (!warning || warning.type !== 'ghost_train') return;
  
  let destroyedCount = 0;
  const destroyedNames = [];
  const destroyedUnits = []; // Track destroyed unit info for animation
  
  // Ghost Train destroys ALL units in its path - both player AND boss units!
  for (const tile of warning.tiles) {
    const unitId = state.board[tile.r][tile.c];
    if (unitId && state.units[unitId]) {
      const unit = state.units[unitId];
      destroyedNames.push(`${unit.name} (${unit.owner})`);
      destroyedUnits.push({ r: tile.r, c: tile.c, name: unit.name, owner: unit.owner });
      // Send card to discard pile
      discardUnitCard(lobby, unit);
      delete state.units[unitId];
      state.board[tile.r][tile.c] = null;
      destroyedCount++;
    }
  }
  
  // Emit execution event for visual effects
  if (lobby.hostSocket) {
    lobby.hostSocket.emit("bossEventExecute", {
      type: 'ghost_train',
      lines: warning.lines,
      tiles: warning.tiles,
      destroyed: destroyedCount,
      destroyedUnits: destroyedUnits
    });
  }
  
  // Log results
  if (destroyedCount > 0) {
    logToLobby(lobby, `💀 GHOST TRAIN! ${destroyedCount} unit(s) run down: ${destroyedNames.join(', ')}`, "ghost-train-execute");
    combatLogToLobby(lobby, `🚂 GHOST TRAIN STRIKES! ${destroyedCount} unit(s) destroyed!`, "boss-execute");
  } else {
    logToLobby(lobby, `🚂 Ghost Train passes through - no casualties!`, "ghost-train-warning");
    combatLogToLobby(lobby, `🚂 GHOST TRAIN - All units escaped!`, "boss-execute");
  }
  
  // Clear warning
  state.bossEventWarning = null;
  
  // Recompute row ownership
  recomputeOwners(state);
}

// ==================== END BOSS EVENT SYSTEM ====================

// ==================== BLOOD CHALICE EVENT ====================

// Blood Chalice - Spawn chalices on random open tiles
function processBloodChaliceSpawn(lobby, boss, config) {
  const { state } = lobby.gameState;
  
  // Calculate count based on occurrence
  const count = Math.min(config.startCount + (state.bossEventOccurrence * config.growthRate), config.maxCount);
  
  // Find all open tiles (not occupied by units, not spawn tiles, not already a chalice)
  const openTiles = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!state.board[r][c]) {
        openTiles.push({ r, c });
      }
    }
  }
  
  // Initialize chalice tiles if not exists
  if (!state.chaliceTiles) {
    state.chaliceTiles = [];
  }
  
  // Remove existing chalices from open tiles list
  const existingChalices = new Set(state.chaliceTiles.map(t => `${t.r}-${t.c}`));
  const availableTiles = openTiles.filter(t => !existingChalices.has(`${t.r}-${t.c}`));
  
  // Select random tiles ensuring none are adjacent to each other
  const selectedTiles = [];
  const shuffled = availableTiles.sort(() => Math.random() - 0.5);
  
  for (const tile of shuffled) {
    if (selectedTiles.length >= count) break;
    
    // Check if adjacent to any already selected tile
    const isAdjacent = selectedTiles.some(selected => {
      const dr = Math.abs(selected.r - tile.r);
      const dc = Math.abs(selected.c - tile.c);
      return dr <= 1 && dc <= 1; // Adjacent includes diagonals
    });
    
    // Also check against existing chalices
    const isAdjacentToExisting = state.chaliceTiles.some(existing => {
      const dr = Math.abs(existing.r - tile.r);
      const dc = Math.abs(existing.c - tile.c);
      return dr <= 1 && dc <= 1;
    });
    
    if (!isAdjacent && !isAdjacentToExisting) {
      selectedTiles.push(tile);
    }
  }
  
  
  // Add new chalices to state
  state.chaliceTiles = [...state.chaliceTiles, ...selectedTiles];
  
  // Increment occurrence counter
  state.bossEventOccurrence++;
  
  // Log the event
  logToLobby(lobby, `🍷 BLOOD CHALICE RITUAL! ${selectedTiles.length} chalices have appeared!`, "boss-benefit");
  combatLogToLobby(lobby, `🍷 ${selectedTiles.length} Blood Chalices have appeared...`, "boss-benefit");
  
  // Emit event to client for visual effects
  if (lobby.hostSocket) {
    lobby.hostSocket.emit("bloodChaliceSpawn", {
      tiles: selectedTiles,
      allChalices: state.chaliceTiles
    });
  }
  if (lobby.guestSocket) {
    lobby.guestSocket.emit("bloodChaliceSpawn", {
      tiles: selectedTiles,
      allChalices: state.chaliceTiles
    });
  }
}

// Check if a unit consumes a chalice at the given position
function checkChaliceConsumption(lobby, unitId, row, col) {
  const { state } = lobby.gameState;
  if (!state.chaliceTiles || state.chaliceTiles.length === 0) return false;
  
  // Check if there's a chalice at this position
  const chaliceIndex = state.chaliceTiles.findIndex(t => t.r === row && t.c === col);
  if (chaliceIndex === -1) return false;
  
  const unit = state.units[unitId];
  if (!unit) return false;
  
  // Remove the chalice
  state.chaliceTiles.splice(chaliceIndex, 1);
  
  // Heal unit to full and increase max HP by 1
  const oldMaxHp = unit.maxHp || unit.hp;
  unit.maxHp = oldMaxHp + 1;
  unit.hp = unit.maxHp; // Heal to new max
  
  // Track chalice buff for display (increment if already has one)
  unit.chaliceBuff = (unit.chaliceBuff || 0) + 1;
  
  // Log the consumption
  logToLobby(lobby, `🍷 ${unit.name} consumed a Blood Chalice! +1 Max HP, fully healed!`);
  combatLogToLobby(lobby, `🍷 ${unit.name} (${unit.owner}) drank the chalice: ${oldMaxHp} → ${unit.maxHp} Max HP`, "heal");
  
  // Emit consumption event
  if (lobby.hostSocket) {
    lobby.hostSocket.emit("bloodChaliceConsumed", {
      unitId: unitId,
      unitName: unit.name,
      row: row,
      col: col,
      newMaxHp: unit.maxHp,
      remainingChalices: state.chaliceTiles
    });
  }
  if (lobby.guestSocket) {
    lobby.guestSocket.emit("bloodChaliceConsumed", {
      unitId: unitId,
      unitName: unit.name,
      row: row,
      col: col,
      newMaxHp: unit.maxHp,
      remainingChalices: state.chaliceTiles
    });
  }
  
  return true;
}

// ==================== END BLOOD CHALICE EVENT ====================

// ==================== GEM RAIN EVENT (Garnet Queen) ====================

const GEM_TYPES = ['ruby', 'emerald', 'topaz', 'obsidian', 'diamond'];

// Gem Rain - Create warning tiles that will receive gems next turn
function processGemRainWarning(lobby, boss, config) {
  const { state } = lobby.gameState;
  
  // Calculate count based on occurrence (starts at startCount, grows by growthRate each time, max at maxCount)
  const count = Math.min(config.startCount + (state.bossEventOccurrence * config.growthRate), config.maxCount);
  
  // Find all tiles (can target any tile, including empty ones)
  const allTiles = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      allTiles.push({ r, c });
    }
  }
  
  // Shuffle and select random tiles (don't assign gem types yet - that happens on execution)
  const shuffled = allTiles.sort(() => Math.random() - 0.5);
  const selectedTiles = shuffled.slice(0, count).map(tile => ({ r: tile.r, c: tile.c }));
  
  
  // Store warning in state (gem types will be assigned on execution)
  state.bossEventWarning = {
    type: 'gem_rain',
    tiles: selectedTiles
  };
  
  // Increment occurrence counter
  state.bossEventOccurrence++;
  
  // Log the warning with special gem-rain-warning type
  logToLobby(lobby, `💎 GEM RAIN INCOMING! ${count} gems are falling...`, "gem-rain-warning");
  combatLogToLobby(lobby, `💎 The Garnet Queen summons gems from the sky!`, "boss-event");
  
  // Emit warning to clients for visual effects
  if (lobby.hostSocket) {
    lobby.hostSocket.emit("gemRainWarning", { tiles: selectedTiles });
  }
  if (lobby.guestSocket) {
    lobby.guestSocket.emit("gemRainWarning", { tiles: selectedTiles });
  }
}

// Gem Rain - Execute the gem effects on units
function processGemRainExecution(lobby) {
  const { state } = lobby.gameState;
  const warning = state.bossEventWarning;
  
  if (!warning || warning.type !== 'gem_rain') return;
  
  
  const results = [];
  
  // Now assign random gem types and apply effects
  for (const tile of warning.tiles) {
    const gemType = GEM_TYPES[Math.floor(Math.random() * GEM_TYPES.length)];
    const unitId = state.board[tile.r][tile.c];
    
    // If no unit on this tile, gem does nothing
    if (!unitId || !state.units[unitId]) {
      results.push({
        r: tile.r,
        c: tile.c,
        gemType: gemType,
        effect: 'miss',
        unitName: null
      });
      continue;
    }
    
    const unit = state.units[unitId];
    let effectDesc = '';
    
    switch (gemType) {
      case 'ruby':
        // +1 ATK (permanent, stacks)
        unit.atk = (unit.atk || 0) + 1;
        if (!unit.gemBuffs) unit.gemBuffs = {};
        unit.gemBuffs.atk = (unit.gemBuffs.atk || 0) + 1;
        effectDesc = '+1 ATK';
        logToLobby(lobby, `💎 Ruby gem hits ${unit.name}! ${effectDesc}`);
        break;
        
      case 'emerald':
        // +1 HP (permanent, stacks)
        unit.hp = (unit.hp || 1) + 1;
        unit.maxHp = (unit.maxHp || unit.hp) + 1;
        if (!unit.gemBuffs) unit.gemBuffs = {};
        unit.gemBuffs.hp = (unit.gemBuffs.hp || 0) + 1;
        effectDesc = '+1 HP';
        logToLobby(lobby, `💎 Emerald gem hits ${unit.name}! ${effectDesc}`);
        break;
        
      case 'topaz':
        // +1 Extra attack per turn (permanent, stacks)
        if (!unit.gemBuffs) unit.gemBuffs = {};
        unit.gemBuffs.extraAttacks = (unit.gemBuffs.extraAttacks || 0) + 1;
        console.log(`[GEM] TOPAZ: Set ${unit.name} (${unitId}) extraAttacks = ${unit.gemBuffs.extraAttacks}`);
        effectDesc = '+1 extra attack';
        logToLobby(lobby, `💎 Topaz gem hits ${unit.name}! ${effectDesc}`);
        break;
        
      case 'obsidian':
        // Frozen for 2 turns (can't move or attack)
        unit.frozen = 2;
        console.log(`[GEM] OBSIDIAN: Set ${unit.name} (${unitId}) frozen = ${unit.frozen}`);
        effectDesc = 'FROZEN for 2 turns';
        logToLobby(lobby, `💎 Obsidian gem hits ${unit.name}! ${effectDesc}`);
        break;
        
      case 'diamond':
        // Unlimited moves for the unit's owner's next turn
        if (!unit.gemBuffs) unit.gemBuffs = {};
        unit.gemBuffs.unlimitedMoves = true;
        unit.gemBuffs.unlimitedMovesOwner = unit.owner; // Track whose turn it should last
        console.log(`[GEM] DIAMOND: Set ${unit.name} (${unitId}) unlimitedMoves = true, owner = ${unit.owner}, current activeSide = ${state.activeSide}`);
        effectDesc = 'unlimited moves next turn';
        logToLobby(lobby, `💎 Diamond gem hits ${unit.name}! ${effectDesc}`);
        break;
    }
    
    results.push({
      r: tile.r,
      c: tile.c,
      gemType: gemType,
      effect: effectDesc,
      unitId: unitId,
      unitName: unit.name
    });
    
    combatLogToLobby(lobby, `💎 ${gemType.toUpperCase()} → ${unit.name}: ${effectDesc}`, 
      gemType === 'obsidian' ? 'damage' : 'buff');
  }
  
  // Clear the warning
  state.bossEventWarning = null;
  
  // Emit execution results to clients
  if (lobby.hostSocket) {
    lobby.hostSocket.emit("gemRainExecute", { results });
  }
  if (lobby.guestSocket) {
    lobby.guestSocket.emit("gemRainExecute", { results });
  }
}

// Clear diamond buff (unlimited moves) at end of turn for units owned by the given role
function clearDiamondBuffs(state, role) {
  console.log(`[DIAMOND] clearDiamondBuffs called for role=${role}, activeSide=${state.activeSide}`);
  for (const unitId in state.units) {
    const unit = state.units[unitId];
    if (unit.gemBuffs && unit.gemBuffs.unlimitedMoves) {
      console.log(`[DIAMOND] Found unit ${unit.name} with unlimitedMoves, owner=${unit.owner}, clearing for role=${role}`);
      if (unit.owner === role) {
        console.log(`[DIAMOND] CLEARING unlimitedMoves from ${unit.name}`);
        delete unit.gemBuffs.unlimitedMoves;
        delete unit.gemBuffs.unlimitedMovesOwner;
      } else {
        console.log(`[DIAMOND] NOT clearing - owner ${unit.owner} != role ${role}`);
      }
    }
  }
}

// ==================== END GEM RAIN EVENT ====================

// ==================== ECLIPSE EVENT (Moon Shadow Sentinel) ====================

// Eclipse effect types
const ECLIPSE_EFFECTS = [
  { type: 'atk', value: 1, label: '+1 ATK', description: 'All units gain +1 ATK!' },
  { type: 'atk', value: -1, label: '-1 ATK', description: 'All units lose 1 ATK!' },
  { type: 'hp', value: 3, label: '+3 HP', description: 'All units gain +3 HP!' },
  { type: 'atk', value: -4, label: '-4 ATK', description: 'All units lose 4 ATK!' },
  { type: 'moves', value: 2, label: '+2 Moves', description: 'All units gain +2 moves!' }
];

function processEclipseStart(lobby, boss, config) {
  const { state } = lobby.gameState;
  
  // Pick a random eclipse effect
  const effect = ECLIPSE_EFFECTS[Math.floor(Math.random() * ECLIPSE_EFFECTS.length)];
  
  // Set eclipse active state
  state.eclipseActive = true;
  state.eclipseEffect = effect;
  state.eclipseTurnsLeft = 2; // Lasts for player turn + boss turn
  
  // Apply the effect immediately to all units
  applyEclipseEffect(state, effect);
  
  combatLogToLobby(lobby, `🌑 Moon Shadow Sentinel - ECLIPSE`, "boss-event");
  combatLogToLobby(lobby, effect.description, "combat-result");
  logToLobby(lobby, `🌑 ECLIPSE! Darkness falls - ${effect.description}`);
  
  // Emit eclipse event to clients
  if (lobby.hostSocket) {
    lobby.hostSocket.emit("eclipseStart", { effect: effect, turnsLeft: 2 });
  }
  if (lobby.guestSocket) {
    lobby.guestSocket.emit("eclipseStart", { effect: effect, turnsLeft: 2 });
  }
}

function applyEclipseEffectToUnit(unit, effect) {
  if (effect.type === 'atk') {
    // Store original ATK if not already stored (first eclipse application)
    if (unit.originalAtk === undefined) {
      unit.originalAtk = unit.atk;
    }
    unit.atk = Math.max(0, unit.atk + effect.value);
  } else if (effect.type === 'hp') {
    // Store original HP values if not already stored
    if (unit.originalHp === undefined) {
      unit.originalHp = unit.hp;
      unit.originalMaxHp = unit.maxHp;
    }
    unit.hp += effect.value;
    unit.maxHp += effect.value;
  } else if (effect.type === 'moves') {
    if (unit.eclipseMoveBonus === undefined) unit.eclipseMoveBonus = 0;
    unit.eclipseMoveBonus += effect.value;
  }
}

function applyEclipseEffect(state, effect) {
  for (const unitId in state.units) {
    applyEclipseEffectToUnit(state.units[unitId], effect);
  }
}

function removeEclipseEffect(state) {
  for (const unitId in state.units) {
    const unit = state.units[unitId];
    
    // Restore original ATK
    if (unit.originalAtk !== undefined) {
      unit.atk = unit.originalAtk;
      delete unit.originalAtk;
    }
    
    // Restore original HP (but don't exceed current damage taken)
    if (unit.originalMaxHp !== undefined) {
      const damageTaken = unit.maxHp - unit.hp; // How much damage they've taken
      unit.maxHp = unit.originalMaxHp;
      unit.hp = Math.max(1, unit.originalMaxHp - damageTaken); // Restore but keep damage
      delete unit.originalHp;
      delete unit.originalMaxHp;
    }
    
    // Remove move bonus
    if (unit.eclipseMoveBonus !== undefined) {
      delete unit.eclipseMoveBonus;
    }
  }
}

function processEclipseEnd(lobby) {
  const { state } = lobby.gameState;
  
  if (!state.eclipseActive) return;
  
  state.eclipseTurnsLeft--;
  
  if (state.eclipseTurnsLeft <= 0) {
    // Remove the eclipse effect from all units
    removeEclipseEffect(state);
    
    state.eclipseActive = false;
    state.eclipseEffect = null;
    
    logToLobby(lobby, `☀️ The eclipse ends - light returns!`, "eclipse-warning");
    
    // Emit eclipse end to clients
    if (lobby.hostSocket) {
      lobby.hostSocket.emit("eclipseEnd", {});
    }
    if (lobby.guestSocket) {
      lobby.guestSocket.emit("eclipseEnd", {});
    }
  }
}

// ==================== END ECLIPSE EVENT ====================

// ==================== POLYMORPH EVENT (The Arcane Dragonlord) ====================

// Helper to polymorph a single unit
function polymorphUnit(state, unitId) {
  const unit = state.units[unitId];
  if (!unit) return;
  
  // Skip real structures (not gem shards) - they can't be polymorphed
  if (unit.type === 'structure' && unit.key !== 'gemshard') return;
  
  // Skip if already polymorphed
  if (unit.isPolymorphed) return;
  
  // Initialize polymorphedUnits if needed
  if (!state.polymorphedUnits) state.polymorphedUnits = {};
  
  // Store original data
  state.polymorphedUnits[unitId] = {
    key: unit.key,
    name: unit.name,
    atk: unit.atk,
    hp: unit.hp,
    maxHp: unit.maxHp,
    art: unit.art,
    effect: unit.effect,
    effectId: unit.effectId,
    effectDesc: unit.effectDesc,
    type: unit.type,
    stationary: unit.stationary || false
  };
  
  // Transform to sheep (1/1, no effects, can move)
  unit.key = 'sheep';
  unit.name = 'Sheep';
  unit.atk = 1;
  unit.hp = 1;
  unit.maxHp = 1;
  unit.art = '/images/Sheep.png';
  unit.effect = null;
  unit.effectId = null;
  unit.effectDesc = null;
  unit.type = 'monster'; // Sheep are monsters, not structures
  unit.stationary = false; // Sheep can move
  unit.isPolymorphed = true;
}

// Helper to polymorph a unit into a dragon (4/4)
function polymorphToDragon(state, unitId) {
  const unit = state.units[unitId];
  if (!unit) return;
  
  // Skip real structures (not gem shards)
  if (unit.type === 'structure' && unit.key !== 'gemshard') return;
  
  // Skip if already polymorphed
  if (unit.isPolymorphed) return;
  
  // Initialize polymorphedUnits if needed
  if (!state.polymorphedUnits) state.polymorphedUnits = {};
  
  // Store original data
  state.polymorphedUnits[unitId] = {
    key: unit.key,
    name: unit.name,
    atk: unit.atk,
    hp: unit.hp,
    maxHp: unit.maxHp,
    art: unit.art,
    effect: unit.effect,
    effectId: unit.effectId,
    effectDesc: unit.effectDesc,
    type: unit.type,
    stationary: unit.stationary || false
  };
  
  // Transform to dragon (4/4, no effects, can move)
  unit.key = 'polymorph-dragon';
  unit.name = 'Polymorphed Dragon';
  unit.atk = 4;
  unit.hp = 4;
  unit.maxHp = 4;
  unit.art = '/images/polymorph-dragon.png';
  unit.effect = null;
  unit.effectId = null;
  unit.effectDesc = null;
  unit.type = 'monster';
  unit.stationary = false;
  unit.isPolymorphed = true;
}

function processPolymorphStart(lobby, boss, config) {
  const { state } = lobby.gameState;
  
  // Set polymorph active state
  state.polymorphActive = true;
  state.polymorphTurnsLeft = config.duration || 2;
  
  // Store original unit data and transform all units to sheep
  state.polymorphedUnits = {};
  
  // Collect units by owner
  const goldUnits = [];
  const silverUnits = [];
  
  for (const unitId in state.units) {
    const unit = state.units[unitId];
    // Skip real structures (not gem shards)
    if (unit.type === 'structure' && unit.key !== 'gemshard') continue;
    
    if (unit.owner === 'gold') {
      goldUnits.push(unitId);
    } else if (unit.owner === 'silver') {
      silverUnits.push(unitId);
    }
  }
  
  // Pick one random unit from each side to become a dragon
  const goldDragonId = goldUnits.length > 0 ? goldUnits[Math.floor(Math.random() * goldUnits.length)] : null;
  const silverDragonId = silverUnits.length > 0 ? silverUnits[Math.floor(Math.random() * silverUnits.length)] : null;
  
  // Transform all units - dragons for the lucky ones, sheep for the rest
  for (const unitId in state.units) {
    if (unitId === goldDragonId || unitId === silverDragonId) {
      polymorphToDragon(state, unitId);
    } else {
      polymorphUnit(state, unitId);
    }
  }
  
  combatLogToLobby(lobby, `🐑🐲 The Arcane Dragonlord - POLYMORPH WAVE`, "boss-event");
  combatLogToLobby(lobby, `Units transformed! One dragon per side, the rest are Sheep!`, "combat-result");
  logToLobby(lobby, `🐲 POLYMORPH WAVE! Each side gets one 4/4 Dragon, the rest become 1/1 Sheep for ${config.duration} turns!`, "polymorph-warning");
  
  // Emit polymorph event to clients
  if (lobby.hostSocket) {
    lobby.hostSocket.emit("polymorphStart", { turnsLeft: state.polymorphTurnsLeft });
  }
  if (lobby.guestSocket) {
    lobby.guestSocket.emit("polymorphStart", { turnsLeft: state.polymorphTurnsLeft });
  }
}

function processPolymorphEnd(lobby) {
  const { state } = lobby.gameState;
  
  if (!state.polymorphActive) return;
  
  state.polymorphTurnsLeft--;
  
  if (state.polymorphTurnsLeft <= 0) {
    // Restore all polymorphed units
    if (state.polymorphedUnits) {
      for (const unitId in state.polymorphedUnits) {
        const unit = state.units[unitId];
        if (!unit) continue; // Unit may have died while polymorphed
        
        const original = state.polymorphedUnits[unitId];
        
        // Restore original stats
        unit.key = original.key;
        unit.name = original.name;
        unit.atk = original.atk;
        unit.maxHp = original.maxHp;
        // Keep HP at 1 if they survived as sheep, otherwise restore proportionally
        unit.hp = Math.min(original.hp, original.maxHp);
        unit.art = original.art;
        unit.effect = original.effect;
        unit.effectId = original.effectId;
        unit.effectDesc = original.effectDesc;
        unit.type = original.type;
        unit.stationary = original.stationary || false;
        delete unit.isPolymorphed;
      }
    }
    
    state.polymorphActive = false;
    delete state.polymorphedUnits;
    
    logToLobby(lobby, `✨ The polymorph wears off - units return to normal!`, "polymorph-warning");
    
    // Emit polymorph end to clients
    if (lobby.hostSocket) {
      lobby.hostSocket.emit("polymorphEnd", {});
    }
    if (lobby.guestSocket) {
      lobby.guestSocket.emit("polymorphEnd", {});
    }
  }
}

// ==================== END POLYMORPH EVENT ====================

// ==================== DIVINE JUDGMENT EVENT (The Seraph of Judgment) ====================

function processDivineJudgmentStart(lobby, boss, config) {
  const { state } = lobby.gameState;
  
  // Set divine judgment active state
  state.divineJudgmentActive = true;
  state.divineJudgmentTurnsLeft = config.duration || 2;
  
  const atkThreshold = config.atkThreshold || 4;
  const wrathDamage = config.wrathDamage || 2;
  
  // Track affected units
  const wrathfulUnits = [];
  const pridefulUnits = [];
  const violentUnits = [];
  
  // Judge all player units (gold side only, since boss is silver)
  for (const unitId in state.units) {
    const unit = state.units[unitId];
    if (unit.owner !== 'gold') continue; // Only judge player units
    if (unit.type === 'structure') continue; // Skip structures
    
    // Check for Wrath (high ATK) - takes damage immediately
    if (unit.atk >= atkThreshold) {
      wrathfulUnits.push({ id: unitId, name: unit.name });
      // Check divine shield before applying damage
      if (!checkDivineShield(state, unit, lobby)) {
        unit.hp -= wrathDamage;
      }
      unit.judgedWrath = true; // Mark for visual effect
    }
    
    // Check for Pride (has buffs/enchantments) - buffs suppressed for duration
    if (unit.atkBuffed || unit.hpBuffed || unit.blessingMight || unit.blessingVigor || 
        unit.blessingProtection || unit.blessingKings || unit.deathWard) {
      pridefulUnits.push({ id: unitId, name: unit.name });
      // Store original buff state
      unit.prideOriginal = {
        atkBuffed: unit.atkBuffed || 0,
        hpBuffed: unit.hpBuffed || 0,
        blessingMight: unit.blessingMight,
        blessingVigor: unit.blessingVigor,
        blessingProtection: unit.blessingProtection,
        blessingKings: unit.blessingKings,
        deathWard: unit.deathWard
      };
      // Suppress buffs
      unit.judgedPride = true;
      unit.atkBuffed = 0;
      unit.hpBuffed = 0;
      delete unit.blessingMight;
      delete unit.blessingVigor;
      delete unit.blessingProtection;
      delete unit.blessingKings;
      delete unit.deathWard;
    }
    
    // Check for Violence (has killed this game) - stunned for duration
    if (unit.killCount && unit.killCount > 0) {
      violentUnits.push({ id: unitId, name: unit.name, kills: unit.killCount });
      unit.judgedViolence = true;
      unit.stunned = true; // Cannot move or attack
    }
  }
  
  // Process deaths from Wrath damage
  const deadUnits = [];
  for (const item of wrathfulUnits) {
    const unit = state.units[item.id];
    if (unit && unit.hp <= 0) {
      deadUnits.push(item.id);
    }
  }
  
  for (const unitId of deadUnits) {
    const unit = state.units[unitId];
    if (!unit) continue;
    const pos = getUnitPos(state, unitId);
    if (pos) {
      processOnDeathEffect(lobby, unit, unit.owner, pos);
      state.board[pos.r][pos.c] = null;
    }
    discardUnitCard(lobby, unit);
    delete state.units[unitId];
    logToLobby(lobby, `${unit.name} was destroyed by Divine Wrath!`);
  }
  
  // Log the judgment
  combatLogToLobby(lobby, `⚖️✨ The Seraph of Judgment - DIVINE JUDGMENT`, "boss-event");
  
  if (wrathfulUnits.length > 0) {
    const names = wrathfulUnits.map(u => u.name).join(', ');
    logToLobby(lobby, `🔥 WRATH: ${names} judged for high power! (${wrathDamage} damage)`);
  }
  if (pridefulUnits.length > 0) {
    const names = pridefulUnits.map(u => u.name).join(', ');
    logToLobby(lobby, `💚 PRIDE: ${names} judged! Buffs suppressed for ${config.duration} turns.`);
  }
  if (violentUnits.length > 0) {
    const names = violentUnits.map(u => u.name).join(', ');
    logToLobby(lobby, `🖤 VIOLENCE: ${names} judged for killing! Stunned for ${config.duration} turns.`);
  }
  
  if (wrathfulUnits.length === 0 && pridefulUnits.length === 0 && violentUnits.length === 0) {
    logToLobby(lobby, `✨ Your units were found pure! No judgment applied.`);
  }
  
  // Emit divine judgment event to clients
  const eventData = {
    turnsLeft: state.divineJudgmentTurnsLeft,
    wrathful: wrathfulUnits,
    prideful: pridefulUnits,
    violent: violentUnits
  };
  
  if (lobby.hostSocket) {
    lobby.hostSocket.emit("divineJudgmentStart", eventData);
  }
  if (lobby.guestSocket) {
    lobby.guestSocket.emit("divineJudgmentStart", eventData);
  }
  
  // Set cinematic delay - this will pause game processing for 6.5 seconds
  // to allow the client cinematic to complete
  state.divineJudgmentCinematicUntil = Date.now() + 6500;
}

function processDivineJudgmentEnd(lobby) {
  const { state } = lobby.gameState;
  
  if (!state.divineJudgmentActive) return;
  
  state.divineJudgmentTurnsLeft--;
  
  // Update clients with remaining turns
  if (lobby.hostSocket) {
    lobby.hostSocket.emit("divineJudgmentUpdate", { turnsLeft: state.divineJudgmentTurnsLeft });
  }
  if (lobby.guestSocket) {
    lobby.guestSocket.emit("divineJudgmentUpdate", { turnsLeft: state.divineJudgmentTurnsLeft });
  }
  
  if (state.divineJudgmentTurnsLeft <= 0) {
    // Restore all judged units
    for (const unitId in state.units) {
      const unit = state.units[unitId];
      if (!unit) continue;
      
      // Clear wrath marker
      delete unit.judgedWrath;
      
      // Restore Pride buffs
      if (unit.judgedPride && unit.prideOriginal) {
        unit.atkBuffed = unit.prideOriginal.atkBuffed;
        unit.hpBuffed = unit.prideOriginal.hpBuffed;
        if (unit.prideOriginal.blessingMight) unit.blessingMight = unit.prideOriginal.blessingMight;
        if (unit.prideOriginal.blessingVigor) unit.blessingVigor = unit.prideOriginal.blessingVigor;
        if (unit.prideOriginal.blessingProtection) unit.blessingProtection = unit.prideOriginal.blessingProtection;
        if (unit.prideOriginal.blessingKings) unit.blessingKings = unit.prideOriginal.blessingKings;
        if (unit.prideOriginal.deathWard) unit.deathWard = unit.prideOriginal.deathWard;
        delete unit.prideOriginal;
        delete unit.judgedPride;
      }
      
      // Remove Violence stun
      if (unit.judgedViolence) {
        delete unit.stunned;
        delete unit.judgedViolence;
      }
    }
    
    state.divineJudgmentActive = false;
    
    logToLobby(lobby, `✨ Divine Judgment has lifted - units restored!`);
    
    // Emit divine judgment end to clients
    if (lobby.hostSocket) {
      lobby.hostSocket.emit("divineJudgmentEnd", {});
    }
    if (lobby.guestSocket) {
      lobby.guestSocket.emit("divineJudgmentEnd", {});
    }
  }
}

// ==================== END DIVINE JUDGMENT EVENT ====================

// ==================== CHEAT CODE EVENT (The Final Boss - 8-Bit Battalion) ====================

const CHEAT_CODES = [
  {
    code: 'IDKFA',
    name: 'Full Arsenal',
    description: 'ALL units gain +2 ATK',
    type: 'permanent'
  },
  {
    code: 'BIGHEAD',
    name: 'Big Head Mode',
    description: 'ALL units gain +1/+1',
    type: 'permanent'
  },
  {
    code: 'HESOYAM',
    name: 'Bankrupt',
    description: 'Both players lose all energy for 2 turns',
    type: 'duration'
  },
  {
    code: 'HOWDOITURNTHISON',
    name: 'Stat Swap',
    description: 'ALL units swap ATK ↔ HP and lose buffs',
    type: 'permanent'
  },
  {
    code: 'GREEDISGOOD',
    name: 'Discount Mode',
    description: 'ALL cards cost 1 energy for 2 turns',
    type: 'duration'
  }
];

function processCheatCodeStart(lobby, boss, config) {
  const { state, players } = lobby.gameState;
  
  // Pick a random cheat code
  const cheat = CHEAT_CODES[Math.floor(Math.random() * CHEAT_CODES.length)];
  
  // Track affected units for visual feedback
  const affectedUnits = [];
  
  // Apply the cheat effect
  if (cheat.code === 'IDKFA') {
    // All units gain +2 ATK permanently
    for (const unitId in state.units) {
      const unit = state.units[unitId];
      if (unit.type === 'structure') continue;
      unit.atk += 2;
      unit.cheatBuffed = true;
      // Track the buff
      if (!unit.permBuffs) unit.permBuffs = [];
      unit.permBuffs.push({ atk: 2, hp: 0, source: "IDKFA Cheat" });
      affectedUnits.push({ id: unitId, name: unit.name, owner: unit.owner });
    }
    logToLobby(lobby, `🎮 IDKFA: All units gained +2 ATK!`);
    
  } else if (cheat.code === 'BIGHEAD') {
    // All units gain +1/+1 permanently
    for (const unitId in state.units) {
      const unit = state.units[unitId];
      if (unit.type === 'structure') continue;
      unit.atk += 1;
      unit.hp += 1;
      unit.maxHp = (unit.maxHp || unit.hp) + 1;
      unit.cheatBuffed = true;
      // Track the buff
      if (!unit.permBuffs) unit.permBuffs = [];
      unit.permBuffs.push({ atk: 1, hp: 1, source: "BIGHEAD Cheat" });
      affectedUnits.push({ id: unitId, name: unit.name, owner: unit.owner });
    }
    logToLobby(lobby, `🎮 BIGHEAD: All units gained +1/+1!`);
    
  } else if (cheat.code === 'HESOYAM') {
    // Both players lose all energy for 2 turns
    players.gold.energy = 0;
    players.silver.energy = 0;
    state.cheatHesoyamActive = true;
    state.cheatHesoyamTurnsLeft = config.duration || 2;
    logToLobby(lobby, `🎮 HESOYAM: Both players bankrupt for ${state.cheatHesoyamTurnsLeft} turns!`);
    
  } else if (cheat.code === 'HOWDOITURNTHISON') {
    // All units swap ATK and HP, lose all buffs
    for (const unitId in state.units) {
      const unit = state.units[unitId];
      if (unit.type === 'structure') continue;
      
      // Swap ATK and HP
      const oldAtk = unit.atk;
      const oldHp = unit.hp;
      unit.atk = oldHp;
      unit.hp = oldAtk;
      unit.maxHp = oldAtk; // New max HP is the old ATK
      
      // Clear all buffs
      delete unit.atkBuffed;
      delete unit.hpBuffed;
      delete unit.blessingMight;
      delete unit.blessingVigor;
      delete unit.blessingProtection;
      delete unit.blessingKings;
      delete unit.deathWard;
      delete unit.gemBuffs;
      delete unit.permBuffs; // Clear permanent buffs too
      
      unit.cheatSwapped = true;
      affectedUnits.push({ id: unitId, name: unit.name, owner: unit.owner, oldAtk, oldHp });
    }
    
    // Check for deaths (units with 0 or less HP after swap)
    const deadUnits = [];
    for (const unitId in state.units) {
      const unit = state.units[unitId];
      if (unit.hp <= 0) {
        deadUnits.push(unitId);
      }
    }
    
    for (const unitId of deadUnits) {
      const unit = state.units[unitId];
      if (!unit) continue;
      const pos = getUnitPos(state, unitId);
      if (pos) {
        state.board[pos.r][pos.c] = null;
      }
      discardUnitCard(lobby, unit);
      delete state.units[unitId];
      logToLobby(lobby, `${unit.name} was destroyed by stat swap!`);
    }
    
    logToLobby(lobby, `🎮 HOWDOITURNTHISON: All units swapped ATK ↔ HP and lost buffs!`);
    
  } else if (cheat.code === 'GREEDISGOOD') {
    // All cards cost 1 energy for 2 turns
    state.cheatGreedActive = true;
    state.cheatGreedTurnsLeft = config.duration || 2;
    logToLobby(lobby, `🎮 GREEDISGOOD: All cards cost 1 energy for ${state.cheatGreedTurnsLeft} turns!`);
  }
  
  // Log the cheat activation
  combatLogToLobby(lobby, `🎮💥 The Final Boss - CHEAT CODE ACTIVATED`, "boss-event");
  combatLogToLobby(lobby, `${cheat.code}: ${cheat.name}`, "cheat-code");
  
  // Emit cheat code event to clients
  const eventData = {
    cheat: cheat,
    affectedUnits: affectedUnits,
    hesoyamTurnsLeft: state.cheatHesoyamTurnsLeft || 0,
    greedTurnsLeft: state.cheatGreedTurnsLeft || 0
  };
  
  if (lobby.hostSocket) {
    lobby.hostSocket.emit("cheatCodeStart", eventData);
  }
  if (lobby.guestSocket) {
    lobby.guestSocket.emit("cheatCodeStart", eventData);
  }
  
  // Set cinematic delay - 5 seconds for the cheat code animation
  state.cheatCodeCinematicUntil = Date.now() + 5000;
}

function processCheatCodeEnd(lobby) {
  const { state, players } = lobby.gameState;
  
  // Process HESOYAM duration (energy drain happens at start of each player's turn)
  if (state.cheatHesoyamActive) {
    state.cheatHesoyamTurnsLeft--;
    
    if (state.cheatHesoyamTurnsLeft <= 0) {
      state.cheatHesoyamActive = false;
      logToLobby(lobby, `🎮 HESOYAM effect ended - energy restored!`);
      
      if (lobby.hostSocket) {
        lobby.hostSocket.emit("cheatCodeEnd", { cheat: 'HESOYAM' });
      }
      if (lobby.guestSocket) {
        lobby.guestSocket.emit("cheatCodeEnd", { cheat: 'HESOYAM' });
      }
    } else {
      if (lobby.hostSocket) {
        lobby.hostSocket.emit("cheatCodeUpdate", { cheat: 'HESOYAM', turnsLeft: state.cheatHesoyamTurnsLeft });
      }
      if (lobby.guestSocket) {
        lobby.guestSocket.emit("cheatCodeUpdate", { cheat: 'HESOYAM', turnsLeft: state.cheatHesoyamTurnsLeft });
      }
    }
  }
  
  // Process GREEDISGOOD duration
  if (state.cheatGreedActive) {
    state.cheatGreedTurnsLeft--;
    
    if (state.cheatGreedTurnsLeft <= 0) {
      state.cheatGreedActive = false;
      logToLobby(lobby, `🎮 GREEDISGOOD effect ended - normal costs restored!`);
      
      if (lobby.hostSocket) {
        lobby.hostSocket.emit("cheatCodeEnd", { cheat: 'GREEDISGOOD' });
      }
      if (lobby.guestSocket) {
        lobby.guestSocket.emit("cheatCodeEnd", { cheat: 'GREEDISGOOD' });
      }
    } else {
      if (lobby.hostSocket) {
        lobby.hostSocket.emit("cheatCodeUpdate", { cheat: 'GREEDISGOOD', turnsLeft: state.cheatGreedTurnsLeft });
      }
      if (lobby.guestSocket) {
        lobby.guestSocket.emit("cheatCodeUpdate", { cheat: 'GREEDISGOOD', turnsLeft: state.cheatGreedTurnsLeft });
      }
    }
  }
}

// ==================== END CHEAT CODE EVENT ====================

function emitLobbyState(lobby) {
  const info = { 
    code: lobby.code, 
    hostDeck: lobby.hostDeck, 
    guestDeck: lobby.guestDeck, 
    hostReady: lobby.hostReady, 
    guestReady: lobby.guestReady, 
    guestJoined: !!lobby.guestSocket, 
    gameStarted: lobby.gameStarted,
    hostUsername: lobby.hostUsername,
    guestUsername: lobby.guestUsername,
    hostDeckName: lobby.hostDeckName,
    guestDeckName: lobby.guestDeckName
  };
  if (lobby.hostSocket) lobby.hostSocket.emit("lobbyState", { ...info, isHost: true });
  if (lobby.guestSocket) lobby.guestSocket.emit("lobbyState", { ...info, isHost: false });
}

function checkFreePlayReactions(lobby) {
  if (!lobby.tutorialFreePlay || !lobby.fpDialogs || !lobby.hostSocket) return;
  const state = lobby.gameState.state;
  const fp = lobby.fpDialogs;

  const currentSilverCount = Object.values(state.units).filter(u => u.owner === 'silver').length;
  if (currentSilverCount < fp.prevSilverCount) fp.silverDeaths += fp.prevSilverCount - currentSilverCount;
  fp.prevSilverCount = currentSilverCount;

  if (!fp.fiveDeathsShown && fp.silverDeaths >= 5) {
    fp.fiveDeathsShown = true;
    setTimeout(() => lobby.hostSocket?.emit('loreDialog', { speaker: 'Lost King', text: "My army will gladly die for me." }), 400);
  }
  if (!fp.lastWallShown && fp.prevRowGHP > 0 && state.rowHP[6] <= 0) {
    fp.lastWallShown = true;
    setTimeout(() => lobby.hostSocket?.emit('loreDialog', { speaker: 'Lost King', text: "Grrrr, no matter, I will still win." }), 400);
  }
  if (!fp.heartHitShown && state.heartHP.silver < fp.silverHeartAtStart) {
    fp.heartHitShown = true;
    setTimeout(() => lobby.hostSocket?.emit('loreDialog', { speaker: 'Lost King', text: "Ughhh, leave me be!!" }), 400);
  }
  fp.prevRowGHP = state.rowHP[6];
}

function emitGameState(lobby) {
  if (!lobby.gameState) return;
  const { state, players } = lobby.gameState;
  
  // Calculate hp buffs for each player (from buff tiles)
  const goldHpBuff = getHpBuffBonus(state, "gold");
  const silverHpBuff = getHpBuffBonus(state, "silver");
  
  // Calculate Armory bonus for each player (passive aura - affects all units)
  const goldArmoryBonus = getArmoryBonus(state, "gold");
  const silverArmoryBonus = getArmoryBonus(state, "silver");
  
  // Create units with effective stats
  const unitsWithBuffs = {};
  for (const uid in state.units) {
    const u = state.units[uid];
    
    // Volcanic scorched units don't benefit from HP buffs (but can still be healed)
    if (u.volcanicScorched) {
      unitsWithBuffs[uid] = { 
        ...u, 
        displayHp: u.hp,
        displayMaxHp: u.maxHp || u.hp,
        hpBuffed: false
      };
      continue;
    }
    
    const tileHpBuff = u.owner === "gold" ? goldHpBuff : silverHpBuff;
    const armoryBuff = u.owner === "gold" ? goldArmoryBonus : silverArmoryBonus;
    
    // Check for Moon Flare Sorceress aura (+1 HP to adjacent allies)
    let moonflareHpBuff = 0;
    const pos = getUnitPos(state, uid);
    if (pos) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = pos.r + dr, nc = pos.c + dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
          const aid = state.board[nr][nc];
          if (aid && state.units[aid] && state.units[aid].owner === u.owner && state.units[aid].effectId === "moonflare_aura") {
            moonflareHpBuff = 1;
            break; // Only count once
          }
        }
        if (moonflareHpBuff > 0) break;
      }
    }
    
    // Don't give Armory buff to the Armory itself
    const armoryBuffForUnit = (u.effectId === "armory_buff") ? 0 : armoryBuff;
    
    const totalHpBuff = tileHpBuff + moonflareHpBuff + armoryBuffForUnit;
    
    // Compute display ATK including all passive buffs
    let displayAtk = u.atk;
    if (pos) {
      // Moonstone Witch - +1 ATK per Gem Shard on field
      if (u.effectId === "gem_transform") {
        for (const gid in state.units) {
          if (state.units[gid].key === "gemshard") displayAtk += 1;
        }
      }
      // Void Broodmother - +1 ATK per owned Void Drone
      if (u.effectId === "spawn_drone") {
        for (const gid in state.units) {
          if (state.units[gid].key === "voiddrone" && state.units[gid].owner === u.owner) displayAtk += 1;
        }
      }
      // Starweave Archer - +1 ATK per adjacent ally
      if (u.effectId === "starweave_ranged") {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = pos.r + dr, nc = pos.c + dc;
            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
            const aid = state.board[nr][nc];
            if (aid && state.units[aid] && state.units[aid].owner === u.owner) displayAtk += 1;
          }
        }
      }
      // Adjacent aura buffs and debuffs
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = pos.r + dr, nc = pos.c + dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
          const aid = state.board[nr][nc];
          if (aid && state.units[aid] && state.units[aid].owner === u.owner && state.units[aid].effectId === "attack_aura") displayAtk += 1;
          if (aid && state.units[aid] && state.units[aid].owner === u.owner && state.units[aid].effectId === "moonflare_aura") displayAtk += 1;
          if (aid && state.units[aid] && state.units[aid].owner === u.owner && state.units[aid].effectId === "garnet_aura") displayAtk += 1;
          if (aid && state.units[aid] && state.units[aid].owner !== u.owner && state.units[aid].effectId === "garnet_aura") {
            displayAtk = Math.min(displayAtk, 2);
          }
          if (aid && state.units[aid] && state.units[aid].owner !== u.owner && 
              (state.units[aid].effectId === "weaken_aura" || state.units[aid].effectId === "lifesteal_weaken")) {
            displayAtk = Math.max(0, displayAtk - 1);
          }
        }
      }
    }
    
    unitsWithBuffs[uid] = { 
      ...u, 
      displayAtk: displayAtk,
      displayHp: u.hp + totalHpBuff,
      displayMaxHp: (u.maxHp || u.hp) + totalHpBuff,
      hpBuffed: totalHpBuff > 0,
      atkModified: displayAtk !== u.atk,
      armoryBuffed: armoryBuffForUnit > 0 ? armoryBuffForUnit : undefined
    };
  }
  
  // Calculate Raphael protected tiles, War Banner aura tiles, and Coffin Trapper tiles for client-side glow
  const raphaelProtectedTiles = [];
  const warBannerAuraTiles = [];
  const coffinTrapperTiles = [];
  const sheriffAuraTiles = [];
  const nosferatuAuraTiles = [];
  const garnetAuraTiles = [];
  const diamondGuardianTiles = [];
  for (const uid in state.units) {
    const u = state.units[uid];
    if (u.effectId === "raphael_shield") {
      const raphaelPos = getUnitPos(state, uid);
      if (raphaelPos) {
        const behindDir = u.owner === "gold" ? -1 : 1;
        for (let i = 1; i <= 3; i++) {
          const pr = raphaelPos.r + behindDir * i;
          if (pr >= 0 && pr < ROWS) {
            raphaelProtectedTiles.push({ r: pr, c: raphaelPos.c, owner: u.owner });
          }
        }
      }
    }
    if (u.effectId === "attack_aura") {
      const bannerPos = getUnitPos(state, uid);
      if (bannerPos) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = bannerPos.r + dr, nc = bannerPos.c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
              warBannerAuraTiles.push({ r: nr, c: nc, owner: u.owner });
            }
          }
        }
      }
    }
    if (u.effectId === "root_aura") {
      const trapPos = getUnitPos(state, uid);
      if (trapPos) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = trapPos.r + dr, nc = trapPos.c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
              coffinTrapperTiles.push({ r: nr, c: nc, owner: u.owner });
            }
          }
        }
      }
    }
    if (u.effectId === "weaken_aura") {
      const sheriffPos = getUnitPos(state, uid);
      if (sheriffPos) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = sheriffPos.r + dr, nc = sheriffPos.c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
              sheriffAuraTiles.push({ r: nr, c: nc, owner: u.owner });
            }
          }
        }
      }
    }
    if (u.effectId === "lifesteal_weaken") {
      const nosPos = getUnitPos(state, uid);
      if (nosPos) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = nosPos.r + dr, nc = nosPos.c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
              nosferatuAuraTiles.push({ r: nr, c: nc, owner: u.owner });
            }
          }
        }
      }
    }
    if (u.effectId === "garnet_aura") {
      const garnetPos = getUnitPos(state, uid);
      if (garnetPos) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = garnetPos.r + dr, nc = garnetPos.c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
              garnetAuraTiles.push({ r: nr, c: nc, owner: u.owner });
            }
          }
        }
      }
    }
    if (u.effectId === "bodyguard") {
      const dgPos = getUnitPos(state, uid);
      if (dgPos) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = dgPos.r + dr, nc = dgPos.c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
              diamondGuardianTiles.push({ r: nr, c: nc, owner: u.owner });
            }
          }
        }
      }
    }
  }

  const base = { 
    board: state.board, 
    rowHP: state.rowHP, 
    rowOwner: state.rowOwner, 
    heartHP: state.heartHP, 
    units: unitsWithBuffs, 
    activeSide: state.activeSide, 
    turnNumber: state.turnNumber, 
    gameOver: state.gameOver,
    winner: state.winner || null,
    spawn: state.spawn, 
    movedThisTurn: [...state.movedThisTurn], 
    attackedThisTurn: [...state.attackedThisTurn], 
    firstTurn: state.firstTurn,
    buffTiles: state.buffTiles,
    moveCountThisTurn: state.moveCountThisTurn,
    attackCountThisTurn: state.attackCountThisTurn || {},
    bossEventWarning: state.bossEventWarning,
    chaliceTiles: state.chaliceTiles || [],
    eclipseActive: state.eclipseActive || false,
    eclipseEffect: state.eclipseEffect || null,
    polymorphActive: state.polymorphActive || false,
    polymorphTurnsLeft: state.polymorphTurnsLeft || 0,
    divineJudgmentActive: state.divineJudgmentActive || false,
    divineJudgmentTurnsLeft: state.divineJudgmentTurnsLeft || 0,
    cheatHesoyamActive: state.cheatHesoyamActive || false,
    cheatHesoyamTurnsLeft: state.cheatHesoyamTurnsLeft || 0,
    cheatGreedActive: state.cheatGreedActive || false,
    cheatGreedTurnsLeft: state.cheatGreedTurnsLeft || 0,
    raphaelProtectedTiles: raphaelProtectedTiles,
    warBannerAuraTiles: warBannerAuraTiles,
    coffinTrapperTiles: coffinTrapperTiles,
    sheriffAuraTiles: sheriffAuraTiles,
    nosferatuAuraTiles: nosferatuAuraTiles,
    garnetAuraTiles: garnetAuraTiles,
    diamondGuardianTiles: diamondGuardianTiles
  };
  if (lobby.hostSocket) lobby.hostSocket.emit("state", { 
    ...base, 
    hand: players.gold.hand, 
    deckCount: players.gold.deck.length, 
    discardCount: players.gold.discard.length,
    discard: players.gold.discard, 
    energy: players.gold.energy, 
    maxEnergy: players.gold.maxEnergy, 
    canDraw: !players.gold.hasDrawn && players.gold.hand.length < MAX_HAND_SIZE,
    pendingWizardSummon: state.pendingWizardSummon && state.pendingWizardSummon.gold && state.pendingWizardSummon.gold.active,
    // Opponent info (silver)
    enemyHandCount: players.silver.hand.length,
    enemyDeckCount: players.silver.deck.length,
    enemyEnergy: players.silver.energy,
    enemyMaxEnergy: players.silver.maxEnergy,
    enemyDiscard: players.silver.discard
  });
  if (lobby.guestSocket) lobby.guestSocket.emit("state", { 
    ...base, 
    hand: players.silver.hand, 
    deckCount: players.silver.deck.length, 
    discardCount: players.silver.discard.length,
    discard: players.silver.discard, 
    energy: players.silver.energy, 
    maxEnergy: players.silver.maxEnergy, 
    canDraw: !players.silver.hasDrawn && players.silver.hand.length < MAX_HAND_SIZE,
    pendingWizardSummon: state.pendingWizardSummon && state.pendingWizardSummon.silver && state.pendingWizardSummon.silver.active,
    // Opponent info (gold)
    enemyHandCount: players.gold.hand.length,
    enemyDeckCount: players.gold.deck.length,
    enemyEnergy: players.gold.energy,
    enemyMaxEnergy: players.gold.maxEnergy,
    enemyDiscard: players.gold.discard
  });

  checkFreePlayReactions(lobby);
}

// Helper to log board state for AI debugging (condensed)
function logBoardState(state, perspective) {
  const { board, units, rowHP, heartHP, spawn, buffTiles } = state;
  
  // One-line summary
  const goldUnits = Object.values(units).filter(u => u.owner === 'gold');
  const silverUnits = Object.values(units).filter(u => u.owner === 'silver');
  
  
  // Show buff tiles if any
  if (buffTiles && Object.keys(buffTiles).length > 0) {
    const buffInfo = Object.values(buffTiles).map(b => `${b.id}@(${b.row},${b.col})`).join(', ');
  }
  
  // Show boss event warning if any
  if (state.bossEventWarning) {
  }
}

// Process AI turn for campaign mode
async function processAITurn(lobby) {
  // Check if AI was stopped (player left)
  if (lobby.aiStopped) {
    return;
  }
  
  const { state, players } = lobby.gameState;
  const ai = lobby.ai;
  if (!ai) return;
  
  // Wait for Divine Judgment cinematic to complete
  if (state.divineJudgmentCinematicUntil && Date.now() < state.divineJudgmentCinematicUntil) {
    const remainingDelay = state.divineJudgmentCinematicUntil - Date.now();
    setTimeout(() => {
      delete state.divineJudgmentCinematicUntil;
      processAITurn(lobby);
    }, remainingDelay);
    return;
  }
  
  // Wait for Cheat Code cinematic to complete
  if (state.cheatCodeCinematicUntil && Date.now() < state.cheatCodeCinematicUntil) {
    const remainingDelay = state.cheatCodeCinematicUntil - Date.now();
    setTimeout(() => {
      delete state.cheatCodeCinematicUntil;
      processAITurn(lobby);
    }, remainingDelay);
    return;
  }
  
  // Prevent multiple AI loops from running simultaneously
  if (lobby.aiProcessing) {
    return;
  }
  lobby.aiProcessing = true;

  const aiRole = "silver";
  const aiPlayer = players[aiRole];
  
  // Log board state at start of turn (condensed)
  logBoardState(state, "SILVER");
  
  // *** BOSS EVENT: Execute pending warning at START of boss turn ***
  if (state.bossEventWarning) {
    
    // For void collapse, we need to delay unit removal until animation completes
    const eventType = state.bossEventWarning.type;
    
    if (eventType === 'void_collapse') {
      // Send the execute event but DON'T remove units yet
      processVoidCollapseExecuteEvent(lobby);
      
      // Wait for countdown (3s) + fade (0.5s) + implosions (tiles * 150ms + buffer)
      const tiles = state.bossEventWarning.tiles || [];
      const animationTime = 3500 + (tiles.length * 150) + 500;
      await new Promise(resolve => setTimeout(resolve, animationTime));
      
      // NOW remove units and update state
      processVoidCollapseRemoveUnits(lobby);
      emitGameState(lobby);
      
      // Small buffer after state update
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      // Other events work as before
      processBossEventExecute(lobby);
      emitGameState(lobby); // Update client to show destruction
      
      // Wait for dramatic countdown sequence (3s countdown + 0.5s fade + implosions + buffer)
      await new Promise(resolve => setTimeout(resolve, 6000));
    }
  }
  
  // Use same speed setting as player AI (if auto-play is enabled)
  const speed = lobby.autoPlaySpeed || 1;
  const baseDelay = speed === 2 ? 250 : 600;
  const randomDelay = speed === 2 ? 150 : 300;
  
  // Quick check: if AI has 0 energy (e.g., from HESOYAM), do minimal actions and end turn
  if (aiPlayer.energy === 0) {
    logToLobby(lobby, "Silver has no energy - doing free actions only");
    
    // Do the draw first if needed (free action) - but only if hand isn't full
    if (!aiPlayer.hasDrawn && aiPlayer.hand.length < MAX_HAND_SIZE && (aiPlayer.deck.length > 0 || aiPlayer.discard.length > 0)) {
      drawCards(lobby, aiRole, 1);
      aiPlayer.hasDrawn = true;
    } else {
      // Mark as drawn even if we couldn't draw (hand full or no cards)
      aiPlayer.hasDrawn = true;
    }
    
    // Let AI do moves/attacks with existing units (these don't cost energy)
    // But limit iterations to prevent infinite loops
    let zeroEnergyActions = 0;
    const maxZeroEnergyActions = 20;
    
    const doZeroEnergyAction = async () => {
      if (state.gameOver || state.activeSide !== aiRole || zeroEnergyActions >= maxZeroEnergyActions) {
        // End turn
        setTimeout(() => {
          processEndOfTurnEffects(lobby, aiRole);
          processEclipseEnd(lobby);
          processPolymorphEnd(lobby);
          processDivineJudgmentEnd(lobby);
          processCheatCodeEnd(lobby);
          state.bossTurnCount++;
          processBossEventWarning(lobby);
          
          for (const uid in state.units) {
            const u = state.units[uid];
            u.canDoubleAttack = false;
            u.attackCountThisTurn = 0;
            if (u.owner === aiRole) u.untargetable = false;
          }
          
          state.activeSide = "gold";
          state.movedThisTurn.clear();
          state.attackedThisTurn.clear();
          state.moveCountThisTurn = {};
          state.attackCountThisTurn = {};
          clearDiamondBuffs(state, "silver");
          
          const goldPlayer = players.gold;
          let energyGain = 1 + Math.floor((state.turnNumber - 1) / 3);
          if (playerHasBuff(state, "gold", "energy_buff")) energyGain += 1;
          goldPlayer.energy = Math.min(goldPlayer.energy + energyGain, MAX_ENERGY);
          goldPlayer.hasDrawn = false;
          
          if (state.cheatHesoyamActive && state.cheatHesoyamTurnsLeft > 0) {
            goldPlayer.energy = 0;
            logToLobby(lobby, `🎮 HESOYAM: Energy drained! (${state.cheatHesoyamTurnsLeft} turns left)`);
          }
          
          processStartOfTurnEffects(lobby, "gold");
          processBossEventCountdown(lobby);
          state.turnNumber++;
          logToLobby(lobby, "--- GOLD's turn (+" + energyGain + " energy) ---");
          combatLogToLobby(lobby, `─── Turn ${state.turnNumber}: GOLD ───`, "turn-separator");
          lobby.aiProcessing = false;
          emitGameState(lobby);
          
          if (lobby.autoPlay && !state.gameOver) {
            setTimeout(() => processPlayerAITurn(lobby), 800);
          }
        }, baseDelay);
        return;
      }
      
      zeroEnergyActions++;
      
      // Ask AI for action but it should only return moves/attacks (not playCard since no energy)
      const action = ai.decideAction(state, aiPlayer.hand, 0, true, false); // Pass 0 energy, already drew
      
      if (action.type === "endTurn" || action.type === "playCard") {
        // AI wants to play card or end turn - just end turn
        doZeroEnergyAction(); // This will hit the end turn path
        return;
      }
      
      // Process move or attack
      if (action.type === "move" || action.type === "attack" || action.type === "attackRow" || action.type === "attackHeart") {
        await executeAction(lobby, aiRole, action);
        emitGameState(lobby);
        setTimeout(doZeroEnergyAction, baseDelay + Math.random() * randomDelay);
      } else {
        // Unknown action, end turn
        zeroEnergyActions = maxZeroEnergyActions;
        doZeroEnergyAction();
      }
    };
    
    setTimeout(doZeroEnergyAction, baseDelay);
    return;
  }
  
  // Track actions to prevent infinite loops
  let actionCount = 0;
  let consecutiveFailedMoves = 0;
  const MAX_ACTIONS_PER_TURN = 50;
  const MAX_CONSECUTIVE_FAILED_MOVES = 5;
  
  const executeAIAction = async () => {
    try {
      // Check if AI was stopped (player left)
      if (lobby.aiStopped) {
        lobby.aiProcessing = false;
        return;
      }
      
      if (state.gameOver || state.activeSide !== aiRole) {
        lobby.aiProcessing = false;
        return;
      }
      
      // Safety check - force end turn if too many actions
      actionCount++;
      if (actionCount > MAX_ACTIONS_PER_TURN) {
        forceAIEndTurn();
        return;
      }
      
      const action = ai.decideAction(
        state,
        aiPlayer.hand,
        aiPlayer.energy,
        aiPlayer.hasDrawn,
        true // Enable logging
      );
      
      // Removed duplicate log - decideAction now logs everything
      
      if (action.type === "endTurn") {
        // AI ends turn - process end of turn
        processEndOfTurnEffects(lobby, aiRole);
        
        // Process eclipse end (counts down each turn)
        processEclipseEnd(lobby);
        
        // Process polymorph end (counts down each turn)
        processPolymorphEnd(lobby);
        
        // Process divine judgment end (counts down each turn)
        processDivineJudgmentEnd(lobby);
        
        // Process cheat code duration effects (counts down each turn)
        processCheatCodeEnd(lobby);
        
        // Increment boss turn count and check for NEW warning
        state.bossTurnCount++;
        processBossEventWarning(lobby);
        
        for (const uid in state.units) {
          const u = state.units[uid];
          u.canDoubleAttack = false;
          u.attackCountThisTurn = 0;
          if (u.owner === aiRole) {
            u.untargetable = false;
          }
        }
        
        state.activeSide = "gold";
        state.movedThisTurn.clear();
        state.attackedThisTurn.clear();
        state.moveCountThisTurn = {};
        state.attackCountThisTurn = {};
        clearDiamondBuffs(state, "silver"); // Clear silver's diamond buffs (their turn ended)
        
        const goldPlayer = players.gold;
        let energyGain = 1 + Math.floor((state.turnNumber - 1) / 3);
        if (playerHasBuff(state, "gold", "energy_buff")) energyGain += 1;
        goldPlayer.energy = Math.min(goldPlayer.energy + energyGain, MAX_ENERGY);
        goldPlayer.hasDrawn = false;
        
        // HESOYAM cheat: drain all energy after gaining it
        if (state.cheatHesoyamActive && state.cheatHesoyamTurnsLeft > 0) {
          goldPlayer.energy = 0;
          logToLobby(lobby, `🎮 HESOYAM: Energy drained! (${state.cheatHesoyamTurnsLeft} turns left)`);
        }
        
        processStartOfTurnEffects(lobby, "gold");
        
        // Show countdown warning at start of player's turn
        processBossEventCountdown(lobby);
        
        state.turnNumber++;
        logToLobby(lobby, "--- GOLD's turn (+" + energyGain + " energy) ---");
        combatLogToLobby(lobby, `─── Turn ${state.turnNumber}: GOLD ───`, "turn-separator");
        lobby.aiProcessing = false; // Clear the flag
        emitGameState(lobby);
        
        // If auto-play is enabled, continue with player AI
        if (lobby.autoPlay && !state.gameOver) {
          setTimeout(() => {
            processPlayerAITurn(lobby);
          }, 800);
        }
        return;
      }
      
      // Track if this is a move action (most likely to fail repeatedly)
      const isMoveAction = action.type === "move";
      const stateBeforeAction = isMoveAction ? JSON.stringify(state.board) : null;
      
      // Execute the action
      await executeAction(lobby, aiRole, action);
      
      // Check if move actually happened
      if (isMoveAction) {
        const stateAfterAction = JSON.stringify(state.board);
        if (stateBeforeAction === stateAfterAction) {
          consecutiveFailedMoves++;
          
          if (consecutiveFailedMoves >= MAX_CONSECUTIVE_FAILED_MOVES) {
            forceAIEndTurn();
            return;
          }
        } else {
          consecutiveFailedMoves = 0; // Reset on successful move
        }
      } else {
        consecutiveFailedMoves = 0; // Reset on non-move action
      }
      
      emitGameState(lobby);
      
      // Continue AI turn after delay (use same speed as player AI)
      if (state.activeSide === aiRole && !state.gameOver) {
        const currentSpeed = lobby.autoPlaySpeed || 1;
        const actionDelay = (currentSpeed === 2 ? 250 : 600) + Math.random() * (currentSpeed === 2 ? 150 : 300);
        setTimeout(executeAIAction, actionDelay);
      } else {
        lobby.aiProcessing = false; // Clear if turn ended another way
      }
    } catch (err) {
      console.error("AI turn error:", err.message, err.stack);
      forceAIEndTurn();
    }
  };
  
  // Helper to force end turn
  const forceAIEndTurn = () => {
    lobby.aiProcessing = false;
    processEndOfTurnEffects(lobby, aiRole);
    
    // Increment boss turn count and check for NEW warning
    state.bossTurnCount++;
    processBossEventWarning(lobby);
    
    state.activeSide = "gold";
    state.movedThisTurn.clear();
    state.attackedThisTurn.clear();
    state.moveCountThisTurn = {};
    state.attackCountThisTurn = {};
    clearDiamondBuffs(state, "silver"); // Clear silver's diamond buffs (their turn ended)
    const goldPlayer = players.gold;
    let energyGain = 1 + Math.floor((state.turnNumber - 1) / 3);
    if (playerHasBuff(state, "gold", "energy_buff")) energyGain += 1;
    goldPlayer.energy = Math.min(goldPlayer.energy + energyGain, MAX_ENERGY);
    goldPlayer.hasDrawn = false;
    
    // HESOYAM cheat: drain all energy after gaining it
    if (state.cheatHesoyamActive && state.cheatHesoyamTurnsLeft > 0) {
      goldPlayer.energy = 0;
      logToLobby(lobby, `🎮 HESOYAM: Energy drained! (${state.cheatHesoyamTurnsLeft} turns left)`);
    }
    
    processStartOfTurnEffects(lobby, "gold");
    
    // Show countdown warning at start of player's turn
    processBossEventCountdown(lobby);
    
    state.turnNumber++;
    logToLobby(lobby, "--- GOLD's turn (+" + energyGain + " energy) ---");
    emitGameState(lobby);
    
    // If auto-play is enabled, continue with player AI
    if (lobby.autoPlay && !state.gameOver) {
      setTimeout(() => {
        processPlayerAITurn(lobby);
      }, 800);
    }
  };
  
  // Start AI turn with delay
  const initialDelay = (speed === 2 ? 250 : 600) + Math.random() * (speed === 2 ? 150 : 300);
  setTimeout(executeAIAction, initialDelay);
}

// Process player AI turn (auto-play mode)
async function processPlayerAITurn(lobby) {
  if (!lobby || !lobby.autoPlay || !lobby.playerAI) return;
  
  const { state, players } = lobby.gameState;
  const playerRole = "gold";
  const playerAI = lobby.playerAI;
  
  // Wait for Divine Judgment cinematic to complete
  if (state.divineJudgmentCinematicUntil && Date.now() < state.divineJudgmentCinematicUntil) {
    const remainingDelay = state.divineJudgmentCinematicUntil - Date.now();
    setTimeout(() => {
      delete state.divineJudgmentCinematicUntil;
      processPlayerAITurn(lobby);
    }, remainingDelay);
    return;
  }
  
  // Wait for Cheat Code cinematic to complete
  if (state.cheatCodeCinematicUntil && Date.now() < state.cheatCodeCinematicUntil) {
    const remainingDelay = state.cheatCodeCinematicUntil - Date.now();
    setTimeout(() => {
      delete state.cheatCodeCinematicUntil;
      processPlayerAITurn(lobby);
    }, remainingDelay);
    return;
  }
  
  // Prevent multiple AI loops
  if (lobby.playerAIProcessing) return;
  if (state.gameOver || state.activeSide !== playerRole) return;
  
  lobby.playerAIProcessing = true;
  
  // Log board state at start of turn (condensed)
  logBoardState(state, "GOLD");
  
  const player = players[playerRole];
  // Speed setting: 1 = normal (600-900ms), 2 = fast (250-400ms)
  const speed = lobby.autoPlaySpeed || 1;
  const baseDelay = speed === 2 ? 250 : 600;
  const randomDelay = speed === 2 ? 150 : 300;
  
  let actionCount = 0;
  const MAX_ACTIONS = 50;
  
  const executePlayerAIAction = async () => {
    try {
      // Stop if auto-play was disabled
      if (!lobby.autoPlay) {
        lobby.playerAIProcessing = false;
        return;
      }
      
      if (state.gameOver || state.activeSide !== playerRole) {
        lobby.playerAIProcessing = false;
        return;
      }
      
      actionCount++;
      if (actionCount > MAX_ACTIONS) {
        forcePlayerEndTurn();
        return;
      }
      
      const action = playerAI.decideAction(
        state,
        player.hand,
        player.energy,
        player.hasDrawn,
        true // Enable logging
      );
      
      
      if (action.type === "endTurn") {
        forcePlayerEndTurn();
        return;
      }
      
      // Execute the action
      await executeAction(lobby, playerRole, action);
      emitGameState(lobby);
      
      // Continue with next action after delay (recalculate in case speed changed)
      const currentSpeed = lobby.autoPlaySpeed || 1;
      const actionDelay = (currentSpeed === 2 ? 250 : 600) + Math.random() * (currentSpeed === 2 ? 150 : 300);
      setTimeout(executePlayerAIAction, actionDelay);
      
    } catch (err) {
      console.error("Player AI error:", err);
      lobby.playerAIProcessing = false;
    }
  };
  
  const forcePlayerEndTurn = () => {
    lobby.playerAIProcessing = false;
    
    processEndOfTurnEffects(lobby, playerRole);
    
    // Process eclipse end (counts down each turn)
    processEclipseEnd(lobby);
    
    // Process polymorph end (counts down each turn)
    processPolymorphEnd(lobby);
    
    // Clear firstTurn after gold's first turn
    if (state.firstTurn) {
      state.firstTurn = false;
    }
    
    // Reset attack counts etc
    for (const uid in state.units) {
      const u = state.units[uid];
      u.canDoubleAttack = false;
      u.attackCountThisTurn = 0;
      if (u.owner === playerRole) {
        u.untargetable = false;
      }
    }
    
    state.activeSide = "silver";
    state.movedThisTurn.clear();
    state.attackedThisTurn.clear();
    state.moveCountThisTurn = {};
    state.attackCountThisTurn = {};
    clearDiamondBuffs(state, "gold"); // Clear gold's diamond buffs (their turn ended)
    
    const silverPlayer = players.silver;
    // Challenge mode: AI starts with 4 energy per turn, scales normally
    const baseEnergy = lobby.isChallenge ? 4 : 1;
    let energyGain = baseEnergy + Math.floor((state.turnNumber - 1) / 3);
    if (playerHasBuff(state, "silver", "energy_buff")) energyGain += 1;
    // Challenge mode: max energy is 15 instead of 10
    const maxEnergy = lobby.isChallenge ? 15 : MAX_ENERGY;
    silverPlayer.energy = Math.min(silverPlayer.energy + energyGain, maxEnergy);
    silverPlayer.hasDrawn = false;
    
    // HESOYAM cheat: drain all energy after gaining it
    if (state.cheatHesoyamActive && state.cheatHesoyamTurnsLeft > 0) {
      silverPlayer.energy = 0;
      logToLobby(lobby, `🎮 HESOYAM: Boss energy drained! (${state.cheatHesoyamTurnsLeft} turns left)`);
    }
    
    processStartOfTurnEffects(lobby, "silver");
    state.turnNumber++;
    logToLobby(lobby, "--- SILVER's turn (+" + energyGain + " energy) ---");
    combatLogToLobby(lobby, `─── Turn ${state.turnNumber}: SILVER ───`, "turn-separator");
    emitGameState(lobby);
    
    // Now it's enemy AI's turn
    if (!state.gameOver) {
      processAITurn(lobby);
    }
  };
  
  // Start player AI with delay
  const initialDelay = (speed === 2 ? 250 : 600) + Math.random() * (speed === 2 ? 150 : 300);
  setTimeout(executePlayerAIAction, initialDelay);
}

// Execute a single AI action
async function executeAction(lobby, role, action) {
  const { state, players } = lobby.gameState;
  const p = players[role];
  
  switch (action.type) {
    case "drawCard": {
      if (p.hasDrawn) return;
      if (p.deck.length === 0 && p.discard.length === 0) {
        p.hasDrawn = true; // Mark as drawn even if can't draw (no cards left)
        return;
      }
      if (p.hand.length >= MAX_HAND_SIZE) {
        p.hasDrawn = true; // Mark as drawn even if can't draw (hand full)
        return;
      }
      // Challenge mode: AI draws 3 cards, normal: 1 (or 2 with Ancient Library buff)
      let drawCount = playerHasBuff(state, role, "draw_buff") ? 2 : 1;
      if (lobby.isChallenge && role === "silver") {
        drawCount = 3;
      }
      drawCards(lobby, role, drawCount);
      p.hasDrawn = true;
      logToLobby(lobby, role.toUpperCase() + " draws " + drawCount);
      break;
    }
    
    case "playCard": {
      const idx = p.hand.findIndex(c => c.id === action.cardId);
      if (idx === -1) return;
      const card = p.hand[idx];
      
      // GREEDISGOOD cheat: all cards cost 1 energy
      const effectiveCost = state.cheatGreedActive ? 1 : card.cost;
      if (p.energy < effectiveCost) return;
      
      if (card.effect === "instant") {
        p.energy -= effectiveCost;
        p.hand.splice(idx, 1);
        p.discard.push(card);
        processInstantSpell(lobby, role, card.effectId, action.row, action.targetUnitId);
        logToLobby(lobby, role.toUpperCase() + " cast " + card.name);
      } else if (action.spawn) {
        p.energy -= effectiveCost;
        p.hand.splice(idx, 1);
        const id = genId();
        const unitData = { id, owner: role, key: card.key, name: card.name, atk: card.atk, hp: card.hp, maxHp: card.hp, cost: card.cost, type: card.type || "monster", effect: card.effect, effectId: card.effectId, effectDesc: card.effectDesc, art: card.art, originalCard: card };
        if (card.range) unitData.range = card.range;
        if (card.effectId === "burrow") {
          unitData.untargetable = true;
          unitData.burrowTurnsLeft = 2;
        }
        if (card.effectId === "phantom") unitData.untargetable = true;
        if (card.stolen) unitData.stolen = true;
        if (card.isHolo) unitData.isHolo = true;
        if (card.stationary) unitData.stationary = true;
        if (card.effectId === "stacking_aura") unitData.wizardStacks = 1; // Wizard NPC starts with +1/+1 buff
        state.units[id] = unitData;
        state.spawn[role] = id;
        
        // Apply eclipse effect to newly deployed unit if eclipse is active
        if (state.eclipseActive && state.eclipseEffect) {
          applyEclipseEffectToUnit(state.units[id], state.eclipseEffect);
        }
        
        // Apply polymorph to newly deployed unit if polymorph is active
        if (state.polymorphActive) {
          polymorphUnit(state, id);
        }
        
        // Process on-deploy effects for spawn deployment
        if (card.effectId === "wizard_rune") {
          const wizardsInDeck = p.deck.filter(c => WIZARD_CARDS.includes(c.key) && c.type === 'monster');
          if (wizardsInDeck.length > 0 && p.hand.length < MAX_HAND_SIZE) {
            const randomWizard = wizardsInDeck[Math.floor(Math.random() * wizardsInDeck.length)];
            const wizardIndex = p.deck.findIndex(c => c.id === randomWizard.id);
            if (wizardIndex !== -1) {
              p.deck.splice(wizardIndex, 1);
              p.hand.push(randomWizard);
              logToLobby(lobby, "Wizard's Rune draws " + randomWizard.name + " from the deck!");
            }
          } else if (wizardsInDeck.length === 0) {
            logToLobby(lobby, "Wizard's Rune finds no wizards in the deck!");
          } else {
            logToLobby(lobby, "Wizard's Rune - hand is full!");
          }
        }
        
        logToLobby(lobby, role.toUpperCase() + " deployed " + card.name + " to spawn");
        emitSFX(lobby, card.key, 'deploy'); // Play deploy sound
      } else if (action.row !== undefined && action.col !== undefined) {
        if (state.board[action.row][action.col]) return;
        p.energy -= effectiveCost;
        p.hand.splice(idx, 1);
        const id = genId();
        const unitData = { id, owner: role, key: card.key, name: card.name, atk: card.atk, hp: card.hp, maxHp: card.hp, cost: card.cost, type: card.type || "monster", effect: card.effect, effectId: card.effectId, effectDesc: card.effectDesc, art: card.art, originalCard: card };
        if (card.range) unitData.range = card.range;
        if (card.effectId === "burrow") {
          unitData.untargetable = true;
          unitData.burrowTurnsLeft = 2;
        }
        if (card.effectId === "phantom") unitData.untargetable = true;
        if (card.stolen) unitData.stolen = true;
        if (card.isHolo) unitData.isHolo = true;
        if (card.stationary) unitData.stationary = true;
        if (card.effectId === "stacking_aura") unitData.wizardStacks = 1; // Wizard NPC starts with +1/+1 buff
        state.units[id] = unitData;
        state.board[action.row][action.col] = id;
        
        // Apply eclipse effect to newly deployed unit if eclipse is active
        if (state.eclipseActive && state.eclipseEffect) {
          applyEclipseEffectToUnit(state.units[id], state.eclipseEffect);
        }
        
        // Apply polymorph to newly deployed unit if polymorph is active
        if (state.polymorphActive) {
          polymorphUnit(state, id);
        }
        
        // Check for blood chalice consumption
        checkChaliceConsumption(lobby, id, action.row, action.col);
        
        recomputeOwners(state);
        
        // Process on-deploy effects (gem_spawn for Emerald Forager)
        if (card.effectId === "gem_spawn") {
          const adjacentTiles = [
            { r: action.row - 1, c: action.col }, { r: action.row + 1, c: action.col },
            { r: action.row, c: action.col - 1 }, { r: action.row, c: action.col + 1 }
          ];
          for (const tile of adjacentTiles) {
            if (!canSpawnAtTile(state, tile.r, tile.c, role)) continue;
            const gemId = genId();
            state.units[gemId] = {
              id: gemId,
              owner: role,
              key: "gemshard",
              name: "Gem Shard",
              atk: 1,
              hp: 1,
              maxHp: 1,
              type: "structure",
              art: "/images/Gem Shard.png"
            };
            state.board[tile.r][tile.c] = gemId;
            
            // Apply polymorph to spawned gem if polymorph is active
            if (state.polymorphActive) {
              polymorphUnit(state, gemId);
            }
            
            logToLobby(lobby, card.name + " summons a Gem Shard!");
            break;
          }
        }
        
        // Rune Scribe - next spell costs 1 less
        if (card.effectId === "spell_discount") {
          if (!state.spellDiscount) state.spellDiscount = {};
          state.spellDiscount[role] = (state.spellDiscount[role] || 0) + 1;
          logToLobby(lobby, "Rune Scribe enchants - your next spell costs 1 less!");
        }
        
        // Wizard's Rune - draw a random wizard from deck
        if (card.effectId === "wizard_rune") {
          const player = lobby.gameState.players[role];
          const wizardsInDeck = player.deck.filter(c => WIZARD_CARDS.includes(c.key) && c.type === 'monster');
          if (wizardsInDeck.length > 0 && player.hand.length < MAX_HAND_SIZE) {
            const randomWizard = wizardsInDeck[Math.floor(Math.random() * wizardsInDeck.length)];
            // Remove from deck and add to hand
            const wizardIndex = player.deck.findIndex(c => c.id === randomWizard.id);
            if (wizardIndex !== -1) {
              player.deck.splice(wizardIndex, 1);
              player.hand.push(randomWizard);
              logToLobby(lobby, "Wizard's Rune draws " + randomWizard.name + " from the deck!");
            }
          } else if (wizardsInDeck.length === 0) {
            logToLobby(lobby, "Wizard's Rune finds no wizards in the deck!");
          } else {
            logToLobby(lobby, "Wizard's Rune - hand is full!");
          }
        }
        
        // Chrono Drake - Time Rift: show discard selection to resurrect a unit
        if (card.effectId === "time_rift") {
          const player = players[role];
          const unitsInDiscard = player.discard.filter(c => c.type === "monster" || c.type === "structure");
          
          if (unitsInDiscard.length > 0) {
            // Store the deploy position for resurrection
            const deployPos = { r: action.row, c: action.col };
            
            // Check if this is AI - auto-select the best unit
            if (lobby.isAIGame && role === "silver") {
              // AI auto-selects the highest cost unit (most valuable)
              const sortedUnits = unitsInDiscard.sort((a, b) => (b.cost || 0) - (a.cost || 0));
              const bestUnit = sortedUnits[0];
              
              // Find an adjacent empty tile to deploy
              const adjacentPositions = [
                { r: deployPos.r - 1, c: deployPos.c },
                { r: deployPos.r + 1, c: deployPos.c },
                { r: deployPos.r, c: deployPos.c - 1 },
                { r: deployPos.r, c: deployPos.c + 1 }
              ];
              
              let spawnPos = null;
              for (const pos of adjacentPositions) {
                if (pos.r >= 0 && pos.r < 7 && pos.c >= 0 && pos.c < 5 && !state.board[pos.r][pos.c]) {
                  spawnPos = pos;
                  break;
                }
              }
              
              if (spawnPos && bestUnit) {
                // Remove from discard
                const idx = player.discard.findIndex(c => c.id === bestUnit.id);
                if (idx !== -1) {
                  player.discard.splice(idx, 1);
                  
                  // Resurrect the unit
                  const id = genId();
                  const fullHp = bestUnit.maxHp || bestUnit.hp;
                  state.units[id] = {
                    id,
                    owner: role,
                    key: bestUnit.key,
                    name: bestUnit.name,
                    atk: bestUnit.atk,
                    hp: fullHp,
                    maxHp: fullHp,
                    cost: bestUnit.cost,
                    type: bestUnit.type,
                    effect: bestUnit.effect,
                    effectId: bestUnit.effectId,
                    effectDesc: bestUnit.effectDesc,
                    art: bestUnit.art,
                    originalCard: bestUnit
                  };
                  if (bestUnit.stationary) state.units[id].stationary = true;
                  state.board[spawnPos.r][spawnPos.c] = id;
                  state.movedThisTurn.add(id);
                  
                  logToLobby(lobby, "Time Rift resurrects " + bestUnit.name + "!");
                }
              } else {
                logToLobby(lobby, "No empty tile adjacent to Chrono Drake for resurrection!");
              }
            } else {
              // Human player - wait for selection
              if (!state.pendingTimeRift) state.pendingTimeRift = {};
              state.pendingTimeRift[role] = {
                active: true,
                deployPos: deployPos
              };
              
              logToLobby(lobby, "Chrono Drake opens a Time Rift! Choose a unit to resurrect.");
              
              // Emit event to client to show discard selection
              const socket = role === "gold" ? lobby.hostSocket : lobby.guestSocket;
              if (socket) {
                socket.emit("timeRiftTrigger", { 
                  units: unitsInDiscard.map(c => ({ id: c.id, key: c.key, name: c.name, atk: c.atk, hp: c.maxHp || c.hp, art: c.art })),
                  deployPos: deployPos
                });
              }
            }
          } else {
            logToLobby(lobby, "Chrono Drake finds no units in discard to resurrect!");
          }
        }
        
        // Armory deployed - show green cross heal effect on all existing friendly units
        if (card.effectId === "armory_buff") {
          const armoryPos = { r: action.row, c: action.col };
          const buffedPositions = [];
          for (const uid in state.units) {
            const unit = state.units[uid];
            if (unit.owner === role && uid !== id && unit.effectId !== "armory_buff") {
              const unitPos = getUnitPos(state, uid);
              if (unitPos) buffedPositions.push({ r: unitPos.r, c: unitPos.c });
            }
          }
          if (buffedPositions.length > 0) {
            const animData = { type: "effect", effectType: "heal_pulse", sourcePos: armoryPos, targets: buffedPositions };
            if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
            if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
          }
        }
        
        logToLobby(lobby, role.toUpperCase() + " played " + card.name);
        emitSFX(lobby, card.key, 'deploy'); // Play deploy sound
      }
      break;
    }
    
    case "move": {
      const u = state.units[action.unitId];
      if (!u || u.owner !== role) return;
      
      // Check if unit is stationary (cannot move at all)
      if (u.stationary) return;
      
      // Check if unit is rooted
      if (u.rooted) return;
      
      // Check if unit is stunned (Divine Judgment violence)
      if (u.stunned) {
        logToLobby(lobby, `${u.name} is stunned by Divine Judgment and cannot act!`);
        return;
      }
      
      // Check if unit is frozen (Temporal Stasis or Obsidian gem)
      console.log(`[MOVE] ${u.name} (${action.unitId}) attempting move, frozen = ${u.frozen}`);
      if (u.frozen) {
        console.log(`[MOVE] BLOCKED - ${u.name} is frozen!`);
        logToLobby(lobby, `${u.name} is frozen and cannot move!`);
        return;
      }
      
      // Check if unit is adjacent to Coffin Trapper (root_aura)
      const fromPos = getUnitPos(state, action.unitId);
      if (fromPos) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = fromPos.r + dr, nc = fromPos.c + dc;
            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
            const adjId = state.board[nr][nc];
            if (adjId && state.units[adjId] && state.units[adjId].owner !== role && state.units[adjId].effectId === "root_aura") {
              return; // Can't move - rooted by Coffin Trapper
            }
          }
        }
      }
      
      const moveCount = state.moveCountThisTurn[action.unitId] || 0;
      const canDoubleMove = u.effectId === "double_move" || playerHasBuff(state, role, "move_buff");
      const canTripleMove = u.effectId === "triple_move";
      const canLongMove = u.effectId === "stampede"; // 2 tiles cardinal, 1 move per turn
      const hasUnlimitedMoves = u.gemBuffs && u.gemBuffs.unlimitedMoves; // Diamond gem buff
      const eclipseMoveBonus = u.eclipseMoveBonus || 0; // Eclipse +moves effect
      const baseMoves = canTripleMove ? 3 : (canDoubleMove ? 2 : 1);
      const maxMoves = hasUnlimitedMoves ? 999 : (baseMoves + eclipseMoveBonus);
      console.log(`[MOVE] ${u.name}: moveCount=${moveCount}, maxMoves=${maxMoves}, unlimitedMoves=${hasUnlimitedMoves}, eclipseBonus=${eclipseMoveBonus}, gemBuffs=${JSON.stringify(u.gemBuffs)}`);
      if (moveCount >= maxMoves) return;
      
      const from = getUnitPos(state, action.unitId);
      if (!from) return;
      if (state.board[action.toRow][action.toCol]) return;
      
      // Validate move distance
      const rowDist = Math.abs(from.r - action.toRow);
      const colDist = Math.abs(from.c - action.toCol);
      
      let validMove = false;
      // Adjacent move (all units can do this)
      if (rowDist <= 1 && colDist <= 1 && !(rowDist === 0 && colDist === 0)) {
        validMove = true;
      }
      // Stampede: 2 tiles cardinal, path must be clear
      if (canLongMove && !validMove) {
        const isStraightLine = (rowDist <= 2 && colDist === 0) || (colDist <= 2 && rowDist === 0);
        if (isStraightLine) {
          let pathClear = true;
          if (rowDist === 2 && colDist === 0) {
            const midRow = from.r + (action.toRow > from.r ? 1 : -1);
            if (state.board[midRow][from.c]) pathClear = false;
          } else if (colDist === 2 && rowDist === 0) {
            const midCol = from.c + (action.toCol > from.c ? 1 : -1);
            if (state.board[from.r][midCol]) pathClear = false;
          }
          if (pathClear) validMove = true;
        }
      }
      
      if (!validMove) return;
      
      // Can't move into enemy home rows with HP
      const enemy = enemyOf(role);
      const isEnemyHomeRow = (enemy === "gold" && action.toRow <= 1) || (enemy === "silver" && action.toRow >= 5);
      if (isEnemyHomeRow && state.rowHP[action.toRow] > 0) return;
      
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", { type: "move", unitId: action.unitId, fromRow: from.r, fromCol: from.c, toRow: action.toRow, toCol: action.toCol });
      state.board[from.r][from.c] = null;
      state.board[action.toRow][action.toCol] = action.unitId;
      
      // Check for blood chalice consumption
      checkChaliceConsumption(lobby, action.unitId, action.toRow, action.toCol);
      
      state.moveCountThisTurn[action.unitId] = moveCount + 1;
      if (state.moveCountThisTurn[action.unitId] >= maxMoves) {
        state.movedThisTurn.add(action.unitId);
      }
      recomputeOwners(state);
      logToLobby(lobby, role.toUpperCase() + " moved");
      break;
    }
    
    case "moveFromSpawn": {
      if (state.spawn[role] !== action.unitId) return;
      const u = state.units[action.unitId];
      if (!u) return;
      if (state.board[action.toRow][action.toCol]) return;
      state.spawn[role] = null;
      state.board[action.toRow][action.toCol] = action.unitId;
      state.movedThisTurn.add(action.unitId);
      
      // Check for blood chalice consumption
      checkChaliceConsumption(lobby, action.unitId, action.toRow, action.toCol);
      
      recomputeOwners(state);
      
      // Process on-deploy effects when unit enters board from spawn
      if (u.effectId === "gem_spawn") {
        const adjacentTiles = [
          { r: action.toRow - 1, c: action.toCol }, { r: action.toRow + 1, c: action.toCol },
          { r: action.toRow, c: action.toCol - 1 }, { r: action.toRow, c: action.toCol + 1 }
        ];
        for (const tile of adjacentTiles) {
          if (!canSpawnAtTile(state, tile.r, tile.c, role)) continue;
          const gemId = genId();
          state.units[gemId] = {
            id: gemId,
            owner: role,
            key: "gemshard",
            name: "Gem Shard",
            atk: 1,
            hp: 1,
            maxHp: 1,
            type: "structure",
            art: "/images/Gem Shard.png"
          };
          state.board[tile.r][tile.c] = gemId;
          
          // Apply polymorph to spawned gem if polymorph is active
          if (state.polymorphActive) {
            polymorphUnit(state, gemId);
          }
          
          logToLobby(lobby, u.name + " summons a Gem Shard!");
          break;
        }
      }
      
      logToLobby(lobby, role.toUpperCase() + "'s " + u.name + " entered board");
      break;
    }
    
    case "attackUnit": {
      const a = state.units[action.attackerId];
      const t = state.units[action.targetId];
      if (!a || !t || a.owner !== role) return;
      
      // Handle Opal Devourer consuming friendly Gem Shards
      const isConsumeGem = a.effectId === "consume_gem" && t.owner === role && t.key === "gemshard";
      if (isConsumeGem) {
        const tp = getUnitPos(state, action.targetId);
        if (!tp) return;
        
        // Opal Devourer consumes friendly Gem Shard for +2/+2
        a.atk += 2;
        a.hp += 2;
        a.maxHp = (a.maxHp || a.hp) + 2;
        logToLobby(lobby, a.name + " devours " + t.name + "! +2/+2 (now " + a.atk + "/" + a.hp + ")");
        
        // Process death effects (Prismatic Fairy triggers)
        processOnDeathEffect(lobby, t, t.owner, { r: tp.r, c: tp.c });
        processAllyDeathTriggers(lobby, t.owner, t, { r: tp.r, c: tp.c });
        
        state.board[tp.r][tp.c] = null;
        discardUnitCard(lobby, t);
        delete state.units[action.targetId];
        if (!state.attackCountThisTurn) state.attackCountThisTurn = {};
        state.attackCountThisTurn[action.attackerId] = (state.attackCountThisTurn[action.attackerId] || 0) + 1;
        state.attackedThisTurn.add(action.attackerId);
        return;
      }
      
      // Check attack count - base 1 attack, +1 for canDoubleAttack (spell), +N for topaz gem buffs
      const attackCount = state.attackCountThisTurn?.[action.attackerId] || 0;
      const baseAttacks = 1;
      const doubleAttackBonus = a.canDoubleAttack ? 1 : 0;
      const topazBonus = (a.gemBuffs && a.gemBuffs.extraAttacks) || 0;
      const bloodBiteBonus = a.effectId === "blood_bite" ? 1 : 0; const maxAttacks = baseAttacks + doubleAttackBonus + bloodBiteBonus + topazBonus;
      
      console.log(`[ATTACK] ${a.name} (${action.attackerId}): attackCount=${attackCount}, maxAttacks=${maxAttacks} (base=${baseAttacks}, double=${doubleAttackBonus}, topaz=${topazBonus}), frozen=${a.frozen}`);
      
      if (attackCount >= maxAttacks) return;
      
      // Check if attacker is frozen
      if (a.frozen) {
        console.log(`[ATTACK] BLOCKED - ${a.name} is frozen!`);
        return;
      }
      
      // Check if attacker is stunned (Divine Judgment violence)
      if (a.stunned) {
        logToLobby(lobby, `${a.name} is stunned by Divine Judgment and cannot act!`);
        return;
      }
      
      const ap = getUnitPos(state, action.attackerId);
      const tp = getUnitPos(state, action.targetId);
      if (!ap || !tp) return;
      
      // Combat log header
      combatLogToLobby(lobby, `⚔️ ${a.name} attacks ${t.name}`, "combat-header");
      combatLogToLobby(lobby, `Base ATK: ${a.atk}`, "combat-step");
      
      let dmg = getEffectiveAtk(state, action.attackerId, action.targetId);
      if (a.effectId === "blood_bite" && (state.attackCountThisTurn?.[action.attackerId] || 0) >= 1) dmg = 1;
      if (dmg !== a.atk) {
        combatLogToLobby(lobby, `Modified ATK: ${dmg} (buffs/debuffs applied)`, "combat-step");
      }
      
      const dmgBeforeReduction = dmg;
      dmg = applyDamageReduction(state, action.targetId, dmg, action.attackerId, lobby);
      if (dmg !== dmgBeforeReduction) {
        combatLogToLobby(lobby, `Damage reduced: ${dmgBeforeReduction} → ${dmg} (Shield Bearer/armor)`, "combat-step");
      }
      
      const before = t.hp;
      t.hp -= dmg;
      
      combatLogToLobby(lobby, `${t.name}: ${before} HP - ${dmg} damage = ${t.hp} HP`, "combat-result");
      
      // Emit attack animation (attacker budges toward target, target shakes)
      const attackAnim = { type: "attack", attackerRow: ap.r, attackerCol: ap.c, targetRow: tp.r, targetCol: tp.c };
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", attackAnim);
      if (lobby.guestSocket) lobby.guestSocket.emit("animate", attackAnim);
      
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", { type: "damage", row: tp.r, col: tp.c });
      
      // Play attack sound for attacker
      emitSFX(lobby, a.key, 'attack');
      
      // Track attack count
      if (!state.attackCountThisTurn) state.attackCountThisTurn = {};
      state.attackCountThisTurn[action.attackerId] = (state.attackCountThisTurn[action.attackerId] || 0) + 1;
      
      // Add to attackedThisTurn set if at max attacks (for UI highlighting)
      const newAttackCount = state.attackCountThisTurn[action.attackerId];
      if (newAttackCount >= maxAttacks) {
        state.attackedThisTurn.add(action.attackerId);
      }
      
      logToLobby(lobby, a.name + " deals " + dmg + " to " + t.name);
      
      // Cinderwing splash_random - deal 1 damage to another random enemy on attack
      if (a.effectId === "splash_random") {
        const otherEnemies = [];
        for (const uid in state.units) {
          if (state.units[uid].owner !== role && uid !== action.targetId && !state.units[uid].untargetable) {
            otherEnemies.push(uid);
          }
        }
        if (otherEnemies.length > 0) {
          const splashTargetId = otherEnemies[Math.floor(Math.random() * otherEnemies.length)];
          const splashTarget = state.units[splashTargetId];
          const splDmg = applyDamageReduction(state, splashTargetId, 1, action.attackerId, lobby);
          splashTarget.hp -= splDmg;
          logToLobby(lobby, a.name + "'s flames splash " + splashTarget.name + " for " + splDmg + " damage!");
          if (splashTarget.hp <= 0 && shouldUnitDie(lobby, splashTarget)) {
            const splashPos = getUnitPos(state, splashTargetId);
            processOnDeathEffect(lobby, splashTarget, splashTarget.owner, splashPos);
            processAllyDeathTriggers(lobby, splashTarget.owner, splashTarget, splashPos);
            if (splashPos) state.board[splashPos.r][splashPos.c] = null;
            discardUnitCard(lobby, splashTarget);
            delete state.units[splashTargetId];
            logToLobby(lobby, splashTarget.name + " destroyed by splash damage!");
          }
        }
      }
      
      // Spore Titan - deals 1 damage to enemies adjacent to the TARGET
      if (a.effectId === "half_damage_aura" && tp) {
        const splashPositions = [
          { r: tp.r, c: tp.c - 1 },
          { r: tp.r, c: tp.c + 1 },
          { r: tp.r - 1, c: tp.c },
          { r: tp.r + 1, c: tp.c }
        ];
        const hitPositions = [];
        for (const sp of splashPositions) {
          if (sp.r < 0 || sp.r >= ROWS || sp.c < 0 || sp.c >= COLS) continue;
          const splashId = state.board[sp.r][sp.c];
          if (splashId && state.units[splashId] && state.units[splashId].owner !== role) {
            const splashTarget = state.units[splashId];
            if (splashTarget.untargetable) continue;
            const spDmg = applyDamageReduction(state, splashId, 1, action.attackerId, lobby); splashTarget.hp -= spDmg;
            hitPositions.push({ r: sp.r, c: sp.c });
            logToLobby(lobby, a.name + " spore damages " + splashTarget.name + " for 1");
            if (splashTarget.hp <= 0 && shouldUnitDie(lobby, splashTarget)) {
              processOnDeathEffect(lobby, splashTarget, splashTarget.owner, { r: sp.r, c: sp.c });
              processAllyDeathTriggers(lobby, splashTarget.owner, splashTarget, { r: sp.r, c: sp.c });
              state.board[sp.r][sp.c] = null;
              discardUnitCard(lobby, splashTarget);
              delete state.units[splashId];
              logToLobby(lobby, splashTarget.name + " destroyed by spores!");
            }
          }
        }
        // Emit spore cloud animation
        if (hitPositions.length > 0) {
          const animData = {
            type: "effect",
            effectType: "spore_cloud",
            sourcePos: tp,
            targets: hitPositions
          };
          if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
          if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
        }
      }
      
      // Archangel Gabriel - deal 1 to all enemies in target's row
      if (a.effectId === "gabriel_wrath" && tp) {
        let rowDamage = 0;
        const toRemoveRow = [];
        for (let c = 0; c < COLS; c++) {
          const uid = state.board[tp.r][c];
          if (uid && uid !== action.targetId && state.units[uid] && state.units[uid].owner !== role) {
            const rwDmg = applyDamageReduction(state, uid, 1, action.attackerId, lobby); state.units[uid].hp -= rwDmg;
            rowDamage++;
            if (state.units[uid].hp <= 0 && shouldUnitDie(lobby, state.units[uid])) {
              toRemoveRow.push({ uid, pos: { r: tp.r, c } });
            }
          }
        }
        for (const { uid, pos } of toRemoveRow) {
          const deadUnit = state.units[uid];
          processOnDeathEffect(lobby, deadUnit, deadUnit.owner, pos);
          processAllyDeathTriggers(lobby, deadUnit.owner, deadUnit, pos);
          state.board[pos.r][pos.c] = null;
          discardUnitCard(lobby, deadUnit);
          delete state.units[uid];
        }
        if (rowDamage > 0) {
          logToLobby(lobby, a.name + "'s wrath deals 1 damage to " + rowDamage + " enemies in the row!");
        }
      }
      
      // Blessing of Might - gain +1 ATK on attack
      if (a.mightBlessing) {
        a.atk += 1;
        // Track the buff (incremental from blessing)
        if (!a.permBuffs) a.permBuffs = [];
        a.permBuffs.push({ atk: 1, hp: 0, source: "Blessing of Might (on attack)" });
        logToLobby(lobby, a.name + "'s Blessing of Might grants +1 ATK!");
        triggerStatGainEffects(lobby, 'atk', 1, action.attackerId);
      }
      
      // Blessing of Vigor - attacker gains energy
      if (a.vigorBlessing) {
        const players = lobby.gameState.players;
        players[role].energy = Math.min(players[role].energy + 1, players[role].maxEnergy);
        logToLobby(lobby, a.name + "'s Blessing of Vigor grants 1 energy!");
      }
      
      // Blessing of Kings - attacker draws
      if (a.kingsBlessing) {
        drawCards(lobby, role, 1);
        logToLobby(lobby, a.name + "'s Blessing of Kings draws a card!");
      }
      
      // Blessing of Vigor/Kings on DEFENDER being attacked
      if (t.vigorBlessing && t.owner !== role) {
        const players = lobby.gameState.players;
        players[t.owner].energy = Math.min(players[t.owner].energy + 1, players[t.owner].maxEnergy);
        logToLobby(lobby, t.name + "'s Blessing of Vigor grants 1 energy!");
      }
      if (t.kingsBlessing && t.owner !== role) {
        drawCards(lobby, t.owner, 1);
        logToLobby(lobby, t.name + "'s Blessing of Kings draws a card!");
      }
      
      // Arcane Tether - when damaged, deal 1 damage to nearest enemy
      if (t.effectId === "arcane_link" && t.hp > 0) {
        let nearestEnemy = null;
        let nearestDist = Infinity;
        for (const uid in state.units) {
          if (state.units[uid].owner !== t.owner && uid !== action.attackerId && !state.units[uid].untargetable) {
            const enemyPos = getUnitPos(state, uid);
            if (enemyPos) {
              const dist = Math.abs(tp.r - enemyPos.r) + Math.abs(tp.c - enemyPos.c);
              if (dist < nearestDist) {
                nearestDist = dist;
                nearestEnemy = uid;
              }
            }
          }
        }
        if (nearestEnemy) {
          const linkTarget = state.units[nearestEnemy];
          const lnkDmg = applyDamageReduction(state, nearestEnemy, 1, action.attackerId, lobby); linkTarget.hp -= lnkDmg;
          logToLobby(lobby, t.name + "'s arcane link zaps " + linkTarget.name + " for 1 damage!");
          if (linkTarget.hp <= 0 && shouldUnitDie(lobby, linkTarget)) {
            const linkPos = getUnitPos(state, nearestEnemy);
            processOnDeathEffect(lobby, linkTarget, linkTarget.owner, linkPos);
            processAllyDeathTriggers(lobby, linkTarget.owner, linkTarget, linkPos);
            if (linkPos) state.board[linkPos.r][linkPos.c] = null;
            discardUnitCard(lobby, linkTarget);
            delete state.units[nearestEnemy];
            logToLobby(lobby, linkTarget.name + " destroyed by arcane link!");
          }
        }
      }
      
      // Mirror Wizard - arcane reflection: deal damage back to attacker
      if (t.effectId === "arcane_reflection" && t.hp > 0 && a && state.units[action.attackerId]) {
        const reflectDmg = dmg;
        const beforeAttacker = a.hp;
        a.hp -= reflectDmg;
        
        combatLogToLobby(lobby, `🪞 ${t.name} - Arcane Reflection`, "combat-header");
        combatLogToLobby(lobby, `${a.name}: ${beforeAttacker} HP - ${reflectDmg} = ${a.hp} HP`, "combat-result");
        logToLobby(lobby, t.name + " reflects " + reflectDmg + " damage back to " + a.name + "!");
        
        // Emit animation for reflection damage
        emitEffectAnimation(lobby, null, [{ r: ap.r, c: ap.c }], "arcane_reflection");
        
        if (a.hp <= 0 && shouldUnitDie(lobby, a)) {
          combatLogToLobby(lobby, `💀 ${a.name} DESTROYED by reflection`, "combat-death");
          processOnDeathEffect(lobby, a, a.owner, ap);
          processAllyDeathTriggers(lobby, a.owner, a, ap);
          state.board[ap.r][ap.c] = null;
          discardUnitCard(lobby, a);
          delete state.units[action.attackerId];
          logToLobby(lobby, a.name + " destroyed by arcane reflection!");
        }
      }
      
      if (t.hp <= 0 && shouldUnitDie(lobby, t)) {
        combatLogToLobby(lobby, `💀 ${t.name} DESTROYED (${t.hp} HP)`, "combat-death");
        if (lobby.hostSocket) lobby.hostSocket.emit("animate", { type: "destroy", row: tp.r, col: tp.c });
        processOnDeathEffect(lobby, t, t.owner, { r: tp.r, c: tp.c }, action.attackerId);
        processAllyDeathTriggers(lobby, t.owner, t, { r: tp.r, c: tp.c });
        processOnKillEffect(lobby, action.attackerId, role, { r: tp.r, c: tp.c }, t);
        if (!state.board[tp.r][tp.c] || state.board[tp.r][tp.c] === action.targetId) {
          state.board[tp.r][tp.c] = null;
        }
        discardUnitCard(lobby, t);
        delete state.units[action.targetId];
        logToLobby(lobby, t.name + " destroyed!");
        recomputeOwners(state);
      }
      break;
    }
    
    case "attackRow": {
      const a = state.units[action.attackerId];
      if (!a || a.owner !== role) return;
      
      // Check attack count - base 1 attack, +1 for canDoubleAttack (spell), +N for topaz gem buffs
      const attackCount = state.attackCountThisTurn?.[action.attackerId] || 0;
      const baseAttacks = 1;
      const doubleAttackBonus = a.canDoubleAttack ? 1 : 0;
      const topazBonus = (a.gemBuffs && a.gemBuffs.extraAttacks) || 0;
      const bloodBiteBonus = a.effectId === "blood_bite" ? 1 : 0; const maxAttacks = baseAttacks + doubleAttackBonus + bloodBiteBonus + topazBonus;
      
      if (attackCount >= maxAttacks) return;
      if (state.rowHP[action.row] <= 0) return;
      
      const ap = getUnitPos(state, action.attackerId);
      
      let dmg = getEffectiveAtk(state, action.attackerId);
      if (a.effectId === "blood_bite" && (state.attackCountThisTurn?.[action.attackerId] || 0) >= 1) dmg = 1;
      const rowLetter = String.fromCharCode(65 + action.row);
      
      // Combat log for row attack
      combatLogToLobby(lobby, `⚔️ ${a.name} attacks Row ${rowLetter}`, "combat-header");
      combatLogToLobby(lobby, `Base ATK: ${a.atk}`, "combat-step");
      
      if (a.effectId === "siege") {
        combatLogToLobby(lobby, `Siege bonus: ${dmg} × 2 = ${dmg * 2}`, "combat-step");
        dmg *= 2;
      }
      
      const beforeRowHP = state.rowHP[action.row];
      state.rowHP[action.row] = Math.max(0, state.rowHP[action.row] - dmg);
      
      // Track attack count
      if (!state.attackCountThisTurn) state.attackCountThisTurn = {};
      state.attackCountThisTurn[action.attackerId] = (state.attackCountThisTurn[action.attackerId] || 0) + 1;
      
      // Add to attackedThisTurn set if at max attacks (for UI highlighting)
      const newAttackCount = state.attackCountThisTurn[action.attackerId];
      if (newAttackCount >= maxAttacks) {
        state.attackedThisTurn.add(action.attackerId);
      }
      
      // Play attack sound
      emitSFX(lobby, a.key, 'attack');
      
      // Emit attack animation (attacker budges toward the row)
      if (ap) {
        const attackAnim = { type: "attack", attackerRow: ap.r, attackerCol: ap.c, targetRow: action.row, targetCol: ap.c };
        if (lobby.hostSocket) lobby.hostSocket.emit("animate", attackAnim);
        if (lobby.guestSocket) lobby.guestSocket.emit("animate", attackAnim);
      }
      
      combatLogToLobby(lobby, `Row ${rowLetter}: ${beforeRowHP} HP - ${dmg} damage = ${state.rowHP[action.row]} HP`, "combat-result");
      logToLobby(lobby, a.name + " attacks row for " + dmg);
      
      if (state.rowHP[action.row] <= 0) {
        combatLogToLobby(lobby, `💀 Row ${rowLetter} DESTROYED!`, "combat-death");
        logToLobby(lobby, "Row " + rowLetter + " destroyed!");
        // Deal overflow to heart
        const overflow = Math.max(0, dmg - beforeRowHP);
        if (overflow > 0) {
          combatLogToLobby(lobby, `Overflow damage: ${overflow} to Heart`, "combat-step");
        }
        if (action.row <= 1) {
          state.heartHP.gold = Math.max(0, state.heartHP.gold - overflow);
          if (state.heartHP.gold <= 0) {
            state.gameOver = true;
            state.winner = role;
            logToLobby(lobby, role.toUpperCase() + " WINS!");
          }
        }
      }
      break;
    }
    
    case "attackFromSpawn": {
      // AI attacking from spawn position
      const attackerId = state.spawn[role];
      if (!attackerId || attackerId !== action.attackerId) return;
      const a = state.units[attackerId];
      const t = state.units[action.targetId];
      if (!a || !t || a.owner !== role || t.owner === role) return;
      
      // Check attack count - base 1 attack, +1 for canDoubleAttack (spell), +N for topaz gem buffs
      const attackCount = state.attackCountThisTurn?.[attackerId] || 0;
      const baseAttacks = 1;
      const doubleAttackBonus = a.canDoubleAttack ? 1 : 0;
      const topazBonus = (a.gemBuffs && a.gemBuffs.extraAttacks) || 0;
      const bloodBiteBonus = a.effectId === "blood_bite" ? 1 : 0; const maxAttacks = baseAttacks + doubleAttackBonus + bloodBiteBonus + topazBonus;
      
      if (attackCount >= maxAttacks) return;
      
      const tp = getUnitPos(state, action.targetId);
      if (!tp) return;
      
      // Spawn can attack units in adjacent row (row 6 for silver)
      const adjRow = role === "gold" ? 0 : 6;
      if (tp.r !== adjRow) return;
      
      // Combat log header
      combatLogToLobby(lobby, `⚔️ ${a.name} (spawn) attacks ${t.name}`, "combat-header");
      combatLogToLobby(lobby, `Base ATK: ${a.atk}`, "combat-step");
      
      let dmg = getEffectiveAtk(state, attackerId, action.targetId);
      if (a.effectId === "blood_bite" && (state.attackCountThisTurn?.[attackerId] || 0) >= 1) dmg = 1;
      if (dmg !== a.atk) {
        combatLogToLobby(lobby, `Modified ATK: ${dmg} (buffs/debuffs applied)`, "combat-step");
      }
      
      const dmgBeforeReduction = dmg;
      dmg = applyDamageReduction(state, action.targetId, dmg, attackerId, lobby);
      if (dmg !== dmgBeforeReduction) {
        combatLogToLobby(lobby, `Damage reduced: ${dmgBeforeReduction} → ${dmg} (Shield Bearer/armor)`, "combat-step");
      }
      
      const before = t.hp;
      t.hp -= dmg;
      
      // Track attack count
      if (!state.attackCountThisTurn) state.attackCountThisTurn = {};
      state.attackCountThisTurn[attackerId] = (state.attackCountThisTurn[attackerId] || 0) + 1;
      
      // Add to attackedThisTurn set if at max attacks (for UI highlighting)
      const newAttackCount = state.attackCountThisTurn[attackerId];
      if (newAttackCount >= maxAttacks) {
        state.attackedThisTurn.add(attackerId);
      }
      
      combatLogToLobby(lobby, `${t.name}: ${before} HP - ${dmg} damage = ${t.hp} HP`, "combat-result");
      
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", { type: "damage", row: tp.r, col: tp.c });
      
      // Play attack sound for attacker
      emitSFX(lobby, a.key, 'attack');
      
      logToLobby(lobby, a.name + " (from spawn) deals " + dmg + " to " + t.name);
      
      // Mirror Wizard - arcane reflection: deal FULL damage back to attacker in spawn
      if (t.effectId === "arcane_reflection" && t.hp > 0 && dmg > 0 && state.spawn[role]) {
        // Spawn unit takes reflection damage
        const spawnUnit = state.spawn[role];
        const beforeSpawn = spawnUnit.hp;
        spawnUnit.hp -= dmg;
        
        combatLogToLobby(lobby, `🪞 ${t.name} - Arcane Reflection`, "combat-header");
        combatLogToLobby(lobby, `${a.name}: ${beforeSpawn} HP - ${dmg} = ${spawnUnit.hp} HP`, "combat-result");
        logToLobby(lobby, t.name + " reflects " + dmg + " damage back to " + a.name + " in spawn!");
        
        if (spawnUnit.hp <= 0) {
          logToLobby(lobby, a.name + " destroyed by arcane reflection!");
          delete state.spawn[role];
        }
      }
      
      if (t.hp <= 0 && shouldUnitDie(lobby, t)) {
        combatLogToLobby(lobby, `💀 ${t.name} DESTROYED (${t.hp} HP)`, "combat-death");
        if (lobby.hostSocket) lobby.hostSocket.emit("animate", { type: "destroy", row: tp.r, col: tp.c });
        processOnDeathEffect(lobby, t, t.owner, { r: tp.r, c: tp.c });
        processAllyDeathTriggers(lobby, t.owner, t, { r: tp.r, c: tp.c });
        processOnKillEffect(lobby, attackerId, role, { r: tp.r, c: tp.c }, t);
        state.board[tp.r][tp.c] = null;
        discardUnitCard(lobby, t);
        delete state.units[action.targetId];
        logToLobby(lobby, t.name + " destroyed!");
        recomputeOwners(state);
      }
      break;
    }
    
    case "attackHeart": {
      const a = state.units[action.attackerId];
      if (!a || a.owner !== role) return;
      
      // Check attack count - base 1 attack, +1 for canDoubleAttack (spell), +N for topaz gem buffs
      const attackCount = state.attackCountThisTurn?.[action.attackerId] || 0;
      const baseAttacks = 1;
      const doubleAttackBonus = a.canDoubleAttack ? 1 : 0;
      const topazBonus = (a.gemBuffs && a.gemBuffs.extraAttacks) || 0;
      const bloodBiteBonus = a.effectId === "blood_bite" ? 1 : 0; const maxAttacks = baseAttacks + doubleAttackBonus + bloodBiteBonus + topazBonus;
      
      if (attackCount >= maxAttacks) return;
      
      const target = action.target; // 'gold' or 'silver'
      if (target === role) return; // Can't attack own heart
      
      const pos = getUnitPos(state, action.attackerId);
      if (!pos) return;
      
      // Check if walls are down (both defensive rows must be destroyed)
      if (target === "gold" && (state.rowHP[0] > 0 || state.rowHP[1] > 0)) return;
      if (target === "silver" && (state.rowHP[5] > 0 || state.rowHP[6] > 0)) return;
      
      // Check range - must be in heart row or within ranged distance
      const heartRow = target === "gold" ? 0 : 6;
      const distance = Math.abs(pos.r - heartRow);
      const isRanged = a.effectId === "ranged" || a.effectId === "ranged_pierce" || a.effectId === "starweave_ranged" || a.effectId === "seraphic_range" || a.range;
      // Ranged units can attack heart from (range - 1) rows away (range 2 = 1 row, range 3 = 2 rows)
      const maxRange = a.range ? (a.range - 1) : (isRanged ? 1 : 0);
      if (distance > maxRange) return;
      
      // Combat log header
      combatLogToLobby(lobby, `⚔️ ${a.name} attacks ${target.toUpperCase()} HEART`, "combat-header");
      combatLogToLobby(lobby, `Base ATK: ${a.atk}`, "combat-step");
      
      let dmg = getEffectiveAtk(state, action.attackerId);
      if (a.effectId === "blood_bite" && (state.attackCountThisTurn?.[action.attackerId] || 0) >= 1) dmg = 1;
      if (a.effectId === "stampede") {
        combatLogToLobby(lobby, `Stampede bonus: +2 vs structures`, "combat-step");
        dmg += 2;
      }
      
      const beforeHP = state.heartHP[target];
      
      // Track attack count
      if (!state.attackCountThisTurn) state.attackCountThisTurn = {};
      state.attackCountThisTurn[action.attackerId] = (state.attackCountThisTurn[action.attackerId] || 0) + 1;
      
      // Add to attackedThisTurn set if at max attacks (for UI highlighting)
      const newAttackCount = state.attackCountThisTurn[action.attackerId];
      if (newAttackCount >= maxAttacks) {
        state.attackedThisTurn.add(action.attackerId);
      }
      
      state.heartHP[target] = Math.max(0, state.heartHP[target] - dmg);
      
      // Play attack sound
      emitSFX(lobby, a.key, 'attack');
      
      // Emit attack animation (attacker budges toward the heart)
      const attackAnim = { type: "attack", attackerRow: pos.r, attackerCol: pos.c, targetRow: heartRow, targetCol: pos.c };
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", attackAnim);
      if (lobby.guestSocket) lobby.guestSocket.emit("animate", attackAnim);
      
      combatLogToLobby(lobby, `${target.toUpperCase()} Heart: ${beforeHP} HP - ${dmg} damage = ${state.heartHP[target]} HP`, "combat-result");
      logToLobby(lobby, a.name + " hits " + target.toUpperCase() + " HEART for " + dmg + "!");
      
      if (state.heartHP[target] <= 0) {
        combatLogToLobby(lobby, `💀 ${target.toUpperCase()} HEART DESTROYED!`, "combat-death");
        state.gameOver = true;
        state.winner = role;
        logToLobby(lobby, "=== " + target.toUpperCase() + " DESTROYED! " + role.toUpperCase() + " WINS! ===");
        
        // Handle campaign rewards for AI victory (shouldn't happen often!)
        if (lobby.isAIGame && role === "gold" && lobby.hostUserId && lobby.bossId) {
          handleCampaignVictory(lobby);
        }
      }
      break;
    }
  }
}

io.on("connection", (socket) => {
  // Send deck options - use original deck IDs but display as slot numbers
  // Slot 1 = medieval (always unlocked), Slots 2-8 unlock as you beat bosses
  const deckSlots = [
    { id: 'medieval', name: 'Deck Slot 1', description: 'Your first deck slot - always available!' },
    { id: 'void-alien', name: 'Deck Slot 2', description: 'Unlocked by beating The Hive Mind' },
    { id: 'western-skeleton', name: 'Deck Slot 3', description: 'Unlocked by beating The Dead Sheriff' },
    { id: 'crimson-court', name: 'Deck Slot 4', description: 'Unlocked by beating The Blood Countess' },
    { id: 'jeweled-court', name: 'Deck Slot 5', description: 'Unlocked by beating The Garnet Queen' },
    { id: 'elunes-chosen', name: 'Deck Slot 6', description: 'Unlocked by beating Moon Shadow Sentinel' },
    { id: 'dragon-wizard', name: 'Deck Slot 7', description: 'Unlocked by beating The Arcane Dragonlord' },
    { id: 'celestial-host', name: 'Deck Slot 8', description: 'Unlocked by beating The Seraph of Judgment' }
  ];
  socket.emit("deckList", deckSlots);
  socket.emit("campaignBosses", CAMPAIGN_BOSSES);

  socket.on("createLobby", (data) => {
    const code = generateLobbyCode();
    lobbies[code] = { 
      code, 
      hostSocket: socket, 
      guestSocket: null, 
      hostDeck: data.deckId || "medieval", 
      hostDeckName: data.deckName || null,
      guestDeck: null, 
      guestDeckName: null,
      hostReady: true, 
      guestReady: false, 
      gameStarted: false, 
      gameState: null, 
      log: [],
      hostUsername: data.username || "Guest",
      guestUsername: null,
      hostUserId: data.userId || null,
      guestUserId: null,
      isAIGame: false,
      aiLevel: 1
    };
    socket.data.lobbyCode = code; 
    socket.data.isHost = true;
    socket.data.username = data.username || "Guest";
    emitLobbyState(lobbies[code]);
  });

  // Start campaign game against AI
  socket.on("startCampaign", async (data) => {
    try {
    const { bossId, deckId, username, userId, difficulty } = data;
    const boss = CAMPAIGN_BOSSES.find(b => b.id === bossId);
    if (!boss) return socket.emit("lobbyError", "Invalid boss.");

    // Use client-selected difficulty (1=easy, 2=medium, 3=hard, 4=challenge), default to medium
    const aiLevel = difficulty || 2;
    const isChallenge = aiLevel === 4;

    // Determine which deck the boss will use
    let bossDeckId = boss.deckId;
    if (isChallenge && boss.challengeDeckId) {
      bossDeckId = boss.challengeDeckId;
    }

    // Check if auto-play is allowed (must have beaten this boss at this difficulty)
    let canAutoPlay = false;
    if (userId === 'admin') {
      // Admin can always auto-play
      canAutoPlay = true;
    } else if (userId) {
      try {
        const user = await User.findById(userId);
        if (user) {
          const starsEarned = user.campaign.stars.get(String(bossId)) || 0;
          // Can auto-play if they've beaten at this difficulty or higher
          // For challenge mode (4), they need to have beaten challenge mode
          if (starsEarned >= aiLevel) {
            canAutoPlay = true;
          }
        }
      } catch (err) {
        console.error('Error checking auto-play eligibility:', err);
      }
    }

    // Look up user's custom deck if they have one
    let customDeckCards = null;
    let deckMusic = 'default';
    let deckBackground = 'default';
    
    // Starter deck for new players (medieval cards)
    const STARTER_DECK = ['peasant','peasant','peasant','squire','squire','squire','archer','archer','archer','manatarms','manatarms','shieldbearer','shieldbearer','warhound','warhound','battlefieldmedic','battlefieldmedic','knight','knight','knight','crusader','royalguard','royalguard','paladin','siegeram'];
    
    // Handle admin custom decks
    if (userId === 'admin') {
      const customDeck = adminCustomDecks.find(d => d.id === deckId);
      if (customDeck && customDeck.cards && customDeck.cards.length >= 25) {
        customDeckCards = customDeck.cards;
        deckMusic = customDeck.music || 'default';
        deckBackground = customDeck.background || 'default';
      } else if (deckId === 'medieval') {
        // Admin gets starter deck if no custom deck built for slot 1
        customDeckCards = STARTER_DECK;
      } else {
        return socket.emit("lobbyError", "Please build a deck with at least 25 cards first.");
      }
    } else if (userId) {
      try {
        const user = await User.findById(userId);
        if (user) {
          const customDeck = user.customDecks.find(d => d.id === deckId);
          if (customDeck && customDeck.cards && customDeck.cards.length >= 25) {
            customDeckCards = customDeck.cards;
            deckMusic = customDeck.music || 'default';
            deckBackground = customDeck.background || 'default';
          } else if (deckId === 'medieval') {
            // New players get starter deck if no custom deck built for slot 1
            customDeckCards = STARTER_DECK;
          } else {
            return socket.emit("lobbyError", "Please build a deck with at least 25 cards first.");
          }
        } else {
          return socket.emit("lobbyError", "User not found. Please log in again.");
        }
      } catch (err) {
        console.error('Error loading custom deck:', err);
        return socket.emit("lobbyError", "Error loading deck. Please try again.");
      }
    } else {
      return socket.emit("lobbyError", "Please log in to play campaign.");
    }

    const code = generateLobbyCode();
    lobbies[code] = {
      code,
      hostSocket: socket,
      guestSocket: null,
      hostDeck: deckId || "medieval",
      guestDeck: bossDeckId,
      hostCustomDeckCards: customDeckCards, // Store for restart
      hostReady: true,
      guestReady: true,
      gameStarted: true,
      gameState: null,
      log: [],
      hostUsername: username || "Guest",
      guestUsername: boss.name + (isChallenge ? " (Challenge)" : ""),
      hostUserId: userId || null,
      guestUserId: null,
      isAIGame: true,
      aiLevel: isChallenge ? 3 : aiLevel, // Challenge mode uses hard AI
      bossId: bossId,
      isChallenge: isChallenge,
      ai: new GameAI(isChallenge ? 3 : aiLevel),
      canAutoPlay: canAutoPlay,
      autoPlay: false, // Start with auto-play off, player can toggle it
      playerAI: canAutoPlay ? new GameAI(2, 'gold') : null // Player AI ready if eligible
    };
    
    socket.data.lobbyCode = code;
    socket.data.isHost = true;
    socket.data.username = username || "Guest";
    
    // Pass custom deck cards if available
    const hostCustomDefs = await getCustomCardDefs(userId);
    lobbies[code].gameState = createGameState(deckId || "medieval", bossDeckId, customDeckCards, null, hostCustomDefs, null);
    
    // Debug: log initial hasDrawn state
    console.log(`[CAMPAIGN] Created lobby ${code}, gold.hasDrawn=${lobbies[code].gameState.players.gold.hasDrawn}, canDraw=${!lobbies[code].gameState.players.gold.hasDrawn && lobbies[code].gameState.players.gold.hand.length < 10}`);
    
    socket.emit("role", "gold");
    socket.emit("campaignStart", { 
      code: code, 
      myDeck: deckId || "medieval", 
      enemyDeck: bossDeckId,
      bossName: boss.name + (isChallenge ? " (Challenge)" : ""),
      bossId: bossId,
      difficulty: aiLevel,
      isChallenge: isChallenge,
      music: deckMusic,
      background: deckBackground,
      canAutoPlay: canAutoPlay,
      firstTimeBoss: !canAutoPlay, // First time if they haven't beaten this boss at this difficulty
      bossMusic: boss.deckId // Boss's theme music (uses deck ID)
    });
    socket.emit("enemyInfo", { username: boss.name, isAI: true });
    logToLobby(lobbies[code], "=== CAMPAIGN: " + boss.name.toUpperCase() + " ===");
    logToLobby(lobbies[code], "GOLD's turn");
    emitLobbyState(lobbies[code]);
    emitGameState(lobbies[code]);
    } catch (err) {
      console.error('[startCampaign] Unexpected error:', err);
      socket.emit("lobbyError", "Failed to start campaign. Please try again.");
    }
  });

  // Start the tutorial encounter (Boss 0 — scripted Medieval king)
  socket.on("startTutorial", (data) => {
    const username = data?.username || "Recruit";
    const userId = data?.userId || null;
    const code = generateLobbyCode();

    lobbies[code] = {
      code,
      hostSocket: socket,
      guestSocket: null,
      hostDeck: "medieval",
      guestDeck: "medieval",
      hostReady: true,
      guestReady: true,
      gameStarted: true,
      gameState: null,
      log: [],
      hostUsername: username,
      guestUsername: "Lost King",
      hostUserId: userId,
      guestUserId: null,
      isAIGame: true,
      isTutorial: true,
      tutorialStep: 0,         // current step index in the script (filled in later)
      bossId: 0,
      aiLevel: 1,
      ai: null,                // tutorial uses scripted moves, not GameAI
      canAutoPlay: false,
      autoPlay: false,
      playerAI: null
    };

    socket.data.lobbyCode = code;
    socket.data.isHost = true;
    socket.data.username = username;

    // Pre-set tutorial board: Knight at E5, enemy Archer/Crusader at C1/C2, weak walls, scripted draws.
    lobbies[code].gameState = createTutorialState();

    console.log(`[TUTORIAL] Created tutorial lobby ${code} for ${username}`);

    socket.emit("role", "gold");
    socket.emit("tutorialStart", {
      code,
      myDeck: "medieval",
      enemyDeck: "medieval",
      bossName: "Lost King",
      music: "medieval",
      background: "medieval"
    });
    socket.emit("enemyInfo", { username: "Lost King", isAI: true });
    logToLobby(lobbies[code], "=== TUTORIAL: THE LOST KING ===");
    logToLobby(lobbies[code], "GOLD's turn");
    emitLobbyState(lobbies[code]);
    emitGameState(lobbies[code]);

    // Kick off the script after the client has loaded game.html and rejoined.
    // The delay needs to cover: page navigation + load + socket reconnect.
    // 600ms was fine locally but too short over the network — use 2000ms.
    setTimeout(() => processTutorialScript(lobbies[code]), 2000);
  });

  // ========== Tutorial state-machine helpers ==========
  function emitTutorialDialog(lobby, step) {
    if (!lobby.hostSocket) return;
    const nextStep = TUTORIAL_SCRIPT[lobby.tutorialStep + 1];
    const payload = {
      speaker: step.speaker,
      text: step.text,
      hint: step.hint,
      nextAction:    nextStep && nextStep.type === 'gate' ? nextStep.action : null,
      nextHighlight: step.nextHighlight || null
    };
    lobby.pendingTutorialEvent = { type: 'dialog', payload };
    lobby.hostSocket.emit("tutorialDialog", payload);
  }
  function emitTutorialGate(lobby, step) {
    if (!lobby.hostSocket) return;
    lobby.pendingTutorialEvent = { type: 'gate', payload: step };
    lobby.hostSocket.emit("tutorialGate", step);
  }
  function emitTutorialFinish(lobby) {
    if (!lobby.hostSocket) return;
    lobby.hostSocket.emit("tutorialFinish", { win: true });
  }

  // Run a single scripted enemy action against the live game state
  function executeTutorialEnemyAction(lobby, step) {
    const state = lobby.gameState.state;
    const fromPos = step.fromUnit;
    const toPos = step.toUnit || step.toTile;
    const sock = lobby.hostSocket;

    if (step.do === 'spawn') {
      const id = placeTutorialUnit(state, "medieval", step.cardKey, "silver", step.tile.row, step.tile.col);
      logToLobby(lobby, "Lost King summons " + (state.units[id]?.name || step.cardKey));

    } else if (step.do === 'move' && fromPos && toPos) {
      const fromId = state.board[fromPos.row][fromPos.col];
      if (!fromId) return;
      if (sock) sock.emit("animate", { type: "move", unitId: fromId,
        fromRow: fromPos.row, fromCol: fromPos.col, toRow: toPos.row, toCol: toPos.col });
      state.board[fromPos.row][fromPos.col] = null;
      state.board[toPos.row][toPos.col] = fromId;
      logToLobby(lobby, (state.units[fromId]?.name || "Unit") + " advances");

    } else if (step.do === 'attack' && fromPos) {
      const attackerId = state.board[fromPos.row][fromPos.col];
      const attacker = attackerId ? state.units[attackerId] : null;
      if (!attacker) return;

      if (step.toRow !== undefined) {
        if (sock) sock.emit("animate", { type: "attack",
          attackerRow: fromPos.row, attackerCol: fromPos.col,
          targetRow: step.toRow, targetCol: fromPos.col });
        const dmg = attacker.atk;
        state.rowHP[step.toRow] = Math.max(0, state.rowHP[step.toRow] - dmg);
        logToLobby(lobby, attacker.name + " hits the wall for " + dmg);

      } else if (step.toUnit) {
        const targetId = state.board[step.toUnit.row][step.toUnit.col];
        const target = targetId ? state.units[targetId] : null;
        if (!target) return;
        if (sock) sock.emit("animate", { type: "attack",
          attackerRow: fromPos.row, attackerCol: fromPos.col,
          targetRow: step.toUnit.row, targetCol: step.toUnit.col });
        target.hp -= attacker.atk;
        logToLobby(lobby, attacker.name + " strikes " + target.name + " for " + attacker.atk);
        if (sock) sock.emit("animate", { type: "damage", row: step.toUnit.row, col: step.toUnit.col });
        if (target.hp <= 0) {
          state.board[step.toUnit.row][step.toUnit.col] = null;
          delete state.units[targetId];
          if (sock) sock.emit("animate", { type: "destroy", row: step.toUnit.row, col: step.toUnit.col });
          logToLobby(lobby, target.name + " falls!");
        }
      }
    }
    emitGameState(lobby);
  }

  // Walk the script forward from the current step until we hit a gate or run out of steps
  function processTutorialScript(lobby) {
    if (!lobby || !lobby.isTutorial) return;
    while (lobby.tutorialStep < TUTORIAL_SCRIPT.length) {
      const step = TUTORIAL_SCRIPT[lobby.tutorialStep];
      if (step.type === 'dialog') {
        emitTutorialDialog(lobby, step);
        return; // wait for tutorialAdvance
      }
      if (step.type === 'gate') {
        emitTutorialGate(lobby, step);
        return; // wait for player to perform the gated action
      }
      if (step.type === 'enemyAction') {
        executeTutorialEnemyAction(lobby, step);
        lobby.tutorialStep++;
        const delay = step.do === 'spawn' ? 1000 : 800;
        setTimeout(() => processTutorialScript(lobby), delay);
        return;
      }
      if (step.type === 'endEnemyTurn') {
        lobby.gameState.state.activeSide = "gold";
        lobby.gameState.state.turnNumber++;
        const p = lobby.gameState.players.gold;
        p.energy = Math.min((p.maxEnergy = (p.maxEnergy || 8) + 0), 10);
        p.hasDrawn = false;
        emitGameState(lobby);
        lobby.tutorialStep++;
        setTimeout(() => processTutorialScript(lobby), 600);
        return;
      }
      if (step.type === 'freePlay') {
        lobby.isTutorial = false;
        lobby.tutorialFreePlay = true;
        lobby.ai = new GameAI(1);
        lobby.tutorialStep++;
        const { state } = lobby.gameState;
        lobby.fpDialogs = {
          prevSilverCount: Object.values(state.units).filter(u => u.owner === 'silver').length,
          silverDeaths: 0,
          silverHeartAtStart: state.heartHP.silver,
          prevRowGHP: state.rowHP[6],
          lastWallShown: false,
          fiveDeathsShown: false,
          heartHitShown: false
        };
        if (lobby.hostSocket) lobby.hostSocket.emit('tutorialFreePlay', {});
        if (state.activeSide === 'silver' && !state.gameOver) processAITurn(lobby);
        return;
      }
      if (step.type === 'finish') {
        emitTutorialFinish(lobby);
        // Persist tutorialCompleted on the user
        if (lobby.hostUserId) {
          User.findById(lobby.hostUserId).then(user => {
            if (user) {
              user.set('preferences.tutorialCompleted', true);
              user.markModified('preferences');
              return user.save();
            }
          }).catch(err => console.error('[TUTORIAL] failed to persist completion:', err));
        }
        delete lobbies[lobby.code];
        return;
      }
      lobby.tutorialStep++;
    }
  }

  // Check whether a player action satisfies the current tutorial gate; if so, advance the script
  function tryAdvanceTutorialFromAction(lobby, payload) {
    if (!lobby || !lobby.isTutorial) return;
    const step = TUTORIAL_SCRIPT[lobby.tutorialStep];
    if (!step || step.type !== 'gate') return;

    let matches = false;
    if (step.action === 'drawCard' && payload.type === 'drawCard') matches = true;
    else if (step.action === 'endTurn' && payload.type === 'endTurn') matches = true;
    else if (step.action === 'playCard' && payload.type === 'playCard') matches = true;
    else if (step.action === 'attack' && (payload.type === 'attack' || payload.type === 'attackUnit' || payload.type === 'attackRow' || payload.type === 'attackFromSpawn')) matches = true;
    else if (step.action === 'attackHeart' && (payload.type === 'attackHeart' || payload.targetHeart)) matches = true;
    else if (step.action === 'move' && payload.type === 'move') matches = true;

    if (matches) {
      lobby.tutorialStep++;
      // Use a small delay so the player sees the action complete before next dialog/gate
      setTimeout(() => processTutorialScript(lobby), 350);
    }
  }

  // Tutorial: player skipped mid-flow → close the lobby cleanly
  socket.on("tutorialSkip", () => {
    const code = socket.data.lobbyCode;
    const lobby = lobbies[code];
    if (!lobby || !lobby.isTutorial) return;
    console.log(`[TUTORIAL] Player skipped tutorial — closing lobby ${code}`);
    delete lobbies[code];
  });

  // Tutorial: client clicked through a dialog → advance the script
  socket.on("tutorialAdvance", () => {
    const lobby = lobbies[socket.data.lobbyCode];
    if (!lobby || !lobby.isTutorial) return;
    const step = TUTORIAL_SCRIPT[lobby.tutorialStep];
    if (step && step.type === 'dialog') {
      lobby.tutorialStep++;
      processTutorialScript(lobby);
    }
  });

  // Tutorial: after each player action, check if it satisfies the current gate.
  // Runs AFTER the main "action" handler because Socket.IO fires listeners in order
  // and the main handler is synchronous (deferred via setTimeout).
  socket.on("action", (payload) => {
    const lobby = lobbies[socket.data.lobbyCode];
    if (!lobby || !lobby.isTutorial) return;
    setTimeout(() => tryAdvanceTutorialFromAction(lobby, payload), 50);
  });

  // Toggle auto-play on/off during campaign game
  socket.on("toggleAutoPlay", (data) => {
    const lobby = lobbies[socket.data.lobbyCode];
    if (!lobby || !lobby.isAIGame) return;
    
    // Only allow if eligible
    if (!lobby.canAutoPlay) {
      socket.emit("log", "Auto-play not available - beat this boss first!");
      return;
    }
    
    const enable = data.enabled;
    lobby.autoPlay = enable;
    
    // Set speed if provided
    if (data.speed) {
      lobby.autoPlaySpeed = data.speed;
    }
    
    if (enable) {
      // Make sure playerAI exists
      if (!lobby.playerAI) {
        lobby.playerAI = new GameAI(2, 'gold');
      }
      const speedText = lobby.autoPlaySpeed === 2 ? " (2x Speed)" : "";
      logToLobby(lobby, "🤖 Auto-Play ENABLED" + speedText);
      socket.emit("autoPlayStatus", { enabled: true, speed: lobby.autoPlaySpeed || 1 });
      
      // If it's gold's turn, start the player AI
      const { state } = lobby.gameState;
      if (state.activeSide === "gold" && !state.gameOver) {
        setTimeout(() => {
          processPlayerAITurn(lobby);
        }, 500);
      }
    } else {
      logToLobby(lobby, "🤖 Auto-Play DISABLED");
      socket.emit("autoPlayStatus", { enabled: false, speed: lobby.autoPlaySpeed || 1 });
      // Setting autoPlay to false will stop the player AI loop naturally
      // Also reset processing flag to allow manual play
      lobby.playerAIProcessing = false;
    }
  });
  
  // Set auto-play speed
  socket.on("setAutoPlaySpeed", (data) => {
    const lobby = lobbies[socket.data.lobbyCode];
    if (!lobby || !lobby.isAIGame || !lobby.autoPlay) return;
    
    const speed = data.speed === 2 ? 2 : 1;
    lobby.autoPlaySpeed = speed;
    
    const speedText = speed === 2 ? "2x" : "1x";
    logToLobby(lobby, "🤖 Auto-Play Speed: " + speedText);
    socket.emit("autoPlayStatus", { enabled: true, speed: speed });
  });

  // Start playtest mode - player controls both sides with all cards available
  socket.on("startPlaytest", async (data) => {
    const { username } = data;
    
    const code = generateLobbyCode();
    lobbies[code] = {
      code,
      hostSocket: socket,
      guestSocket: null,
      hostDeck: "playtest",
      guestDeck: "playtest",
      hostReady: true,
      guestReady: true,
      gameStarted: true,
      gameState: null,
      log: [],
      hostUsername: username || "Tester",
      guestUsername: "Tester (Silver)",
      hostUserId: null,
      guestUserId: null,
      isAIGame: false,
      isPlaytest: true  // Special flag for playtest mode
    };
    
    socket.data.lobbyCode = code;
    socket.data.isHost = true;
    socket.data.username = username || "Tester";
    
    // Create game state with empty decks - cards will come from library
    lobbies[code].gameState = createPlaytestGameState();
    
    socket.emit("role", "gold");
    socket.emit("playtestStart", { 
      code: code,
      allCards: getAllCardsForPlaytest()
    });
    socket.emit("enemyInfo", { username: "Tester (Silver)", isPlaytest: true });
    logToLobby(lobbies[code], "=== PLAYTEST MODE ===");
    logToLobby(lobbies[code], "You control both sides. Use card library to spawn units.");
    logToLobby(lobbies[code], "GOLD's turn");
    emitPlaytestState(lobbies[code]);
  });

  socket.on("joinLobby", (data) => {
    const code = data.code?.toUpperCase(); const lobby = lobbies[code];
    if (!lobby) return socket.emit("lobbyError", "Lobby not found.");
    if (lobby.guestSocket) return socket.emit("lobbyError", "Lobby full.");
    if (lobby.gameStarted) return socket.emit("lobbyError", "Game in progress.");
    lobby.guestSocket = socket; 
    lobby.guestDeck = data.deckId || "medieval"; 
    lobby.guestDeckName = data.deckName || null;
    lobby.guestReady = true;
    lobby.guestUsername = data.username || "Guest";
    lobby.guestUserId = data.userId || null;
    socket.data.lobbyCode = code; 
    socket.data.isHost = false;
    socket.data.username = data.username || "Guest";
    emitLobbyState(lobby);
  });

  socket.on("selectDeck", (data) => {
    const lobby = lobbies[socket.data.lobbyCode]; if (!lobby || lobby.gameStarted) return;
    if (socket.data.isHost) {
      lobby.hostDeck = data.deckId;
      lobby.hostDeckName = data.deckName || null;
    } else {
      lobby.guestDeck = data.deckId;
      lobby.guestDeckName = data.deckName || null;
    }
    emitLobbyState(lobby);
  });

  socket.on("startGame", async () => {
    const lobby = lobbies[socket.data.lobbyCode];
    if (!lobby || !socket.data.isHost || !lobby.guestSocket || !lobby.guestReady) return;
    
    // Look up custom decks for both players
    let hostCustomCards = null;
    let guestCustomCards = null;
    let hostCustomDefs = {};
    let guestCustomDefs = {};

    // Handle admin for host
    if (lobby.hostUserId === 'admin') {
      const customDeck = adminCustomDecks.find(d => d.id === lobby.hostDeck);
      if (customDeck && customDeck.cards && customDeck.cards.length >= 25) {
        hostCustomCards = customDeck.cards;
      }
    } else if (lobby.hostUserId) {
      try {
        const hostUser = await User.findById(lobby.hostUserId);
        if (hostUser) {
          const customDeck = hostUser.customDecks.find(d => d.id === lobby.hostDeck);
          if (customDeck && customDeck.cards && customDeck.cards.length >= 25) {
            hostCustomCards = customDeck.cards;
          }
          if (hostUser.customCards) {
            for (const [key, card] of hostUser.customCards) { const { count, ...template } = card; hostCustomDefs[key] = template; }
          }
        }
      } catch (err) { console.error('Error loading host custom deck:', err); }
    }

    // Handle admin for guest
    if (lobby.guestUserId === 'admin') {
      const customDeck = adminCustomDecks.find(d => d.id === lobby.guestDeck);
      if (customDeck && customDeck.cards && customDeck.cards.length >= 25) {
        guestCustomCards = customDeck.cards;
      }
    } else if (lobby.guestUserId) {
      try {
        const guestUser = await User.findById(lobby.guestUserId);
        if (guestUser) {
          const customDeck = guestUser.customDecks.find(d => d.id === lobby.guestDeck);
          if (customDeck && customDeck.cards && customDeck.cards.length >= 25) {
            guestCustomCards = customDeck.cards;
          }
          if (guestUser.customCards) {
            for (const [key, card] of guestUser.customCards) { const { count, ...template } = card; guestCustomDefs[key] = template; }
          }
        }
      } catch (err) { console.error('Error loading guest custom deck:', err); }
    }

    lobby.gameStarted = true;
    lobby.gameState = createGameState(lobby.hostDeck, lobby.guestDeck, hostCustomCards, guestCustomCards, hostCustomDefs, guestCustomDefs);
    lobby.hostSocket.emit("role", "gold");
    lobby.hostSocket.emit("enemyInfo", { username: lobby.guestUsername, isAI: false });
    lobby.guestSocket.emit("role", "silver");
    lobby.guestSocket.emit("enemyInfo", { username: lobby.hostUsername, isAI: false });
    logToLobby(lobby, "=== GAME START ===");
    logToLobby(lobby, "GOLD's turn");
    emitLobbyState(lobby);
    emitGameState(lobby);
  });

  socket.on("rejoinGame", (data) => {
    const code = data.code?.toUpperCase();
    const lobby = lobbies[code];
    const ts = new Date().toISOString().slice(11, 23);
    console.log(`[REJOIN ${ts}] sock=${socket.id} code=${code} isHost=${data.isHost} hasLobby=${!!lobby} availableLobbies=[${Object.keys(lobbies).join(', ')}]`);
    
    if (!lobby) {
      console.log(`[REJOIN] Lobby not found: ${code}`);
      return socket.emit("lobbyError", "Game not found. Return to home.");
    }
    
    if (!lobby.gameStarted) {
      console.log(`[REJOIN] Game not started: ${code}`);
      return socket.emit("lobbyError", "Game not started yet.");
    }
    
    // Reconnect socket to lobby
    socket.data.lobbyCode = code;
    socket.data.isHost = data.isHost;
    
    console.log(`[REJOIN] Successfully rejoined lobby: ${code}, role: ${data.isHost ? 'gold' : 'silver'}`);
    
    if (data.isHost) {
      lobby.hostSocket = socket;
      socket.emit("role", "gold");

      // If it's AI's turn and this is a campaign game, restart AI processing
      if (lobby.isAIGame && lobby.ai && lobby.gameState.state.activeSide === "silver" && !lobby.gameState.state.gameOver) {
        setTimeout(() => processAITurn(lobby), 1000);
      }

      // Re-send the current tutorial dialog or gate so the new socket sees it
      if (lobby.isTutorial && lobby.pendingTutorialEvent) {
        const ev = lobby.pendingTutorialEvent;
        if (ev.type === 'dialog') socket.emit('tutorialDialog', ev.payload);
        else if (ev.type === 'gate') socket.emit('tutorialGate', ev.payload);
      }
    } else {
      lobby.guestSocket = socket;
      socket.emit("role", "silver");
    }

    emitGameState(lobby);
  });

  socket.on("leaveGame", () => {
    const code = socket.data.lobbyCode;
    const lobby = lobbies[code];
    if (!lobby) return;
    
    // Stop any running AI
    lobby.aiStopped = true;
    lobby.aiProcessing = false;
    
    // Notify other player and close lobby
    if (socket.data.isHost) {
      if (lobby.guestSocket) lobby.guestSocket.emit("lobbyError", "Host left the game.");
    } else {
      if (lobby.hostSocket) lobby.hostSocket.emit("lobbyError", "Opponent left the game.");
    }
    delete lobbies[code];
  });

  socket.on("restartGame", async () => {
    const lobby = lobbies[socket.data.lobbyCode];
    if (!lobby || !socket.data.isHost) return;

    // Tutorial restarts to the scripted starting board, not a default game.
    if (lobby.isTutorial) {
      lobby.gameState = createTutorialState();
      lobby.tutorialStep = 0;
      lobby.aiStopped = false;
      lobby.aiProcessing = false;
      lobby.autoPlay = false;
      logToLobby(lobby, "=== TUTORIAL RESTARTED ===");
      logToLobby(lobby, "GOLD's turn");
      emitGameState(lobby);
      return;
    }

    // Reset game state - use stored custom deck cards for campaign games
    const [restartHostDefs, restartGuestDefs] = await Promise.all([
      getCustomCardDefs(lobby.hostUserId),
      getCustomCardDefs(lobby.guestUserId)
    ]);
    lobby.gameState = createGameState(lobby.hostDeck, lobby.guestDeck, lobby.hostCustomDeckCards || null, lobby.guestCustomDeckCards || null, restartHostDefs, restartGuestDefs);
    
    // Recreate AI instances for campaign games (fresh state)
    if (lobby.isAIGame) {
      lobby.ai = new GameAI(lobby.isChallenge ? 3 : lobby.aiLevel);
    }
    if (lobby.canAutoPlay) {
      lobby.playerAI = new GameAI(2, 'gold');
    }
    lobby.autoPlay = false; // Reset auto-play on restart
    lobby.aiStopped = false; // Make sure AI can run
    lobby.aiProcessing = false;
    
    logToLobby(lobby, "=== GAME RESTARTED ===");
    logToLobby(lobby, "GOLD's turn");
    emitGameState(lobby);
  });

  socket.on("action", (payload) => {
    const lobby = lobbies[socket.data.lobbyCode];
    const ts = new Date().toISOString().slice(11, 23);
    console.log(`[ACTION ${ts}] sock=${socket.id} type=${payload.type} lobbyCode=${socket.data.lobbyCode} isHost=${socket.data.isHost} cardId=${payload.cardId || '-'} hasLobby=${!!lobby}`);

    if (!lobby) {
      console.log(`[ACTION ${ts}] NO LOBBY — code=${socket.data.lobbyCode} availableLobbies=[${Object.keys(lobbies).join(', ')}] -> needRejoin sent`);
      // Likely a race: client emitted action before its rejoin reached us. Ask client to rejoin + retry the action.
      socket.emit("needRejoin", { retry: payload });
      return;
    }
    if (!lobby.gameStarted) {
      console.log(`[ACTION DEBUG] Game not started for lobby: ${socket.data.lobbyCode}`);
      return socket.emit("log", "Game hasn't started yet.");
    }
    if (!lobby.gameState) {
      console.log(`[ACTION DEBUG] No gameState for lobby: ${socket.data.lobbyCode}`);
      return socket.emit("log", "Game state not initialized. Try refreshing.");
    }
    
    const { state, players } = lobby.gameState;
    let role = socket.data.isHost ? "gold" : "silver";
    
    // Playtest mode: allow controlling both sides
    if (lobby.isPlaytest && payload.playtestRole) {
      role = payload.playtestRole;
    }
    
    if (state.gameOver) return socket.emit("log", "Game over.");
    
    // In playtest mode, allow actions for either side
    if (!lobby.isPlaytest && state.activeSide !== role) {
      return socket.emit("log", "Not your turn.");
    }

    // Playtest-specific actions
    if (lobby.isPlaytest) {
      // Switch which side you're controlling
      if (payload.type === "playtestSwitchSide") {
        // Just end turn to switch sides
        processEndOfTurnEffects(lobby, state.activeSide);
        state.activeSide = enemyOf(state.activeSide);
        state.movedThisTurn.clear();
        state.attackedThisTurn.clear();
        state.moveCountThisTurn = {};
        state.turnNumber++;
        
        // Keep energy at 99 for playtest
        players.gold.energy = 99;
        players.silver.energy = 99;
        players.gold.hasDrawn = true;
        players.silver.hasDrawn = true;
        
        logToLobby(lobby, "--- " + state.activeSide.toUpperCase() + "'s turn ---");
        emitPlaytestState(lobby);
        return;
      }
      
      // Spawn a card directly from the library
      if (payload.type === "playtestSpawn") {
        const { cardKey, row, col, side } = payload;
        
        // Validate row/col
        if (row < 0 || row >= ROWS || col < 0 || col >= COLS) {
          return socket.emit("log", "Invalid position");
        }
        
        // Find the card definition
        let cardDef = null;
        for (const deckKey in DECKS) {
          const deck = DECKS[deckKey];
          for (const card of deck.cards) {
            if (card.key === cardKey) {
              cardDef = card;
              break;
            }
          }
          if (cardDef) break;
        }
        
        if (!cardDef) {
          return socket.emit("log", "Card not found: " + cardKey);
        }
        
        // Create a card instance and add to the player's hand
        const card = { ...cardDef, id: genId() };
        players[side].hand.push(card);
        
        // Set spawn zone temporarily
        const oldSpawn = state.spawn[side];
        state.spawn[side] = side === "gold" ? "you" : "enemy";
        
        // Temporarily switch active side if needed
        const oldActiveSide = state.activeSide;
        state.activeSide = side;
        
        // Now let the regular playCard code handle it through the action handler
        // We'll recursively call with the playCard action
        const playCardPayload = {
          type: "playCard",
          cardId: card.id,
          spawn: state.spawn[side],
          row: row,
          col: col,
          playtestRole: side
        };
        
        // Emit a fake action to process through normal flow
        socket.emit("log", "Spawning " + cardDef.name + " for " + side.toUpperCase());
        
        // Restore
        state.activeSide = oldActiveSide;
        state.spawn[side] = oldSpawn;
        
        // Process as playCard inline (copy the essential logic)
        const targetPlayer = players[side];
        const cidx = targetPlayer.hand.findIndex(c => c.id === card.id);
        if (cidx === -1) {
          return socket.emit("log", "Card not found in hand");
        }
        
        // Remove from hand
        targetPlayer.hand.splice(cidx, 1);
        
        // Check if cell is occupied (except for structures that can stack)
        if (state.board[row][col] && cardDef.type !== "spell") {
          return socket.emit("log", "Cell is occupied");
        }
        
        // Handle spells
        if (cardDef.type === "spell") {
          logToLobby(lobby, side.toUpperCase() + " casts " + card.name);
          // Get the unit at the target cell (if any) for targeted spells
          const targetUnitId = state.board[row][col] || null;
          processInstantSpell(lobby, side, card.effectId, row, targetUnitId, col);
          targetPlayer.discard.push(card);
          emitPlaytestState(lobby);
          return;
        }
        
        // Create unit
        const unitId = genId();
        const unitData = {
          id: unitId,
          owner: side,
          key: card.key,
          name: card.name,
          atk: card.atk,
          hp: card.hp,
          maxHp: card.hp,
          cost: card.cost,
          type: card.type,
          effect: card.effect,
          effectId: card.effectId,
          effectDesc: card.effectDesc,
          art: card.art,
          originalCard: card
        };
        state.units[unitId] = unitData;
        state.board[row][col] = unitId;
        recomputeOwners(state);
        
        // Process on-deploy effects
        if (card.effectId === "gem_spawn") {
          const adjacentTiles = [
            { r: row - 1, c: col }, { r: row + 1, c: col },
            { r: row, c: col - 1 }, { r: row, c: col + 1 }
          ];
          for (const tile of adjacentTiles) {
            if (!canSpawnAtTile(state, tile.r, tile.c, side)) continue;
            const gemId = genId();
            state.units[gemId] = {
              id: gemId, owner: side, key: "gemshard", name: "Gem Shard",
              atk: 1, hp: 1, maxHp: 1, type: "structure", art: "/images/Gem Shard.png"
            };
            state.board[tile.r][tile.c] = gemId;
            
            // Apply polymorph to spawned gem if polymorph is active
            if (state.polymorphActive) {
              polymorphUnit(state, gemId);
            }
            
            logToLobby(lobby, card.name + " summons a Gem Shard!");
            break;
          }
        }
        
        // Armory deployed - show green cross heal effect on all existing friendly units
        if (card.effectId === "armory_buff") {
          const armoryPos = { r: row, c: col };
          const buffedPositions = [];
          for (const uid in state.units) {
            const unit = state.units[uid];
            if (unit.owner === side && uid !== unitId && unit.effectId !== "armory_buff") {
              const unitPos = getUnitPos(state, uid);
              if (unitPos) buffedPositions.push({ r: unitPos.r, c: unitPos.c });
            }
          }
          if (buffedPositions.length > 0) {
            const animData = { type: "effect", effectType: "heal_pulse", sourcePos: armoryPos, targets: buffedPositions };
            if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
            if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
          }
        }
        
        logToLobby(lobby, side.toUpperCase() + " spawned " + card.name);
        emitPlaytestState(lobby);
        return;
      }
    }

    // Handle free wizard summon from Wizard's Rune death
    if (payload.type === "summonFreeWizard") {
      const { cardId, row, col } = payload;
      
      // Check if player has pending wizard summon
      if (!state.pendingWizardSummon || !state.pendingWizardSummon[role] || !state.pendingWizardSummon[role].active) {
        return socket.emit("log", "No pending wizard summon.");
      }
      
      const p = players[role];
      const idx = p.hand.findIndex(c => c.id === cardId);
      if (idx === -1) return socket.emit("log", "Card not found in hand.");
      
      const card = p.hand[idx];
      if (!WIZARD_CARDS.includes(card.key)) {
        return socket.emit("log", "Selected card is not a Wizard.");
      }
      
      // Validate placement
      if (row === undefined || col === undefined || row < 0 || row >= ROWS || col < 0 || col >= COLS) {
        return socket.emit("log", "Invalid placement.");
      }
      if (state.board[row][col]) {
        return socket.emit("log", "Tile is occupied.");
      }
      if (!canDeployOnRow(state, row, role)) {
        return socket.emit("log", "Cannot deploy there.");
      }
      
      // Summon the wizard for free
      p.hand.splice(idx, 1);
      const id = genId();
      state.units[id] = {
        id,
        owner: role,
        key: card.key,
        name: card.name,
        atk: card.atk,
        hp: card.hp,
        maxHp: card.hp,
        cost: card.cost,
        type: card.type,
        effect: card.effect,
        effectId: card.effectId,
        effectDesc: card.effectDesc,
        art: card.art,
        originalCard: card
      };
      state.board[row][col] = id;
      state.movedThisTurn.add(id);
      
      // Clear pending wizard summon
      state.pendingWizardSummon[role].active = false;
      
      logToLobby(lobby, "Wizards Rune summons " + card.name + " for free!");
      emitSFX(lobby, card.key, 'deploy');
      return emitGameState(lobby);
    }
    
    // Handle skipping wizard summon
    if (payload.type === "skipWizardSummon") {
      if (state.pendingWizardSummon && state.pendingWizardSummon[role]) {
        state.pendingWizardSummon[role].active = false;
        logToLobby(lobby, role.toUpperCase() + " declines to summon a wizard.");
      }
      return emitGameState(lobby);
    }

    // Handle Time Rift resurrection from Chrono Drake
    if (payload.type === "timeRiftResurrect") {
      const { cardId } = payload;
      
      // Check if player has pending time rift
      if (!state.pendingTimeRift || !state.pendingTimeRift[role] || !state.pendingTimeRift[role].active) {
        return socket.emit("log", "No pending Time Rift.");
      }
      
      const p = players[role];
      const idx = p.discard.findIndex(c => c.id === cardId);
      if (idx === -1) return socket.emit("log", "Card not found in discard.");
      
      const card = p.discard[idx];
      if (card.type !== "monster" && card.type !== "structure") {
        return socket.emit("log", "Can only resurrect units.");
      }
      
      const deployPos = state.pendingTimeRift[role].deployPos;
      
      // Find an adjacent empty tile to deploy the resurrected unit
      const adjacentPositions = [
        { r: deployPos.r - 1, c: deployPos.c },
        { r: deployPos.r + 1, c: deployPos.c },
        { r: deployPos.r, c: deployPos.c - 1 },
        { r: deployPos.r, c: deployPos.c + 1 },
        { r: deployPos.r - 1, c: deployPos.c - 1 },
        { r: deployPos.r - 1, c: deployPos.c + 1 },
        { r: deployPos.r + 1, c: deployPos.c - 1 },
        { r: deployPos.r + 1, c: deployPos.c + 1 }
      ];
      
      let spawnPos = null;
      for (const pos of adjacentPositions) {
        if (pos.r < 0 || pos.r >= ROWS || pos.c < 0 || pos.c >= COLS) continue;
        if (!state.board[pos.r][pos.c]) {
          spawnPos = pos;
          break;
        }
      }
      
      if (!spawnPos) {
        logToLobby(lobby, "No empty tile adjacent to Chrono Drake for resurrection!");
        state.pendingTimeRift[role].active = false;
        return emitGameState(lobby);
      }
      
      // Remove from discard
      p.discard.splice(idx, 1);
      
      // Resurrect the unit with full stats
      const id = genId();
      const fullHp = card.maxHp || card.hp;
      state.units[id] = {
        id,
        owner: role,
        key: card.key,
        name: card.name,
        atk: card.atk,
        hp: fullHp,
        maxHp: fullHp,
        cost: card.cost,
        type: card.type,
        effect: card.effect,
        effectId: card.effectId,
        effectDesc: card.effectDesc,
        art: card.art,
        originalCard: card
      };
      // Preserve stationary flag
      if (card.stationary) state.units[id].stationary = true;
      state.board[spawnPos.r][spawnPos.c] = id;
      state.movedThisTurn.add(id);
      
      // Clear pending time rift
      state.pendingTimeRift[role].active = false;
      
      logToLobby(lobby, "Time Rift resurrects " + card.name + "!");
      emitSFX(lobby, card.key, 'deploy');
      return emitGameState(lobby);
    }
    
    // Handle skipping time rift
    if (payload.type === "skipTimeRift") {
      if (state.pendingTimeRift && state.pendingTimeRift[role]) {
        state.pendingTimeRift[role].active = false;
        logToLobby(lobby, role.toUpperCase() + " declines to resurrect a unit.");
      }
      return emitGameState(lobby);
    }
    
    // Handle Resurrection spell (deploy anywhere with immune)
    if (payload.type === "resurrectionSelect") {
      const { cardId, row, col } = payload;
      
      // Check if player has pending resurrection
      if (!state.pendingResurrection || !state.pendingResurrection[role] || !state.pendingResurrection[role].active) {
        return socket.emit("log", "No pending Resurrection.");
      }
      
      const p = players[role];
      const idx = p.discard.findIndex(c => c.id === cardId);
      if (idx === -1) return socket.emit("log", "Card not found in discard.");
      
      const card = p.discard[idx];
      if (card.type !== "monster" && card.type !== "structure") {
        return socket.emit("log", "Can only resurrect units.");
      }
      
      // Validate placement - can be any empty tile except enemy home rows with HP
      if (row === undefined || col === undefined || row < 0 || row >= ROWS || col < 0 || col >= COLS) {
        return socket.emit("log", "Invalid placement.");
      }
      if (state.board[row][col]) {
        return socket.emit("log", "Tile occupied.");
      }
      const enemy = enemyOf(role);
      const isEnemyHomeRow = (enemy === "gold" && row <= 1) || (enemy === "silver" && row >= 5);
      if (isEnemyHomeRow && state.rowHP[row] > 0) {
        return socket.emit("log", "Cannot deploy in enemy home row with HP.");
      }
      
      // Remove from discard
      p.discard.splice(idx, 1);
      
      // Resurrect with full stats and immune
      const id = genId();
      const fullHp = card.maxHp || card.hp;
      state.units[id] = {
        id,
        owner: role,
        key: card.key,
        name: card.name,
        atk: card.atk,
        hp: fullHp,
        maxHp: fullHp,
        cost: card.cost,
        type: card.type,
        effect: card.effect,
        effectId: card.effectId,
        effectDesc: card.effectDesc,
        art: card.art,
        originalCard: card,
        immune: true,
        immuneUntilNextTurn: true
      };
      if (card.stationary) state.units[id].stationary = true;
      state.board[row][col] = id;
      state.movedThisTurn.add(id);
      
      // Clear pending resurrection
      state.pendingResurrection[role].active = false;
      
      logToLobby(lobby, "Resurrection brings back " + card.name + " with divine protection!");
      emitSFX(lobby, card.key, 'deploy');
      return emitGameState(lobby);
    }
    
    if (payload.type === "skipResurrection") {
      if (state.pendingResurrection && state.pendingResurrection[role]) {
        state.pendingResurrection[role].active = false;
        logToLobby(lobby, role.toUpperCase() + " declines to resurrect a unit.");
      }
      return emitGameState(lobby);
    }

    if (payload.type === "endTurn") {
      processEndOfTurnEffects(lobby, role);
      
      // Process eclipse end (counts down each turn)
      processEclipseEnd(lobby);
      
      // Process polymorph end (counts down each turn)
      processPolymorphEnd(lobby);
      
      // Clear diamond buff (unlimited moves) for the player ending their turn
      clearDiamondBuffs(state, role);
      
      // Clear firstTurn after gold's first turn
      if (state.firstTurn && role === "gold") {
        state.firstTurn = false;
      }
      
      // Reset double attack buffs, attack counts, and handle burrower/untargetable
      for (const uid in state.units) {
        const u = state.units[uid];
        u.canDoubleAttack = false;
        u.attackCountThisTurn = 0;
        
        // For units belonging to the player ending their turn:
        if (u.owner === role) {
          // Handle Burrower Beast - stays untargetable for 2 turns
          if (u.effectId === "burrow" && u.untargetable) {
            u.burrowTurnsLeft = (u.burrowTurnsLeft || 2) - 1;
            if (u.burrowTurnsLeft <= 0) {
              u.untargetable = false;
              delete u.burrowTurnsLeft;
              logToLobby(lobby, u.name + " emerges from the ground!");
            }
          } 
          // Phantom Scout - only untargetable for 1 turn (clears after opponent's turn)
          else if (u.effectId === "phantom") {
            u.untargetable = false;
          }
          // Other untargetable effects clear normally
          else if (u.untargetable) {
            u.untargetable = false;
          }
          
          // Clear Archangel Michael's rampage flag
          if (u.michaelUsedThisTurn) {
            delete u.michaelUsedThisTurn;
          }
          
          // Clear Archangel Raphael's deploy immune
          if (u.immuneUntilNextTurn) {
            delete u.immune;
            delete u.immuneUntilNextTurn;
          }
        }
      }
      
      state.activeSide = enemyOf(role); 
      state.movedThisTurn.clear(); 
      state.attackedThisTurn.clear();
      state.moveCountThisTurn = {}; // Reset move counts for new turn
      state.attackCountThisTurn = {}; // Reset attack counts for new turn
      
      // Process cheat code duration effects (counts down each turn)
      processCheatCodeEnd(lobby);
      
      const np = players[state.activeSide]; 
      
      // Calculate passive energy: +1 base, +1 more every 3 turns
      // Turn 1-3: +1, Turn 4-6: +2, Turn 7-9: +3, etc.
      // Challenge mode: AI (silver) gets +4 base instead of +1
      const isAITurn = state.activeSide === "silver" && lobby.isAIGame;
      const baseEnergy = (isAITurn && lobby.isChallenge) ? 4 : 1;
      let energyGain = baseEnergy + Math.floor((state.turnNumber - 1) / 3);
      
      // Energy Well buff tile bonus
      if (playerHasBuff(state, state.activeSide, "energy_buff")) {
        energyGain += 1;
      }
      
      // Challenge mode: AI max energy is 15 instead of 10
      const maxEnergy = (isAITurn && lobby.isChallenge) ? 15 : MAX_ENERGY;
      np.energy = Math.min(np.energy + energyGain, maxEnergy);
      np.hasDrawn = false;
      
      // HESOYAM cheat: drain all energy after gaining it (affects both players)
      if (state.cheatHesoyamActive && state.cheatHesoyamTurnsLeft > 0) {
        np.energy = 0;
        const turnOwner = state.activeSide === "gold" ? "Player" : "Boss";
        logToLobby(lobby, `🎮 HESOYAM: ${turnOwner} energy drained! (${state.cheatHesoyamTurnsLeft} turns left)`);
      }
      
      // Healing Spring buff - heal units on that tile
      for (const key in state.buffTiles) {
        const buff = state.buffTiles[key];
        if (buff.id === "heal_buff") {
          const unitId = state.board[buff.row][buff.col];
          if (unitId && state.units[unitId] && state.units[unitId].owner === state.activeSide) {
            const u = state.units[unitId];
            if (u.hp < u.maxHp) {
              u.hp = Math.min(u.hp + 1, u.maxHp);
              logToLobby(lobby, u.name + " healed by Healing Spring");
            }
          }
        }
      }
      
      processStartOfTurnEffects(lobby, state.activeSide);
      state.turnNumber++; // Increment every turn
      logToLobby(lobby, "--- " + state.activeSide.toUpperCase() + "'s turn (+" + energyGain + " energy) ---");
      combatLogToLobby(lobby, `─── Turn ${state.turnNumber}: ${state.activeSide.toUpperCase()} ───`, "turn-separator");
      
      // Playtest mode: keep energy at 99
      if (lobby.isPlaytest) {
        players.gold.energy = 99;
        players.silver.energy = 99;
        emitPlaytestState(lobby);
      } else {
        emitGameState(lobby);
      }
      
      // If it's now AI's turn, process AI actions
      if (lobby.isAIGame && state.activeSide === "silver" && !state.gameOver) {
        processAITurn(lobby);
      }
      return;
    }

    if (payload.type === "drawCard") {
      const p = players[role];
      if (p.hasDrawn) return socket.emit("log", "Already drew.");
      if (p.deck.length === 0 && p.discard.length === 0) return socket.emit("log", "No cards!");
      if (p.hand.length >= MAX_HAND_SIZE) { socket.emit("mustDiscard", {}); return socket.emit("log", "Hand full!"); }
      
      // Ancient Library buff - draw 2 instead of 1
      const drawCount = playerHasBuff(state, role, "draw_buff") ? 2 : 1;
      drawCards(lobby, role, drawCount); 
      p.hasDrawn = true;
      logToLobby(lobby, role.toUpperCase() + " draws " + drawCount);
      return emitGameState(lobby);
    }

    if (payload.type === "discardCard") {
      const p = players[role]; const idx = p.hand.findIndex(c => c.id === payload.cardId);
      if (idx === -1) return; // stale client state — ignore silently
      const card = p.hand.splice(idx, 1)[0]; p.discard.push(card);
      logToLobby(lobby, role.toUpperCase() + " discards " + card.name);
      return emitGameState(lobby);
    }

    if (payload.type === "playCard") {
      const { cardId, row, col, spawn, targetUnitId } = payload; const p = players[role];
      const idx = p.hand.findIndex(c => c.id === cardId); if (idx === -1) return; // stale state, ignore
      const card = p.hand[idx]; let cost = card.cost || 0;
      
      // GREEDISGOOD cheat: all cards cost 1 energy
      if (state.cheatGreedActive) {
        cost = 1;
      }
      
      // Apply spell discount from Rune Scribe (after GREEDISGOOD, so it can still reduce to 0)
      if (card.type === "spell" && state.spellDiscount && state.spellDiscount[role] > 0) {
        cost = Math.max(0, cost - state.spellDiscount[role]);
        state.spellDiscount[role] = 0; // Consume the discount
        logToLobby(lobby, "Rune Scribe's enchantment reduces spell cost!");
      }
      
      if (p.energy < cost) return socket.emit("log", "Not enough energy.");

      if (card.effect === "instant") {
        // Handle targeted instant spells
        if (card.requiresTarget === "unit") {
          if (!targetUnitId || !state.units[targetUnitId]) return socket.emit("log", "Select a target unit.");
          if (state.units[targetUnitId].owner !== role) return socket.emit("log", "Must target your own unit.");
        }
        if (card.requiresTarget === "enemy_unit") {
          if (!targetUnitId || !state.units[targetUnitId]) return socket.emit("log", "Select a target unit.");
          if (state.units[targetUnitId].owner === role) return socket.emit("log", "Must target an enemy unit.");
        }
        if (card.requiresTarget === "any_unit") {
          if (!targetUnitId || !state.units[targetUnitId]) return socket.emit("log", "Select a target unit.");
        }
        if (card.requiresTarget === "row") {
          if (row === undefined || row === null || row < 0 || row >= ROWS) return socket.emit("log", "Select a target row.");
          // Only fortify_row (Castle Walls) requires your own rows
          // row_damage (Void Collapse) can target any row
          if (card.effectId === "fortify_row" && !canDeployOnRow(state, row, role)) {
            return socket.emit("log", "Can only fortify your own rows.");
          }
        }
        if (card.requiresTarget === "tile") {
          if (row === undefined || row === null || row < 0 || row >= ROWS) return socket.emit("log", "Select a target tile.");
          if (col === undefined || col === null || col < 0 || col >= COLS) return socket.emit("log", "Select a target tile.");
          // Lunar Barrage cannot target home rows
          if (card.effectId === "lunar_aoe") {
            const isHomeRow = row <= 1 || row >= 5;
            if (isHomeRow) return socket.emit("log", "Cannot target home rows.");
          }
        }
        
        p.energy -= cost; p.hand.splice(idx, 1); p.discard.push(card);
        processInstantSpell(lobby, role, card.effectId, row, targetUnitId, col);
        logToLobby(lobby, role.toUpperCase() + " cast " + card.name);
        emitSFX(lobby, card.key, 'deploy'); // Play spell sound
        
        // Storm Drake spell_echo - deal 1 damage to random enemy when spell is cast
        for (const uid in state.units) {
          const u = state.units[uid];
          if (u.owner === role && u.effectId === "spell_echo") {
            const enemies = [];
            for (const eid in state.units) {
              if (state.units[eid].owner !== role && !state.units[eid].untargetable) {
                enemies.push(eid);
              }
            }
            if (enemies.length > 0) {
              const targetId = enemies[Math.floor(Math.random() * enemies.length)];
              const target = state.units[targetId];
              const echoDmg = applyDamageReduction(state, targetId, 1, null, lobby); target.hp -= echoDmg;
              logToLobby(lobby, u.name + " echoes the spell - zaps " + target.name + " for 1 damage!");
              if (target.hp <= 0 && shouldUnitDie(lobby, target)) {
                const targetPos = getUnitPos(state, targetId);
                processOnDeathEffect(lobby, target, target.owner, targetPos);
                processAllyDeathTriggers(lobby, target.owner, target, targetPos);
                if (targetPos) state.board[targetPos.r][targetPos.c] = null;
                discardUnitCard(lobby, target);
                delete state.units[targetId];
                logToLobby(lobby, target.name + " destroyed by spell echo!");
              }
            }
          }
        }
        
        return emitGameState(lobby);
      }

      if (spawn) {
        if (spawn !== role) return socket.emit("log", "Not your spawn.");
        if (state.spawn[spawn]) return socket.emit("log", "Spawn occupied.");
        p.energy -= cost; p.hand.splice(idx, 1);
        const id = genId();
        const unitData = { id, owner: role, key: card.key, name: card.name, atk: card.atk, hp: card.hp, maxHp: card.hp, cost: card.cost, type: card.type || "monster", effect: card.effect, effectId: card.effectId, effectDesc: card.effectDesc, art: card.art, originalCard: card };
        // Preserve range for ranged attackers
        if (card.range) unitData.range = card.range;
        // Preserve stolen flag for Soul Collector cards
        if (card.stolen) unitData.stolen = true;
        // Preserve holo flag for holographic cards
        if (card.isHolo) unitData.isHolo = true;
        // Preserve stationary flag
        if (card.stationary) unitData.stationary = true;
        // Burrower Beast - untargetable for 2 turns
        if (card.effectId === "burrow") {
          unitData.untargetable = true;
          unitData.burrowTurnsLeft = 2;
        }
        // Phantom Scout - untargetable for 1 turn
        if (card.effectId === "phantom") {
          unitData.untargetable = true;
        }
        state.units[id] = unitData;
        state.spawn[spawn] = id;
        logToLobby(lobby, role.toUpperCase() + " deployed " + card.name + " to spawn");
        emitSFX(lobby, card.key, 'deploy'); // Play deploy sound
        return emitGameState(lobby);
      }

      if (row == null || col == null || row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
      if (state.board[row][col]) return socket.emit("log", "Tile occupied.");
      
      // Burrower Beast can deploy cardinal-adjacent to any friendly unit
      let canDeploy = canDeployOnRow(state, row, role);
      if (!canDeploy && card.effectId === "burrow") {
        // Check if there's a friendly unit cardinal-adjacent to this position
        const cardinalOffsets = [{r: -1, c: 0}, {r: 1, c: 0}, {r: 0, c: -1}, {r: 0, c: 1}];
        for (const offset of cardinalOffsets) {
          const nr = row + offset.r;
          const nc = col + offset.c;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
          const adjId = state.board[nr][nc];
          if (adjId && state.units[adjId] && state.units[adjId].owner === role) {
            // Check it's not an enemy home row with HP
            const enemy = enemyOf(role);
            const isEnemyHomeRow = (enemy === "gold" && row <= 1) || (enemy === "silver" && row >= 5);
            if (!isEnemyHomeRow || state.rowHP[row] <= 0) {
              canDeploy = true;
              break;
            }
          }
        }
      }
      
      // Night Shade Ambusher can deploy in neutral zones (rows 2-4)
      if (!canDeploy && card.effectId === "ambush_deploy") {
        if (row >= 2 && row <= 4) {
          canDeploy = true;
        }
      }
      
      // Lucifer Fallen Angel can deploy anywhere
      if (!canDeploy && card.deployAnywhere) {
        // Can deploy anywhere except enemy home rows with HP
        const enemy = enemyOf(role);
        const isEnemyHomeRow = (enemy === "gold" && row <= 1) || (enemy === "silver" && row >= 5);
        if (!isEnemyHomeRow || state.rowHP[row] <= 0) {
          canDeploy = true;
        }
      }
      
      // Angelic Descent buff - next unit can deploy anywhere
      if (!canDeploy && state.angelicDescent && state.angelicDescent[role]) {
        // Can deploy anywhere except enemy home rows with HP
        const enemy = enemyOf(role);
        const isEnemyHomeRow = (enemy === "gold" && row <= 1) || (enemy === "silver" && row >= 5);
        if (!isEnemyHomeRow || state.rowHP[row] <= 0) {
          canDeploy = true;
        }
      }
      
      if (!canDeploy) return socket.emit("log", "Can't deploy here.");
      p.energy -= cost; p.hand.splice(idx, 1);
      const id = genId();
      const unitData = { id, owner: role, key: card.key, name: card.name, atk: card.atk, hp: card.hp, maxHp: card.hp, cost: card.cost, type: card.type || "monster", effect: card.effect, effectId: card.effectId, effectDesc: card.effectDesc, art: card.art, originalCard: card };
      // Preserve range for ranged attackers
      if (card.range) unitData.range = card.range;
      // Preserve stolen flag for Soul Collector cards
      if (card.stolen) unitData.stolen = true;
      // Preserve holo flag for holographic cards
      if (card.isHolo) unitData.isHolo = true;
      // Burrower Beast - untargetable for 2 turns (deploy turn + next turn)
      if (card.effectId === "burrow") {
        unitData.untargetable = true;
        unitData.burrowTurnsLeft = 2;
      }
      // Phantom Scout - untargetable immediately (until your next turn starts)
      if (card.effectId === "phantom") {
        unitData.untargetable = true;
      }
      // Preserve stationary flag
      if (card.stationary) unitData.stationary = true;
      state.units[id] = unitData;
      state.board[row][col] = id;
      
      // Apply eclipse effect to newly deployed unit if eclipse is active
      if (state.eclipseActive && state.eclipseEffect) {
        applyEclipseEffectToUnit(state.units[id], state.eclipseEffect);
      }
      
      // Apply polymorph to newly deployed unit if polymorph is active
      if (state.polymorphActive) {
        polymorphUnit(state, id);
      }
      
      // Check for blood chalice consumption
      checkChaliceConsumption(lobby, id, row, col);
      
      recomputeOwners(state); // Update row ownership after placing unit
      
      // Process on-deploy effects
      if (card.effectId === "gem_spawn") {
        // Emerald Forager - spawn a Gem Shard in adjacent empty tile
        const adjacentTiles = [
          { r: row - 1, c: col }, { r: row + 1, c: col },
          { r: row, c: col - 1 }, { r: row, c: col + 1 }
        ];
        let spawned = false;
        for (const tile of adjacentTiles) {
          if (!canSpawnAtTile(state, tile.r, tile.c, role)) continue;
          // Found empty tile, spawn gem
          const gemId = genId();
          state.units[gemId] = {
            id: gemId,
            owner: role,
            key: "gemshard",
            name: "Gem Shard",
            atk: 1,
            hp: 1,
            maxHp: 1,
            type: "structure",
            art: "/images/Gem Shard.png"
          };
          state.board[tile.r][tile.c] = gemId;
          
          // Apply polymorph to spawned gem if polymorph is active
          if (state.polymorphActive) {
            polymorphUnit(state, gemId);
          }
          
          logToLobby(lobby, card.name + " summons a Gem Shard!");
          spawned = true;
          break;
        }
        if (!spawned) {
        }
      }
      
      // Chrono Drake - Time Rift: show discard selection to resurrect a unit
      if (card.effectId === "time_rift") {
        const unitsInDiscard = p.discard.filter(c => c.type === "monster" || c.type === "structure");
        
        if (unitsInDiscard.length > 0) {
          // Store the deploy position for resurrection
          const deployPos = { r: row, c: col };
          
          // Set pending time rift state
          if (!state.pendingTimeRift) state.pendingTimeRift = {};
          state.pendingTimeRift[role] = {
            active: true,
            deployPos: deployPos
          };
          
          logToLobby(lobby, "Chrono Drake opens a Time Rift! Choose a unit to resurrect.");
          
          // Emit event to client to show discard selection
          if (socket) {
            socket.emit("timeRiftTrigger", { 
              units: unitsInDiscard.map(c => ({ id: c.id, key: c.key, name: c.name, atk: c.atk, hp: c.maxHp || c.hp, art: c.art })),
              deployPos: deployPos
            });
          }
        } else {
          logToLobby(lobby, "Chrono Drake finds no units in discard to resurrect!");
        }
      }
      
      // Cherub Hymnist - draw a card on deploy
      if (card.effectId === "cherub_draw") {
        drawCards(lobby, role, 1);
        logToLobby(lobby, card.name + " sings a hymn! Draw a card.");
      }
      
      // Archangel Raphael - immune when played
      if (card.effectId === "raphael_shield") {
        state.units[id].immune = true;
        state.units[id].immuneUntilNextTurn = true;
        logToLobby(lobby, card.name + " descends with divine protection!");
      }
      
      // Check for Angelic Descent buff (deploy anywhere + damage adjacent)
      if (state.angelicDescent && state.angelicDescent[role]) {
        // Deal 1 damage to adjacent enemies
        let damaged = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = row + dr, nc = col + dc;
            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
            const adjId = state.board[nr][nc];
            if (adjId && state.units[adjId] && state.units[adjId].owner !== role) {
              const enemy = state.units[adjId];
              const adjDmg = applyDamageReduction(state, adjId, 1, null, lobby); enemy.hp -= adjDmg;
              damaged++;
              if (enemy.hp <= 0) {
                const adjPos = { r: nr, c: nc };
                processOnDeathEffect(lobby, enemy, enemy.owner, adjPos);
                processAllyDeathTriggers(lobby, enemy.owner, enemy, adjPos);
                state.board[nr][nc] = null;
                discardUnitCard(lobby, enemy);
                delete state.units[adjId];
              }
            }
          }
        }
        if (damaged > 0) {
          logToLobby(lobby, "Angelic Descent deals 1 damage to " + damaged + " adjacent enemies!");
        }
        delete state.angelicDescent[role];
      }
      
      logToLobby(lobby, role.toUpperCase() + " played " + card.name);
      emitSFX(lobby, card.key, 'deploy'); // Play deploy sound
      return emitGameState(lobby);
    }

    if (payload.type === "moveFromSpawn") {
      const { unitId, toRow, toCol } = payload;
      if (state.spawn[role] !== unitId) return socket.emit("log", "Not your spawn unit.");
      const u = state.units[unitId]; if (!u || u.owner !== role) return;
      if (state.movedThisTurn.has(unitId)) return socket.emit("log", "Already moved.");
      if (toRow < 0 || toRow >= ROWS || toCol < 0 || toCol >= COLS || state.board[toRow][toCol]) return socket.emit("log", "Invalid.");
      const hr = role === "gold" ? [0, 1] : [5, 6]; if (!hr.includes(toRow)) return socket.emit("log", "Home rows only.");
      state.spawn[role] = null; state.board[toRow][toCol] = unitId; state.movedThisTurn.add(unitId);
      state.moveCountThisTurn[unitId] = 1;
      
      // Check for blood chalice consumption
      checkChaliceConsumption(lobby, unitId, toRow, toCol);
      
      recomputeOwners(state); // Update row ownership
      
      // Process on-deploy effects when unit enters board from spawn
      if (u.effectId === "gem_spawn") {
        // Emerald Forager - spawn a Gem Shard in adjacent empty tile
        const adjacentTiles = [
          { r: toRow - 1, c: toCol }, { r: toRow + 1, c: toCol },
          { r: toRow, c: toCol - 1 }, { r: toRow, c: toCol + 1 }
        ];
        for (const tile of adjacentTiles) {
          if (!canSpawnAtTile(state, tile.r, tile.c, role)) continue;
          // Found empty tile, spawn gem
          const gemId = genId();
          state.units[gemId] = {
            id: gemId,
            owner: role,
            key: "gemshard",
            name: "Gem Shard",
            atk: 1,
            hp: 1,
            maxHp: 1,
            type: "structure",
            art: "/images/Gem Shard.png"
          };
          state.board[tile.r][tile.c] = gemId;
          
          // Apply polymorph to spawned gem if polymorph is active
          if (state.polymorphActive) {
            polymorphUnit(state, gemId);
          }
          
          logToLobby(lobby, u.name + " summons a Gem Shard!");
          break;
        }
      }
      
      logToLobby(lobby, role.toUpperCase() + "'s " + u.name + " entered board");
      return emitGameState(lobby);
    }

    if (payload.type === "move") {
      const { unitId, toRow, toCol } = payload; const u = state.units[unitId];
      if (!u || u.owner !== role) return;
      
      // Check if unit is stationary (cannot move at all, like Meditation Monk)
      if (u.stationary) {
        return socket.emit("log", `${u.name} cannot move!`);
      }
      
      // Check if unit is frozen (Obsidian gem)
      if (u.frozen) {
        console.log(`[PLAYER MOVE] BLOCKED - ${u.name} is frozen (${u.frozen} turns)`);
        return socket.emit("log", `${u.name} is frozen and cannot move!`);
      }
      
      // Check if unit is rooted by Moon Shadow Warden's shadow_root
      if (u.rooted) {
        return socket.emit("log", "Can't move - rooted by shadow magic!");
      }
      
      // Check if unit is rooted by Coffin Trapper's root_aura
      const from = getUnitPos(state, unitId); 
      if (!from) return socket.emit("log", "Unit not found.");
      
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = from.r + dr, nc = from.c + dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
          const adjId = state.board[nr][nc];
          if (adjId && state.units[adjId] && state.units[adjId].owner !== role && state.units[adjId].effectId === "root_aura") {
            return socket.emit("log", "Can't move - rooted by " + state.units[adjId].name + "!");
          }
        }
      }
      
      // Check move limits based on unit abilities
      const moveCount = state.moveCountThisTurn[unitId] || 0;
      const canDoubleMove = u.effectId === "double_move" || playerHasBuff(state, role, "move_buff");
      const canTripleMove = u.effectId === "triple_move";
      const canLongMove = u.effectId === "stampede"; // Can move 2 tiles but only once
      const hasUnlimitedMoves = u.gemBuffs && u.gemBuffs.unlimitedMoves; // Diamond gem buff
      const maxMoves = hasUnlimitedMoves ? 999 : (canTripleMove ? 3 : (canDoubleMove ? 2 : 1));
      
      console.log(`[PLAYER MOVE] ${u.name}: moveCount=${moveCount}, maxMoves=${maxMoves}, frozen=${u.frozen}, unlimitedMoves=${hasUnlimitedMoves}`);
      
      if (moveCount >= maxMoves) return socket.emit("log", "No more moves for this unit.");
      if (toRow < 0 || toRow >= ROWS || toCol < 0 || toCol >= COLS) return socket.emit("log", "Invalid.");
      
      // Sapphire Dancer fairy_swap - can swap positions with any friendly unit
      if (u.effectId === "fairy_swap" && state.board[toRow][toCol]) {
        const targetUnitId = state.board[toRow][toCol];
        if (targetUnitId && state.units[targetUnitId]) {
          const targetUnit = state.units[targetUnitId];
          if (targetUnit.owner === role && targetUnitId !== unitId) {
            // Valid swap target - perform the swap
            state.board[from.r][from.c] = targetUnitId;
            state.board[toRow][toCol] = unitId;
            state.movedThisTurn.add(unitId);
            if (!state.moveCountThisTurn) state.moveCountThisTurn = {};
            state.moveCountThisTurn[unitId] = maxMoves; // Use up all moves
            recomputeOwners(state);
            logToLobby(lobby, u.name + " swaps with " + targetUnit.name + "!");
            const swapAnim = { type: "effect", effectType: "fairy_swap", fromPos: { r: from.r, c: from.c }, toPos: { r: toRow, c: toCol } };
            if (lobby.hostSocket) lobby.hostSocket.emit("animate", swapAnim);
            if (lobby.guestSocket) lobby.guestSocket.emit("animate", swapAnim);
            return emitGameState(lobby);
          }
        }
      }
      
      // Normal move - tile must be empty
      if (state.board[toRow][toCol]) return socket.emit("log", "Invalid.");
      
      // Calculate distance
      const rowDist = Math.abs(from.r - toRow);
      const colDist = Math.abs(from.c - toCol);
      
      // Squire knight_leap ability - can move to adjacent tile of any Knight
      let validMove = isAdjacent(from.r, from.c, toRow, toCol);
      
      // Stampede can move up to 2 tiles in a straight line (cardinal)
      if (canLongMove && !validMove) {
        const isStraightLine = (rowDist <= 2 && colDist === 0) || (colDist <= 2 && rowDist === 0);
        if (isStraightLine) {
          // Check path is clear for 2-tile move
          let pathClear = true;
          if (rowDist === 2 && colDist === 0) {
            const midRow = from.r + (toRow > from.r ? 1 : -1);
            if (state.board[midRow][from.c]) pathClear = false;
          } else if (colDist === 2 && rowDist === 0) {
            const midCol = from.c + (toCol > from.c ? 1 : -1);
            if (state.board[from.r][midCol]) pathClear = false;
          }
          if (pathClear) validMove = true;
        }
      }
      
      if (u.effectId === "knight_leap" && !validMove) {
        // Check if destination is adjacent to any knight
        for (const id in state.units) {
          const other = state.units[id];
          if (other.owner === role && other.key === "knight") {
            const kpos = getUnitPos(state, id);
            if (kpos && isAdjacent(kpos.r, kpos.c, toRow, toCol)) {
              validMove = true;
              break;
            }
          }
        }
      }
      
      if (!validMove) return socket.emit("log", "Must be adjacent (or use special movement ability).");
      
      // Check if trying to move into enemy home row
      const enemy = enemyOf(role);
      const isEnemyHomeRow = (enemy === "gold" && toRow <= 1) || (enemy === "silver" && toRow >= 5);
      if (isEnemyHomeRow && state.rowHP[toRow] > 0) {
        return socket.emit("log", "Can't move into enemy row until its HP is 0.");
      }
      
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", { type: "move", unitId, fromRow: from.r, fromCol: from.c, toRow, toCol });
      if (lobby.guestSocket) lobby.guestSocket.emit("animate", { type: "move", unitId, fromRow: from.r, fromCol: from.c, toRow, toCol });
      state.board[from.r][from.c] = null; state.board[toRow][toCol] = unitId;
      
      // Check for blood chalice consumption
      checkChaliceConsumption(lobby, unitId, toRow, toCol);
      
      // Track move count
      state.moveCountThisTurn[unitId] = moveCount + 1;
      if (state.moveCountThisTurn[unitId] >= maxMoves) {
        state.movedThisTurn.add(unitId);
      }
      
      // Seraphic Hunter - if moved, can't attack this turn
      if (u.effectId === "seraphic_range") {
        state.attackedThisTurn.add(unitId);
        logToLobby(lobby, u.name + " moved and cannot attack this turn.");
      }
      
      recomputeOwners(state); // Recompute after move to update row ownership
      logToLobby(lobby, role.toUpperCase() + " moved" + (canDoubleMove && state.moveCountThisTurn[unitId] < maxMoves ? " (can move again)" : ""));
      return emitGameState(lobby);
    }

    if (payload.type === "attackUnit") {
      const { attackerId, targetId } = payload;
      const a = state.units[attackerId], t = state.units[targetId];
      if (!a || !t || a.owner !== role) return;
      
      // Check if attacker is frozen (Obsidian gem)
      if (a.frozen) {
        console.log(`[PLAYER ATTACK] BLOCKED - ${a.name} is frozen (${a.frozen} turns)`);
        return socket.emit("log", `${a.name} is frozen and cannot attack!`);
      }
      
      // UFO Scraper can attack friendly aliens to absorb stats
      const isAbsorbAttack = a.effectId === "absorb_ally" && t.owner === role;
      
      // Opal Devourer can attack friendly Gem Shards to gain +2/+2
      const isConsumeGem = a.effectId === "consume_gem" && t.owner === role && t.key === "gemshard";
      
      // Lunar Priestess can attack allies to heal them
      const isHealAttack = a.effectId === "heal_attack" && t.owner === role;
      
      // Normal attacks can't target own units (unless special ability)
      if (t.owner === role && !isAbsorbAttack && !isConsumeGem && !isHealAttack) return;
      
      // Check if target is untargetable (Burrower Beast on deploy turn)
      if (t.untargetable && !isAbsorbAttack && !isConsumeGem) return socket.emit("log", t.name + " is untargetable this turn.");
      
      // Check if unit has already attacked (considering double attack buff and topaz gem buff)
      const attackCount = state.attackCountThisTurn?.[attackerId] || 0;
      const baseAttacks = 1;
      const doubleAttackBonus = a.canDoubleAttack ? 1 : 0;
      const bloodBiteBonus = a.effectId === "blood_bite" ? 1 : 0;
      const topazBonus = (a.gemBuffs && a.gemBuffs.extraAttacks) || 0;
      const maxAttacks = baseAttacks + doubleAttackBonus + bloodBiteBonus + topazBonus;
      
      console.log(`[PLAYER ATTACK] ${a.name}: attackCount=${attackCount}, maxAttacks=${maxAttacks}, frozen=${a.frozen}, topazBonus=${topazBonus}`);
      
      if (attackCount >= maxAttacks) return socket.emit("log", "Already attacked.");
      
      const ap = getUnitPos(state, attackerId), tp = getUnitPos(state, targetId);
      if (!ap || !tp) return socket.emit("log", "Position not found.");
      
      // Check attack range based on unit abilities
      let validAttack = false;
      
      // Calculate bonus range from Hunting God's Blessing
      const bonusRange = a.bonusRange || 0;
      
      // Peasant diagonal_attack - can attack diagonally
      if (a.effectId === "diagonal_attack") {
        validAttack = isAdjacent(ap.r, ap.c, tp.r, tp.c);
      }
      // Vampire Lord lifesteal_lord - can attack diagonally
      else if (a.effectId === "lifesteal_lord") {
        validAttack = isAdjacent(ap.r, ap.c, tp.r, tp.c);
      }
      // Archer ranged - can attack 2 tiles away (cardinal only)
      else if (a.effectId === "ranged") {
        const rowDist = Math.abs(ap.r - tp.r);
        const colDist = Math.abs(ap.c - tp.c);
        // Cardinal attack up to 2 tiles (+ bonus range)
        const maxRange = 2 + bonusRange;
        validAttack = (rowDist <= maxRange && colDist === 0) || (colDist <= maxRange && rowDist === 0);
      }
      // Star Weave Archer - ranged 2
      else if (a.effectId === "starweave_ranged") {
        const rowDist = Math.abs(ap.r - tp.r);
        const colDist = Math.abs(ap.c - tp.c);
        const maxRange = 2 + bonusRange;
        validAttack = (rowDist <= maxRange && colDist === 0) || (colDist <= maxRange && rowDist === 0);
      }
      // Bone Revolver ranged_pierce - ranged that ignores shields
      else if (a.effectId === "ranged_pierce") {
        const rowDist = Math.abs(ap.r - tp.r);
        const colDist = Math.abs(ap.c - tp.c);
        // Cardinal attack up to 2 tiles
        validAttack = (rowDist <= 2 && colDist === 0) || (colDist <= 2 && rowDist === 0);
      }
      // Seraphic Hunter - range 3, cardinal only
      else if (a.effectId === "seraphic_range" || a.range) {
        const rowDist = Math.abs(ap.r - tp.r);
        const colDist = Math.abs(ap.c - tp.c);
        const maxRange = (a.range || 3) + bonusRange;
        validAttack = (rowDist <= maxRange && colDist === 0) || (colDist <= maxRange && rowDist === 0);
      }
      // Default: cardinal adjacent only (+ bonus range)
      else {
        if (bonusRange > 0) {
          const rowDist = Math.abs(ap.r - tp.r);
          const colDist = Math.abs(ap.c - tp.c);
          const maxRange = 1 + bonusRange;
          validAttack = (rowDist <= maxRange && colDist === 0) || (colDist <= maxRange && rowDist === 0);
        } else {
          validAttack = isCardinalAdjacent(ap.r, ap.c, tp.r, tp.c);
        }
      }
      
      if (!validAttack) return socket.emit("log", "Target out of range.");
      
      // Handle UFO Scraper absorb attack
      if (isAbsorbAttack) {
        // Emit absorb animation - target floats into UFO
        const animData = { 
          type: "effect", 
          effectType: "ufo_absorb", 
          sourcePos: { r: ap.r, c: ap.c },
          targetPos: { r: tp.r, c: tp.c },
          targetArt: t.art,
          targetName: t.name
        };
        if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
        if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
        
        // UFO Scraper kills friendly and absorbs stats
        const absorbedAtk = t.atk;
        const absorbedHp = t.hp;
        a.atk += absorbedAtk;
        a.hp += absorbedHp;
        a.maxHp = (a.maxHp || 1) + (t.maxHp || t.hp);
        // Track the buff
        if (!a.permBuffs) a.permBuffs = [];
        a.permBuffs.push({ atk: absorbedAtk, hp: absorbedHp, source: `Absorbed ${t.name}` });
        logToLobby(lobby, a.name + " absorbs " + t.name + "! Now " + a.atk + "/" + a.hp);
        
        // Process death effects (Coffin resurrect, Undertaker growth, etc.)
        processOnDeathEffect(lobby, t, t.owner, { r: tp.r, c: tp.c });
        processAllyDeathTriggers(lobby, t.owner, t, { r: tp.r, c: tp.c });
        
        state.board[tp.r][tp.c] = null;
        discardUnitCard(lobby, t);
        delete state.units[targetId];
        state.attackedThisTurn.add(attackerId);
        a.attackCountThisTurn = (a.attackCountThisTurn || 0) + 1;
        return emitGameState(lobby);
      }
      
      // Handle Opal Devourer consume gem attack
      if (isConsumeGem) {
        // Opal Devourer consumes friendly Gem Shard for +2/+2
        a.atk += 2;
        a.hp += 2;
        a.maxHp = (a.maxHp || a.hp) + 2;
        // Track the buff
        if (!a.permBuffs) a.permBuffs = [];
        a.permBuffs.push({ atk: 2, hp: 2, source: "Opal Devourer (devoured gem)" });
        logToLobby(lobby, a.name + " devours " + t.name + "! +2/+2 (now " + a.atk + "/" + a.hp + ")");
        
        // Process death effects (Prismatic Fairy triggers)
        processOnDeathEffect(lobby, t, t.owner, { r: tp.r, c: tp.c });
        processAllyDeathTriggers(lobby, t.owner, t, { r: tp.r, c: tp.c });
        
        state.board[tp.r][tp.c] = null;
        discardUnitCard(lobby, t);
        delete state.units[targetId];
        if (!state.attackCountThisTurn) state.attackCountThisTurn = {};
        state.attackCountThisTurn[attackerId] = (state.attackCountThisTurn[attackerId] || 0) + 1;
        if (state.attackCountThisTurn[attackerId] >= maxAttacks) {
          state.attackedThisTurn.add(attackerId);
        }
        return emitGameState(lobby);
      }
      
      // Handle Lunar Priestess heal attack
      if (isHealAttack) {
        // Heal ally for ATK amount
        const healAmount = a.atk;
        const oldHp = t.hp;
        t.hp = Math.min(t.hp + healAmount, t.maxHp || t.hp + healAmount);
        const actualHeal = t.hp - oldHp;
        logToLobby(lobby, a.name + " blesses " + t.name + " with lunar light! +" + actualHeal + " HP (now " + t.hp + ")");
        if (!state.attackCountThisTurn) state.attackCountThisTurn = {};
        state.attackCountThisTurn[attackerId] = (state.attackCountThisTurn[attackerId] || 0) + 1;
        if (state.attackCountThisTurn[attackerId] >= maxAttacks) {
          state.attackedThisTurn.add(attackerId);
        }
        return emitGameState(lobby);
      }
      
      // Calculate damage
      let dmg = getEffectiveAtk(state, attackerId, targetId);
      
      // Blood Familiar - second attack only deals 1 damage
      const isBloodBiteSecond = a.effectId === "blood_bite" && attackCount >= 1;
      if (isBloodBiteSecond) {
        dmg = 1;
      }
      
      // Combat log header
      combatLogToLobby(lobby, `⚔️ ${a.name} attacks ${t.name}`, "combat-header");
      if (isBloodBiteSecond) {
        combatLogToLobby(lobby, `Blood Bite (second attack): 1 damage`, "combat-step");
      } else {
        combatLogToLobby(lobby, `Base ATK: ${a.atk}`, "combat-step");
        if (dmg !== a.atk) {
          combatLogToLobby(lobby, `Modified ATK: ${dmg} (buffs/debuffs applied)`, "combat-step");
        }
      }
      
      const dmgBeforeReduction = dmg;
      dmg = applyDamageReduction(state, targetId, dmg, attackerId, lobby);
      if (dmg !== dmgBeforeReduction) {
        combatLogToLobby(lobby, `Damage reduced: ${dmgBeforeReduction} → ${dmg} (Shield Bearer/armor)`, "combat-step");
      }
      
      const before = t.hp; 
      
      // Diamond Guardian bodyguard - redirects 1 damage from adjacent allies to self
      let bodyguardId = null;
      if (dmg > 0) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = tp.r + dr, nc = tp.c + dc;
            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
            const aid = state.board[nr][nc];
            if (aid && state.units[aid] && state.units[aid].owner === t.owner && 
                state.units[aid].effectId === "bodyguard" && aid !== targetId) {
              bodyguardId = aid;
              break;
            }
          }
          if (bodyguardId) break;
        }
      }
      
      if (bodyguardId && dmg > 0) {
        const bodyguard = state.units[bodyguardId];
        bodyguard.hp -= 1;
        dmg -= 1;
        logToLobby(lobby, bodyguard.name + " intercepts 1 damage!");
        // Emit bodyguard glow animation
        const bgPos = getUnitPos(state, bodyguardId);
        if (bgPos) {
          const animData = { type: "effect", effectType: "bodyguard_glow", targetPos: bgPos, protectedPos: { r: tp.r, c: tp.c } };
          if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
          if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
        }
        if (bodyguard.hp <= 0) {
          const bgPos2 = getUnitPos(state, bodyguardId);
          processOnDeathEffect(lobby, bodyguard, bodyguard.owner, bgPos2, attackerId);
          processAllyDeathTriggers(lobby, bodyguard.owner, bodyguard, bgPos2);
          if (bgPos2) state.board[bgPos2.r][bgPos2.c] = null;
          discardUnitCard(lobby, bodyguard);
          delete state.units[bodyguardId];
          logToLobby(lobby, bodyguard.name + " destroyed protecting ally!");
        }
      }
      
      t.hp -= dmg;
      
      combatLogToLobby(lobby, `${t.name}: ${before} HP - ${dmg} damage = ${t.hp} HP`, "combat-result");
      
      // Emit attack animation (attacker budges toward target, target shakes)
      const attackAnim = { type: "attack", attackerRow: ap.r, attackerCol: ap.c, targetRow: tp.r, targetCol: tp.c };
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", attackAnim);
      if (lobby.guestSocket) lobby.guestSocket.emit("animate", attackAnim);
      
      // Amethyst Enchanter reflect_damage - reflects 1 damage back to attacker
      if (t.effectId === "reflect_damage" && dmg > 0 && state.units[attackerId]) {
        const refDmg = applyDamageReduction(state, attackerId, 1, null, lobby); a.hp -= refDmg;
        logToLobby(lobby, t.name + " reflects 1 damage back to " + a.name + "!");
        // Emit reflect animation
        if (refDmg > 0) {
          const animData = { type: "effect", effectType: "amethyst_reflect", sourcePos: { r: tp.r, c: tp.c }, targetPos: { r: ap.r, c: ap.c } };
          if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
          if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
        }
        if (a.hp <= 0) {
          const attackerPos = getUnitPos(state, attackerId);
          processOnDeathEffect(lobby, a, a.owner, attackerPos);
          processAllyDeathTriggers(lobby, a.owner, a, attackerPos);
          if (attackerPos) state.board[attackerPos.r][attackerPos.c] = null;
          discardUnitCard(lobby, a);
          delete state.units[attackerId];
          logToLobby(lobby, a.name + " destroyed by reflected damage!");
        }
      }
      
      // Mirror Wizard - arcane reflection: deal FULL damage back to attacker
      if (t.effectId === "arcane_reflection" && t.hp > 0 && dmg > 0 && state.units[attackerId]) {
        const reflectDmg = dmg;
        const beforeAttacker = a.hp;
        a.hp -= reflectDmg;
        
        combatLogToLobby(lobby, `🪞 ${t.name} - Arcane Reflection`, "combat-header");
        combatLogToLobby(lobby, `${a.name}: ${beforeAttacker} HP - ${reflectDmg} = ${a.hp} HP`, "combat-result");
        logToLobby(lobby, t.name + " reflects " + reflectDmg + " damage back to " + a.name + "!");
        
        // Emit animation for reflection damage
        emitEffectAnimation(lobby, null, [{ r: ap.r, c: ap.c }], "arcane_reflection");
        
        if (a.hp <= 0 && shouldUnitDie(lobby, a)) {
          combatLogToLobby(lobby, `💀 ${a.name} DESTROYED by reflection`, "combat-death");
          processOnDeathEffect(lobby, a, a.owner, ap);
          processAllyDeathTriggers(lobby, a.owner, a, ap);
          state.board[ap.r][ap.c] = null;
          discardUnitCard(lobby, a);
          delete state.units[attackerId];
          logToLobby(lobby, a.name + " destroyed by arcane reflection!");
        }
      }
      
      // hp_buff and moonflare aura give virtual HP - unit survives at 0 HP if buff active
      const hpBuffBonus = getTotalHpBonus(state, targetId);
      const effectiveHp = t.hp + hpBuffBonus;
      
      // Send damage animation
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", { type: "damage", row: tp.r, col: tp.c });
      if (lobby.guestSocket) lobby.guestSocket.emit("animate", { type: "damage", row: tp.r, col: tp.c });
      
      // Play attack sound for attacker
      emitSFX(lobby, a.key, 'attack');
      
      // Adaptive Colossus - gains +1 max HP when surviving damage (for the target if it has this ability)
      if (t.effectId === "adapt_hp" && t.hp > 0 && dmg > 0) {
        t.maxHp = (t.maxHp || t.hp) + 1;
        logToLobby(lobby, t.name + " adapts! Max HP now " + t.maxHp);
        // Big green cross animation
        const adaptPos = getUnitPos(state, targetId);
        if (adaptPos) {
          const animData = { type: "effect", effectType: "heal_on_kill", sourcePos: adaptPos };
          if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
          if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
        }
      }
      
      // Track attack count
      if (!state.attackCountThisTurn) state.attackCountThisTurn = {};
      state.attackCountThisTurn[attackerId] = (state.attackCountThisTurn[attackerId] || 0) + 1;
      const newAttackCount = state.attackCountThisTurn[attackerId];
      if (newAttackCount >= maxAttacks) {
        state.attackedThisTurn.add(attackerId);
      }
      
      // Seraphic Hunter - if attacked, can't move this turn
      if (a.effectId === "seraphic_range") {
        state.movedThisTurn.add(attackerId);
        state.moveCountThisTurn[attackerId] = 999; // Ensure can't move
      }
      
      logToLobby(lobby, a.name + " deals " + dmg + " to " + t.name + (newAttackCount < maxAttacks ? " (can attack again)" : ""));
      
      // === BLESSING EFFECTS ON ATTACK ===
      // Blessing of Might - gain +1 ATK on attack
      if (a.mightBlessing && state.units[attackerId]) {
        a.atk += 1;
        logToLobby(lobby, a.name + "'s Blessing of Might grants +1 ATK!");
        triggerStatGainEffects(lobby, 'atk', 1, attackerId);
      }
      
      // Blessing of Vigor - attacker gains energy
      if (a.vigorBlessing && state.units[attackerId]) {
        const p = players[role];
        p.energy = Math.min(p.energy + 1, MAX_ENERGY);
        logToLobby(lobby, a.name + "'s Blessing of Vigor grants 1 energy!");
      }
      
      // Blessing of Kings - attacker draws
      if (a.kingsBlessing && state.units[attackerId]) {
        drawCards(lobby, role, 1);
        logToLobby(lobby, a.name + "'s Blessing of Kings draws a card!");
      }
      
      // === LIFESTEAL EFFECTS ===
      // Check if attacker has lifesteal
      const hasLifesteal = a.effectId === "lifesteal" || 
                           a.effectId === "lifesteal_weaken" || 
                           a.effectId === "lifesteal_grow" ||
                           a.effectId === "lifesteal_lord" ||
                           hasVampireLordBuff(state, role);
      
      if (hasLifesteal && dmg > 0) {
        // Lifesteal heals the unit for 1 HP when attacking
        const maxHp = a.maxHp || a.hp;
        if (a.hp < maxHp) {
          const hpBefore = a.hp;
          a.hp = Math.min(a.hp + 1, maxHp);
          logToLobby(lobby, a.name + " drains life! +1 HP");
          combatLogToLobby(lobby, `Lifesteal (attacker): ${a.name} heals ${hpBefore} → ${a.hp} HP`, "combat-lifesteal");
          // Emit lifesteal animation
          const lsPos = getUnitPos(state, attackerId);
          const lsTargetPos = getUnitPos(state, targetId);
          if (lsPos && lsTargetPos) {
            const animData = { type: "effect", effectType: "lifesteal", sourcePos: lsTargetPos, targetPos: lsPos };
            if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
            if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
          }
        } else {
          combatLogToLobby(lobby, `Lifesteal (attacker): ${a.name} already at max HP`, "combat-step");
        }
      }
      
      // Neural Harvester - gain energy if target survives
      if (a.effectId === "energy_on_hit" && t.hp > 0) {
        lobby.gameState.players[role].energy = Math.min(lobby.gameState.players[role].energy + 1, MAX_ENERGY);
        logToLobby(lobby, a.name + " harvests 1 energy!");
        const harvesterPos = getUnitPos(state, attackerId);
        if (harvesterPos) {
          const animData = { type: "effect", effectType: "energy_bolt", sourcePos: harvesterPos, role: role };
          if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
          if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
        }
      }
      
      // Blood Familiar blood_bite - second attack handled via maxAttacks (no auto-bite needed)
      
      // Recalculate effective HP after all damage (including blood_bite)
      // Re-check moonflare aura in case positions changed
      const finalHpBuffBonus = getTotalHpBonus(state, targetId);
      const finalEffectiveHp = t.hp + finalHpBuffBonus;
      
      // Royal Guard cleave - splash half damage to adjacent enemies of target
      if (a.effectId === "cleave") {
        const splashDmg = Math.floor(dmg / 2);
        if (splashDmg > 0) {
          const splashPositions = [
            { r: tp.r, c: tp.c - 1 },
            { r: tp.r, c: tp.c + 1 }
          ];
          for (const sp of splashPositions) {
            if (sp.c < 0 || sp.c >= COLS) continue;
            const splashId = state.board[sp.r][sp.c];
            if (splashId && state.units[splashId] && state.units[splashId].owner !== role) {
              const splashTarget = state.units[splashId];
              if (splashTarget.untargetable) continue;
              const reducedSplash = applyDamageReduction(state, splashId, splashDmg, attackerId, lobby);
              splashTarget.hp -= reducedSplash;
              logToLobby(lobby, a.name + " cleaves " + splashTarget.name + " for " + reducedSplash);
              if (splashTarget.hp <= 0 && shouldUnitDie(lobby, splashTarget)) {
                processOnDeathEffect(lobby, splashTarget, splashTarget.owner, { r: sp.r, c: sp.c });
                processAllyDeathTriggers(lobby, splashTarget.owner, splashTarget, { r: sp.r, c: sp.c });
                state.board[sp.r][sp.c] = null;
                discardUnitCard(lobby, splashTarget);
                delete state.units[splashId];
                logToLobby(lobby, splashTarget.name + " destroyed by cleave!");
              }
            }
          }
        }
      }
      
      // Spore Titan - deals 1 damage to enemies adjacent to the TARGET (not the attacker)
      if (a.effectId === "half_damage_aura") {
        const splashPositions = [
          { r: tp.r, c: tp.c - 1 },
          { r: tp.r, c: tp.c + 1 },
          { r: tp.r - 1, c: tp.c },
          { r: tp.r + 1, c: tp.c }
        ];
        const hitPositions = []; // Track positions that actually get hit
        for (const sp of splashPositions) {
          if (sp.r < 0 || sp.r >= ROWS || sp.c < 0 || sp.c >= COLS) continue;
          const splashId = state.board[sp.r][sp.c];
          if (splashId && state.units[splashId] && state.units[splashId].owner !== role) {
            const splashTarget = state.units[splashId];
            if (splashTarget.untargetable) continue;
            const spDmg2 = applyDamageReduction(state, splashId, 1, attackerId, lobby); splashTarget.hp -= spDmg2;
            hitPositions.push({ r: sp.r, c: sp.c });
            logToLobby(lobby, a.name + " spore damages " + splashTarget.name + " for 1");
            if (splashTarget.hp <= 0 && shouldUnitDie(lobby, splashTarget)) {
              processOnDeathEffect(lobby, splashTarget, splashTarget.owner, { r: sp.r, c: sp.c });
              processAllyDeathTriggers(lobby, splashTarget.owner, splashTarget, { r: sp.r, c: sp.c });
              state.board[sp.r][sp.c] = null;
              discardUnitCard(lobby, splashTarget);
              delete state.units[splashId];
              logToLobby(lobby, splashTarget.name + " destroyed by spores!");
            }
          }
        }
        // Emit spore cloud animation for hit tiles
        if (hitPositions.length > 0) {
          const animData = {
            type: "effect",
            effectType: "spore_cloud",
            sourcePos: tp,
            targets: hitPositions
          };
          if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
          if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
        }
      }
      
      // Archangel Gabriel - deal 1 damage to all enemies in target's row
      if (a.effectId === "gabriel_wrath" && tp) {
        let rowDamage = 0;
        const toRemoveRow = [];
        for (let c = 0; c < COLS; c++) {
          const uid = state.board[tp.r][c];
          if (uid && uid !== payload.targetId && state.units[uid] && state.units[uid].owner !== role) {
            const rwDmg2 = applyDamageReduction(state, uid, 1, attackerId, lobby); state.units[uid].hp -= rwDmg2;
            rowDamage++;
            if (state.units[uid].hp <= 0 && shouldUnitDie(lobby, state.units[uid])) {
              toRemoveRow.push({ uid, pos: { r: tp.r, c } });
            }
          }
        }
        for (const { uid, pos } of toRemoveRow) {
          const deadUnit = state.units[uid];
          processOnDeathEffect(lobby, deadUnit, deadUnit.owner, pos);
          processAllyDeathTriggers(lobby, deadUnit.owner, deadUnit, pos);
          state.board[pos.r][pos.c] = null;
          discardUnitCard(lobby, deadUnit);
          delete state.units[uid];
        }
        if (rowDamage > 0) {
          logToLobby(lobby, a.name + "'s wrath deals 1 damage to " + rowDamage + " enemies in the row!");
        }
      }
      
      if (finalEffectiveHp <= 0) {
        // Death Ward (Lunar Prayer) - survives lethal damage once with 1 HP
        if (t.deathWard) {
          t.hp = 1;
          t.deathWard = false;
          logToLobby(lobby, t.name + "'s Lunar Prayer activates! Survives with 1 HP!");
          combatLogToLobby(lobby, `✨ ${t.name} would die but DEATH WARD triggers! Survives with 1 HP`, "combat-lifesteal");
        }
        // Elder Vampire immortal - heals to full instead of dying (once per game)
        else if (t.effectId === "immortal" && !t.immortalUsed) {
          t.hp = t.maxHp || 6;
          t.immortalUsed = true;
          logToLobby(lobby, t.name + " refuses to die! Heals to full HP!");
          combatLogToLobby(lobby, `☠️ ${t.name} would die but IMMORTAL triggers! Heals to full`, "combat-lifesteal");
          // Emit immortal animation
          const animData = { type: "effect", effectType: "immortal_rise", targetPos: { r: tp.r, c: tp.c } };
          if (lobby.hostSocket) lobby.hostSocket.emit("animate", animData);
          if (lobby.guestSocket) lobby.guestSocket.emit("animate", animData);
        } else {
          combatLogToLobby(lobby, `💀 ${t.name} DESTROYED (${t.hp} HP)`, "combat-death");
          if (lobby.hostSocket) lobby.hostSocket.emit("animate", { type: "destroy", row: tp.r, col: tp.c });
          if (lobby.guestSocket) lobby.guestSocket.emit("animate", { type: "destroy", row: tp.r, col: tp.c });
          // Process on-death effect for dying unit (pass attackerId for retaliation)
          processOnDeathEffect(lobby, t, t.owner, { r: tp.r, c: tp.c }, attackerId);
          processAllyDeathTriggers(lobby, t.owner, t, { r: tp.r, c: tp.c });
          // Process on-kill effect for attacker (pass killed unit position and unit for steal_card)
          processOnKillEffect(lobby, attackerId, role, { r: tp.r, c: tp.c }, t);
          // Only remove unit if spawn_drone didn't place a drone there
          if (!state.board[tp.r][tp.c]) {
            // Position is empty, unit was removed
          } else if (state.board[tp.r][tp.c] === targetId) {
            // Drone wasn't spawned, remove the dead unit
            state.board[tp.r][tp.c] = null;
          }
          discardUnitCard(lobby, t);
          delete state.units[targetId];
          logToLobby(lobby, t.name + " destroyed!");
          const overflow = Math.max(0, dmg - before);
          if (overflow > 0 && state.rowHP[tp.r] > 0) { state.rowHP[tp.r] = Math.max(0, state.rowHP[tp.r] - overflow); logToLobby(lobby, "Row takes " + overflow + " overflow"); }
          recomputeOwners(state); // Recompute after unit destroyed
        }
      }
      
      // Moon Shadow Warden - shadow_root prevents target from moving next turn
      if (a.effectId === "shadow_root" && t.hp > 0) {
        t.rooted = true;
        logToLobby(lobby, t.name + " is rooted by shadow magic! Cannot move next turn.");
      }
      recomputeOwners(state);
      return emitGameState(lobby);
    }

    if (payload.type === "attackRow") {
      const { attackerId, row } = payload; const a = state.units[attackerId];
      if (!a || a.owner !== role) return;
      if (state.attackedThisTurn.has(attackerId)) return socket.emit("log", "Already attacked.");
      if (row < 0 || row >= ROWS || state.rowHP[row] <= 0) return socket.emit("log", "No HP.");
      
      // Can only attack enemy HOME rows (gold: 0-1, silver: 5-6)
      const enemy = enemyOf(role);
      const isEnemyHomeRow = (enemy === "gold" && row <= 1) || (enemy === "silver" && row >= 5);
      if (!isEnemyHomeRow) return socket.emit("log", "Can only attack enemy home rows.");
      
      const ap = getUnitPos(state, attackerId); if (!ap) return;
      
      // Check range - ranged units can attack from further away
      const isRanged = a.effectId === "ranged" || a.effectId === "ranged_pierce" || a.effectId === "starweave_ranged" || a.effectId === "seraphic_range" || a.range;
      const maxRange = a.range ? a.range : (isRanged ? 2 : 1);
      const rowDistance = Math.abs(ap.r - row);
      
      if (rowDistance > maxRange) {
        return socket.emit("log", isRanged ? `Too far (max ${maxRange} rows).` : "Not adjacent (no diagonal).");
      }
      
      let dmg = getEffectiveAtk(state, attackerId); 
      // Siege Ram deals double damage to structures
      if (a.effectId === "siege") dmg *= 2;
      // Ghostly Stampede deals +2 to structures
      if (a.effectId === "stampede") dmg += 2;
      state.attackedThisTurn.add(attackerId); state.rowHP[row] = Math.max(0, state.rowHP[row] - dmg);
      emitSFX(lobby, a.key, 'attack'); // Play attack sound
      
      // Emit attack animation (attacker budges toward the row)
      const attackAnim = { type: "attack", attackerRow: ap.r, attackerCol: ap.c, targetRow: row, targetCol: ap.c };
      if (lobby.hostSocket) {
        lobby.hostSocket.emit("animate", attackAnim);
      }
      if (lobby.guestSocket) {
        lobby.guestSocket.emit("animate", attackAnim);
      }
      
      logToLobby(lobby, a.name + " hits row for " + dmg + " (HP: " + state.rowHP[row] + ")");
      return emitGameState(lobby);
    }

    if (payload.type === "attackHeart") {
      const { attackerId, target } = payload; const u = state.units[attackerId];
      if (!u || u.owner !== role) return;
      if (state.attackedThisTurn.has(attackerId)) return socket.emit("log", "Already attacked.");
      if (target === role) return socket.emit("log", "Can't attack own heart.");
      const pos = getUnitPos(state, attackerId); if (!pos) return;
      
      // Heart attack range:
      // - Must be in the enemy's heart row to attack (row 0 for gold heart, row 6 for silver heart)
      // - Ranged units can attack from further away
      const heartRow = target === "gold" ? 0 : 6; 
      const distance = Math.abs(pos.r - heartRow);
      const isRanged = u.effectId === "ranged" || u.effectId === "ranged_pierce" || u.effectId === "starweave_ranged" || u.effectId === "seraphic_range" || u.range;
      // Seraphic Hunter has range 3, but for heart attack we use range-1 (so can attack from 2 rows away)
      const maxRange = u.range ? (u.range - 1) : (isRanged ? 1 : 0);
      
      if (distance > maxRange) {
        return socket.emit("log", isRanged ? `Ranged unit must be within ${maxRange} row(s) of the heart.` : "Must be in the heart's row to attack.");
      }
      
      let dmg = getEffectiveAtk(state, attackerId); 
      // Ghostly Stampede deals +2 to structures (including heart)
      if (u.effectId === "stampede") dmg += 2;
      state.attackedThisTurn.add(attackerId);
      state.heartHP[target] = Math.max(0, state.heartHP[target] - dmg);
      emitSFX(lobby, u.key, 'attack'); // Play attack sound
      
      // Emit attack animation (attacker budges toward the heart)
      const attackAnim = { type: "attack", attackerRow: pos.r, attackerCol: pos.c, targetRow: heartRow, targetCol: pos.c };
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", attackAnim);
      if (lobby.guestSocket) lobby.guestSocket.emit("animate", attackAnim);
      
      logToLobby(lobby, role.toUpperCase() + " hits " + target.toUpperCase() + " HEART for " + dmg + "!");
      if (state.heartHP[target] <= 0) { 
        state.gameOver = true; 
        state.winner = role;
        logToLobby(lobby, "=== " + target.toUpperCase() + " DESTROYED! " + role.toUpperCase() + " WINS! ==="); 
        
        // Handle campaign rewards
        if (lobby.isAIGame && role === "gold" && lobby.hostUserId && lobby.bossId) {
          handleCampaignVictory(lobby);
        }
      }
      return emitGameState(lobby);
    }
    
    // Attack from spawn - can attack units in adjacent row
    if (payload.type === "attackFromSpawn") {
      const { targetId } = payload;
      const attackerId = state.spawn[role];
      if (!attackerId) return socket.emit("log", "No unit in spawn.");
      const a = state.units[attackerId], t = state.units[targetId];
      if (!a || !t || a.owner !== role || t.owner === role) return;
      if (state.attackedThisTurn.has(attackerId)) return socket.emit("log", "Already attacked.");
      const tp = getUnitPos(state, targetId);
      if (!tp) return socket.emit("log", "Target not found.");
      // Spawn can attack units in adjacent row (row 0 for gold, row 6 for silver)
      const adjRow = role === "gold" ? 0 : 6;
      if (tp.r !== adjRow) return socket.emit("log", "Can only attack units in adjacent row.");
      let dmg = getEffectiveAtk(state, attackerId, targetId); dmg = applyDamageReduction(state, targetId, dmg, attackerId, lobby);
      const before = t.hp; t.hp -= dmg; state.attackedThisTurn.add(attackerId);
      emitSFX(lobby, a.key, 'attack'); // Play attack sound
      
      // Emit attack animation (spawn unit budges toward target)
      // Spawn position is off-board, so use row -1 for gold spawn, row 7 for silver spawn
      const spawnRow = role === "gold" ? -1 : 7;
      const attackAnim = { type: "attack", attackerRow: spawnRow, attackerCol: 2, targetRow: tp.r, targetCol: tp.c };
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", attackAnim);
      if (lobby.guestSocket) lobby.guestSocket.emit("animate", attackAnim);
      
      logToLobby(lobby, a.name + " (from spawn) deals " + dmg + " to " + t.name);
      if (t.hp <= 0 && shouldUnitDie(lobby, t)) {
        if (lobby.hostSocket) lobby.hostSocket.emit("animate", { type: "destroy", row: tp.r, col: tp.c });
        if (lobby.guestSocket) lobby.guestSocket.emit("animate", { type: "destroy", row: tp.r, col: tp.c });
        processOnDeathEffect(lobby, t, t.owner, { r: tp.r, c: tp.c });
        processAllyDeathTriggers(lobby, t.owner, t, { r: tp.r, c: tp.c });
        processOnKillEffect(lobby, attackerId, role, { r: tp.r, c: tp.c }, t);
        state.board[tp.r][tp.c] = null;
        discardUnitCard(lobby, t);
        delete state.units[targetId];
        logToLobby(lobby, t.name + " destroyed!");
        recomputeOwners(state);
      }
      return emitGameState(lobby);
    }
  });

  socket.on("disconnect", () => {
    const code = socket.data.lobbyCode;
    const lobby = lobbies[code];
    const ts = new Date().toISOString().slice(11, 23);
    console.log(`[DISCONNECT ${ts}] sock=${socket.id} lobbyCode=${code} isHost=${socket.data.isHost} hasLobby=${!!lobby} gameStarted=${lobby?.gameStarted}`);
    if (!lobby) return;
    
    // If game has started, give time for rejoin (page redirect)
    if (lobby.gameStarted) {
      const wasHost = socket.data.isHost;
      
      // Clear the socket reference
      if (wasHost) {
        lobby.hostSocket = null;
      } else {
        lobby.guestSocket = null;
      }
      
      // AI games get a longer reconnect window; multiplayer is 5 seconds
      const isAIGame = lobby.isAIGame;
      const timeoutMs = isAIGame ? 30000 : 5000;
      console.log(`[DISCONNECT ${ts}] starting ${timeoutMs}ms reconnect timer for ${code} (isAIGame=${isAIGame})`);
      setTimeout(() => {
        const currentLobby = lobbies[code];
        const ts2 = new Date().toISOString().slice(11, 23);
        if (!currentLobby) {
          console.log(`[TIMER ${ts2}] ${code} already deleted, no-op`);
          return;
        }

        if (wasHost && !currentLobby.hostSocket) {
          console.log(`[TIMER ${ts2}] DELETING ${code}: host did not rejoin`);
          if (currentLobby.guestSocket) currentLobby.guestSocket.emit("lobbyError", "Host disconnected.");
          delete lobbies[code];
        } else if (!wasHost && !isAIGame && !currentLobby.guestSocket) {
          console.log(`[TIMER ${ts2}] DELETING ${code}: guest did not rejoin`);
          if (currentLobby.hostSocket) currentLobby.hostSocket.emit("lobbyError", "Opponent disconnected.");
          delete lobbies[code];
        } else {
          console.log(`[TIMER ${ts2}] ${code} survived (host rejoined or AI game)`);
        }
      }, timeoutMs);
      return;
    }
    
    // Game not started - handle normally
    if (socket.data.isHost) { 
      if (lobby.guestSocket) lobby.guestSocket.emit("lobbyError", "Host left."); 
      delete lobbies[code]; 
    } else { 
      lobby.guestSocket = null; 
      lobby.guestDeck = null; 
      lobby.guestReady = false; 
      emitLobbyState(lobby); 
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});