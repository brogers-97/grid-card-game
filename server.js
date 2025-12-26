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

app.get("/api/campaign/bosses", (req, res) => {
  res.json({ bosses: CAMPAIGN_BOSSES });
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
      bonecolossus: 'legendary', shallowgrave: 'legendary', highnoon: 'legendary'
    };
    
    // Get max copies based on rarity
    const getMaxCopies = (card) => {
      const rarity = cardRarity[card] || 'common';
      if (rarity === 'legendary') return 1;
      if (rarity === 'rare') return 2;
      return 3;
    };
    
    // Medieval cards that every player should have (set to max based on rarity)
    const medievalCards = [
      'peasant', 'squire', 'archer', 'manatarms', 'shieldbearer', 
      'warhound', 'battlefieldmedic', 'knight', 'crusader', 
      'royalguard', 'paladin', 'siegeram', 'warbanner', 
      'shrine', 'armory', 'castlewalls', 'treasury', 'rally'
    ];
    
    // Set each medieval card to max based on rarity
    medievalCards.forEach(card => {
      user.cardCollection.set(card, getMaxCopies(card));
    });
    
    // Cap all other cards based on rarity
    for (const [card, count] of user.cardCollection.entries()) {
      const maxCopies = getMaxCopies(card);
      if (count > maxCopies) {
        user.cardCollection.set(card, maxCopies);
      }
    }
    
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
    
    if (!deckType || !['medieval', 'void-alien', 'western-skeleton', 'crimson-court'].includes(deckType)) {
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
    cards.forEach(key => {
      cardCounts[key] = (cardCounts[key] || 0) + 1;
    });
    
    for (const [key, count] of Object.entries(cardCounts)) {
      const owned = user.cardCollection.get(key) || 0;
      if (count > owned) {
        return res.status(400).json({ 
          success: false, 
          error: `You don't own enough copies of ${key}` 
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
      // Ghostly Stampede x1 (double move + siege)
      { key: "ghostlystampede", name: "Ghostly Stampede", atk: 5, hp: 4, cost: 5, type: "monster", effect: "passive", effectId: "stampede", effectDesc: "PASSIVE: Can move twice. +2 damage to structures.", art: "/images/Ghostly Stampede.png", rarity: "legendary" },
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
  console.log('createDeckFromKeys called with', cardKeys.length, 'cards');
  const result = cardKeys.map(key => {
    const template = getCardTemplate(key);
    if (!template) {
      console.warn(`Unknown card key: ${key}`);
      return null;
    }
    return { ...template, id: genId(), maxHp: template.hp };
  }).filter(c => c !== null);
  console.log('createDeckFromKeys returning', result.length, 'cards');
  console.log('First 3 cards:', result.slice(0, 3).map(c => c.name));
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
    pendingCoffinResurrects: { gold: [], silver: [] } // For Coffin resurrect_self
  };
  
  // Create decks - use custom cards if provided, otherwise default deck
  console.log('createGameState - hostCustomCards:', hostCustomCards ? hostCustomCards.length : 'null');
  console.log('createGameState - guestCustomCards:', guestCustomCards ? guestCustomCards.length : 'null');
  
  const goldDeckCards = hostCustomCards && hostCustomCards.length >= 25 
    ? shuffle(createDeckFromKeys(hostCustomCards)) 
    : shuffle(createDeck(hostDeck));
  const silverDeckCards = guestCustomCards && guestCustomCards.length >= 25 
    ? shuffle(createDeckFromKeys(guestCustomCards)) 
    : shuffle(createDeck(guestDeck));
  
  console.log('Gold deck size:', goldDeckCards.length);
  console.log('Silver deck size:', silverDeckCards.length);
  
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
  // Most Wanted mark - target takes +2 damage
  if (targetId && state.units[targetId] && state.units[targetId].marked) {
    atk += 2;
  }
  return atk;
}

function applyDamageReduction(state, tid, dmg, attackerId) {
  const t = state.units[tid]; if (!t) return dmg; const pos = getUnitPos(state, tid); if (!pos) return dmg;
  const attacker = attackerId ? state.units[attackerId] : null;
  
  // Bone Revolver - ranged_pierce ignores shield effects
  const ignoresShields = attacker && attacker.effectId === "ranged_pierce";
  
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

// Get effective max HP for a unit (includes hp_buff)
function getEffectiveMaxHp(state, uid) {
  const u = state.units[uid]; if (!u) return 0;
  let maxHp = u.maxHp || u.hp;
  maxHp += getHpBuffBonus(state, u.owner);
  return maxHp;
}

function logToLobby(lobby, msg) { lobby.log = lobby.log || []; lobby.log.push(msg); if (lobby.hostSocket) lobby.hostSocket.emit("log", msg); if (lobby.guestSocket) lobby.guestSocket.emit("log", msg); }

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
  const a = state.units[aid]; if (!a || a.effect !== "onKill") return;
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
  // Blood Countess / lifesteal_grow - gain +1/+1 on kill
  if (a.effectId === "lifesteal_grow") {
    a.atk += 1;
    a.hp += 1;
    a.maxHp = (a.maxHp || a.hp) + 1;
    logToLobby(lobby, a.name + " grows stronger! Now " + a.atk + "/" + a.hp);
  }
}

// Process on-death effects (for the dying unit's owner)
function processOnDeathEffect(lobby, deadUnit, deadUnitOwner, deadPos) {
  if (!deadUnit || deadUnit.effect !== "onDeath") return;
  const state = lobby.gameState.state;
  
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
        if (target.hp <= 0) {
          toRemove.push({ id: targetId, r: pos.r, c: pos.c });
        }
      }
    }
    for (const item of toRemove) {
      const deadTarget = state.units[item.id];
      // Don't recursively trigger death effects to avoid infinite loops
      state.board[item.r][item.c] = null;
      delete state.units[item.id];
      logToLobby(lobby, deadTarget.name + " destroyed by " + deadUnit.name + "'s death explosion!");
    }
    if (damaged > 0) {
      logToLobby(lobby, deadUnit.name + " explodes, dealing 2 damage to " + damaged + " enemies!");
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
  
  for (const uid in state.units) {
    const u = state.units[uid];
    // Undertaker - gains +1/+1 on ally death
    if (u.owner === deadUnitOwner && u.effectId === "grow_on_ally_death") {
      u.atk += 1;
      u.hp += 1;
      u.maxHp = (u.maxHp || u.hp) + 1;
      logToLobby(lobby, u.name + " grows from ally death! Now " + u.atk + "/" + u.hp);
    }
    // Crypt Keeper - gains +1 max HP on ally death
    if (u.owner === deadUnitOwner && u.effectId === "grow_max_hp_on_ally_death") {
      u.maxHp = (u.maxHp || u.hp) + 1;
      u.hp += 1; // Also heal for the new max
      logToLobby(lobby, u.name + " absorbs death essence! Max HP now " + u.maxHp);
    }
  }
}

function processEndOfTurnEffects(lobby, role) {
  const state = lobby.gameState.state;
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
  }
}

function processStartOfTurnEffects(lobby, role) {
  const state = lobby.gameState.state;
  
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
  }
}

function processInstantSpell(lobby, role, effectId, targetRow, targetUnitId) {
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
          processAllyDeathTriggers(lobby, target.owner);
          state.board[pos.r][pos.c] = null;
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
          if (target.hp <= 0) {
            toRemove.push({ id: uid, col: c });
          }
        }
      }
      // Remove dead units
      for (const item of toRemove) {
        const deadUnit = state.units[item.id];
        processOnDeathEffect(lobby, deadUnit, deadUnit.owner, { r: targetRow, c: item.col });
        processAllyDeathTriggers(lobby, deadUnit.owner);
        state.board[targetRow][item.col] = null;
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
          if (target.hp <= 0) {
            toRemove.push({ id: uid, col: c });
          }
        }
      }
      for (const item of toRemove) {
        const deadUnit = state.units[item.id];
        processOnDeathEffect(lobby, deadUnit, deadUnit.owner, { r: targetRow, c: item.col });
        processAllyDeathTriggers(lobby, deadUnit.owner);
        state.board[targetRow][item.col] = null;
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
        
        if (target.hp <= 0) {
          const pos = getUnitPos(state, targetUnitId);
          processOnDeathEffect(lobby, target, target.owner, pos);
          processAllyDeathTriggers(lobby, target.owner);
          if (pos) state.board[pos.r][pos.c] = null;
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
      if (target.hp <= 0) {
        const pos = getUnitPos(state, targetUnitId);
        processOnDeathEffect(lobby, target, target.owner, pos);
        processAllyDeathTriggers(lobby, target.owner);
        if (pos) state.board[pos.r][pos.c] = null;
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
          if (target.hp <= 0) {
            toRemove.push({ id: uid, col: c });
          }
        }
      }
      for (const item of toRemove) {
        const deadUnit = state.units[item.id];
        processOnDeathEffect(lobby, deadUnit, deadUnit.owner, { r: targetRow, c: item.col });
        processAllyDeathTriggers(lobby, deadUnit.owner);
        state.board[targetRow][item.col] = null;
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
}

// Handle campaign victory rewards
async function handleCampaignVictory(lobby) {
  try {
    const { state } = lobby.gameState;
    
    // Stars = difficulty level beaten (1=easy, 2=medium, 3=hard)
    // If you beat hard, you get all 3 stars
    // If you beat medium, you get 2 stars
    // If you beat easy, you get 1 star
    const stars = lobby.aiLevel || 2;
    
    const result = await authHelpers.completeBoss(lobby.hostUserId, lobby.bossId, stars, lobby.aiLevel);
    
    // Send rewards to player
    if (lobby.hostSocket) {
      lobby.hostSocket.emit("campaignVictory", {
        bossId: lobby.bossId,
        stars: stars,
        rewards: result.rewards,
        user: result.user
      });
    }
    
    const difficultyNames = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
    logToLobby(lobby, "🎉 Boss defeated on " + difficultyNames[stars] + "! Earned " + stars + " star(s)!");
    logToLobby(lobby, "Cards won: " + result.rewards.cards.join(", "));
    
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

function emitLobbyState(lobby) {
  const info = { code: lobby.code, hostDeck: lobby.hostDeck, guestDeck: lobby.guestDeck, hostReady: lobby.hostReady, guestReady: lobby.guestReady, guestJoined: !!lobby.guestSocket, gameStarted: lobby.gameStarted };
  if (lobby.hostSocket) lobby.hostSocket.emit("lobbyState", { ...info, isHost: true });
  if (lobby.guestSocket) lobby.guestSocket.emit("lobbyState", { ...info, isHost: false });
}

function emitGameState(lobby) {
  if (!lobby.gameState) return;
  const { state, players } = lobby.gameState;
  
  // Calculate hp buffs for each player
  const goldHpBuff = getHpBuffBonus(state, "gold");
  const silverHpBuff = getHpBuffBonus(state, "silver");
  
  // Create units with effective stats
  const unitsWithBuffs = {};
  for (const uid in state.units) {
    const u = state.units[uid];
    const hpBuff = u.owner === "gold" ? goldHpBuff : silverHpBuff;
    unitsWithBuffs[uid] = { 
      ...u, 
      displayHp: u.hp + hpBuff,
      displayMaxHp: (u.maxHp || u.hp) + hpBuff,
      hpBuffed: hpBuff > 0
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
    moveCountThisTurn: state.moveCountThisTurn
  };
  if (lobby.hostSocket) lobby.hostSocket.emit("state", { 
    ...base, 
    hand: players.gold.hand, 
    deckCount: players.gold.deck.length, 
    discardCount: players.gold.discard.length, 
    energy: players.gold.energy, 
    maxEnergy: players.gold.maxEnergy, 
    canDraw: !players.gold.hasDrawn && players.gold.hand.length < MAX_HAND_SIZE,
    // Opponent info (silver)
    enemyHandCount: players.silver.hand.length,
    enemyDeckCount: players.silver.deck.length,
    enemyEnergy: players.silver.energy,
    enemyMaxEnergy: players.silver.maxEnergy
  });
  if (lobby.guestSocket) lobby.guestSocket.emit("state", { 
    ...base, 
    hand: players.silver.hand, 
    deckCount: players.silver.deck.length, 
    discardCount: players.silver.discard.length, 
    energy: players.silver.energy, 
    maxEnergy: players.silver.maxEnergy, 
    canDraw: !players.silver.hasDrawn && players.silver.hand.length < MAX_HAND_SIZE,
    // Opponent info (gold)
    enemyHandCount: players.gold.hand.length,
    enemyDeckCount: players.gold.deck.length,
    enemyEnergy: players.gold.energy,
    enemyMaxEnergy: players.gold.maxEnergy
  });
}

// Process AI turn for campaign mode
async function processAITurn(lobby) {
  const { state, players } = lobby.gameState;
  const ai = lobby.ai;
  if (!ai) return;
  
  // Prevent multiple AI loops from running simultaneously
  if (lobby.aiProcessing) {
    console.log("AI already processing, skipping duplicate call");
    return;
  }
  lobby.aiProcessing = true;

  const aiRole = "silver";
  const aiPlayer = players[aiRole];
  
  // Add delay to make AI feel more natural
  const actionDelay = 800 + Math.random() * 400;
  
  // Track actions to prevent infinite loops
  let actionCount = 0;
  let consecutiveFailedMoves = 0;
  const MAX_ACTIONS_PER_TURN = 50;
  const MAX_CONSECUTIVE_FAILED_MOVES = 5;
  
  const executeAIAction = async () => {
    try {
      if (state.gameOver || state.activeSide !== aiRole) {
        lobby.aiProcessing = false;
        return;
      }
      
      // Safety check - force end turn if too many actions
      actionCount++;
      if (actionCount > MAX_ACTIONS_PER_TURN) {
        console.log("AI reached max actions, forcing end turn");
        forceAIEndTurn();
        return;
      }
      
      const action = ai.decideAction(
        state,
        aiPlayer.hand,
        aiPlayer.energy,
        aiPlayer.hasDrawn
      );
      
      console.log("AI action:", action.type);
      
      if (action.type === "endTurn") {
        // AI ends turn - process end of turn
        processEndOfTurnEffects(lobby, aiRole);
        
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
        
        const goldPlayer = players.gold;
        let energyGain = 1 + Math.floor((state.turnNumber - 1) / 3);
        if (playerHasBuff(state, "gold", "energy_buff")) energyGain += 1;
        goldPlayer.energy = Math.min(goldPlayer.energy + energyGain, MAX_ENERGY);
        goldPlayer.hasDrawn = false;
        
        processStartOfTurnEffects(lobby, "gold");
        state.turnNumber++;
        logToLobby(lobby, "--- GOLD's turn (+" + energyGain + " energy) ---");
        lobby.aiProcessing = false; // Clear the flag
        emitGameState(lobby);
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
          console.log("AI move failed, consecutive failures:", consecutiveFailedMoves);
          
          if (consecutiveFailedMoves >= MAX_CONSECUTIVE_FAILED_MOVES) {
            console.log("Too many failed moves, forcing end turn");
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
      
      // Continue AI turn after delay
      if (state.activeSide === aiRole && !state.gameOver) {
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
    state.activeSide = "gold";
    state.movedThisTurn.clear();
    state.attackedThisTurn.clear();
    state.moveCountThisTurn = {};
    const goldPlayer = players.gold;
    let energyGain = 1 + Math.floor((state.turnNumber - 1) / 3);
    if (playerHasBuff(state, "gold", "energy_buff")) energyGain += 1;
    goldPlayer.energy = Math.min(goldPlayer.energy + energyGain, MAX_ENERGY);
    goldPlayer.hasDrawn = false;
    processStartOfTurnEffects(lobby, "gold");
    state.turnNumber++;
    logToLobby(lobby, "--- GOLD's turn (+" + energyGain + " energy) ---");
    emitGameState(lobby);
  };
  
  // Start AI turn with delay
  setTimeout(executeAIAction, actionDelay);
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
      const drawCount = playerHasBuff(state, role, "draw_buff") ? 2 : 1;
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
        p.discard.push(card);
        const id = genId();
        const hpB = getArmoryBonus(state, role);
        const maxHp = card.hp + hpB;
        const unitData = { id, owner: role, key: card.key, name: card.name, atk: card.atk, hp: maxHp, maxHp, cost: card.cost, type: card.type || "monster", effect: card.effect, effectId: card.effectId, effectDesc: card.effectDesc, art: card.art };
        if (card.effectId === "burrow") {
          unitData.untargetable = true;
          unitData.burrowTurnsLeft = 2;
        }
        if (card.effectId === "phantom") unitData.untargetable = true;
        if (card.stolen) unitData.stolen = true;
        state.units[id] = unitData;
        state.spawn[role] = id;
        logToLobby(lobby, role.toUpperCase() + " deployed " + card.name + " to spawn");
      } else if (action.row !== undefined && action.col !== undefined) {
        if (state.board[action.row][action.col]) return;
        p.energy -= card.cost;
        p.hand.splice(idx, 1);
        p.discard.push(card);
        const id = genId();
        const hpB = getArmoryBonus(state, role);
        const maxHp = card.hp + hpB;
        const unitData = { id, owner: role, key: card.key, name: card.name, atk: card.atk, hp: maxHp, maxHp, cost: card.cost, type: card.type || "monster", effect: card.effect, effectId: card.effectId, effectDesc: card.effectDesc, art: card.art };
        if (card.effectId === "burrow") {
          unitData.untargetable = true;
          unitData.burrowTurnsLeft = 2;
        }
        if (card.effectId === "phantom") unitData.untargetable = true;
        if (card.stolen) unitData.stolen = true;
        state.units[id] = unitData;
        state.board[action.row][action.col] = id;
        recomputeOwners(state);
        logToLobby(lobby, role.toUpperCase() + " played " + card.name);
      }
      break;
    }
    
    case "move": {
      const u = state.units[action.unitId];
      if (!u || u.owner !== role) return;
      const moveCount = state.moveCountThisTurn[action.unitId] || 0;
      const canDoubleMove = u.effectId === "double_move" || u.effectId === "stampede" || playerHasBuff(state, role, "move_buff");
      if (moveCount >= (canDoubleMove ? 2 : 1)) return;
      
      const from = getUnitPos(state, action.unitId);
      if (!from) return;
      if (state.board[action.toRow][action.toCol]) return;
      
      // Validate move is adjacent (or within 2 for double move)
      const rowDist = Math.abs(from.r - action.toRow);
      const colDist = Math.abs(from.c - action.toCol);
      const maxDist = canDoubleMove ? 2 : 1;
      if (rowDist > maxDist || colDist > maxDist) return; // Too far
      if (rowDist === 0 && colDist === 0) return; // Same tile
      
      // Can't move into enemy home rows with HP
      const enemy = enemyOf(role);
      const isEnemyHomeRow = (enemy === "gold" && action.toRow <= 1) || (enemy === "silver" && action.toRow >= 5);
      if (isEnemyHomeRow && state.rowHP[action.toRow] > 0) return;
      
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", { type: "move", unitId: action.unitId, fromRow: from.r, fromCol: from.c, toRow: action.toRow, toCol: action.toCol });
      state.board[from.r][from.c] = null;
      state.board[action.toRow][action.toCol] = action.unitId;
      state.moveCountThisTurn[action.unitId] = moveCount + 1;
      if (state.moveCountThisTurn[action.unitId] >= (canDoubleMove ? 2 : 1)) {
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
      recomputeOwners(state);
      logToLobby(lobby, role.toUpperCase() + "'s " + u.name + " entered board");
      break;
    }
    
    case "attackUnit": {
      const a = state.units[action.attackerId];
      const t = state.units[action.targetId];
      if (!a || !t || a.owner !== role) return;
      if (state.attackedThisTurn.has(action.attackerId)) return;
      
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
      dmg = applyDamageReduction(state, action.targetId, dmg, action.attackerId);
      if (dmg !== dmgBeforeReduction) {
        combatLogToLobby(lobby, `Damage reduced: ${dmgBeforeReduction} → ${dmg} (Shield Bearer/armor)`, "combat-step");
      }
      
      const before = t.hp;
      t.hp -= dmg;
      
      combatLogToLobby(lobby, `${t.name}: ${before} HP - ${dmg} damage = ${t.hp} HP`, "combat-result");
      
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", { type: "damage", row: tp.r, col: tp.c });
      
      state.attackedThisTurn.add(action.attackerId);
      logToLobby(lobby, a.name + " deals " + dmg + " to " + t.name);
      
      if (t.hp <= 0) {
        combatLogToLobby(lobby, `💀 ${t.name} DESTROYED (${t.hp} HP)`, "combat-death");
        if (lobby.hostSocket) lobby.hostSocket.emit("animate", { type: "destroy", row: tp.r, col: tp.c });
        processOnDeathEffect(lobby, t, t.owner, { r: tp.r, c: tp.c });
        processAllyDeathTriggers(lobby, t.owner);
        processOnKillEffect(lobby, action.attackerId, role, { r: tp.r, c: tp.c }, t);
        if (!state.board[tp.r][tp.c] || state.board[tp.r][tp.c] === action.targetId) {
          state.board[tp.r][tp.c] = null;
        }
        delete state.units[action.targetId];
        logToLobby(lobby, t.name + " destroyed!");
        recomputeOwners(state);
      }
      break;
    }
    
    case "attackRow": {
      const a = state.units[action.attackerId];
      if (!a || a.owner !== role) return;
      if (state.attackedThisTurn.has(action.attackerId)) return;
      if (state.rowHP[action.row] <= 0) return;
      
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
      state.attackedThisTurn.add(action.attackerId);
      
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
      if (state.attackedThisTurn.has(attackerId)) return;
      
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
      dmg = applyDamageReduction(state, action.targetId, dmg, attackerId);
      if (dmg !== dmgBeforeReduction) {
        combatLogToLobby(lobby, `Damage reduced: ${dmgBeforeReduction} → ${dmg} (Shield Bearer/armor)`, "combat-step");
      }
      
      const before = t.hp;
      t.hp -= dmg;
      state.attackedThisTurn.add(attackerId);
      
      combatLogToLobby(lobby, `${t.name}: ${before} HP - ${dmg} damage = ${t.hp} HP`, "combat-result");
      
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", { type: "damage", row: tp.r, col: tp.c });
      
      logToLobby(lobby, a.name + " (from spawn) deals " + dmg + " to " + t.name);
      
      if (t.hp <= 0) {
        combatLogToLobby(lobby, `💀 ${t.name} DESTROYED (${t.hp} HP)`, "combat-death");
        if (lobby.hostSocket) lobby.hostSocket.emit("animate", { type: "destroy", row: tp.r, col: tp.c });
        processOnDeathEffect(lobby, t, t.owner, { r: tp.r, c: tp.c });
        processAllyDeathTriggers(lobby, t.owner);
        processOnKillEffect(lobby, attackerId, role, { r: tp.r, c: tp.c }, t);
        state.board[tp.r][tp.c] = null;
        delete state.units[action.targetId];
        logToLobby(lobby, t.name + " destroyed!");
        recomputeOwners(state);
      }
      break;
    }
    
    case "attackHeart": {
      const a = state.units[action.attackerId];
      if (!a || a.owner !== role) return;
      if (state.attackedThisTurn.has(action.attackerId)) return;
      
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
      const isRanged = a.effectId === "ranged";
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
      state.attackedThisTurn.add(action.attackerId);
      state.heartHP[target] = Math.max(0, state.heartHP[target] - dmg);
      
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
  console.log("Connected:", socket.id);
  socket.emit("deckList", Object.entries(DECKS).map(([id, d]) => ({ id, name: d.name, description: d.description })));
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
    console.log("Lobby " + code + " created by " + socket.data.username);
    emitLobbyState(lobbies[code]);
  });

  // Start campaign game against AI
  socket.on("startCampaign", async (data) => {
    const { bossId, deckId, username, userId, difficulty } = data;
    const boss = CAMPAIGN_BOSSES.find(b => b.id === bossId);
    if (!boss) return socket.emit("lobbyError", "Invalid boss.");

    // Use client-selected difficulty (1=easy, 2=medium, 3=hard), default to medium
    const aiLevel = difficulty || 2;
    console.log('Starting campaign with AI difficulty:', aiLevel);

    // Look up user's custom deck if they have one
    let customDeckCards = null;
    let deckMusic = 'default';
    let deckBackground = 'default';
    if (userId) {
      try {
        const user = await User.findById(userId);
        console.log('Looking up custom deck for user:', userId, 'deckId:', deckId);
        if (user) {
          console.log('User customDecks:', JSON.stringify(user.customDecks));
          const customDeck = user.customDecks.find(d => d.id === deckId);
          console.log('Found custom deck:', customDeck ? 'yes' : 'no');
          if (customDeck && customDeck.cards && customDeck.cards.length >= 25) {
            customDeckCards = customDeck.cards;
            deckMusic = customDeck.music || 'default';
            deckBackground = customDeck.background || 'default';
            console.log('Using custom deck with', customDeckCards.length, 'cards, music:', deckMusic, 'background:', deckBackground);
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
      guestDeck: boss.deckId,
      hostReady: true,
      guestReady: true,
      gameStarted: true,
      gameState: null,
      log: [],
      hostUsername: username || "Guest",
      guestUsername: boss.name,
      hostUserId: userId || null,
      guestUserId: null,
      isAIGame: true,
      aiLevel: aiLevel,
      bossId: bossId,
      ai: new GameAI(aiLevel)
    };
    
    socket.data.lobbyCode = code;
    socket.data.isHost = true;
    socket.data.username = username || "Guest";
    
    // Pass custom deck cards if available
    lobbies[code].gameState = createGameState(deckId || "medieval", boss.deckId, customDeckCards, null);
    socket.emit("role", "gold");
    socket.emit("campaignStart", { 
      code: code, 
      myDeck: deckId || "medieval", 
      enemyDeck: boss.deckId,
      bossName: boss.name,
      music: deckMusic,
      background: deckBackground
    });
    socket.emit("enemyInfo", { username: boss.name, isAI: true });
    logToLobby(lobbies[code], "=== CAMPAIGN: " + boss.name.toUpperCase() + " ===");
    logToLobby(lobbies[code], "GOLD's turn");
    emitLobbyState(lobbies[code]);
    emitGameState(lobbies[code]);
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
    console.log(socket.data.username + " joined lobby " + code);
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
    console.log("Rejoin attempt for lobby " + code + " as " + (data.isHost ? "host" : "guest"));
    
    if (!lobby) {
      console.log("Lobby " + code + " not found!");
      return socket.emit("lobbyError", "Game not found. Return to home.");
    }
    
    if (!lobby.gameStarted) {
      console.log("Lobby " + code + " game not started yet");
      return socket.emit("lobbyError", "Game not started yet.");
    }
    
    // Reconnect socket to lobby
    socket.data.lobbyCode = code;
    socket.data.isHost = data.isHost;
    
    if (data.isHost) {
      lobby.hostSocket = socket;
      socket.emit("role", "gold");
      console.log("Host rejoined lobby " + code);
      
      // If it's AI's turn and this is a campaign game, restart AI processing
      if (lobby.isAIGame && lobby.ai && lobby.gameState.state.activeSide === "silver" && !lobby.gameState.state.gameOver) {
        console.log("Restarting AI turn after host rejoin");
        setTimeout(() => processAITurn(lobby), 1000);
      }
    } else {
      lobby.guestSocket = socket;
      socket.emit("role", "silver");
      console.log("Guest rejoined lobby " + code);
    }
    
    emitGameState(lobby);
  });

  socket.on("leaveGame", () => {
    const code = socket.data.lobbyCode;
    const lobby = lobbies[code];
    if (!lobby) return;
    
    // Notify other player and close lobby
    if (socket.data.isHost) {
      if (lobby.guestSocket) lobby.guestSocket.emit("lobbyError", "Host left the game.");
    } else {
      if (lobby.hostSocket) lobby.hostSocket.emit("lobbyError", "Opponent left the game.");
    }
    delete lobbies[code];
    console.log("Lobby " + code + " closed by player");
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
    const role = socket.data.isHost ? "gold" : "silver";
    if (state.gameOver) return socket.emit("log", "Game over.");
    if (state.activeSide !== role) return socket.emit("log", "Not your turn.");

    if (payload.type === "endTurn") {
      processEndOfTurnEffects(lobby, role);
      
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
      const np = players[state.activeSide]; 
      
      // Calculate passive energy: +1 base, +1 more every 3 turns
      // Turn 1-3: +1, Turn 4-6: +2, Turn 7-9: +3, etc.
      let energyGain = 1 + Math.floor((state.turnNumber - 1) / 3);
      
      // Energy Well buff tile bonus
      if (playerHasBuff(state, state.activeSide, "energy_buff")) {
        energyGain += 1;
      }
      
      np.energy = Math.min(np.energy + energyGain, MAX_ENERGY);
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
      emitGameState(lobby);
      
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
      const card = p.hand[idx]; const cost = card.cost || 0;
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
        if (card.requiresTarget === "row") {
          if (row === undefined || row === null || row < 0 || row >= ROWS) return socket.emit("log", "Select a target row.");
          // Only fortify_row (Castle Walls) requires your own rows
          // row_damage (Void Collapse) can target any row
          if (card.effectId === "fortify_row" && !canDeployOnRow(state, row, role)) {
            return socket.emit("log", "Can only fortify your own rows.");
          }
        }
        
        p.energy -= cost; p.hand.splice(idx, 1); p.discard.push(card);
        processInstantSpell(lobby, role, card.effectId, row, targetUnitId);
        logToLobby(lobby, role.toUpperCase() + " cast " + card.name);
        return emitGameState(lobby);
      }

      if (spawn) {
        if (spawn !== role) return socket.emit("log", "Not your spawn.");
        if (state.spawn[spawn]) return socket.emit("log", "Spawn occupied.");
        p.energy -= cost; p.hand.splice(idx, 1); p.discard.push(card);
        const id = genId(); const hpB = getArmoryBonus(state, role);
        const maxHp = card.hp + hpB;
        const unitData = { id, owner: role, key: card.key, name: card.name, atk: card.atk, hp: maxHp, maxHp: maxHp, cost: card.cost, type: card.type || "monster", effect: card.effect, effectId: card.effectId, effectDesc: card.effectDesc, art: card.art };
        // Preserve stolen flag for Soul Collector cards
        if (card.stolen) unitData.stolen = true;
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
      
      if (!canDeploy) return socket.emit("log", "Can't deploy here.");
      p.energy -= cost; p.hand.splice(idx, 1); p.discard.push(card);
      const id = genId(); const hpB = getArmoryBonus(state, role);
      const maxHp = card.hp + hpB;
      const unitData = { id, owner: role, key: card.key, name: card.name, atk: card.atk, hp: maxHp, maxHp: maxHp, cost: card.cost, type: card.type || "monster", effect: card.effect, effectId: card.effectId, effectDesc: card.effectDesc, art: card.art };
      // Preserve stolen flag for Soul Collector cards
      if (card.stolen) unitData.stolen = true;
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
      recomputeOwners(state); // Update row ownership after placing unit
      logToLobby(lobby, role.toUpperCase() + " played " + card.name);
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
      recomputeOwners(state); // Update row ownership
      logToLobby(lobby, role.toUpperCase() + "'s " + u.name + " entered board");
      return emitGameState(lobby);
    }

    if (payload.type === "move") {
      const { unitId, toRow, toCol } = payload; const u = state.units[unitId];
      if (!u || u.owner !== role) return;
      
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
      const canDoubleMove = u.effectId === "double_move" || u.effectId === "stampede" || playerHasBuff(state, role, "move_buff");
      const maxMoves = canDoubleMove ? 2 : 1;
      
      if (moveCount >= maxMoves) return socket.emit("log", "No more moves for this unit.");
      if (toRow < 0 || toRow >= ROWS || toCol < 0 || toCol >= COLS || state.board[toRow][toCol]) return socket.emit("log", "Invalid.");
      
      // Squire knight_leap ability - can move to adjacent tile of any Knight
      let validMove = isAdjacent(from.r, from.c, toRow, toCol);
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
      
      if (!validMove) return socket.emit("log", "Must be adjacent (or next to a Knight for Squire).");
      
      // Check if trying to move into enemy home row
      const enemy = enemyOf(role);
      const isEnemyHomeRow = (enemy === "gold" && toRow <= 1) || (enemy === "silver" && toRow >= 5);
      if (isEnemyHomeRow && state.rowHP[toRow] > 0) {
        return socket.emit("log", "Can't move into enemy row until its HP is 0.");
      }
      
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", { type: "move", unitId, fromRow: from.r, fromCol: from.c, toRow, toCol });
      if (lobby.guestSocket) lobby.guestSocket.emit("animate", { type: "move", unitId, fromRow: from.r, fromCol: from.c, toRow, toCol });
      state.board[from.r][from.c] = null; state.board[toRow][toCol] = unitId;
      
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
      
      // UFO Scraper can attack friendly aliens to absorb stats
      const isAbsorbAttack = a.effectId === "absorb_ally" && t.owner === role;
      
      // Normal attacks can't target own units (unless UFO Scraper)
      if (t.owner === role && !isAbsorbAttack) return;
      
      // Check if target is untargetable (Burrower Beast on deploy turn)
      if (t.untargetable && !isAbsorbAttack) return socket.emit("log", t.name + " is untargetable this turn.");
      
      // Check if unit has already attacked (considering double attack buff)
      // Must check this BEFORE the attackedThisTurn set, since Rally Cry can be cast after first attack
      const attackCount = a.attackCountThisTurn || 0;
      const maxAttacks = a.canDoubleAttack ? 2 : 1;
      if (attackCount >= maxAttacks) return socket.emit("log", "Already attacked.");
      
      const ap = getUnitPos(state, attackerId), tp = getUnitPos(state, targetId);
      if (!ap || !tp) return socket.emit("log", "Position not found.");
      
      // Check attack range based on unit abilities
      let validAttack = false;
      
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
        // Cardinal attack up to 2 tiles
        validAttack = (rowDist <= 2 && colDist === 0) || (colDist <= 2 && rowDist === 0);
      }
      // Bone Revolver ranged_pierce - ranged that ignores shields
      else if (a.effectId === "ranged_pierce") {
        const rowDist = Math.abs(ap.r - tp.r);
        const colDist = Math.abs(ap.c - tp.c);
        // Cardinal attack up to 2 tiles
        validAttack = (rowDist <= 2 && colDist === 0) || (colDist <= 2 && rowDist === 0);
      }
      // Default: cardinal adjacent only
      else {
        validAttack = isCardinalAdjacent(ap.r, ap.c, tp.r, tp.c);
      }
      
      if (!validAttack) return socket.emit("log", "Target out of range.");
      
      // Handle UFO Scraper absorb attack
      if (isAbsorbAttack) {
        // UFO Scraper kills friendly and absorbs stats
        a.atk += t.atk;
        a.hp += t.hp;
        a.maxHp = (a.maxHp || 1) + (t.maxHp || t.hp);
        logToLobby(lobby, a.name + " absorbs " + t.name + "! Now " + a.atk + "/" + a.hp);
        state.board[tp.r][tp.c] = null;
        delete state.units[targetId];
        state.attackedThisTurn.add(attackerId);
        a.attackCountThisTurn = (a.attackCountThisTurn || 0) + 1;
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
      dmg = applyDamageReduction(state, targetId, dmg, attackerId);
      if (dmg !== dmgBeforeReduction) {
        combatLogToLobby(lobby, `Damage reduced: ${dmgBeforeReduction} → ${dmg} (Shield Bearer/armor)`, "combat-step");
      }
      
      const before = t.hp; 
      t.hp -= dmg;
      
      combatLogToLobby(lobby, `${t.name}: ${before} HP - ${dmg} damage = ${t.hp} HP`, "combat-result");
      
      // hp_buff gives virtual HP - unit survives at 0 HP if buff active
      const hpBuffBonus = getHpBuffBonus(state, t.owner);
      const effectiveHp = t.hp + hpBuffBonus;
      
      // Send damage animation
      if (lobby.hostSocket) lobby.hostSocket.emit("animate", { type: "damage", row: tp.r, col: tp.c });
      if (lobby.guestSocket) lobby.guestSocket.emit("animate", { type: "damage", row: tp.r, col: tp.c });
      
      // Adaptive Colossus - gains +1 max HP when surviving damage (for the target if it has this ability)
      if (t.effectId === "adapt_hp" && t.hp > 0 && dmg > 0) {
        t.maxHp = (t.maxHp || t.hp) + 1;
        logToLobby(lobby, t.name + " adapts! Max HP now " + t.maxHp);
      }
      
      // Track attack count
      a.attackCountThisTurn = attackCount + 1;
      if (a.attackCountThisTurn >= maxAttacks) {
        state.attackedThisTurn.add(attackerId);
      }
      
      logToLobby(lobby, a.name + " deals " + dmg + " to " + t.name + (a.canDoubleAttack && a.attackCountThisTurn < maxAttacks ? " (can attack again)" : ""));
      
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
        const secondDmg = applyDamageReduction(state, targetId, 1, attackerId);
        t.hp -= secondDmg;
        logToLobby(lobby, a.name + " bites again for " + secondDmg + "!");
      }
      
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
              const reducedSplash = applyDamageReduction(state, splashId, splashDmg, attackerId);
              splashTarget.hp -= reducedSplash;
              logToLobby(lobby, a.name + " cleaves " + splashTarget.name + " for " + reducedSplash);
              if (splashTarget.hp <= 0) {
                processOnDeathEffect(lobby, splashTarget, splashTarget.owner, { r: sp.r, c: sp.c });
                processAllyDeathTriggers(lobby, splashTarget.owner);
                state.board[sp.r][sp.c] = null; 
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
            if (splashTarget.hp <= 0) {
              processOnDeathEffect(lobby, splashTarget, splashTarget.owner, { r: sp.r, c: sp.c });
              processAllyDeathTriggers(lobby, splashTarget.owner);
              state.board[sp.r][sp.c] = null; 
              delete state.units[splashId];
              logToLobby(lobby, splashTarget.name + " destroyed by spores!");
            }
          }
        }
      }
      
      if (effectiveHp <= 0) {
        // Elder Vampire immortal - heals to full instead of dying (once per game)
        if (t.effectId === "immortal" && !t.immortalUsed) {
          t.hp = t.maxHp || 6;
          t.immortalUsed = true;
          logToLobby(lobby, t.name + " refuses to die! Heals to full HP!");
          combatLogToLobby(lobby, `☠️ ${t.name} would die but IMMORTAL triggers! Heals to full`, "combat-lifesteal");
        } else {
          combatLogToLobby(lobby, `💀 ${t.name} DESTROYED (${t.hp} HP)`, "combat-death");
          if (lobby.hostSocket) lobby.hostSocket.emit("animate", { type: "destroy", row: tp.r, col: tp.c });
          if (lobby.guestSocket) lobby.guestSocket.emit("animate", { type: "destroy", row: tp.r, col: tp.c });
          // Process on-death effect for dying unit
          processOnDeathEffect(lobby, t, t.owner, { r: tp.r, c: tp.c });
          processAllyDeathTriggers(lobby, t.owner, t, { r: tp.r, c: tp.c });
          // Process on-kill effect for attacker (pass killed unit position and unit for steal_card)
          processOnKillEffect(lobby, attackerId, role, { r: tp.r, c: tp.c }, t);
          processOnKillEffect(lobby, attackerId, role, { r: tp.r, c: tp.c }, t);
          // Only remove unit if spawn_drone didn't place a drone there
          if (!state.board[tp.r][tp.c]) {
            // Position is empty, unit was removed
          } else if (state.board[tp.r][tp.c] === targetId) {
            // Drone wasn't spawned, remove the dead unit
            state.board[tp.r][tp.c] = null;
          }
          delete state.units[targetId];
          logToLobby(lobby, t.name + " destroyed!");
          const overflow = Math.max(0, dmg - before);
          if (overflow > 0 && state.rowHP[tp.r] > 0) { state.rowHP[tp.r] = Math.max(0, state.rowHP[tp.r] - overflow); logToLobby(lobby, "Row takes " + overflow + " overflow"); }
          recomputeOwners(state); // Recompute after unit destroyed
        }
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
      const isRanged = a.effectId === "ranged";
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
      const isRanged = u.effectId === "ranged";
      const maxRange = isRanged ? 1 : 0;
      
      if (distance > maxRange) {
        return socket.emit("log", isRanged ? "Archer must be within 1 row of the heart." : "Must be in the heart's row to attack.");
      }
      
      let dmg = getEffectiveAtk(state, attackerId); 
      // Ghostly Stampede deals +2 to structures (including heart)
      if (u.effectId === "stampede") dmg += 2;
      state.attackedThisTurn.add(attackerId);
      state.heartHP[target] = Math.max(0, state.heartHP[target] - dmg);
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
      let dmg = getEffectiveAtk(state, attackerId, targetId); dmg = applyDamageReduction(state, targetId, dmg, attackerId);
      const before = t.hp; t.hp -= dmg; state.attackedThisTurn.add(attackerId);
      logToLobby(lobby, a.name + " (from spawn) deals " + dmg + " to " + t.name);
      if (t.hp <= 0) {
        if (lobby.hostSocket) lobby.hostSocket.emit("animate", { type: "destroy", row: tp.r, col: tp.c });
        if (lobby.guestSocket) lobby.guestSocket.emit("animate", { type: "destroy", row: tp.r, col: tp.c });
        processOnDeathEffect(lobby, t, t.owner, { r: tp.r, c: tp.c });
        processAllyDeathTriggers(lobby, t.owner);
        processOnKillEffect(lobby, attackerId, role, { r: tp.r, c: tp.c }, t);
        state.board[tp.r][tp.c] = null; delete state.units[targetId];
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
      console.log((wasHost ? "Host" : "Guest") + " disconnected from " + code + " - waiting for rejoin...");
      
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
          console.log("Lobby " + code + " closed - host didn't rejoin");
        } else if (!wasHost && !currentLobby.guestSocket) {
          // Guest didn't rejoin
          if (currentLobby.hostSocket) currentLobby.hostSocket.emit("lobbyError", "Opponent disconnected.");
          delete lobbies[code];
          console.log("Lobby " + code + " closed - guest didn't rejoin");
        }
      }, 5000);
      return;
    }
    
    // Game not started - handle normally
    if (socket.data.isHost) { 
      if (lobby.guestSocket) lobby.guestSocket.emit("lobbyError", "Host left."); 
      delete lobbies[code]; 
      console.log("Lobby " + code + " closed"); 
    } else { 
      lobby.guestSocket = null; 
      lobby.guestDeck = null; 
      lobby.guestReady = false; 
      emitLobbyState(lobby); 
    }
  });
});

server.listen(PORT, () => console.log("Server on http://localhost:" + PORT));