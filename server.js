require('dotenv').config();
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { connectDB, User, CAMPAIGN_BOSSES, authHelpers } = require("./database");
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
    const { username, password } = req.body;
    const user = await authHelpers.register(username, password);
    res.json({ success: true, user });
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
      gemshard: 'common'
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
app.post("/api/saveDeck", async (req, res) => {
  try {
    const { userId, deckType, deckName, cards, music, background } = req.body;
    
    if (!userId || userId === 'admin') {
      return res.status(400).json({ success: false, error: 'Invalid user' });
    }
    
    if (!deckType || !['medieval', 'void-alien', 'western-skeleton', 'crimson-court', 'jeweled-court', 'elunes-chosen', 'dragon-wizard'].includes(deckType)) {
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
    cards.forEach(key => {
      if (key.endsWith('_holo')) {
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

const PORT = process.env.PORT || 3000;
const ROWS = 7;
const COLS = 6;
const START_ROW_HP = [15, 15, 0, 0, 0, 15, 15]; // 2 home rows each side, 3 neutral middle rows
const START_HEART_HP = 30;
const START_ENERGY = 8;
const MAX_ENERGY = 10;
const START_HAND_SIZE = 5;
const MAX_HAND_SIZE = 7;

// Wizard unit keys for Wizard's Rune effect
const WIZARD_CARDS = ['redwizard', 'bluewizard', 'mirrorwizard', 'manasiphonmage', 'wizardsrune'];

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
      { key: "warbanner", name: "War Banner", atk: 0, hp: 4, cost: 2, type: "spell", effect: "passive", effectId: "attack_aura", effectDesc: "PASSIVE: Adjacent allies +1 ATK.", art: "/images/War Banner.png", rarity: "rare" },
      { key: "shrine", name: "Healing Shrine", atk: 0, hp: 5, cost: 3, type: "spell", effect: "startOfTurn", effectId: "shrine_heal", effectDesc: "START: Heal row allies 1 HP.", art: "/images/Healing Shrine.png", rarity: "rare" },
      { key: "armory", name: "Armory", atk: 0, hp: 4, cost: 3, type: "spell", effect: "passive", effectId: "armory_buff", effectDesc: "PASSIVE: Deployed units +1 HP. Stacks.", art: "/images/Armory.png", rarity: "rare" },
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
      // Void Drone x3 (1 cost filler)
      { key: "voiddrone", name: "Void Drone", atk: 1, hp: 2, cost: 1, type: "monster", art: "/images/Void Drone.png", rarity: "common" },
      { key: "voiddrone", name: "Void Drone", atk: 1, hp: 2, cost: 1, type: "monster", art: "/images/Void Drone.png", rarity: "common" },
      { key: "voiddrone", name: "Void Drone", atk: 1, hp: 2, cost: 1, type: "monster", art: "/images/Void Drone.png", rarity: "common" },
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
      // Void Broodmother x1 (spawn drone on kill)
      { key: "voidbroodmother", name: "Void Broodmother", atk: 2, hp: 6, cost: 4, type: "monster", effect: "onKill", effectId: "spawn_drone", effectDesc: "ON KILL: Spawn a Void Drone in the killed unit's tile.", art: "/images/Void Broodmother.png", rarity: "legendary" },
      // Eclipse Devourer x1 (energy on kill)
      { key: "eclipsedevourer", name: "Eclipse Devourer", atk: 5, hp: 4, cost: 5, type: "monster", effect: "onKill", effectId: "energy_on_kill", effectDesc: "ON KILL: Gain 1 Energy.", art: "/images/Eclipse Devourer.png", rarity: "legendary" },
      // UFO Scraper x1 (absorb friendly alien stats)
      { key: "ufoscraper", name: "UFO Scraper", atk: 1, hp: 1, cost: 4, type: "monster", effect: "passive", effectId: "absorb_ally", effectDesc: "PASSIVE: Can attack friendly Aliens to absorb their stats.", art: "/images/UFO Scraper.png", rarity: "legendary" },
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
      { key: "nightstalker", name: "Nightstalker", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "lifesteal", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP when attacking or attacked.", art: "/images/Nightstalker.png", rarity: "common" },
      { key: "nightstalker", name: "Nightstalker", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "lifesteal", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP when attacking or attacked.", art: "/images/Nightstalker.png", rarity: "common" },
      { key: "nightstalker", name: "Nightstalker", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "lifesteal", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP when attacking or attacked.", art: "/images/Nightstalker.png", rarity: "common" },
      // Crypt Keeper x2 (gains max HP on ally death)
      { key: "cryptkeeper", name: "Crypt Keeper", atk: 1, hp: 3, cost: 2, type: "monster", effect: "passive", effectId: "grow_max_hp_on_ally_death", effectDesc: "PASSIVE: Gains +1 Max HP when a friendly unit dies.", art: "/images/Crypt Keeper.png", rarity: "rare" },
      { key: "cryptkeeper", name: "Crypt Keeper", atk: 1, hp: 3, cost: 2, type: "monster", effect: "passive", effectId: "grow_max_hp_on_ally_death", effectDesc: "PASSIVE: Gains +1 Max HP when a friendly unit dies.", art: "/images/Crypt Keeper.png", rarity: "rare" },
      // Vampire Spawn x3 (lifesteal)
      { key: "vampirespawn", name: "Vampire Spawn", atk: 2, hp: 3, cost: 3, type: "monster", effect: "passive", effectId: "lifesteal", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP when attacking or attacked.", art: "/images/Vampire Spawn.png", rarity: "common" },
      { key: "vampirespawn", name: "Vampire Spawn", atk: 2, hp: 3, cost: 3, type: "monster", effect: "passive", effectId: "lifesteal", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP when attacking or attacked.", art: "/images/Vampire Spawn.png", rarity: "common" },
      { key: "vampirespawn", name: "Vampire Spawn", atk: 2, hp: 3, cost: 3, type: "monster", effect: "passive", effectId: "lifesteal", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP when attacking or attacked.", art: "/images/Vampire Spawn.png", rarity: "common" },
      // Blood Priest x2 (heals adjacent allies end of turn)
      { key: "bloodpriest", name: "Blood Priest", atk: 2, hp: 4, cost: 3, type: "monster", effect: "endOfTurn", effectId: "heal_adjacent", effectDesc: "END OF TURN: Heal adjacent allies for 1.", art: "/images/Blood Priest.png", rarity: "rare" },
      { key: "bloodpriest", name: "Blood Priest", atk: 2, hp: 4, cost: 3, type: "monster", effect: "endOfTurn", effectId: "heal_adjacent", effectDesc: "END OF TURN: Heal adjacent allies for 1.", art: "/images/Blood Priest.png", rarity: "rare" },
      // Soul Collector x2 (on kill: steal card)
      { key: "soulcollector", name: "Soul Collector", atk: 3, hp: 2, cost: 3, type: "monster", effect: "onKill", effectId: "steal_card", effectDesc: "ON KILL: Add a copy of killed unit to your hand.", art: "/images/Soul Collector.png", rarity: "rare" },
      { key: "soulcollector", name: "Soul Collector", atk: 3, hp: 2, cost: 3, type: "monster", effect: "onKill", effectId: "steal_card", effectDesc: "ON KILL: Add a copy of killed unit to your hand.", art: "/images/Soul Collector.png", rarity: "rare" },
      // Nosferatu x2 (lifesteal + weaken aura)
      { key: "nosferatu", name: "Nosferatu", atk: 3, hp: 4, cost: 4, type: "monster", effect: "passive", effectId: "lifesteal_weaken", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP when attacking or attacked. Adjacent enemies deal -1 damage.", art: "/images/Nosferatu.png", rarity: "rare" },
      { key: "nosferatu", name: "Nosferatu", atk: 3, hp: 4, cost: 4, type: "monster", effect: "passive", effectId: "lifesteal_weaken", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP when attacking or attacked. Adjacent enemies deal -1 damage.", art: "/images/Nosferatu.png", rarity: "rare" },
      // Coffin x2 (resurrects self)
      { key: "coffin", name: "Coffin", atk: 0, hp: 6, cost: 4, type: "structure", effect: "passive", effectId: "resurrect_self", effectDesc: "PASSIVE: If destroyed, resummon at start of your next turn.", art: "/images/Coffin.png", rarity: "rare" },
      { key: "coffin", name: "Coffin", atk: 0, hp: 6, cost: 4, type: "structure", effect: "passive", effectId: "resurrect_self", effectDesc: "PASSIVE: If destroyed, resummon at start of your next turn.", art: "/images/Coffin.png", rarity: "rare" },
      // Blood Countess x1 (lifesteal + grows on kill)
      { key: "bloodcountess", name: "Blood Countess", atk: 4, hp: 5, cost: 5, type: "monster", effect: "passive", effectId: "lifesteal_grow", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP when attacking or attacked. ON KILL: Gain +1/+1.", art: "/images/Blood Countess.png", rarity: "legendary" },
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
      { key: "sapphiredancer", name: "Sapphire Dancer", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "fairy_swap", effectDesc: "PASSIVE: Can swap positions with a friendly Fairy.", art: "/images/Sapphire Dancer.png", rarity: "common" },
      { key: "sapphiredancer", name: "Sapphire Dancer", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "fairy_swap", effectDesc: "PASSIVE: Can swap positions with a friendly Fairy.", art: "/images/Sapphire Dancer.png", rarity: "common" },
      { key: "sapphiredancer", name: "Sapphire Dancer", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "fairy_swap", effectDesc: "PASSIVE: Can swap positions with a friendly Fairy.", art: "/images/Sapphire Dancer.png", rarity: "common" },
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
      { key: "bloodcountess", name: "Blood Countess", atk: 4, hp: 5, cost: 5, type: "monster", effect: "passive", effectId: "lifesteal_grow", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP when attacking or attacked. ON KILL: Gain +1/+1.", art: "/images/Blood Countess.png", rarity: "legendary" },
      { key: "bloodcountess", name: "Blood Countess", atk: 4, hp: 5, cost: 5, type: "monster", effect: "passive", effectId: "lifesteal_grow", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP when attacking or attacked. ON KILL: Gain +1/+1.", art: "/images/Blood Countess.png", rarity: "legendary" },
      { key: "bloodcountess", name: "Blood Countess", atk: 4, hp: 5, cost: 5, type: "monster", effect: "passive", effectId: "lifesteal_grow", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP when attacking or attacked. ON KILL: Gain +1/+1.", art: "/images/Blood Countess.png", rarity: "legendary" },
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
      { key: "nosferatu", name: "Nosferatu", atk: 3, hp: 4, cost: 4, type: "monster", effect: "passive", effectId: "lifesteal_weaken", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP when attacking or attacked. Adjacent enemies deal -1 damage.", art: "/images/Nosferatu.png", rarity: "rare" },
      { key: "nosferatu", name: "Nosferatu", atk: 3, hp: 4, cost: 4, type: "monster", effect: "passive", effectId: "lifesteal_weaken", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP when attacking or attacked. Adjacent enemies deal -1 damage.", art: "/images/Nosferatu.png", rarity: "rare" },
      { key: "nosferatu", name: "Nosferatu", atk: 3, hp: 4, cost: 4, type: "monster", effect: "passive", effectId: "lifesteal_weaken", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP when attacking or attacked. Adjacent enemies deal -1 damage.", art: "/images/Nosferatu.png", rarity: "rare" },
      { key: "nosferatu", name: "Nosferatu", atk: 3, hp: 4, cost: 4, type: "monster", effect: "passive", effectId: "lifesteal_weaken", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP when attacking or attacked. Adjacent enemies deal -1 damage.", art: "/images/Nosferatu.png", rarity: "rare" },
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
      { key: "nightstalker", name: "Nightstalker", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "lifesteal", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP when attacking or attacked.", art: "/images/Nightstalker.png", rarity: "common" },
      { key: "nightstalker", name: "Nightstalker", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "lifesteal", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP when attacking or attacked.", art: "/images/Nightstalker.png", rarity: "common" },
      { key: "nightstalker", name: "Nightstalker", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "lifesteal", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP when attacking or attacked.", art: "/images/Nightstalker.png", rarity: "common" },
      { key: "nightstalker", name: "Nightstalker", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "lifesteal", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP when attacking or attacked.", art: "/images/Nightstalker.png", rarity: "common" },
      { key: "nightstalker", name: "Nightstalker", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "lifesteal", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP when attacking or attacked.", art: "/images/Nightstalker.png", rarity: "common" },
      { key: "nightstalker", name: "Nightstalker", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "lifesteal", effectDesc: "PASSIVE: Lifesteal: Heals 1 HP when attacking or attacked.", art: "/images/Nightstalker.png", rarity: "common" },
    ]
  },
  "dragon-wizard": {
    name: "Arcane Dragonflight",
    description: "Wizards and dragons unite with spell synergy and anti-buff tech",
    archetype: "dragon",
    cards: [
      // Meditation Monk x3 (channeling energy ramp)
      { key: "meditationmonk", name: "Meditation Monk", atk: 1, hp: 3, cost: 1, type: "monster", effect: "passive", effectId: "channeling_energy", effectDesc: "CHANNELING: Can't move. Gain +1 Energy at start of your turn.", art: "/images/Meditation Monk.png", rarity: "common" },
      { key: "meditationmonk", name: "Meditation Monk", atk: 1, hp: 3, cost: 1, type: "monster", effect: "passive", effectId: "channeling_energy", effectDesc: "CHANNELING: Can't move. Gain +1 Energy at start of your turn.", art: "/images/Meditation Monk.png", rarity: "common" },
      { key: "meditationmonk", name: "Meditation Monk", atk: 1, hp: 3, cost: 1, type: "monster", effect: "passive", effectId: "channeling_energy", effectDesc: "CHANNELING: Can't move. Gain +1 Energy at start of your turn.", art: "/images/Meditation Monk.png", rarity: "common" },
      // Wyrm Whelp x3 (anti-effect tech)
      { key: "wyrmwhelp", name: "Wyrm Whelp", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "anti_effect", effectDesc: "PASSIVE: +1 ATK when attacking units with effects.", art: "/images/Wyrm Whelp.png", rarity: "common" },
      { key: "wyrmwhelp", name: "Wyrm Whelp", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "anti_effect", effectDesc: "PASSIVE: +1 ATK when attacking units with effects.", art: "/images/Wyrm Whelp.png", rarity: "common" },
      { key: "wyrmwhelp", name: "Wyrm Whelp", atk: 2, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "anti_effect", effectDesc: "PASSIVE: +1 ATK when attacking units with effects.", art: "/images/Wyrm Whelp.png", rarity: "common" },
      // Wizard's Rune x3 (draw wizard on deploy, free wizard on death)
      { key: "wizardsrune", name: "Wizard's Rune", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeployDeath", effectId: "wizard_rune", effectDesc: "DEPLOY: Draw a Wizard. DEATH: Next Wizard costs 0.", art: "/images/Wizards Rune.png", rarity: "common" },
      { key: "wizardsrune", name: "Wizard's Rune", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeployDeath", effectId: "wizard_rune", effectDesc: "DEPLOY: Draw a Wizard. DEATH: Next Wizard costs 0.", art: "/images/Wizards Rune.png", rarity: "common" },
      { key: "wizardsrune", name: "Wizard's Rune", atk: 1, hp: 2, cost: 1, type: "monster", effect: "onDeployDeath", effectId: "wizard_rune", effectDesc: "DEPLOY: Draw a Wizard. DEATH: Next Wizard costs 0.", art: "/images/Wizards Rune.png", rarity: "common" },
      // Cinderwing x3 (splash damage on attack)
      { key: "cinderwing", name: "Cinderwing", atk: 3, hp: 1, cost: 2, type: "monster", effect: "onAttack", effectId: "splash_random", effectDesc: "ON ATTACK: Deal 1 damage to another random enemy.", art: "/images/Cinderwing.png", rarity: "common" },
      { key: "cinderwing", name: "Cinderwing", atk: 3, hp: 1, cost: 2, type: "monster", effect: "onAttack", effectId: "splash_random", effectDesc: "ON ATTACK: Deal 1 damage to another random enemy.", art: "/images/Cinderwing.png", rarity: "common" },
      { key: "cinderwing", name: "Cinderwing", atk: 3, hp: 1, cost: 2, type: "monster", effect: "onAttack", effectId: "splash_random", effectDesc: "ON ATTACK: Deal 1 damage to another random enemy.", art: "/images/Cinderwing.png", rarity: "common" },
      // Mana Siphon Mage x2 (energy drain on kill)
      { key: "manasiphonmage", name: "Mana Siphon Mage", atk: 2, hp: 3, cost: 3, type: "monster", effect: "onKill", effectId: "mana_drain_kill", effectDesc: "ON KILL: Enemy loses 1 energy.", art: "/images/Mana Siphon Mage.png", rarity: "rare" },
      { key: "manasiphonmage", name: "Mana Siphon Mage", atk: 2, hp: 3, cost: 3, type: "monster", effect: "onKill", effectId: "mana_drain_kill", effectDesc: "ON KILL: Enemy loses 1 energy.", art: "/images/Mana Siphon Mage.png", rarity: "rare" },
      // Arcane Tether x2 (damage reflection)
      { key: "arcanetether", name: "Arcane Tether", atk: 2, hp: 4, cost: 3, type: "monster", effect: "passive", effectId: "arcane_link", effectDesc: "ARCANE LINK: When this takes damage, deal 1 damage to the nearest enemy.", art: "/images/Arcane Tether.png", rarity: "rare" },
      { key: "arcanetether", name: "Arcane Tether", atk: 2, hp: 4, cost: 3, type: "monster", effect: "passive", effectId: "arcane_link", effectDesc: "ARCANE LINK: When this takes damage, deal 1 damage to the nearest enemy.", art: "/images/Arcane Tether.png", rarity: "rare" },
      // Storm Drake x2 (spell echo damage)
      { key: "stormdrake", name: "Storm Drake", atk: 3, hp: 4, cost: 4, type: "monster", effect: "passive", effectId: "spell_echo", effectDesc: "SPELL ECHO: When you cast a spell, deal 1 damage to a random enemy.", art: "/images/Storm Drake.png", rarity: "rare" },
      { key: "stormdrake", name: "Storm Drake", atk: 3, hp: 4, cost: 4, type: "monster", effect: "passive", effectId: "spell_echo", effectDesc: "SPELL ECHO: When you cast a spell, deal 1 damage to a random enemy.", art: "/images/Storm Drake.png", rarity: "rare" },
      // Mirror Wizard x2 (copy buffs)
      { key: "mirrorwizard", name: "Mirror Wizard", atk: 1, hp: 4, cost: 3, type: "monster", effect: "passive", effectId: "mirror_buffs", effectDesc: "PASSIVE: Copies any buffs applied to adjacent allies.", art: "/images/Mirror Wizard.png", rarity: "rare" },
      { key: "mirrorwizard", name: "Mirror Wizard", atk: 1, hp: 4, cost: 3, type: "monster", effect: "passive", effectId: "mirror_buffs", effectDesc: "PASSIVE: Copies any buffs applied to adjacent allies.", art: "/images/Mirror Wizard.png", rarity: "rare" },
      // Volcanic Dragon x2 (death HP reset)
      { key: "volcanicdragon", name: "Volcanic Dragon", atk: 4, hp: 3, cost: 4, type: "monster", effect: "onDeath", effectId: "volcanic_death", effectDesc: "ON DEATH: Set all adjacent units (friend and enemy) to 1 HP.", art: "/images/Volcanic Dragon.png", rarity: "rare" },
      { key: "volcanicdragon", name: "Volcanic Dragon", atk: 4, hp: 3, cost: 4, type: "monster", effect: "onDeath", effectId: "volcanic_death", effectDesc: "ON DEATH: Set all adjacent units (friend and enemy) to 1 HP.", art: "/images/Volcanic Dragon.png", rarity: "rare" },
      // Red Wizard x1 (gains HP when any unit gains HP)
      { key: "redwizard", name: "Red Wizard", atk: 2, hp: 4, cost: 5, type: "monster", effect: "passive", effectId: "red_wizard", effectDesc: "PASSIVE: Whenever ANY unit on the field gains HP, this unit gains +1 HP.", art: "/images/Red Wizard.png", rarity: "legendary" },
      // Blue Wizard x1 (gains ATK when any unit gains ATK)
      { key: "bluewizard", name: "Blue Wizard", atk: 4, hp: 2, cost: 5, type: "monster", effect: "passive", effectId: "blue_wizard", effectDesc: "PASSIVE: Whenever ANY unit on the field gains ATK, this unit gains +1 ATK.", art: "/images/Blue Wizard.png", rarity: "legendary" },
      // Chrono Drake x1 (temporal stasis)
      { key: "chronodrake", name: "Chrono Drake", atk: 4, hp: 5, cost: 6, type: "monster", effect: "onDeploy", effectId: "temporal_stasis", effectDesc: "ON DEPLOY: Freeze target enemy for 2 turns (can't move, attack, or use effects).", art: "/images/Chrono Drake.png", requiresTarget: "enemy_unit", rarity: "legendary" },
      // Polymorph x2
      { key: "polymorph", name: "Polymorph", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "polymorph", effectDesc: "INSTANT: Transform target enemy into a 1/1 Sheep (loses all effects).", art: "/images/Polymorph.png", requiresTarget: "enemy_unit", rarity: "rare" },
      { key: "polymorph", name: "Polymorph", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "polymorph", effectDesc: "INSTANT: Transform target enemy into a 1/1 Sheep (loses all effects).", art: "/images/Polymorph.png", requiresTarget: "enemy_unit", rarity: "rare" },
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
  }
};

const lobbies = {};

function generateLobbyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return lobbies[code] ? generateLobbyCode() : code;
}

function genId() { return Math.random().toString(36).slice(2, 10); }
function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

// Get card template by key from any deck
function getCardTemplate(cardKey) {
  for (const deckId in DECKS) {
    const card = DECKS[deckId].cards.find(c => c.key === cardKey);
    if (card) return card;
  }
  return null;
}

// Create deck from array of card keys (for custom decks)
function createDeckFromKeys(cardKeys) {
  const result = cardKeys.map(key => {
    // Check if this is a holo card
    const isHolo = key.endsWith('_holo');
    const baseKey = isHolo ? key.replace('_holo', '') : key;
    
    const template = getCardTemplate(baseKey);
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

// Add unit's card to owner's discard pile when it dies
function discardUnitCard(lobby, unit) {
  if (!unit || !unit.owner) return;
  const player = lobby.gameState.players[unit.owner];
  if (!player) return;
  
  // Don't discard Gem Shards - they're tokens, not cards in the deck
  // Only Ruby Sprite adds a Gem Shard CARD to hand (not from discard)
  if (unit.key === "gemshard") return;
  
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

function createGameState(hostDeck, guestDeck, hostCustomCards = null, guestCustomCards = null) {
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
    ? shuffle(createDeckFromKeys(hostCustomCards)) 
    : shuffle(createDeck(hostDeck));
  const silverDeckCards = guestCustomCards && guestCustomCards.length >= 25 
    ? shuffle(createDeckFromKeys(guestCustomCards)) 
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
    const deckName = deck.name || deckKey;
    
    for (const card of deck.cards) {
      if (!seen.has(card.key)) {
        seen.add(card.key);
        allCards.push({
          ...card,
          deck: deckName
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
  
  // Create units with effective stats
  const unitsWithBuffs = {};
  for (const uid in state.units) {
    const u = state.units[uid];
    const tileHpBuff = u.owner === "gold" ? goldHpBuff : silverHpBuff;
    
    // Check for Moon Flare Sorceress aura
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
    
    const totalHpBuff = tileHpBuff + moonflareHpBuff;
    unitsWithBuffs[uid] = { 
      ...u, 
      displayHp: u.hp + totalHpBuff,
      displayMaxHp: (u.maxHp || u.hp) + totalHpBuff,
      hpBuffed: totalHpBuff > 0
    };
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
  return atk;
}

function applyDamageReduction(state, tid, dmg, attackerId, lobby = null) {
  const t = state.units[tid]; if (!t) return dmg; const pos = getUnitPos(state, tid); if (!pos) return dmg;
  const attacker = attackerId ? state.units[attackerId] : null;
  
  // Bone Revolver - ranged_pierce ignores shield effects
  const ignoresShields = attacker && attacker.effectId === "ranged_pierce";
  
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
    }
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

// Combat log for detailed damage calculations
function combatLogToLobby(lobby, msg, type = "combat-step") { 
  if (lobby.hostSocket) lobby.hostSocket.emit("combatLog", { msg, type }); 
  if (lobby.guestSocket) lobby.guestSocket.emit("combatLog", { msg, type }); 
}

function drawCards(lobby, role, count) {
  const p = lobby.gameState.players[role];
  for (let i = 0; i < count; i++) { if (p.hand.length >= MAX_HAND_SIZE) break; if (p.deck.length === 0) { if (p.discard.length === 0) break; p.deck = shuffle([...p.discard]); p.discard = []; logToLobby(lobby, role.toUpperCase() + " reshuffles"); } if (p.deck.length > 0) p.hand.push(p.deck.pop()); }
}

function processOnKillEffect(lobby, aid, role, killedUnitPos, killedUnit) {
  const state = lobby.gameState.state;
  const a = state.units[aid]; if (!a) return;
  
  // Blood Countess lifesteal_grow - gains +1/+1 on kill (has passive effect type but also on-kill)
  if (a.effectId === "lifesteal_grow") {
    a.atk += 1;
    a.hp += 1;
    a.maxHp = (a.maxHp || a.hp) + 1;
    logToLobby(lobby, a.name + " grows stronger! Now " + a.atk + "/" + a.hp);
  }
  
  // Other on-kill effects require effect === "onKill"
  if (a.effect !== "onKill") return;
  
  if (a.effectId === "heal_on_kill") { 
    // Crusader heals 2 HP on kill, even past max HP
    a.hp += 2;
    a.maxHp = Math.max(a.maxHp || a.hp, a.hp); // Increase max if needed
    logToLobby(lobby, a.name + " heals 2 HP! Now " + a.hp + "/" + a.maxHp); 
  }
  if (a.effectId === "energy_on_kill") { 
    lobby.gameState.players[role].energy = Math.min(lobby.gameState.players[role].energy + 1, MAX_ENERGY); 
    logToLobby(lobby, role.toUpperCase() + " gains 1 energy"); 
  }
  if (a.effectId === "drain_energy") {
    const enemy = enemyOf(role);
    if (lobby.gameState.players[enemy].energy > 0) {
      lobby.gameState.players[enemy].energy = Math.max(0, lobby.gameState.players[enemy].energy - 1);
      logToLobby(lobby, a.name + " drains 1 energy from " + enemy.toUpperCase());
    }
  }
  // Mana Siphon Mage - enemy loses 1 energy on kill
  if (a.effectId === "mana_drain_kill") {
    const enemy = enemyOf(role);
    if (lobby.gameState.players[enemy].energy > 0) {
      lobby.gameState.players[enemy].energy = Math.max(0, lobby.gameState.players[enemy].energy - 1);
      logToLobby(lobby, a.name + " siphons mana! Enemy loses 1 energy!");
    }
  }
  if (a.effectId === "spawn_drone" && killedUnitPos) {
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
      art: "/images/Void Drone.png"
    };
    state.board[killedUnitPos.r][killedUnitPos.c] = droneId;
    logToLobby(lobby, a.name + " spawns a Void Drone!");
  }
  // Grave Robber - draw a card on kill
  if (a.effectId === "draw_on_kill") {
    drawCards(lobby, role, 1);
    logToLobby(lobby, a.name + " draws a card!");
  }
  // Soul Collector - add copy of killed unit to hand
  if (a.effectId === "steal_card" && killedUnit) {
    const p = lobby.gameState.players[role];
    if (p.hand.length < MAX_HAND_SIZE) {
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
    lobby.gameState.players[role].energy = Math.min(lobby.gameState.players[role].energy + 1, MAX_ENERGY);
    logToLobby(lobby, a.name + " is empowered by the stars! +1 ATK, +1 energy (now " + a.atk + " ATK)");
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
    attacker.hp -= 1;
    logToLobby(lobby, deadUnit.name + " retaliates! " + attacker.name + " takes 1 damage!");
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
  }
  
  // Bone Deputy - spawn a 1/1 Bone Pile
  if (deadUnit.effectId === "spawn_bone_pile" && deadPos) {
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
  
  // The Hanged Man - deal 2 damage to all adjacent enemies
  if (deadUnit.effectId === "death_explosion" && deadPos) {
    const adjacentPositions = [
      { r: deadPos.r - 1, c: deadPos.c },
      { r: deadPos.r + 1, c: deadPos.c },
      { r: deadPos.r, c: deadPos.c - 1 },
      { r: deadPos.r, c: deadPos.c + 1 }
    ];
    let damaged = 0;
    const toRemove = [];
    for (const pos of adjacentPositions) {
      if (pos.r < 0 || pos.r >= ROWS || pos.c < 0 || pos.c >= COLS) continue;
      const targetId = state.board[pos.r][pos.c];
      if (targetId && state.units[targetId] && state.units[targetId].owner !== deadUnitOwner) {
        const target = state.units[targetId];
        if (target.untargetable) continue;
        target.hp -= 2;
        damaged++;
        if (target.hp <= 0 && shouldUnitDie(lobby, target)) {
          toRemove.push({ id: targetId, r: pos.r, c: pos.c });
        }
      }
    }
    for (const item of toRemove) {
      const deadTarget = state.units[item.id];
      if (!deadTarget) continue; // May have been saved by deathWard
      // Process death effects for the killed unit (enemy's ally death triggers)
      processOnDeathEffect(lobby, deadTarget, deadTarget.owner, { r: item.r, c: item.c });
      processAllyDeathTriggers(lobby, deadTarget.owner, deadTarget, { r: item.r, c: item.c });
      state.board[item.r][item.c] = null;
      discardUnitCard(lobby, deadTarget);
      delete state.units[item.id];
      logToLobby(lobby, deadTarget.name + " destroyed by " + deadUnit.name + "'s death explosion!");
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
    const adjacentPositions = [
      { r: deadPos.r - 1, c: deadPos.c - 1 }, { r: deadPos.r - 1, c: deadPos.c }, { r: deadPos.r - 1, c: deadPos.c + 1 },
      { r: deadPos.r, c: deadPos.c - 1 }, { r: deadPos.r, c: deadPos.c + 1 },
      { r: deadPos.r + 1, c: deadPos.c - 1 }, { r: deadPos.r + 1, c: deadPos.c }, { r: deadPos.r + 1, c: deadPos.c + 1 }
    ];
    let affected = 0;
    for (const pos of adjacentPositions) {
      if (pos.r < 0 || pos.r >= ROWS || pos.c < 0 || pos.c >= COLS) continue;
      const targetId = state.board[pos.r][pos.c];
      if (targetId && state.units[targetId]) {
        const target = state.units[targetId];
        if (target.untargetable) continue;
        if (target.hp > 1) {
          target.hp = 1;
          affected++;
        }
      }
    }
    if (affected > 0) {
      logToLobby(lobby, deadUnit.name + "'s volcanic eruption scorches " + affected + " units to 1 HP!");
    }
  }
  
  // Wizard's Rune - grant free wizard play on death
  if (deadUnit.effectId === "wizard_rune") {
    if (!state.freeWizard) state.freeWizard = {};
    state.freeWizard[deadUnitOwner] = true;
    logToLobby(lobby, "Wizard's Rune enchants - your next Wizard costs 0 energy!");
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
        // Deal 1 damage to all enemies
        const toRemove = [];
        for (const eid in state.units) {
          const enemy = state.units[eid];
          if (enemy.owner !== deadUnitOwner && !enemy.untargetable) {
            enemy.hp -= 1;
            if (enemy.hp <= 0) {
              const enemyPos = getUnitPos(state, eid);
              toRemove.push({ id: eid, pos: enemyPos });
            }
          }
        }
        logToLobby(lobby, u.name + "'s gem shatters! All enemies take 1 damage!");
        for (const item of toRemove) {
          const deadEnemy = state.units[item.id];
          processOnDeathEffect(lobby, deadEnemy, deadEnemy.owner, item.pos);
          processAllyDeathTriggers(lobby, deadEnemy.owner, deadEnemy, item.pos);
          if (item.pos) state.board[item.pos.r][item.pos.c] = null;
          discardUnitCard(lobby, deadEnemy);
          delete state.units[item.id];
          logToLobby(lobby, deadEnemy.name + " destroyed by gem shatter!");
        }
        break; // Only trigger once even if multiple Prismatic Fairies
      }
    }
  }
  
  for (const uid in state.units) {
    const u = state.units[uid];
    // Undertaker - gains +1/+1 on ally death
    if (u.owner === deadUnitOwner && u.effectId === "grow_on_ally_death") {
      u.atk += 1;
      u.hp += 1;
      u.maxHp = (u.maxHp || u.hp) + 1;
      logToLobby(lobby, u.name + " grows from ally death! Now " + u.atk + "/" + u.hp);
      triggerStatGainEffects(lobby, 'atk', 1, uid);
      triggerStatGainEffects(lobby, 'hp', 1, uid);
    }
    // Crypt Keeper - gains +1 max HP on ally death
    if (u.owner === deadUnitOwner && u.effectId === "grow_max_hp_on_ally_death") {
      u.maxHp = (u.maxHp || u.hp) + 1;
      u.hp += 1; // Also heal for the new max
      logToLobby(lobby, u.name + " absorbs death essence! Max HP now " + u.maxHp);
      triggerStatGainEffects(lobby, 'hp', 1, uid);
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
    
    // Mirror Wizard - copies buffs from adjacent allies
    if (u.effectId === "mirror_buffs") {
      const mirrorPos = getUnitPos(state, uid);
      const sourcePos = getUnitPos(state, sourceUnitId);
      if (mirrorPos && sourcePos) {
        const dist = Math.abs(mirrorPos.r - sourcePos.r) + Math.abs(mirrorPos.c - sourcePos.c);
        if (dist === 1) { // Adjacent
          const sourceUnit = state.units[sourceUnitId];
          if (sourceUnit && sourceUnit.owner === u.owner) {
            if (statType === 'hp') {
              u.hp += amount;
              u.maxHp = (u.maxHp || u.hp) + amount;
            } else if (statType === 'atk') {
              u.atk += amount;
            }
            logToLobby(lobby, u.name + " mirrors the buff! +" + amount + " " + statType.toUpperCase());
          }
        }
      }
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
      allies.forEach(aid => { 
        const ally = state.units[aid];
        if (ally && ally.hp < (ally.maxHp || ally.hp + 1)) {
          ally.hp = Math.min(ally.hp + 1, ally.maxHp || ally.hp + 1);
          healedCount++;
        }
      }); 
      if (healedCount > 0) logToLobby(lobby, u.name + " heals " + healedCount + " allies"); 
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
      for (let c = 0; c < COLS; c++) { 
        const uid = state.board[pos.r][c]; 
        if (uid && state.units[uid] && state.units[uid].owner === role && uid !== id) { 
          const unit = state.units[uid];
          if (unit.hp < (unit.maxHp || unit.hp + 1)) {
            unit.hp = Math.min(unit.hp + 1, unit.maxHp || unit.hp + 1);
            healed++; 
          }
        } 
      } 
      if (healed > 0) logToLobby(lobby, "Shrine heals " + healed + " units"); 
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
        target.hp -= 2;
        logToLobby(lobby, u.name + " calls down starfire on " + target.name + "! (2 damage)");
        if (target.hp <= 0 && shouldUnitDie(lobby, target)) {
          const targetPos = getUnitPos(state, targetId);
          processOnDeathEffect(lobby, target, target.owner, targetPos);
          processAllyDeathTriggers(lobby, target.owner, target, targetPos);
          if (targetPos) state.board[targetPos.r][targetPos.c] = null;
          discardUnitCard(lobby, target);
          delete state.units[targetId];
          logToLobby(lobby, target.name + " is destroyed by starfire!");
        }
      }
    }
  }
  
  // Channeling effects (passive but with start-of-turn triggers)
  for (const id in state.units) {
    const u = state.units[id];
    if (u.owner !== role) continue;
    
    // Meditation Monk - channeling energy (can't move, gains 1 energy at start of turn)
    if (u.effectId === "channeling_energy") {
      const player = lobby.gameState.players[role];
      player.energy = Math.min(player.energy + 1, MAX_ENERGY);
      logToLobby(lobby, u.name + " channels energy! (+1 energy)");
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
      for (let c = 0; c < COLS; c++) {
        const uid = state.board[targetRow][c];
        if (uid && state.units[uid] && state.units[uid].owner !== role) {
          const target = state.units[uid];
          // Check untargetable
          if (target.untargetable) continue;
          target.hp -= 1;
          damaged++;
          if (target.hp <= 0 && shouldUnitDie(lobby, target)) {
            toRemove.push({ id: uid, col: c });
          }
        }
      }
      // Remove dead units
      for (const item of toRemove) {
        const deadUnit = state.units[item.id];
        if (!deadUnit) continue; // May have been saved by deathWard
        const deadPos = { r: targetRow, c: item.col };
        processOnDeathEffect(lobby, deadUnit, deadUnit.owner, deadPos);
        processAllyDeathTriggers(lobby, deadUnit.owner, deadUnit, deadPos);
        state.board[targetRow][item.col] = null;
        discardUnitCard(lobby, deadUnit);
        delete state.units[item.id];
      }
      logToLobby(lobby, "Void Collapse hits " + damaged + " enemies in row " + String.fromCharCode(65 + targetRow) + "!");
    }
  }
  if (effectId === "mass_buff") {
    // Hive Ascension - all friendly units gain +1 ATK and +1 HP permanently
    let buffed = 0;
    for (const uid in state.units) {
      const u = state.units[uid];
      if (u.owner === role) {
        u.atk += 1;
        u.hp += 1;
        u.maxHp = (u.maxHp || u.hp) + 1;
        buffed++;
      }
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
      for (let c = 0; c < COLS; c++) {
        const uid = state.board[targetRow][c];
        if (uid && state.units[uid] && state.units[uid].owner !== role) {
          const target = state.units[uid];
          if (target.untargetable) continue;
          target.hp -= 2;
          damaged++;
          if (target.hp <= 0 && shouldUnitDie(lobby, target)) {
            toRemove.push({ id: uid, col: c });
          }
        }
      }
      for (const item of toRemove) {
        const deadUnit = state.units[item.id];
        if (!deadUnit) continue;
        processOnDeathEffect(lobby, deadUnit, deadUnit.owner, { r: targetRow, c: item.col });
        processAllyDeathTriggers(lobby, deadUnit.owner, deadUnit, { r: targetRow, c: item.col });
        state.board[targetRow][item.col] = null;
        discardUnitCard(lobby, deadUnit);
        delete state.units[item.id];
      }
      logToLobby(lobby, "High Noon! " + damaged + " enemies hit for 2 damage in row " + String.fromCharCode(65 + targetRow) + "!");
    }
  }
  
  // === CRIMSON COURT VAMPIRE SPELLS ===
  
  if (effectId === "blood_pact") {
    // Blood Pact - deal 2 damage to friendly unit, draw 2 cards
    if (targetUnitId && state.units[targetUnitId]) {
      const target = state.units[targetUnitId];
      if (target.owner === role) {
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
      for (let c = 0; c < COLS; c++) {
        const uid = state.board[targetRow][c];
        if (uid && state.units[uid] && state.units[uid].owner !== role) {
          const target = state.units[uid];
          if (target.untargetable) continue;
          target.hp -= 2;
          hitCount++;
          if (target.hp <= 0 && shouldUnitDie(lobby, target)) {
            toRemove.push({ id: uid, col: c });
          }
        }
      }
      for (const item of toRemove) {
        const deadUnit = state.units[item.id];
        if (!deadUnit) continue;
        processOnDeathEffect(lobby, deadUnit, deadUnit.owner, { r: targetRow, c: item.col });
        processAllyDeathTriggers(lobby, deadUnit.owner, deadUnit, { r: targetRow, c: item.col });
        state.board[targetRow][item.col] = null;
        discardUnitCard(lobby, deadUnit);
        delete state.units[item.id];
      }
      // Heal heart for each unit hit
      if (hitCount > 0) {
        state.heartHP[role] = Math.min(state.heartHP[role] + hitCount, 30);
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
    for (const uid in state.units) {
      const u = state.units[uid];
      if (u.owner === role) {
        u.hp += 1;
        u.maxHp = (u.maxHp || u.hp) + 1;
        if (fairyKeys.includes(u.key)) {
          u.atk += 1;
        }
        buffed++;
      }
    }
    logToLobby(lobby, "Pearl Blessing buffs " + buffed + " units!");
  }
  
  if (effectId === "halve_atk") {
    // Gemstone Curse - halve target enemy's ATK (min 1)
    if (targetUnitId && state.units[targetUnitId]) {
      const target = state.units[targetUnitId];
      if (target.owner !== role) {
        const oldAtk = target.atk;
        target.atk = Math.max(1, Math.floor(target.atk / 2));
        logToLobby(lobby, "Gemstone Curse reduces " + target.name + "'s ATK from " + oldAtk + " to " + target.atk + "!");
      }
    }
  }
  
  if (effectId === "summon_gems") {
    // Fairy Ring - summon 2 Gem Shards in home rows
    const homeRows = role === "gold" ? [0, 1] : [5, 6];
    let spawned = 0;
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
          spawned++;
        }
      }
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
      
      let hitCount = 0;
      const toRemove = [];
      for (const pos of hitPositions) {
        const uid = state.board[pos.r][pos.c];
        if (uid && state.units[uid] && state.units[uid].owner !== role) {
          const target = state.units[uid];
          if (target.untargetable) continue;
          target.hp -= 2;
          hitCount++;
          if (target.hp <= 0 && shouldUnitDie(lobby, target)) {
            toRemove.push({ id: uid, pos: pos });
          }
        }
      }
      for (const item of toRemove) {
        const deadUnit = state.units[item.id];
        if (!deadUnit) continue;
        processOnDeathEffect(lobby, deadUnit, deadUnit.owner, item.pos);
        processAllyDeathTriggers(lobby, deadUnit.owner, deadUnit, item.pos);
        state.board[item.pos.r][item.pos.c] = null;
        discardUnitCard(lobby, deadUnit);
        delete state.units[item.id];
      }
      logToLobby(lobby, "Lunar Barrage hits " + hitCount + " enemies for 2 damage!");
    }
  }
  
  // === DRAGON WIZARD SPELLS ===
  
  if (effectId === "polymorph") {
    // Polymorph - transform target enemy into a 1/1 Sheep
    if (targetUnitId && state.units[targetUnitId]) {
      const target = state.units[targetUnitId];
      if (target.owner !== role) {
        if (target.untargetable) {
          logToLobby(lobby, target.name + " is untargetable!");
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
        target.hp -= 2;
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
        buffed++;
        // Trigger stat gain effects (Red/Blue Wizard)
        triggerStatGainEffects(lobby, 'atk', 2, uid);
      }
    }
    logToLobby(lobby, "Dragon's Fury empowers " + buffed + " Dragons with +2 ATK!");
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
    
    // Send rewards to player
    if (lobby.hostSocket) {
      lobby.hostSocket.emit("campaignVictory", {
        bossId: lobby.bossId,
        stars: stars,
        rewards: result.rewards,
        user: result.user,
        isChallenge: lobby.isChallenge
      });
    }
    
    const difficultyNames = { 1: 'Easy', 2: 'Medium', 3: 'Hard', 4: 'Challenge' };
    const diffLabel = lobby.isChallenge ? 'Challenge' : difficultyNames[stars];
    logToLobby(lobby, "🎉 Boss defeated on " + diffLabel + "!" + (lobby.isChallenge ? " ✨ HOLO CARDS!" : " Earned " + stars + " star(s)!"));
    
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
      logToLobby(lobby, `⚠️ BLACK HOLE EVENT: ${turnsUntilEvent}`);
    } else if (boss.eventType === 'ghost_train') {
      logToLobby(lobby, `⚠️ GHOST TRAIN APPROACHING: ${turnsUntilEvent}`);
    } else if (boss.eventType === 'blood_chalice') {
      logToLobby(lobby, `🍷 BLOOD CHALICE RITUAL: ${turnsUntilEvent}`, "boss-benefit");
    } else if (boss.eventType === 'gem_rain') {
      logToLobby(lobby, `💎 GEM RAIN: ${turnsUntilEvent}`, "gem-rain-warning");
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
  logToLobby(lobby, `⚠️ VOID COLLAPSE WARNING! A ${size}x${size} black hole is forming!`);
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
  logToLobby(lobby, `🚂 GHOST TRAIN WARNING! Tracks appearing on: ${lineDescriptions.join(', ')}!`);
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
    logToLobby(lobby, `💀 GHOST TRAIN! ${destroyedCount} unit(s) run down: ${destroyedNames.join(', ')}`);
    combatLogToLobby(lobby, `🚂 GHOST TRAIN STRIKES! ${destroyedCount} unit(s) destroyed!`, "boss-execute");
  } else {
    logToLobby(lobby, `🚂 Ghost Train passes through - no casualties!`);
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

function emitLobbyState(lobby) {
  const info = { code: lobby.code, hostDeck: lobby.hostDeck, guestDeck: lobby.guestDeck, hostReady: lobby.hostReady, guestReady: lobby.guestReady, guestJoined: !!lobby.guestSocket, gameStarted: lobby.gameStarted };
  if (lobby.hostSocket) lobby.hostSocket.emit("lobbyState", { ...info, isHost: true });
  if (lobby.guestSocket) lobby.guestSocket.emit("lobbyState", { ...info, isHost: false });
}

function emitGameState(lobby) {
  if (!lobby.gameState) return;
  const { state, players } = lobby.gameState;
  
  // Calculate hp buffs for each player (from buff tiles)
  const goldHpBuff = getHpBuffBonus(state, "gold");
  const silverHpBuff = getHpBuffBonus(state, "silver");
  
  // Create units with effective stats
  const unitsWithBuffs = {};
  for (const uid in state.units) {
    const u = state.units[uid];
    const tileHpBuff = u.owner === "gold" ? goldHpBuff : silverHpBuff;
    
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
    
    const totalHpBuff = tileHpBuff + moonflareHpBuff;
    unitsWithBuffs[uid] = { 
      ...u, 
      displayHp: u.hp + totalHpBuff,
      displayMaxHp: (u.maxHp || u.hp) + totalHpBuff,
      hpBuffed: totalHpBuff > 0
    };
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
    bossEventWarning: state.bossEventWarning, // For boss event visual warnings
    chaliceTiles: state.chaliceTiles || [] // For blood chalice tiles
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
    freeWizard: state.freeWizard && state.freeWizard.gold, // Wizard's Rune buff indicator
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
    freeWizard: state.freeWizard && state.freeWizard.silver, // Wizard's Rune buff indicator
    // Opponent info (gold)
    enemyHandCount: players.gold.hand.length,
    enemyDeckCount: players.gold.deck.length,
    enemyEnergy: players.gold.energy,
    enemyMaxEnergy: players.gold.maxEnergy,
    enemyDiscard: players.gold.discard
  });
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
      if (p.deck.length === 0 && p.discard.length === 0) return;
      if (p.hand.length >= MAX_HAND_SIZE) return;
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
      if (p.energy < card.cost) return;
      
      if (card.effect === "instant") {
        p.energy -= card.cost;
        p.hand.splice(idx, 1);
        p.discard.push(card);
        processInstantSpell(lobby, role, card.effectId, action.row, action.targetUnitId);
        logToLobby(lobby, role.toUpperCase() + " cast " + card.name);
      } else if (action.spawn) {
        p.energy -= card.cost;
        p.hand.splice(idx, 1);
        const id = genId();
        const hpB = getArmoryBonus(state, role);
        const maxHp = card.hp + hpB;
        const unitData = { id, owner: role, key: card.key, name: card.name, atk: card.atk, hp: maxHp, maxHp, cost: card.cost, type: card.type || "monster", effect: card.effect, effectId: card.effectId, effectDesc: card.effectDesc, art: card.art, originalCard: card };
        if (card.effectId === "burrow") {
          unitData.untargetable = true;
          unitData.burrowTurnsLeft = 2;
        }
        if (card.effectId === "phantom") unitData.untargetable = true;
        if (card.stolen) unitData.stolen = true;
        if (card.isHolo) unitData.isHolo = true;
        state.units[id] = unitData;
        state.spawn[role] = id;
        
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
        p.energy -= card.cost;
        p.hand.splice(idx, 1);
        const id = genId();
        const hpB = getArmoryBonus(state, role);
        const maxHp = card.hp + hpB;
        const unitData = { id, owner: role, key: card.key, name: card.name, atk: card.atk, hp: maxHp, maxHp, cost: card.cost, type: card.type || "monster", effect: card.effect, effectId: card.effectId, effectDesc: card.effectDesc, art: card.art, originalCard: card };
        if (card.effectId === "burrow") {
          unitData.untargetable = true;
          unitData.burrowTurnsLeft = 2;
        }
        if (card.effectId === "phantom") unitData.untargetable = true;
        if (card.stolen) unitData.stolen = true;
        if (card.isHolo) unitData.isHolo = true;
        state.units[id] = unitData;
        state.board[action.row][action.col] = id;
        
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
            if (tile.r < 0 || tile.r >= ROWS || tile.c < 0 || tile.c >= COLS) continue;
            if (state.board[tile.r][tile.c]) continue;
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
        
        // Chrono Drake - freeze target enemy for 2 turns (handled via requiresTarget)
        if (card.effectId === "temporal_stasis" && action.targetUnitId) {
          const target = state.units[action.targetUnitId];
          if (target && target.owner !== role) {
            if (target.untargetable) {
              logToLobby(lobby, target.name + " is untargetable!");
            } else {
              target.frozen = 2; // Frozen for 2 turns
              logToLobby(lobby, "Chrono Drake freezes " + target.name + " in temporal stasis for 2 turns!");
            }
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
      
      // Check if unit is rooted
      if (u.rooted) return;
      
      // Check if unit is channeling (Meditation Monk can't move)
      if (u.effectId === "channeling_energy") return;
      
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
      const canLongMove = u.effectId === "stampede"; // 2 tiles cardinal, 1 move per turn
      const hasUnlimitedMoves = u.gemBuffs && u.gemBuffs.unlimitedMoves; // Diamond gem buff
      const maxMoves = hasUnlimitedMoves ? 999 : (canDoubleMove ? 2 : 1);
      console.log(`[MOVE] ${u.name}: moveCount=${moveCount}, maxMoves=${maxMoves}, unlimitedMoves=${hasUnlimitedMoves}, gemBuffs=${JSON.stringify(u.gemBuffs)}`);
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
          if (tile.r < 0 || tile.r >= ROWS || tile.c < 0 || tile.c >= COLS) continue;
          if (state.board[tile.r][tile.c]) continue;
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
      const maxAttacks = baseAttacks + doubleAttackBonus + topazBonus;
      
      console.log(`[ATTACK] ${a.name} (${action.attackerId}): attackCount=${attackCount}, maxAttacks=${maxAttacks} (base=${baseAttacks}, double=${doubleAttackBonus}, topaz=${topazBonus}), frozen=${a.frozen}`);
      
      if (attackCount >= maxAttacks) return;
      
      // Check if attacker is frozen
      if (a.frozen) {
        console.log(`[ATTACK] BLOCKED - ${a.name} is frozen!`);
        return;
      }
      
      const ap = getUnitPos(state, action.attackerId);
      const tp = getUnitPos(state, action.targetId);
      if (!ap || !tp) return;
      
      // Combat log header
      combatLogToLobby(lobby, `⚔️ ${a.name} attacks ${t.name}`, "combat-header");
      combatLogToLobby(lobby, `Base ATK: ${a.atk}`, "combat-step");
      
      let dmg = getEffectiveAtk(state, action.attackerId, action.targetId);
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
          splashTarget.hp -= 1;
          logToLobby(lobby, a.name + "'s flames splash " + splashTarget.name + " for 1 damage!");
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
          linkTarget.hp -= 1;
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
      const maxAttacks = baseAttacks + doubleAttackBonus + topazBonus;
      
      if (attackCount >= maxAttacks) return;
      if (state.rowHP[action.row] <= 0) return;
      
      const ap = getUnitPos(state, action.attackerId);
      
      let dmg = getEffectiveAtk(state, action.attackerId);
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
      const maxAttacks = baseAttacks + doubleAttackBonus + topazBonus;
      
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
      const maxAttacks = baseAttacks + doubleAttackBonus + topazBonus;
      
      if (attackCount >= maxAttacks) return;
      
      const target = action.target; // 'gold' or 'silver'
      if (target === role) return; // Can't attack own heart
      
      const pos = getUnitPos(state, action.attackerId);
      if (!pos) return;
      
      // Check if walls are down
      if (target === "gold" && (state.rowHP[0] > 0 || state.rowHP[1] > 0)) return;
      if (target === "silver" && (state.rowHP[5] > 0 || state.rowHP[6] > 0)) return;
      
      // Check range - must be in heart row or ranged 1 row away
      const heartRow = target === "gold" ? 0 : 6;
      const distance = Math.abs(pos.r - heartRow);
      const isRanged = a.effectId === "ranged" || a.effectId === "ranged_pierce";
      const maxRange = isRanged ? 1 : 0;
      if (distance > maxRange) return;
      
      // Combat log header
      combatLogToLobby(lobby, `⚔️ ${a.name} attacks ${target.toUpperCase()} HEART`, "combat-header");
      combatLogToLobby(lobby, `Base ATK: ${a.atk}`, "combat-step");
      
      let dmg = getEffectiveAtk(state, action.attackerId);
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
  // Filter out challenge decks (they end with -challenge)
  socket.emit("deckList", Object.entries(DECKS)
    .filter(([id, d]) => !id.endsWith('-challenge'))
    .map(([id, d]) => ({ id, name: d.name, description: d.description })));
  socket.emit("campaignBosses", CAMPAIGN_BOSSES);

  socket.on("createLobby", (data) => {
    const code = generateLobbyCode();
    lobbies[code] = { 
      code, 
      hostSocket: socket, 
      guestSocket: null, 
      hostDeck: data.deckId || "medieval", 
      guestDeck: null, 
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
    if (userId) {
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
    if (userId) {
      try {
        const user = await User.findById(userId);
        if (user) {
          const customDeck = user.customDecks.find(d => d.id === deckId);
          if (customDeck && customDeck.cards && customDeck.cards.length >= 25) {
            customDeckCards = customDeck.cards;
            deckMusic = customDeck.music || 'default';
            deckBackground = customDeck.background || 'default';
          }
        }
      } catch (err) {
        console.error('Error loading custom deck:', err);
      }
    }

    const code = generateLobbyCode();
    lobbies[code] = {
      code,
      hostSocket: socket,
      guestSocket: null,
      hostDeck: deckId || "medieval",
      guestDeck: bossDeckId,
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
    lobbies[code].gameState = createGameState(deckId || "medieval", bossDeckId, customDeckCards, null);
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
      canAutoPlay: canAutoPlay
    });
    socket.emit("enemyInfo", { username: boss.name, isAI: true });
    logToLobby(lobbies[code], "=== CAMPAIGN: " + boss.name.toUpperCase() + " ===");
    logToLobby(lobbies[code], "GOLD's turn");
    emitLobbyState(lobbies[code]);
    emitGameState(lobbies[code]);
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
    if (socket.data.isHost) lobby.hostDeck = data.deckId; else lobby.guestDeck = data.deckId;
    emitLobbyState(lobby);
  });

  socket.on("startGame", async () => {
    const lobby = lobbies[socket.data.lobbyCode];
    if (!lobby || !socket.data.isHost || !lobby.guestSocket || !lobby.guestReady) return;
    
    // Look up custom decks for both players
    let hostCustomCards = null;
    let guestCustomCards = null;
    
    if (lobby.hostUserId) {
      try {
        const hostUser = await User.findById(lobby.hostUserId);
        if (hostUser) {
          const customDeck = hostUser.customDecks.find(d => d.id === lobby.hostDeck);
          if (customDeck && customDeck.cards && customDeck.cards.length >= 25) {
            hostCustomCards = customDeck.cards;
          }
        }
      } catch (err) { console.error('Error loading host custom deck:', err); }
    }
    
    if (lobby.guestUserId) {
      try {
        const guestUser = await User.findById(lobby.guestUserId);
        if (guestUser) {
          const customDeck = guestUser.customDecks.find(d => d.id === lobby.guestDeck);
          if (customDeck && customDeck.cards && customDeck.cards.length >= 25) {
            guestCustomCards = customDeck.cards;
          }
        }
      } catch (err) { console.error('Error loading guest custom deck:', err); }
    }
    
    lobby.gameStarted = true;
    lobby.gameState = createGameState(lobby.hostDeck, lobby.guestDeck, hostCustomCards, guestCustomCards);
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
    
    if (!lobby) {
      return socket.emit("lobbyError", "Game not found. Return to home.");
    }
    
    if (!lobby.gameStarted) {
      return socket.emit("lobbyError", "Game not started yet.");
    }
    
    // Reconnect socket to lobby
    socket.data.lobbyCode = code;
    socket.data.isHost = data.isHost;
    
    if (data.isHost) {
      lobby.hostSocket = socket;
      socket.emit("role", "gold");
      
      // If it's AI's turn and this is a campaign game, restart AI processing
      if (lobby.isAIGame && lobby.ai && lobby.gameState.state.activeSide === "silver" && !lobby.gameState.state.gameOver) {
        setTimeout(() => processAITurn(lobby), 1000);
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

  socket.on("restartGame", () => {
    const lobby = lobbies[socket.data.lobbyCode];
    if (!lobby || !socket.data.isHost) return;
    
    // Reset game state
    lobby.gameState = createGameState(lobby.hostDeck, lobby.guestDeck);
    logToLobby(lobby, "=== GAME RESTARTED ===");
    logToLobby(lobby, "GOLD's turn");
    emitGameState(lobby);
  });

  socket.on("action", (payload) => {
    const lobby = lobbies[socket.data.lobbyCode];
    if (!lobby || !lobby.gameStarted || !lobby.gameState) return;
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
          processSpellEffect(lobby, side, card.effectId, null, row, col);
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
          effectId: card.effectId,
          effectDesc: card.effectDesc,
          art: card.art
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
            if (tile.r < 0 || tile.r >= ROWS || tile.c < 0 || tile.c >= COLS) continue;
            if (state.board[tile.r][tile.c]) continue;
            const gemId = genId();
            state.units[gemId] = {
              id: gemId, owner: side, key: "gemshard", name: "Gem Shard",
              atk: 1, hp: 1, maxHp: 1, type: "structure", art: "/images/Gem Shard.png"
            };
            state.board[tile.r][tile.c] = gemId;
            logToLobby(lobby, card.name + " summons a Gem Shard!");
            break;
          }
        }
        
        logToLobby(lobby, side.toUpperCase() + " spawned " + card.name);
        emitPlaytestState(lobby);
        return;
      }
    }

    if (payload.type === "endTurn") {
      processEndOfTurnEffects(lobby, role);
      
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
        }
      }
      
      state.activeSide = enemyOf(role); 
      state.movedThisTurn.clear(); 
      state.attackedThisTurn.clear();
      state.moveCountThisTurn = {}; // Reset move counts for new turn
      state.attackCountThisTurn = {}; // Reset attack counts for new turn
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
      if (idx === -1) return socket.emit("log", "Card not found.");
      const card = p.hand.splice(idx, 1)[0]; p.discard.push(card);
      logToLobby(lobby, role.toUpperCase() + " discards " + card.name);
      return emitGameState(lobby);
    }

    if (payload.type === "playCard") {
      const { cardId, row, col, spawn, targetUnitId } = payload; const p = players[role];
      const idx = p.hand.findIndex(c => c.id === cardId); if (idx === -1) return socket.emit("log", "Card not found.");
      const card = p.hand[idx]; let cost = card.cost || 0;
      
      // Apply spell discount from Rune Scribe
      if (card.type === "spell" && state.spellDiscount && state.spellDiscount[role] > 0) {
        cost = Math.max(0, cost - state.spellDiscount[role]);
        state.spellDiscount[role] = 0; // Consume the discount
        logToLobby(lobby, "Rune Scribe's enchantment reduces spell cost!");
      }
      
      // Apply free wizard from Wizard's Rune death effect
      if (WIZARD_CARDS.includes(card.key) && card.type === "monster" && state.freeWizard && state.freeWizard[role]) {
        cost = 0;
        state.freeWizard[role] = false; // Consume the free wizard
        logToLobby(lobby, "Wizard's Rune enchantment - " + card.name + " costs 0 energy!");
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
              target.hp -= 1;
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
        const id = genId(); const hpB = getArmoryBonus(state, role);
        const maxHp = card.hp + hpB;
        const unitData = { id, owner: role, key: card.key, name: card.name, atk: card.atk, hp: maxHp, maxHp: maxHp, cost: card.cost, type: card.type || "monster", effect: card.effect, effectId: card.effectId, effectDesc: card.effectDesc, art: card.art, originalCard: card };
        // Preserve stolen flag for Soul Collector cards
        if (card.stolen) unitData.stolen = true;
        // Preserve holo flag for holographic cards
        if (card.isHolo) unitData.isHolo = true;
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
      
      if (!canDeploy) return socket.emit("log", "Can't deploy here.");
      p.energy -= cost; p.hand.splice(idx, 1);
      const id = genId(); const hpB = getArmoryBonus(state, role);
      const maxHp = card.hp + hpB;
      const unitData = { id, owner: role, key: card.key, name: card.name, atk: card.atk, hp: maxHp, maxHp: maxHp, cost: card.cost, type: card.type || "monster", effect: card.effect, effectId: card.effectId, effectDesc: card.effectDesc, art: card.art, originalCard: card };
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
      state.units[id] = unitData;
      state.board[row][col] = id;
      
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
          if (tile.r < 0 || tile.r >= ROWS || tile.c < 0 || tile.c >= COLS) continue;
          if (state.board[tile.r][tile.c]) continue; // Skip occupied
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
          logToLobby(lobby, card.name + " summons a Gem Shard!");
          spawned = true;
          break;
        }
        if (!spawned) {
        }
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
          if (tile.r < 0 || tile.r >= ROWS || tile.c < 0 || tile.c >= COLS) continue;
          if (state.board[tile.r][tile.c]) continue; // Skip occupied
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
      const canLongMove = u.effectId === "stampede"; // Can move 2 tiles but only once
      const hasUnlimitedMoves = u.gemBuffs && u.gemBuffs.unlimitedMoves; // Diamond gem buff
      const maxMoves = hasUnlimitedMoves ? 999 : (canDoubleMove ? 2 : 1);
      
      console.log(`[PLAYER MOVE] ${u.name}: moveCount=${moveCount}, maxMoves=${maxMoves}, frozen=${u.frozen}, unlimitedMoves=${hasUnlimitedMoves}`);
      
      if (moveCount >= maxMoves) return socket.emit("log", "No more moves for this unit.");
      if (toRow < 0 || toRow >= ROWS || toCol < 0 || toCol >= COLS || state.board[toRow][toCol]) return socket.emit("log", "Invalid.");
      
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
      
      // Sapphire Dancer fairy_swap - can swap positions with a friendly Fairy
      const fairyKeys = ['rubysprite', 'emeraldforager', 'sapphiredancer', 'topazminer', 
                         'amethystenchanter', 'diamondguardian', 'opaldevourer',
                         'garnetqueen', 'moonstonewitch', 'prismaticfairy', 'gemshard'];
      if (u.effectId === "fairy_swap" && !validMove) {
        // Check if destination has a friendly fairy
        const targetUnitId = state.board[toRow][toCol];
        if (targetUnitId && state.units[targetUnitId]) {
          const targetUnit = state.units[targetUnitId];
          if (targetUnit.owner === role && fairyKeys.includes(targetUnit.key) && targetUnitId !== unitId) {
            // Valid swap target - perform the swap
            state.board[from.r][from.c] = targetUnitId;
            state.board[toRow][toCol] = unitId;
            state.movedThisTurn.add(unitId);
            state.moveCountThisTurn[unitId] = maxMoves; // Use up all moves
            recomputeOwners(state);
            logToLobby(lobby, u.name + " swaps with " + targetUnit.name + "!");
            return emitGameState(lobby);
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
      const topazBonus = (a.gemBuffs && a.gemBuffs.extraAttacks) || 0;
      const maxAttacks = baseAttacks + doubleAttackBonus + topazBonus;
      
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
        // UFO Scraper kills friendly and absorbs stats
        a.atk += t.atk;
        a.hp += t.hp;
        a.maxHp = (a.maxHp || 1) + (t.maxHp || t.hp);
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
      
      // Combat log header
      combatLogToLobby(lobby, `⚔️ ${a.name} attacks ${t.name}`, "combat-header");
      combatLogToLobby(lobby, `Base ATK: ${a.atk}`, "combat-step");
      if (dmg !== a.atk) {
        combatLogToLobby(lobby, `Modified ATK: ${dmg} (buffs/debuffs applied)`, "combat-step");
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
        if (bodyguard.hp <= 0) {
          const bgPos = getUnitPos(state, bodyguardId);
          processOnDeathEffect(lobby, bodyguard, bodyguard.owner, bgPos, attackerId);
          processAllyDeathTriggers(lobby, bodyguard.owner, bodyguard, bgPos);
          if (bgPos) state.board[bgPos.r][bgPos.c] = null;
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
        a.hp -= 1;
        logToLobby(lobby, t.name + " reflects 1 damage back to " + a.name + "!");
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
      }
      
      // Track attack count
      if (!state.attackCountThisTurn) state.attackCountThisTurn = {};
      state.attackCountThisTurn[attackerId] = (state.attackCountThisTurn[attackerId] || 0) + 1;
      const newAttackCount = state.attackCountThisTurn[attackerId];
      if (newAttackCount >= maxAttacks) {
        state.attackedThisTurn.add(attackerId);
      }
      
      logToLobby(lobby, a.name + " deals " + dmg + " to " + t.name + (newAttackCount < maxAttacks ? " (can attack again)" : ""));
      
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
        } else {
          combatLogToLobby(lobby, `Lifesteal (attacker): ${a.name} already at max HP`, "combat-step");
        }
      }
      
      // Check if target has lifesteal (heals when attacked)
      const targetHasLifesteal = t.effectId === "lifesteal" || 
                                  t.effectId === "lifesteal_weaken" || 
                                  t.effectId === "lifesteal_grow" ||
                                  t.effectId === "lifesteal_lord" ||
                                  hasVampireLordBuff(state, t.owner);
      
      if (targetHasLifesteal && dmg > 0 && t.hp > 0) {
        // Lifesteal heals the unit for 1 HP when attacked
        const maxHp = t.maxHp || t.hp;
        if (t.hp < maxHp) {
          const hpBefore = t.hp;
          t.hp = Math.min(t.hp + 1, maxHp);
          logToLobby(lobby, t.name + " drains life from attacker! +1 HP");
          combatLogToLobby(lobby, `Lifesteal (defender): ${t.name} heals ${hpBefore} → ${t.hp} HP`, "combat-lifesteal");
        } else {
          combatLogToLobby(lobby, `Lifesteal (defender): ${t.name} already at max HP`, "combat-step");
        }
      }
      
      // Neural Harvester - gain energy if target survives
      if (a.effectId === "energy_on_hit" && t.hp > 0) {
        lobby.gameState.players[role].energy = Math.min(lobby.gameState.players[role].energy + 1, MAX_ENERGY);
        logToLobby(lobby, a.name + " harvests 1 energy!");
      }
      
      // Blood Familiar blood_bite - attacks twice, second attack deals 1 damage
      if (a.effectId === "blood_bite" && t.hp > 0) {
        // Deal second attack for 1 damage
        const secondDmg = applyDamageReduction(state, targetId, 1, attackerId, lobby);
        t.hp -= secondDmg;
        logToLobby(lobby, a.name + " bites again for " + secondDmg + "!");
        combatLogToLobby(lobby, `Second bite: ${t.name} takes ${secondDmg} damage, now ${t.hp} HP`, "combat-step");
      }
      
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
        for (const sp of splashPositions) {
          if (sp.r < 0 || sp.r >= ROWS || sp.c < 0 || sp.c >= COLS) continue;
          const splashId = state.board[sp.r][sp.c];
          if (splashId && state.units[splashId] && state.units[splashId].owner !== role) {
            const splashTarget = state.units[splashId];
            if (splashTarget.untargetable) continue;
            splashTarget.hp -= 1;
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
      
      // Check range - archers can attack from 2 tiles away, others must be adjacent
      const isRanged = a.effectId === "ranged" || a.effectId === "ranged_pierce" || a.effectId === "starweave_ranged";
      const maxRange = isRanged ? 2 : 1;
      const rowDistance = Math.abs(ap.r - row);
      
      if (rowDistance > maxRange) {
        return socket.emit("log", isRanged ? "Too far (max 2 rows)." : "Not adjacent (no diagonal).");
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
      // - Archers (ranged): can attack from 1 additional row away (so rows 0-1 for gold heart, rows 5-6 for silver heart)
      const heartRow = target === "gold" ? 0 : 6; 
      const distance = Math.abs(pos.r - heartRow);
      const isRanged = u.effectId === "ranged" || u.effectId === "ranged_pierce" || u.effectId === "starweave_ranged";
      const maxRange = isRanged ? 1 : 0;
      
      if (distance > maxRange) {
        return socket.emit("log", isRanged ? "Archer must be within 1 row of the heart." : "Must be in the heart's row to attack.");
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
      
      // Wait 5 seconds for rejoin before notifying other player
      setTimeout(() => {
        const currentLobby = lobbies[code];
        if (!currentLobby) return; // Lobby already closed
        
        if (wasHost && !currentLobby.hostSocket) {
          // Host didn't rejoin
          if (currentLobby.guestSocket) currentLobby.guestSocket.emit("lobbyError", "Host disconnected.");
          delete lobbies[code];
        } else if (!wasHost && !currentLobby.guestSocket) {
          // Guest didn't rejoin
          if (currentLobby.hostSocket) currentLobby.hostSocket.emit("lobbyError", "Opponent disconnected.");
          delete lobbies[code];
        }
      }, 5000);
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