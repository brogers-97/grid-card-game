const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

// Redirect root to home page
app.get("/", (req, res) => {
  res.redirect("/home.html");
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
    cards: [
      { key: "peasant", name: "Peasant", atk: 1, hp: 2, cost: 1, type: "monster", effect: "passive", effectId: "diagonal_attack", effectDesc: "PASSIVE: Can attack diagonally.", art: "/images/Peasant.png" },
      { key: "peasant", name: "Peasant", atk: 1, hp: 2, cost: 1, type: "monster", effect: "passive", effectId: "diagonal_attack", effectDesc: "PASSIVE: Can attack diagonally.", art: "/images/Peasant.png" },
      { key: "squire", name: "Squire", atk: 2, hp: 2, cost: 1, type: "monster", effect: "passive", effectId: "knight_leap", effectDesc: "PASSIVE: Can move to any Knight.", art: "/images/Squire.png" },
      { key: "squire", name: "Squire", atk: 2, hp: 2, cost: 1, type: "monster", effect: "passive", effectId: "knight_leap", effectDesc: "PASSIVE: Can move to any Knight.", art: "/images/Squire.png" },
      { key: "archer", name: "Archer", atk: 3, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "ranged", effectDesc: "PASSIVE: Can attack 2 tiles away.", art: "/images/Archer.png" },
      { key: "archer", name: "Archer", atk: 3, hp: 2, cost: 2, type: "monster", effect: "passive", effectId: "ranged", effectDesc: "PASSIVE: Can attack 2 tiles away.", art: "/images/Archer.png" },
      { key: "manatarms", name: "Man-at-Arms", atk: 2, hp: 4, cost: 2, type: "monster", art: "/images/Man-at-Arms.png" },
      { key: "manatarms", name: "Man-at-Arms", atk: 2, hp: 4, cost: 2, type: "monster", art: "/images/Man-at-Arms.png" },
      { key: "shieldbearer", name: "Shield Bearer", atk: 1, hp: 5, cost: 2, type: "monster", effect: "passive", effectId: "shield_aura", effectDesc: "PASSIVE: Adjacent allies take -1 damage.", art: "/images/Shield Bearer.png" },
      { key: "warhound", name: "War Hound", atk: 3, hp: 3, cost: 2, type: "monster", effect: "passive", effectId: "double_move", effectDesc: "PASSIVE: Can move twice per turn.", art: "/images/War Hound.png" },
      { key: "battlefieldmedic", name: "Battlefield Medic", atk: 1, hp: 3, cost: 2, type: "monster", effect: "endOfTurn", effectId: "heal_adjacent", effectDesc: "END OF TURN: Heal adjacent allies 1 HP.", art: "/images/Battlefield Medic.png" },
      { key: "knight", name: "Knight", atk: 4, hp: 4, cost: 3, type: "monster", art: "/images/Knight.png" },
      { key: "knight", name: "Knight", atk: 4, hp: 4, cost: 3, type: "monster", art: "/images/Knight.png" },
      { key: "crusader", name: "Crusader", atk: 5, hp: 4, cost: 4, type: "monster", effect: "onKill", effectId: "heal_on_kill", effectDesc: "ON KILL: Heal self 2 HP.", art: "/images/Crusader.png" },
      { key: "royalguard", name: "Royal Guard", atk: 3, hp: 6, cost: 4, type: "monster", effect: "passive", effectId: "cleave", effectDesc: "PASSIVE: Attack splashes to adjacent enemies for half damage.", art: "/images/Royal Guard.png" },
      { key: "paladin", name: "Paladin", atk: 6, hp: 5, cost: 4, type: "monster", effect: "onKill", effectId: "energy_on_kill", effectDesc: "ON KILL: Gain 1 energy.", art: "/images/Paladin.png" },
      { key: "siegeram", name: "Battering Ram", atk: 2, hp: 6, cost: 3, type: "monster", effect: "passive", effectId: "siege", effectDesc: "PASSIVE: 2x damage to rows.", art: "/images/Battering Ram.png" },
      { key: "warbanner", name: "War Banner", atk: 0, hp: 4, cost: 2, type: "spell", effect: "passive", effectId: "attack_aura", effectDesc: "PASSIVE: Adjacent allies +1 ATK.", art: "/images/War Banner.png" },
      { key: "shrine", name: "Healing Shrine", atk: 0, hp: 5, cost: 3, type: "spell", effect: "startOfTurn", effectId: "shrine_heal", effectDesc: "START: Heal row allies 1 HP.", art: "/images/Healing Shrine.png" },
      { key: "armory", name: "Armory", atk: 0, hp: 4, cost: 3, type: "spell", effect: "passive", effectId: "armory_buff", effectDesc: "PASSIVE: Deployed units +1 HP.", art: "/images/Armory.png" },
      { key: "castlewalls", name: "Castle Walls", atk: 0, hp: 0, cost: 4, type: "spell", effect: "instant", effectId: "fortify_row", effectDesc: "INSTANT: This row +15 HP.", art: "/images/Castle Walls.png", requiresTarget: "row" },
      { key: "treasury", name: "King's Treasury", atk: 0, hp: 0, cost: 2, type: "spell", effect: "instant", effectId: "draw_two", effectDesc: "INSTANT: Draw 2 cards.", art: "/images/King's Treasury.png" },
      { key: "rally", name: "Rallying Cry", atk: 0, hp: 0, cost: 3, type: "spell", effect: "instant", effectId: "double_attack", effectDesc: "INSTANT: Target unit can attack twice.", art: "/images/Rallying Cry.png", requiresTarget: "unit" },
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
function createDeck(deckId) { const d = DECKS[deckId]; return d ? d.cards.map(c => ({ ...c, id: genId(), maxHp: c.hp })) : null; }
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

function createGameState(hostDeck, guestDeck) {
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
    moveCountThisTurn: {} // Track moves per unit for double_move
  };
  const players = { gold: {deck:shuffle(createDeck(hostDeck)),hand:[],discard:[],energy:START_ENERGY,maxEnergy:START_ENERGY,hasDrawn:false}, silver: {deck:shuffle(createDeck(guestDeck)),hand:[],discard:[],energy:START_ENERGY,maxEnergy:START_ENERGY,hasDrawn:false} };
  for (let i = 0; i < START_HAND_SIZE; i++) { if (players.gold.deck.length) players.gold.hand.push(players.gold.deck.pop()); if (players.silver.deck.length) players.silver.hand.push(players.silver.deck.pop()); }
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

function getEffectiveAtk(state, uid) {
  const u = state.units[uid]; if (!u) return 0; let atk = u.atk; const pos = getUnitPos(state, uid); if (!pos) return atk;
  // War Banner buff
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (dr === 0 && dc === 0) continue; const nr = pos.r + dr, nc = pos.c + dc; if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue; const aid = state.board[nr][nc]; if (aid && state.units[aid] && state.units[aid].owner === u.owner && state.units[aid].effectId === "attack_aura") atk += 1; }
  // War Shrine buff tile (atk_row_buff)
  const buffKey = `${pos.r}-${pos.c}`;
  if (state.buffTiles[buffKey] && state.buffTiles[buffKey].id === "atk_row_buff") {
    atk += 1;
  }
  return atk;
}

function applyDamageReduction(state, tid, dmg) {
  const t = state.units[tid]; if (!t) return dmg; const pos = getUnitPos(state, tid); if (!pos) return dmg;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (dr === 0 && dc === 0) continue; const nr = pos.r + dr, nc = pos.c + dc; if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue; const aid = state.board[nr][nc]; if (aid && state.units[aid] && state.units[aid].owner === t.owner && state.units[aid].effectId === "shield_aura") return Math.max(0, dmg - 1); }
  return dmg;
}

function getArmoryBonus(state, role) { for (const id in state.units) if (state.units[id].owner === role && state.units[id].effectId === "armory_buff") return 1; return 0; }

function logToLobby(lobby, msg) { lobby.log = lobby.log || []; lobby.log.push(msg); if (lobby.hostSocket) lobby.hostSocket.emit("log", msg); if (lobby.guestSocket) lobby.guestSocket.emit("log", msg); }

function drawCards(lobby, role, count) {
  const p = lobby.gameState.players[role];
  for (let i = 0; i < count; i++) { if (p.hand.length >= MAX_HAND_SIZE) break; if (p.deck.length === 0) { if (p.discard.length === 0) break; p.deck = shuffle([...p.discard]); p.discard = []; logToLobby(lobby, role.toUpperCase() + " reshuffles"); } if (p.deck.length > 0) p.hand.push(p.deck.pop()); }
}

function processOnKillEffect(lobby, aid, role) {
  const a = lobby.gameState.state.units[aid]; if (!a || a.effect !== "onKill") return;
  if (a.effectId === "heal_on_kill") { 
    const maxHp = a.maxHp || a.hp;
    a.hp = Math.min(a.hp + 2, maxHp); 
    logToLobby(lobby, a.name + " heals 2 HP"); 
  }
  if (a.effectId === "energy_on_kill") { lobby.gameState.players[role].energy = Math.min(lobby.gameState.players[role].energy + 1, MAX_ENERGY); logToLobby(lobby, role.toUpperCase() + " gains 1 energy"); }
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
      state.units[targetUnitId].canDoubleAttack = true;
      logToLobby(lobby, state.units[targetUnitId].name + " can attack twice!");
    }
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
  const base = { 
    board: state.board, 
    rowHP: state.rowHP, 
    rowOwner: state.rowOwner, 
    heartHP: state.heartHP, 
    units: state.units, 
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
  if (lobby.hostSocket) lobby.hostSocket.emit("state", { ...base, hand: players.gold.hand, deckCount: players.gold.deck.length, discardCount: players.gold.discard.length, energy: players.gold.energy, maxEnergy: players.gold.maxEnergy, canDraw: !players.gold.hasDrawn && players.gold.hand.length < MAX_HAND_SIZE });
  if (lobby.guestSocket) lobby.guestSocket.emit("state", { ...base, hand: players.silver.hand, deckCount: players.silver.deck.length, discardCount: players.silver.discard.length, energy: players.silver.energy, maxEnergy: players.silver.maxEnergy, canDraw: !players.silver.hasDrawn && players.silver.hand.length < MAX_HAND_SIZE });
}

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);
  socket.emit("deckList", Object.entries(DECKS).map(([id, d]) => ({ id, name: d.name, description: d.description })));

  socket.on("createLobby", (data) => {
    const code = generateLobbyCode();
    lobbies[code] = { code, hostSocket: socket, guestSocket: null, hostDeck: data.deckId || "medieval", guestDeck: null, hostReady: true, guestReady: false, gameStarted: false, gameState: null, log: [] };
    socket.data.lobbyCode = code; socket.data.isHost = true;
    console.log("Lobby " + code + " created");
    emitLobbyState(lobbies[code]);
  });

  socket.on("joinLobby", (data) => {
    const code = data.code?.toUpperCase(); const lobby = lobbies[code];
    if (!lobby) return socket.emit("lobbyError", "Lobby not found.");
    if (lobby.guestSocket) return socket.emit("lobbyError", "Lobby full.");
    if (lobby.gameStarted) return socket.emit("lobbyError", "Game in progress.");
    lobby.guestSocket = socket; lobby.guestDeck = data.deckId || "medieval"; lobby.guestReady = true;
    socket.data.lobbyCode = code; socket.data.isHost = false;
    console.log("Joined lobby " + code);
    emitLobbyState(lobby);
  });

  socket.on("selectDeck", (data) => {
    const lobby = lobbies[socket.data.lobbyCode]; if (!lobby || lobby.gameStarted) return;
    if (socket.data.isHost) lobby.hostDeck = data.deckId; else lobby.guestDeck = data.deckId;
    emitLobbyState(lobby);
  });

  socket.on("startGame", () => {
    const lobby = lobbies[socket.data.lobbyCode];
    if (!lobby || !socket.data.isHost || !lobby.guestSocket || !lobby.guestReady) return;
    lobby.gameStarted = true;
    lobby.gameState = createGameState(lobby.hostDeck, lobby.guestDeck);
    lobby.hostSocket.emit("role", "gold");
    lobby.guestSocket.emit("role", "silver");
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
      
      // Reset double attack buffs and attack counts for all units
      for (const uid in state.units) {
        state.units[uid].canDoubleAttack = false;
        state.units[uid].attackCountThisTurn = 0;
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
      if (role === "silver") state.turnNumber++;
      logToLobby(lobby, "--- " + state.activeSide.toUpperCase() + "'s turn (+" + energyGain + " energy) ---");
      return emitGameState(lobby);
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
        if (card.requiresTarget === "row") {
          if (row === undefined || row === null || row < 0 || row >= ROWS) return socket.emit("log", "Select a target row.");
          // Check if player can target this row (owns it or it's their home row)
          if (!canDeployOnRow(state, row, role)) return socket.emit("log", "Can only target your own rows.");
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
        state.units[id] = { id, owner: role, key: card.key, name: card.name, atk: card.atk, hp: maxHp, maxHp: maxHp, type: card.type || "monster", effect: card.effect, effectId: card.effectId, effectDesc: card.effectDesc, art: card.art };
        state.spawn[spawn] = id;
        logToLobby(lobby, role.toUpperCase() + " deployed " + card.name + " to spawn");
        return emitGameState(lobby);
      }

      if (row == null || col == null || row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
      if (state.board[row][col]) return socket.emit("log", "Tile occupied.");
      recomputeOwners(state);
      if (!canDeployOnRow(state, row, role)) return socket.emit("log", "Can't deploy here.");
      p.energy -= cost; p.hand.splice(idx, 1); p.discard.push(card);
      const id = genId(); const hpB = getArmoryBonus(state, role);
      const maxHp = card.hp + hpB;
      state.units[id] = { id, owner: role, key: card.key, name: card.name, atk: card.atk, hp: maxHp, maxHp: maxHp, type: card.type || "monster", effect: card.effect, effectId: card.effectId, effectDesc: card.effectDesc, art: card.art };
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
      
      // Check move limits based on unit abilities
      const moveCount = state.moveCountThisTurn[unitId] || 0;
      const canDoubleMove = u.effectId === "double_move" || playerHasBuff(state, role, "move_buff");
      const maxMoves = canDoubleMove ? 2 : 1;
      
      if (moveCount >= maxMoves) return socket.emit("log", "No more moves for this unit.");
      if (toRow < 0 || toRow >= ROWS || toCol < 0 || toCol >= COLS || state.board[toRow][toCol]) return socket.emit("log", "Invalid.");
      
      const from = getUnitPos(state, unitId); 
      if (!from) return socket.emit("log", "Unit not found.");
      
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
      if (!a || !t || a.owner !== role || t.owner === role) return;
      if (state.attackedThisTurn.has(attackerId)) return socket.emit("log", "Already attacked.");
      const ap = getUnitPos(state, attackerId), tp = getUnitPos(state, targetId);
      if (!ap || !tp) return socket.emit("log", "Position not found.");
      
      // Check attack range based on unit abilities
      let validAttack = false;
      
      // Peasant diagonal_attack - can attack diagonally
      if (a.effectId === "diagonal_attack") {
        validAttack = isAdjacent(ap.r, ap.c, tp.r, tp.c);
      }
      // Archer ranged - can attack 2 tiles away (cardinal only)
      else if (a.effectId === "ranged") {
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
      
      // Check if unit has already attacked (considering double attack buff)
      const attackCount = a.attackCountThisTurn || 0;
      const maxAttacks = a.canDoubleAttack ? 2 : 1;
      if (attackCount >= maxAttacks) return socket.emit("log", "Already attacked.");
      
      let dmg = getEffectiveAtk(state, attackerId); dmg = applyDamageReduction(state, targetId, dmg);
      const before = t.hp; t.hp -= dmg;
      
      // Track attack count
      a.attackCountThisTurn = attackCount + 1;
      if (a.attackCountThisTurn >= maxAttacks) {
        state.attackedThisTurn.add(attackerId);
      }
      
      logToLobby(lobby, a.name + " deals " + dmg + " to " + t.name + (a.canDoubleAttack && a.attackCountThisTurn < maxAttacks ? " (can attack again)" : ""));
      
      // Royal Guard cleave - splash damage to adjacent enemies
      if (a.effectId === "cleave") {
        const splashDmg = Math.floor(dmg / 2);
        if (splashDmg > 0) {
          // Hit enemies to left and right of target
          const splashPositions = [
            { r: tp.r, c: tp.c - 1 },
            { r: tp.r, c: tp.c + 1 }
          ];
          for (const sp of splashPositions) {
            if (sp.c < 0 || sp.c >= COLS) continue;
            const splashId = state.board[sp.r][sp.c];
            if (splashId && state.units[splashId] && state.units[splashId].owner !== role) {
              const splashTarget = state.units[splashId];
              const reducedSplash = applyDamageReduction(state, splashId, splashDmg);
              splashTarget.hp -= reducedSplash;
              logToLobby(lobby, a.name + " cleaves " + splashTarget.name + " for " + reducedSplash);
              if (splashTarget.hp <= 0) {
                state.board[sp.r][sp.c] = null; 
                delete state.units[splashId];
                logToLobby(lobby, splashTarget.name + " destroyed by cleave!");
              }
            }
          }
        }
      }
      
      if (t.hp <= 0) {
        if (lobby.hostSocket) lobby.hostSocket.emit("animate", { type: "destroy", row: tp.r, col: tp.c });
        if (lobby.guestSocket) lobby.guestSocket.emit("animate", { type: "destroy", row: tp.r, col: tp.c });
        processOnKillEffect(lobby, attackerId, role);
        state.board[tp.r][tp.c] = null; delete state.units[targetId];
        logToLobby(lobby, t.name + " destroyed!");
        const overflow = Math.max(0, dmg - before);
        if (overflow > 0 && state.rowHP[tp.r] > 0) { state.rowHP[tp.r] = Math.max(0, state.rowHP[tp.r] - overflow); logToLobby(lobby, "Row takes " + overflow + " overflow"); }
        recomputeOwners(state); // Recompute after unit destroyed
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
      // Check cardinal adjacency to any cell in the target row
      let adj = false; for (let c = 0; c < COLS; c++) if (isCardinalAdjacent(ap.r, ap.c, row, c)) { adj = true; break; }
      if (!adj) return socket.emit("log", "Not adjacent (no diagonal).");
      let dmg = getEffectiveAtk(state, attackerId); if (a.effectId === "siege") dmg *= 2;
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
      
      const dmg = getEffectiveAtk(state, attackerId); state.attackedThisTurn.add(attackerId);
      state.heartHP[target] = Math.max(0, state.heartHP[target] - dmg);
      logToLobby(lobby, role.toUpperCase() + " hits " + target.toUpperCase() + " HEART for " + dmg + "!");
      if (state.heartHP[target] <= 0) { state.gameOver = true; logToLobby(lobby, "=== " + target.toUpperCase() + " DESTROYED! " + role.toUpperCase() + " WINS! ==="); }
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
      let dmg = getEffectiveAtk(state, attackerId); dmg = applyDamageReduction(state, targetId, dmg);
      const before = t.hp; t.hp -= dmg; state.attackedThisTurn.add(attackerId);
      logToLobby(lobby, a.name + " (from spawn) deals " + dmg + " to " + t.name);
      if (t.hp <= 0) {
        if (lobby.hostSocket) lobby.hostSocket.emit("animate", { type: "destroy", row: tp.r, col: tp.c });
        if (lobby.guestSocket) lobby.guestSocket.emit("animate", { type: "destroy", row: tp.r, col: tp.c });
        processOnKillEffect(lobby, attackerId, role);
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
