const socket = io();
const boardEl = document.getElementById("board");
const logEl = document.getElementById("log");

const endTurnBtn = document.getElementById("endTurnBtn");
const turnLabelEl = document.getElementById("turnLabel");
const energyEl = document.getElementById("energyLabel");

const handEl = document.getElementById("hand");
const deckCountEl = document.getElementById("deckCount");
const discardCountEl = document.getElementById("discardCount");
const drawBtn = document.getElementById("drawBtn");

const spawnEnemyEl = document.getElementById("spawnEnemy");
const spawnYouEl = document.getElementById("spawnYou");
const spawnEnemyUnitEl = document.getElementById("spawnEnemyUnit");
const spawnYouUnitEl = document.getElementById("spawnYouUnit");
const tooltipEl = document.getElementById("unitTooltip");
const discardModal = document.getElementById("discardModal");
const discardCardsEl = document.getElementById("discardCards");
const animationLayer = document.getElementById("cardAnimationLayer");
const menuBtn = document.getElementById("menuBtn");
const gameMenu = document.getElementById("gameMenu");

// Audio elements
const bgMusic = document.getElementById("bgMusic");
const muteBtn = document.getElementById("muteBtn");
const volumeSlider = document.getElementById("volumeSlider");

let isMuted = false;
let myDeckId = null;
let enemyDeckId = null;

// Audio setup
function setupAudio(deckId) {
  if (!bgMusic || !deckId) return;
  
  const audioSrc = `/audio/${deckId}-theme.mp3`;
  
  // Only change source if different
  if (bgMusic.src !== window.location.origin + audioSrc) {
    bgMusic.src = audioSrc;
    bgMusic.volume = (volumeSlider?.value || 30) / 100;
    
    // Try to play (may be blocked by browser autoplay policy)
    bgMusic.play().catch(e => {
      console.log("Autoplay blocked - click anywhere to start music");
      // Add one-time click listener to start music
      document.addEventListener('click', startMusicOnInteraction, { once: true });
    });
  }
}

function startMusicOnInteraction() {
  if (bgMusic && myDeckId && !isMuted) {
    bgMusic.play().catch(e => console.log("Could not play audio"));
  }
}

// Mute button handler
if (muteBtn) {
  muteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    if (bgMusic) {
      bgMusic.muted = isMuted;
    }
    muteBtn.textContent = isMuted ? '🔇' : '🔊';
    muteBtn.classList.toggle('muted', isMuted);
  });
}

// Volume slider handler
if (volumeSlider) {
  volumeSlider.addEventListener('input', (e) => {
    if (bgMusic) {
      bgMusic.volume = e.target.value / 100;
    }
  });
}

// Set background images based on deck selections
function setBackgroundImages(playerDeckId, enemyDeckId) {
  if (!boardEl) return;
  
  const playerBg = playerDeckId ? `/images/${playerDeckId}-bg.png` : 'none';
  const enemyBg = enemyDeckId ? `/images/${enemyDeckId}-bg.png` : 'none';
  
  boardEl.style.setProperty('--player-bg', `url('${playerBg}')`);
  boardEl.style.setProperty('--enemy-bg', `url('${enemyBg}')`);
}

// Parse URL params to rejoin lobby
const urlParams = new URLSearchParams(window.location.search);
const lobbyCode = urlParams.get('lobby');
const isHost = urlParams.get('host') === '1';
myDeckId = urlParams.get('myDeck');
enemyDeckId = urlParams.get('enemyDeck');

// Initialize audio and backgrounds when page loads
if (myDeckId) {
  setupAudio(myDeckId);
  setBackgroundImages(myDeckId, enemyDeckId);
}

// Rejoin lobby when connected
socket.on('connect', () => {
  if (lobbyCode) {
    socket.emit('rejoinGame', { code: lobbyCode, isHost: isHost });
  }
});

// Enemy heart click handler for attacking
const enemyHeartContainer = document.getElementById("enemyRow");
if (enemyHeartContainer) {
  enemyHeartContainer.addEventListener("click", () => {
    if (!selectedUnitId) return;
    if (!isMyTurn()) return;
    
    const enemyHeartEl = document.getElementById("enemyHeartHP");
    if (!enemyHeartEl?.parentElement?.classList.contains("heart-attackable")) return;
    
    const enemy = enemyOf(myRole);
    sendAction({ type: "attackHeart", attackerId: selectedUnitId, target: enemy });
    selectedUnitId = null;
    clearHighlights();
  });
}

// Track previous row HP for damage effects
let prevRowHP = [15, 15, 0, 0, 0, 15, 15];
let prevHeartHP = { gold: 30, silver: 30 };

// Store card element positions for animation
let cardElements = {};

// ===== TOOLTIP FUNCTIONS =====
function showTooltip(unitId, x, y, buff) {
  const u = S.units[unitId];
  if (!u || !tooltipEl) return;
  
  const isEnemy = u.owner !== myRole && myRole !== "spectator";
  const typeClass = u.type === "spell" ? "spell" : (isEnemy ? "enemy" : "");
  
  // Calculate buffs
  const atkBuff = getAtkBuff(unitId);
  const effectiveAtk = u.atk + atkBuff;
  
  // Art section
  const icon = CARD_ICONS[u.key] || '⚔️';
  const hasArt = u.art;
  const artStyle = hasArt ? `background-image: url('${u.art}')` : '';
  const artIconHtml = hasArt ? '' : `<div class="tooltip-art-icon">${icon}</div>`;
  
  const effectHtml = u.effectDesc ? `
    <div class="tooltip-effect">
      <div class="tooltip-effect-label">✨ Effect</div>
      <div class="tooltip-effect-desc">${u.effectDesc}</div>
    </div>
  ` : '';
  
  // Buff tile info if present
  const buffHtml = buff ? `
    <div class="tooltip-buff">
      <div class="tooltip-buff-label">${buff.icon} ${buff.name}</div>
      <div class="tooltip-buff-desc">${buff.desc}</div>
    </div>
  ` : '';
  
  tooltipEl.innerHTML = `
    <div class="tooltip-card ${typeClass}">
      <div class="tooltip-art" style="${artStyle}">${artIconHtml}</div>
      <div class="tooltip-content">
        <div class="tooltip-header">
          <span class="tooltip-name">${u.name}</span>
          <span class="tooltip-type ${u.type || 'monster'}">${u.type || 'Monster'}</span>
        </div>
        <div class="tooltip-owner ${u.owner}">${u.owner.toUpperCase()}'s Unit</div>
        <div class="tooltip-stats">
          <div class="tooltip-stat">
            <div class="tooltip-stat-value atk">${effectiveAtk}</div>
            <div class="tooltip-stat-label">⚔ Attack${atkBuff > 0 ? ` (+${atkBuff})` : ''}</div>
          </div>
          <div class="tooltip-stat">
            <div class="tooltip-stat-value hp">${u.hp}</div>
            <div class="tooltip-stat-label">♥ Health</div>
          </div>
        </div>
        ${effectHtml}
        ${buffHtml}
      </div>
    </div>
  `;
  
  positionTooltip(x, y);
  tooltipEl.classList.add("visible");
}

// Show tooltip for cards in hand
function showCardTooltip(card, x, y) {
  if (!card || !tooltipEl) return;
  
  const typeClass = card.type === "spell" ? "spell" : "";
  const isInstant = card.effect === "instant";
  
  // Art section
  const icon = CARD_ICONS[card.key] || '⚔️';
  const hasArt = card.art;
  const artStyle = hasArt ? `background-image: url('${card.art}')` : '';
  const artIconHtml = hasArt ? '' : `<div class="tooltip-art-icon">${icon}</div>`;
  
  const effectHtml = card.effectDesc ? `
    <div class="tooltip-effect">
      <div class="tooltip-effect-label">✨ Effect</div>
      <div class="tooltip-effect-desc">${card.effectDesc}</div>
    </div>
  ` : '';
  
  const statsHtml = !isInstant ? `
    <div class="tooltip-stats">
      <div class="tooltip-stat">
        <div class="tooltip-stat-value atk">${card.atk}</div>
        <div class="tooltip-stat-label">⚔ Attack</div>
      </div>
      <div class="tooltip-stat">
        <div class="tooltip-stat-value hp">${card.hp}</div>
        <div class="tooltip-stat-label">♥ Health</div>
      </div>
    </div>
  ` : '<div class="tooltip-instant-badge">⚡ INSTANT SPELL</div>';
  
  tooltipEl.innerHTML = `
    <div class="tooltip-card ${typeClass}">
      <div class="tooltip-art ${card.type === 'spell' ? 'spell' : ''}" style="${artStyle}">${artIconHtml}</div>
      <div class="tooltip-content">
        <div class="tooltip-header">
          <span class="tooltip-name">${card.name}</span>
          <span class="tooltip-type ${card.type || 'monster'}">${card.type || 'Monster'}</span>
        </div>
        <div class="tooltip-cost">
          <span class="tooltip-cost-icon">💎</span>
          <span class="tooltip-cost-value">${card.cost}</span>
          <span class="tooltip-cost-label">Energy Cost</span>
        </div>
        ${statsHtml}
        ${effectHtml}
      </div>
    </div>
  `;
  
  positionTooltip(x, y);
  tooltipEl.classList.add("visible");
}

function positionTooltip(x, y) {
  const padding = 15;
  let left = x + padding;
  let top = y + padding;
  
  // Keep tooltip on screen
  if (left + 220 > window.innerWidth) left = x - 220 - padding;
  if (top + 250 > window.innerHeight) top = y - 250 - padding;
  if (left < 0) left = padding;
  if (top < 0) top = padding;
  
  tooltipEl.style.left = left + "px";
  tooltipEl.style.top = top + "px";
}

function hideTooltip() {
  if (tooltipEl) tooltipEl.classList.remove("visible");
}

// Buff tile tooltip functions
const buffTooltipEl = document.getElementById("buffTooltip");

function showBuffTooltip(buff, x, y) {
  if (!buffTooltipEl || !buff) return;
  
  buffTooltipEl.innerHTML = `
    <div class="buff-tooltip-name">${buff.icon} ${buff.name}</div>
    <div class="buff-tooltip-desc">${buff.desc}</div>
  `;
  
  positionBuffTooltip(x, y);
  buffTooltipEl.classList.add("visible");
}

function positionBuffTooltip(x, y) {
  if (!buffTooltipEl) return;
  const padding = 15;
  let left = x + padding;
  let top = y + padding;
  
  if (left + 200 > window.innerWidth) left = x - 200 - padding;
  if (top + 100 > window.innerHeight) top = y - 100 - padding;
  if (left < 0) left = padding;
  if (top < 0) top = padding;
  
  buffTooltipEl.style.left = left + "px";
  buffTooltipEl.style.top = top + "px";
}

function hideBuffTooltip() {
  if (buffTooltipEl) buffTooltipEl.classList.remove("visible");
}

function setupCellTooltip(cellEl, unitId) {
  cellEl.addEventListener("mouseenter", (e) => {
    if (unitId && S.units[unitId]) {
      showTooltip(unitId, e.clientX, e.clientY);
    }
  });
  
  cellEl.addEventListener("mousemove", (e) => {
    if (tooltipEl.classList.contains("visible")) {
      const padding = 15;
      let left = e.clientX + padding;
      let top = e.clientY + padding;
      if (left + 220 > window.innerWidth) left = e.clientX - 220 - padding;
      if (top + 200 > window.innerHeight) top = e.clientY - 200 - padding;
      tooltipEl.style.left = left + "px";
      tooltipEl.style.top = top + "px";
    }
  });
  
  cellEl.addEventListener("mouseleave", hideTooltip);
}


function log(msg, type = "system") {
  if (!logEl) return console.log(msg);
  
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  
  // Apply color coding to specific words
  let html = msg
    .replace(/\bGOLD\b/g, '<span class="log-gold">GOLD</span>')
    .replace(/\bSILVER\b/g, '<span class="log-silver">SILVER</span>')
    .replace(/deals (\d+)/g, 'deals <span class="log-damage">$1</span>')
    .replace(/\+(\d+) (HP|energy)/g, '<span class="log-heal">+$1</span> <span class="log-energy">$2</span>')
    .replace(/-(\d+) (HP|damage)/g, '<span class="log-damage">-$1</span> $2')
    .replace(/\((\d+)\/(\d+)\)/g, '(<span class="log-damage">$1</span>/<span class="log-heal">$2</span>)')
    .replace(/Row ([A-E])/g, 'Row <span class="log-row">$1</span>');
  
  entry.innerHTML = html;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
}

function parseLogType(msg) {
  if (msg.includes("Turn ended") || msg.includes("'s turn")) return "turn";
  if (msg.includes("GAME OVER") || msg.includes("DESTROYED")) return "game-over";
  if (msg.includes("deals") || msg.includes("Attack") || msg.includes("destroyed")) return "combat";
  if (msg.includes("heals") || msg.includes("grants") || msg.includes("Shrine") || msg.includes("Spring")) return "effect";
  if (msg.includes("GOLD")) return "gold-action";
  if (msg.includes("SILVER")) return "silver-action";
  return "system";
}

const ROWS = 7;
const COLS = 6;

let myRole = "spectator";
let activeSide = "silver";
let viewFlipped = false;

let selectedUnitId = null;
let selectedSpawnUnit = null; // Track if we selected our spawn unit

let myHand = [];
let selectedCardId = null;
let deployCardId = null;

let myEnergy = 0;
let myMaxEnergy = 0;
let myDeckCount = 0;
let myDiscardCount = 0;
let canDraw = false;

let S = {
  rowHP: [15, 15, 0, 0, 0, 15, 15],
  rowOwner: [null, null, null, null, null, null, null],
  heartHP: { gold: 30, silver: 30 },
  board: Array.from({ length: 7 }, () => Array(6).fill(null)),
  units: {},
  gameOver: false,
  spawn: { gold: null, silver: null },
  movedThisTurn: [],
  attackedThisTurn: [],
  firstTurn: true,
  buffTiles: {},
  moveCountThisTurn: {}
};

function enemyOf(owner) {
  return owner === "silver" ? "gold" : "silver";
}

function clearHighlights(){
  document.querySelectorAll(".cell.deploy-valid").forEach(c => c.classList.remove("deploy-valid"));
  document.querySelectorAll(".cell.move-valid").forEach(c => c.classList.remove("move-valid"));
  document.querySelectorAll(".cell.attack-valid").forEach(c => c.classList.remove("attack-valid"));
  document.querySelectorAll(".cell.row-attack-valid").forEach(c => c.classList.remove("row-attack-valid"));
  document.querySelectorAll(".attack-icon").forEach(icon => icon.remove());
  document.querySelectorAll(".heart-attackable").forEach(h => h.classList.remove("heart-attackable"));
  if (spawnEnemyEl) spawnEnemyEl.classList.remove("deploy-valid", "move-valid", "selected");
  if (spawnYouEl) spawnYouEl.classList.remove("deploy-valid", "move-valid", "selected");
}

function highlightDeployTiles(){
  clearHighlights();
  if (!deployCardId) return;

  const card = myHand.find(c => c.id === deployCardId);
  if (!card) return;

  // Helper to check if player can deploy on a row (matches server logic)
  // Players can ONLY deploy on their own home rows
  function canDeployOnRow(row) {
    if (myRole === "gold") {
      return row <= 1; // Gold can only deploy on rows 0 and 1 (A and B)
    }
    if (myRole === "silver") {
      return row >= 5; // Silver can only deploy on rows 5 and 6 (F and G)
    }
    return false;
  }

  // Handle targeted instant spells
  if (card.effect === "instant" && card.requiresTarget === "unit") {
    // Rallying Cry - highlight friendly units
    for (let vr = 0; vr < ROWS; vr++) {
      const sr = toServerRow(vr);
      for (let c = 0; c < COLS; c++) {
        const unitId = S.board[sr][c];
        if (unitId && S.units[unitId] && S.units[unitId].owner === myRole) {
          const el = document.getElementById(cellId(vr, c));
          if (el) el.classList.add("deploy-valid");
        }
      }
    }
    return;
  }

  if (card.effect === "instant" && card.requiresTarget === "row") {
    // Castle Walls - highlight your home rows only
    for (let vr = 0; vr < ROWS; vr++) {
      const sr = toServerRow(vr);
      if (canDeployOnRow(sr)) {
        // Highlight any cell in the row as valid target
        for (let c = 0; c < COLS; c++) {
          const el = document.getElementById(cellId(vr, c));
          if (el) el.classList.add("deploy-valid");
        }
      }
    }
    return;
  }

  // Non-targeted instant spells play immediately (handled elsewhere)
  if (card.effect === "instant") {
    return;
  }

  // Normal board deploy highlights for unit cards - only home rows
  for (let vr = 0; vr < ROWS; vr++) {
    const sr = toServerRow(vr);
    for (let c = 0; c < COLS; c++) {
      if (S.board[sr][c]) continue;

      if (canDeployOnRow(sr)) {
        const el = document.getElementById(cellId(vr, c));
        if (el) el.classList.add("deploy-valid");
      }
    }
  }

  // Spawn deploy highlight - only YOUR spawn, and only if empty
  if (myRole === "gold") {
    if (!S.spawn.gold && spawnYouEl) {
      spawnYouEl.classList.add("deploy-valid");
    }
  } else if (myRole === "silver") {
    if (!S.spawn.silver && spawnYouEl) {
      spawnYouEl.classList.add("deploy-valid");
    }
  }
}

// Highlight valid move tiles for spawn unit
function highlightSpawnMoveTiles() {
  clearHighlights();
  if (!selectedSpawnUnit) return;
  
  // Mark spawn as selected
  if (spawnYouEl) spawnYouEl.classList.add("selected");
  
  // Spawn unit can move to any empty cell in home row (back row)
  // Gold's back row is 0, Silver's back row is 4
  const backRow = myRole === "gold" ? 0 : 6;
  const vr = toServerRow(backRow) === backRow ? (viewFlipped ? ROWS - 1 - backRow : backRow) : (viewFlipped ? ROWS - 1 - backRow : backRow);
  
  // Actually, let's just allow the entire home rows for flexibility
  const homeRows = myRole === "gold" ? [0, 1] : [5, 6];
  
  for (const sr of homeRows) {
    for (let c = 0; c < COLS; c++) {
      if (S.board[sr][c]) continue; // Skip occupied
      
      const viewRow = viewFlipped ? (ROWS - 1 - sr) : sr;
      const el = document.getElementById(cellId(viewRow, c));
      if (el) el.classList.add("move-valid");
    }
  }
}

// Check if two positions are cardinally adjacent (no diagonal)
function isCardinalAdjacent(r1, c1, r2, c2) {
  return (Math.abs(r1 - r2) === 1 && c1 === c2) || (Math.abs(c1 - c2) === 1 && r1 === r2);
}

// Highlight valid moves and attacks for a selected unit on the board
function highlightUnitMoves(unitId) {
  clearHighlights();
  if (!unitId) return;
  
  const u = S.units[unitId];
  if (!u || u.owner !== myRole) return;
  
  const pos = findUnitPos(unitId);
  if (!pos) return;
  
  const enemy = enemyOf(myRole);
  const moveCount = S.moveCountThisTurn[unitId] || 0;
  const canDoubleMove = u.effectId === "double_move" || hasBuffTile("move_buff");
  const maxMoves = canDoubleMove ? 2 : 1;
  const canStillMove = moveCount < maxMoves;
  const hasAttacked = S.attackedThisTurn.includes(unitId);
  const isFirstTurn = S.firstTurn;
  
  // Unit ability checks
  const canDiagonalAttack = u.effectId === "diagonal_attack";
  const isRanged = u.effectId === "ranged";
  const canKnightLeap = u.effectId === "knight_leap";
  
  // Helper to check if a row is an enemy home row with HP remaining
  function isBlockedEnemyRow(row) {
    if (enemy === "gold" && row <= 1 && S.rowHP[row] > 0) return true;
    if (enemy === "silver" && row >= 5 && S.rowHP[row] > 0) return true;
    return false;
  }
  
  // Check all adjacent cells (diagonal for movement)
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      
      const nr = pos.r + dr;
      const nc = pos.c + dc;
      
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      
      const viewRow = viewFlipped ? (ROWS - 1 - nr) : nr;
      const el = document.getElementById(cellId(viewRow, nc));
      if (!el) continue;
      
      const targetId = S.board[nr][nc];
      const isCardinal = isCardinalAdjacent(pos.r, pos.c, nr, nc);
      
      if (targetId) {
        // There's a unit here - can we attack it?
        const target = S.units[targetId];
        // Peasant can attack diagonally, others need cardinal
        const canAttackHere = canDiagonalAttack ? true : isCardinal;
        if (target && target.owner === enemy && !hasAttacked && canAttackHere) {
          el.classList.add("attack-valid");
          const icon = document.createElement("div");
          icon.className = "attack-icon";
          icon.innerHTML = "⚔️";
          el.appendChild(icon);
        }
      } else {
        // Empty cell
        // Check if this is an enemy home row with HP (can attack the row) - cardinal only
        const isEnemyHomeRow = (enemy === "gold" && nr <= 1) || (enemy === "silver" && nr >= 5);
        
        if (isEnemyHomeRow && S.rowHP[nr] > 0 && !hasAttacked && isCardinal) {
          el.classList.add("row-attack-valid");
          const icon = document.createElement("div");
          icon.className = "attack-icon row-attack";
          icon.innerHTML = "🏰";
          el.appendChild(icon);
        } else if (!isBlockedEnemyRow(nr) && canStillMove) {
          // Can move to neutral rows, own rows, or enemy rows with 0 HP
          el.classList.add("move-valid");
        }
      }
    }
  }
  
  // Archer ranged attack - can attack 2 tiles away (cardinal only)
  if (isRanged && !hasAttacked) {
    const rangedOffsets = [
      { dr: -2, dc: 0 }, { dr: 2, dc: 0 }, { dr: 0, dc: -2 }, { dr: 0, dc: 2 }
    ];
    for (const offset of rangedOffsets) {
      const nr = pos.r + offset.dr;
      const nc = pos.c + offset.dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      
      const targetId = S.board[nr][nc];
      if (targetId) {
        const target = S.units[targetId];
        if (target && target.owner === enemy) {
          const viewRow = viewFlipped ? (ROWS - 1 - nr) : nr;
          const el = document.getElementById(cellId(viewRow, nc));
          if (el && !el.classList.contains("attack-valid")) {
            el.classList.add("attack-valid");
            const icon = document.createElement("div");
            icon.className = "attack-icon";
            icon.innerHTML = "🏹";
            el.appendChild(icon);
          }
        }
      }
    }
  }
  
  // Squire knight leap - can move to adjacent tile of any Knight
  if (canKnightLeap && canStillMove) {
    for (const id in S.units) {
      const other = S.units[id];
      if (other.owner === myRole && other.key === "knight") {
        const kpos = findUnitPos(id);
        if (!kpos) continue;
        
        // Check all tiles adjacent to this knight
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = kpos.r + dr;
            const nc = kpos.c + dc;
            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
            if (S.board[nr][nc]) continue; // Skip occupied
            
            // Can't move into enemy home row with HP remaining
            if (isBlockedEnemyRow(nr)) continue;
            
            const viewRow = viewFlipped ? (ROWS - 1 - nr) : nr;
            const el = document.getElementById(cellId(viewRow, nc));
            if (el && !el.classList.contains("move-valid")) {
              el.classList.add("move-valid");
            }
          }
        }
      }
    }
  }
  
  // Check if can attack enemy heart
  // Normal units: must be in the heart's row (row 0 for gold heart, row 6 for silver)
  // Archers: can attack from 1 row away (so rows 0-1 for gold heart, rows 5-6 for silver)
  const enemyHeartRow = enemy === "gold" ? 0 : 6;
  const distanceToHeart = Math.abs(pos.r - enemyHeartRow);
  const maxHeartRange = isRanged ? 1 : 0;
  
  if (distanceToHeart <= maxHeartRange && !hasAttacked) {
    // Highlight enemy heart as attackable
    const enemyHeartEl = document.getElementById("enemyHeartHP");
    if (enemyHeartEl) {
      enemyHeartEl.parentElement.classList.add("heart-attackable");
    }
  }
}

// Check if current player has a unit on a specific buff tile type
function hasBuffTile(buffId) {
  for (const key in S.buffTiles) {
    const buff = S.buffTiles[key];
    if (buff.id !== buffId) continue;
    const [r, c] = key.split("-").map(Number);
    const unitId = S.board[r][c];
    if (unitId && S.units[unitId] && S.units[unitId].owner === myRole) {
      return true;
    }
  }
  return false;
}


function isMyTurn() {
  return (myRole === "gold" || myRole === "silver") && myRole === activeSide;
}

function isAdjacent(r1, c1, r2, c2) {
  const dr = Math.abs(r1 - r2);
  const dc = Math.abs(c1 - c2);
  return dr <= 1 && dc <= 1 && !(dr === 0 && dc === 0);
}

function toServerRow(viewRow) {
  return viewFlipped ? (ROWS - 1 - viewRow) : viewRow;
}

function toViewRow(serverRow) {
  return viewFlipped ? (ROWS - 1 - serverRow) : serverRow;
}

function coordLabel(serverRow, col) {
  return String.fromCharCode(65 + serverRow) + (col + 1);
}

function rowClass(owner, serverRow) {
  // Only color home rows based on their original owner (if they still have HP)
  // Don't color rows based on unit presence anymore
  if (serverRow !== undefined) {
    // Gold home rows (0, 1)
    if (serverRow <= 1 && S.rowHP[serverRow] > 0) return "row-gold";
    // Silver home rows (5, 6)
    if (serverRow >= 5 && S.rowHP[serverRow] > 0) return "row-silver";
  }
  return ""; // Neutral or destroyed rows have no color
}

function rowHasUnitsOf(row, owner) {
  for (let c = 0; c < COLS; c++) {
    const id = S.board[row][c];
    if (!id) continue;
    const u = S.units[id];
    if (u && u.owner === owner) return true;
  }
  return false;
}

function findUnitPos(unitId) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (S.board[r][c] === unitId) return { r, c };
    }
  }
  return null;
}

// Check if a unit has adjacent allies with specific effect
function getAdjacentUnitsWithEffect(unitId, effectId) {
  const pos = findUnitPos(unitId);
  if (!pos) return [];
  
  const matches = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = pos.r + dr;
      const nc = pos.c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      
      const adjId = S.board[nr][nc];
      if (!adjId) continue;
      
      const adj = S.units[adjId];
      if (adj && adj.effectId === effectId && adj.owner === S.units[unitId]?.owner) {
        matches.push(adjId);
      }
    }
  }
  return matches;
}

// Calculate effective attack with buffs
function getEffectiveAtk(unitId) {
  const u = S.units[unitId];
  if (!u) return 0;
  
  let atk = u.atk;
  // War Banner buff
  if (getAdjacentUnitsWithEffect(unitId, "attack_aura").length > 0) {
    atk += 1;
  }
  return atk;
}

// Get attack buff amount
function getAtkBuff(unitId) {
  const u = S.units[unitId];
  if (!u) return 0;
  
  let buff = 0;
  if (getAdjacentUnitsWithEffect(unitId, "attack_aura").length > 0) {
    buff += 1;
  }
  return buff;
}

function sendAction(payload) {
  socket.emit("action", payload);
}

function spawnClick(spawnSide){ // spawnSide = "gold" | "silver"
  if (myRole !== "gold" && myRole !== "silver") return log("Spectator cannot act.");
  if (!isMyTurn()) return log("Not your turn.");
  
  // If clicking your own spawn with a unit in it (and no card selected), select it for movement/attack
  if (spawnSide === myRole && S.spawn[spawnSide] && !deployCardId) {
    selectedSpawnUnit = S.spawn[spawnSide];
    selectedUnitId = null;
    selectedCardId = null;
    log(`Selected spawn unit. Click a highlighted tile to move or attack.`);
    highlightSpawnMoveTiles();
    highlightSpawnAttackTargets(); // Also show attack targets
    renderAll();
    return;
  }
  
  // Can only deploy to YOUR OWN spawn
  if (spawnSide !== myRole) return log("You can only deploy to your own spawn.");
  
  if (!deployCardId) return log("Select a card first.");
  
  // Check if spawn is already occupied
  if (S.spawn[spawnSide]) return log("Spawn is already occupied.");

  // Find the card and spawn element for animation
  const card = myHand.find(c => c.id === deployCardId);
  const cardIdToPlay = deployCardId;
  
  // Clear selection immediately
  deployCardId = null;
  selectedCardId = null;
  clearHighlights();
  
  // Animate then send action
  if (card && spawnYouEl) {
    animateCardPlay(card, spawnYouEl, () => {
      sendAction({ type: "playCard", cardId: cardIdToPlay, spawn: spawnSide });
    });
    renderHand();
  } else {
    sendAction({ type: "playCard", cardId: cardIdToPlay, spawn: spawnSide });
    renderHand();
    renderAll();
  }
}

// Highlight attack targets for spawn unit (can attack enemies in adjacent row)
function highlightSpawnAttackTargets() {
  if (!selectedSpawnUnit) return;
  
  const u = S.units[selectedSpawnUnit];
  if (!u || u.owner !== myRole) return;
  
  const hasAttacked = S.attackedThisTurn.includes(selectedSpawnUnit);
  if (hasAttacked) return;
  
  // Spawn can attack units in the adjacent row (row 0 for gold, row 4 for silver)
  const adjRow = myRole === "gold" ? 0 : 6;
  const enemy = enemyOf(myRole);
  
  for (let c = 0; c < COLS; c++) {
    const targetId = S.board[adjRow][c];
    if (!targetId) continue;
    
    const target = S.units[targetId];
    if (target && target.owner === enemy) {
      const viewRow = viewFlipped ? (ROWS - 1 - adjRow) : adjRow;
      const el = document.getElementById(cellId(viewRow, c));
      if (el) {
        el.classList.add("attack-valid");
        const icon = document.createElement("div");
        icon.className = "attack-icon";
        icon.innerHTML = "⚔️";
        el.appendChild(icon);
      }
    }
  }
}

// Click handlers for spawn tiles
if (spawnEnemyEl) spawnEnemyEl.addEventListener("click", () => {
  const spawnSide = myRole === "gold" ? "silver" : "gold";
  spawnClick(spawnSide);
});

if (spawnYouEl) spawnYouEl.addEventListener("click", () => {
  const spawnSide = myRole === "gold" ? "gold" : "silver";
  spawnClick(spawnSide);
});


function cellId(vr, c) { return `cell-${vr}-${c}`; }
function rowHpId(vr) { return `rowhp-${vr}`; }

function buildBoardOnce() {
  if (!boardEl) return;
  boardEl.innerHTML = "";

  for (let vr = 0; vr < ROWS; vr++) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.id = cellId(vr, c);
      cell.addEventListener("click", () => onCellClick(vr, c));
      boardEl.appendChild(cell);
    }

    const hp = document.createElement("div");
    hp.className = "rowHP";
    hp.id = rowHpId(vr);
    boardEl.appendChild(hp);
  }
}

buildBoardOnce();

// Card icons based on card key
const CARD_ICONS = {
  peasant: '🧑‍🌾', squire: '🗡️', archer: '🏹', manatarms: '⚔️', shieldbearer: '🛡️',
  warhound: '🐕', medic: '💊', knight: '🐴', crusader: '✝️', royalguard: '👑',
  paladin: '⚜️', siegeram: '🪵', warbanner: '🚩', shrine: '⛪', armory: '🏛️',
  healspring: '💧', castlewalls: '🏰', treasury: '💰', rally: '📯'
};

function renderHand() {
  if (!handEl) return;
  handEl.innerHTML = "";
  cardElements = {}; // Reset card element references

  myHand.forEach(card => {
    const el = document.createElement("div");
    el.className = "handCard";
    if (card.type === "spell") el.classList.add("spell-card");
    if (card.id === selectedCardId) el.classList.add("selected");

    const icon = CARD_ICONS[card.key] || '⚔️';
    const effectLabel = card.effectDesc ? card.effectDesc.split(':')[0] : '';
    const isInstant = card.effect === "instant";
    
    // Art style - use image or gradient with icon
    const hasArt = card.art;
    const artStyle = hasArt ? `background-image: url('${card.art}')` : '';
    const artContent = hasArt ? '' : icon;

    el.innerHTML = `
      <div class="cardArt ${card.type === 'spell' ? 'spell-art' : ''}" style="${artStyle}">${artContent}</div>
      <div class="cardCost">${card.cost}</div>
      ${card.type === 'spell' ? '<div class="cardType">SPELL</div>' : ''}
      <div class="cardInfoOverlay">
        <div class="cardName">${card.name}</div>
        ${effectLabel ? `<div class="cardEffect">${effectLabel}</div>` : ''}
        ${!isInstant ? `<div class="cardStats">
          <div class="cardStat cardAtk"><span class="cardStatIcon">⚔</span>${card.atk}</div>
          <div class="cardStat cardHp"><span class="cardStatIcon">♥</span>${card.hp}</div>
        </div>` : '<div class="cardInstant">⚡ INSTANT</div>'}
      </div>
    `;

    el.onclick = () => {
      if (!isMyTurn()) return log("Not your turn.", "system");
      
      // If clicking the same card, deselect it
      if (selectedCardId === card.id) {
        selectedCardId = null;
        deployCardId = null;
        clearHighlights();
        renderHand();
        log("Card deselected.", "system");
        return;
      }
      
      selectedCardId = card.id;
      deployCardId = card.id;
      selectedUnitId = null;
      selectedSpawnUnit = null;
      log(`Selected ${card.name}. Click a highlighted tile.`, "system");
      renderHand();
      highlightDeployTiles();
    };
    
    // Tooltip on hover
    el.onmouseenter = (e) => showCardTooltip(card, e.clientX, e.clientY);
    el.onmousemove = (e) => {
      if (tooltipEl?.classList.contains("visible")) {
        positionTooltip(e.clientX, e.clientY);
      }
    };
    el.onmouseleave = hideTooltip;

    handEl.appendChild(el);
    
    // Store reference for animation
    cardElements[card.id] = el;
  });

  const deckBadge = document.getElementById("deckCountBadge");
  if (deckCountEl) deckCountEl.textContent = myDeckCount;
  if (deckBadge) deckBadge.textContent = myDeckCount;
  if (discardCountEl) discardCountEl.textContent = myDiscardCount;
  
  // Update draw button state
  if (drawBtn) {
    drawBtn.disabled = !canDraw || !isMyTurn();
    if (canDraw && isMyTurn()) {
      drawBtn.classList.add("must-draw");
    } else {
      drawBtn.classList.remove("must-draw");
    }
  }
}

function renderSpawnUnit(el, unitId, spawnEl) {
  if (!el) return;
  
  if (!unitId || !S.units[unitId]) {
    el.innerHTML = "";
    el.parentElement?.classList.remove("occupied");
    // Clear hover events
    if (spawnEl) {
      spawnEl.onmouseenter = null;
      spawnEl.onmousemove = null; 
      spawnEl.onmouseleave = null;
    }
    return;
  }
  
  const u = S.units[unitId];
  el.innerHTML = `
    <div class="unitName">${u.name}${u.effectId ? ' ✨' : ''}</div>
    <div class="unitStats">
      <div class="unitStat unitAtk"><span class="unitStatIcon">⚔</span>${u.atk}</div>
      <div class="unitStat unitHp"><span class="unitStatIcon">♥</span>${u.hp}</div>
    </div>
  `;
  el.parentElement?.classList.add("occupied");
  if (u.type === "spell") el.parentElement?.classList.add("spell-unit");
  else el.parentElement?.classList.remove("spell-unit");
  
  // Add tooltip hover events to spawn element
  if (spawnEl) {
    spawnEl.onmouseenter = (e) => showTooltip(unitId, e.clientX, e.clientY);
    spawnEl.onmousemove = (e) => {
      if (tooltipEl?.classList.contains("visible")) {
        positionTooltip(e.clientX, e.clientY);
      }
    };
    spawnEl.onmouseleave = hideTooltip;
  }
}

function renderAll() {
  if (!boardEl) return;

  for (let vr = 0; vr < ROWS; vr++) {
    const sr = toServerRow(vr);

    const hpEl = document.getElementById(rowHpId(vr));

    if (hpEl) {
      // Middle rows (2, 3, 4) have no HP
      if (sr === 2 || sr === 3 || sr === 4) {
        hpEl.textContent = "";
        hpEl.classList.add(sr === 2 ? "row-c" : (sr === 3 ? "row-d" : "row-e"));
      } else {
        const currentHP = S.rowHP[sr];
        const previousHP = prevRowHP[sr];
        
        hpEl.textContent = currentHP;
        hpEl.classList.remove("row-c", "row-d", "row-e");
        
        // Trigger damage/heal animation
        if (currentHP < previousHP) {
          hpEl.classList.remove("damaged", "healed");
          void hpEl.offsetWidth; // Force reflow
          hpEl.classList.add("damaged");
        } else if (currentHP > previousHP) {
          hpEl.classList.remove("damaged", "healed");
          void hpEl.offsetWidth;
          hpEl.classList.add("healed");
        }
      }
    }

    const clsGold = "row-gold";
    const clsSilver = "row-silver";
    const rc = rowClass(S.rowOwner[sr], sr);

    const applyCls = (el) => {
      if (!el) return;
      el.classList.remove(clsGold, clsSilver);
      if (rc) el.classList.add(rc);
    };

    applyCls(hpEl);

    for (let c = 0; c < COLS; c++) {
      const cellEl = document.getElementById(cellId(vr, c));
      if (!cellEl) continue;

      applyCls(cellEl);

      cellEl.classList.remove("selected", "buff-tile", "buff-energy", "buff-heal", "buff-attack", "buff-draw", "buff-move", "buff-hp", "has-unit");
      cellEl.removeAttribute("data-buff-icon");
      cellEl.innerHTML = "";
      
      // Check if this is a buff tile
      const buffKey = `${sr}-${c}`;
      const buff = S.buffTiles[buffKey];
      if (buff) {
        cellEl.classList.add("buff-tile");
        // Add color-specific class based on buff type
        if (buff.id === "energy_buff") cellEl.classList.add("buff-energy");
        else if (buff.id === "heal_buff") cellEl.classList.add("buff-heal");
        else if (buff.id === "atk_row_buff") cellEl.classList.add("buff-attack");
        else if (buff.id === "draw_buff") cellEl.classList.add("buff-draw");
        else if (buff.id === "move_buff") cellEl.classList.add("buff-move");
        else if (buff.id === "hp_buff") cellEl.classList.add("buff-hp");
        
        cellEl.setAttribute("data-buff-name", buff.name);
        cellEl.setAttribute("data-buff-desc", buff.desc);
      }

      const unitId = S.board[sr][c];

      // If there's a unit on a buff tile, add has-unit class to hide effects
      if (unitId && buff) {
        cellEl.classList.add("has-unit");
      }

      if (!unitId) {
        cellEl.textContent = coordLabel(sr, c);
        // Add buff tile hover handlers
        if (buff) {
          cellEl.onmouseenter = (e) => showBuffTooltip(buff, e.clientX, e.clientY);
          cellEl.onmousemove = (e) => positionBuffTooltip(e.clientX, e.clientY);
          cellEl.onmouseleave = hideBuffTooltip;
        } else {
          cellEl.onmouseenter = null;
          cellEl.onmousemove = null;
          cellEl.onmouseleave = null;
        }
        continue;
      }

      const u = S.units[unitId];
      if (!u) {
        cellEl.textContent = coordLabel(sr, c);
        cellEl.onmouseenter = null;
        cellEl.onmousemove = null;
        cellEl.onmouseleave = null;
        continue;
      }

      const wrap = document.createElement("div");
      wrap.className = "unit";
      if (u.effectId) wrap.classList.add("has-effect");
      if (u.type === "spell") wrap.classList.add("spell-unit");
      
      // Add enemy class for visual distinction
      const isEnemy = u.owner !== myRole && myRole !== "spectator";
      if (isEnemy) wrap.classList.add("enemy-unit");
      
      // Calculate buffs
      const atkBuff = getAtkBuff(unitId);
      const atkBuffHtml = atkBuff > 0 ? `<span class="buff">+${atkBuff}</span>` : '';
      
      // Art display
      const icon = CARD_ICONS[u.key] || '⚔️';
      const hasArt = u.art;
      const artStyle = hasArt ? `background-image: url('${u.art}')` : '';
      const artContent = hasArt ? '' : icon;
      const effectBadge = u.effectId ? '<div class="unitEffectBadge">✨</div>' : '';
      
      wrap.innerHTML = `
        <div class="unitArt" style="${artStyle}">${artContent}</div>
        ${effectBadge}
        <div class="unitInfoOverlay">
          <div class="unitName">${u.name}</div>
          <div class="unitStats">
            <div class="unitStat unitAtk"><span class="unitStatIcon">⚔</span>${u.atk}${atkBuffHtml}</div>
            <div class="unitStat unitHp"><span class="unitStatIcon">♥</span>${u.hp}</div>
          </div>
        </div>
      `;
      cellEl.appendChild(wrap);
      
      // Attach tooltip - show both unit tooltip and buff tooltip if on buff tile
      cellEl.onmouseenter = (e) => {
        showTooltip(unitId, e.clientX, e.clientY, buff);
      };
      cellEl.onmousemove = (e) => {
        if (tooltipEl?.classList.contains("visible")) {
          positionTooltip(e.clientX, e.clientY);
        }
      };
      cellEl.onmouseleave = () => {
        hideTooltip();
        hideBuffTooltip();
      };

      if (unitId === selectedUnitId) cellEl.classList.add("selected");
    }
  }

  if (turnLabelEl) {
    turnLabelEl.textContent = activeSide.toUpperCase();
    turnLabelEl.className = activeSide; // Add gold or silver class for styling
  }
  if (endTurnBtn) endTurnBtn.disabled = !isMyTurn() || S.gameOver;

  if (energyEl) energyEl.textContent = `${myEnergy}/10`;

  const enemyHeartHpEl = document.getElementById("enemyHeartHP");
  const yourHeartHpEl = document.getElementById("yourHeartHP");

  if (myRole === "gold") {
    if (enemyHeartHpEl) enemyHeartHpEl.textContent = S.heartHP.silver;
    if (yourHeartHpEl) yourHeartHpEl.textContent = S.heartHP.gold;
  } else if (myRole === "silver") {
    if (enemyHeartHpEl) enemyHeartHpEl.textContent = S.heartHP.gold;
    if (yourHeartHpEl) yourHeartHpEl.textContent = S.heartHP.silver;
  } else {
    if (enemyHeartHpEl) enemyHeartHpEl.textContent = S.heartHP.gold;
    if (yourHeartHpEl) yourHeartHpEl.textContent = S.heartHP.silver;
  }

  // Render spawn units based on player perspective
  if (myRole === "gold") {
    renderSpawnUnit(spawnYouUnitEl, S.spawn.gold, spawnYouEl);
    renderSpawnUnit(spawnEnemyUnitEl, S.spawn.silver, spawnEnemyEl);
  } else if (myRole === "silver") {
    renderSpawnUnit(spawnYouUnitEl, S.spawn.silver, spawnYouEl);
    renderSpawnUnit(spawnEnemyUnitEl, S.spawn.gold, spawnEnemyEl);
  } else {
    renderSpawnUnit(spawnEnemyUnitEl, S.spawn.gold, spawnEnemyEl);
    renderSpawnUnit(spawnYouUnitEl, S.spawn.silver, spawnYouEl);
  }
  
  // Re-apply spawn selection highlight if needed
  if (selectedSpawnUnit && spawnYouEl) {
    spawnYouEl.classList.add("selected");
    highlightSpawnMoveTiles();
  }
  
  // Re-apply unit move highlights if a unit is selected
  if (selectedUnitId && S.units[selectedUnitId]?.owner === myRole) {
    highlightUnitMoves(selectedUnitId);
  }
}

if (endTurnBtn) {
  endTurnBtn.onclick = () => {
    if (!isMyTurn()) return log("Not your turn.", "system");
    deployCardId = null;
    selectedCardId = null;
    selectedUnitId = null;
    selectedSpawnUnit = null;
    clearHighlights();
    sendAction({ type: "endTurn" });
  };
}

if (drawBtn) {
  drawBtn.onclick = () => {
    if (!isMyTurn()) return log("Not your turn.", "system");
    if (!canDraw) return log("Already drew this turn.", "system");
    sendAction({ type: "drawCard" });
  };
}


function onCellClick(viewRow, col) {
  if (myRole !== "gold" && myRole !== "silver") return log("Spectator cannot act.");
  if (!isMyTurn()) return log("Not your turn.");
  if (S.gameOver) return log("Game over.");

  const row = toServerRow(viewRow);
  const occId = S.board[row][col];

  // Handle spawn unit movement/attack
  if (selectedSpawnUnit) {
    // Check if clicking on enemy unit to attack
    if (occId) {
      const target = S.units[occId];
      if (target && target.owner !== myRole) {
        // Check if in adjacent row (row 0 for gold, row 4 for silver)
        const adjRow = myRole === "gold" ? 0 : 6;
        if (row === adjRow) {
          sendAction({ type: "attackFromSpawn", targetId: occId });
          selectedSpawnUnit = null;
          clearHighlights();
          renderAll();
          return;
        }
      }
      return log("That tile is occupied.");
    }
    
    // Check if valid move (home rows only)
    const homeRows = myRole === "gold" ? [0, 1] : [5, 6];
    if (!homeRows.includes(row)) {
      return log("Spawn units can only move to home rows.");
    }
    
    sendAction({ type: "moveFromSpawn", unitId: selectedSpawnUnit, toRow: row, toCol: col });
    
    selectedSpawnUnit = null;
    clearHighlights();
    renderAll();
    return;
  }

  // Handle card deployment
  if (deployCardId) {
    // Find the card
    const card = myHand.find(c => c.id === deployCardId);
    if (!card) {
      deployCardId = null;
      selectedCardId = null;
      clearHighlights();
      return;
    }
    
    // Handle targeted instant spells
    if (card.effect === "instant" && card.requiresTarget === "unit") {
      // Rallying Cry - target a friendly unit
      if (!occId || !S.units[occId] || S.units[occId].owner !== myRole) {
        return log("Select one of your units.");
      }
      const cardIdToPlay = deployCardId;
      deployCardId = null;
      selectedCardId = null;
      clearHighlights();
      sendAction({ type: "playCard", cardId: cardIdToPlay, targetUnitId: occId });
      renderHand();
      return;
    }
    
    if (card.effect === "instant" && card.requiresTarget === "row") {
      // Castle Walls - target a row you control
      const cardIdToPlay = deployCardId;
      deployCardId = null;
      selectedCardId = null;
      clearHighlights();
      sendAction({ type: "playCard", cardId: cardIdToPlay, row });
      renderHand();
      return;
    }
    
    // Normal unit deployment - tile must be empty
    if (occId) return log("That tile is occupied.");
    
    const targetCell = document.getElementById(cellId(viewRow, col));
    const cardIdToPlay = deployCardId;
    
    // Clear selection immediately
    deployCardId = null;
    selectedCardId = null;
    clearHighlights();
    
    // Animate then send action
    if (card && targetCell) {
      animateCardPlay(card, targetCell, () => {
        sendAction({ type: "playCard", cardId: cardIdToPlay, row, col });
      });
      renderHand();
    } else {
      sendAction({ type: "playCard", cardId: cardIdToPlay, row, col });
      renderHand();
      renderAll();
    }
    return;
  }

  // Handle unit selection/movement/attack
  if (occId) {
    const clickedUnit = S.units[occId];
    if (!clickedUnit) return;

    if (selectedUnitId && selectedUnitId !== occId) {
      const a = S.units[selectedUnitId];
      if (a && a.owner === myRole && clickedUnit.owner !== myRole) {
        const ap = findUnitPos(selectedUnitId);
        const tp = findUnitPos(occId);
        if (!ap || !tp) return log("Error: position not found.");
        
        // Check if this is a valid attack based on unit abilities
        let canAttack = false;
        
        // Peasant diagonal attack
        if (a.effectId === "diagonal_attack") {
          canAttack = isAdjacent(ap.r, ap.c, tp.r, tp.c);
        }
        // Archer ranged attack (up to 2 tiles, cardinal only)
        else if (a.effectId === "ranged") {
          const rowDist = Math.abs(ap.r - tp.r);
          const colDist = Math.abs(ap.c - tp.c);
          canAttack = (rowDist <= 2 && colDist === 0) || (colDist <= 2 && rowDist === 0);
        }
        // Default: cardinal adjacent only
        else {
          canAttack = isCardinalAdjacent(ap.r, ap.c, tp.r, tp.c);
        }
        
        if (!canAttack) {
          // Not in range - deselect instead
          selectedUnitId = null;
          clearHighlights();
          renderAll();
          return;
        }
        return sendAction({ type: "attackUnit", attackerId: selectedUnitId, targetId: occId });
      }
    }

    // Clicking same unit deselects it
    if (selectedUnitId === occId) {
      selectedUnitId = null;
      clearHighlights();
      renderAll();
      return;
    }

    selectedUnitId = occId;
    selectedSpawnUnit = null;
    selectedCardId = null;
    deployCardId = null;
    
    // If it's our unit, highlight valid moves/attacks
    if (clickedUnit.owner === myRole) {
      highlightUnitMoves(occId);
    } else {
      clearHighlights();
    }
    
    renderAll();
    return;
  }

  // Clicked on empty cell
  if (!selectedUnitId) {
    // Nothing selected, clicking empty deselects any card selection
    selectedCardId = null;
    deployCardId = null;
    clearHighlights();
    renderHand();
    return;
  }

  const a = S.units[selectedUnitId];
  if (!a || a.owner !== myRole) {
    // Deselect if not our unit
    selectedUnitId = null;
    clearHighlights();
    renderAll();
    return;
  }

  const ap = findUnitPos(selectedUnitId);
  if (!ap) return log("Error: unit position not found.");

  // Check if this is a valid move (adjacent OR knight leap for squires)
  let validMove = isAdjacent(ap.r, ap.c, row, col);
  
  // Squire knight_leap - can move to tiles adjacent to any friendly Knight
  if (a.effectId === "knight_leap" && !validMove) {
    for (const id in S.units) {
      const other = S.units[id];
      if (other.owner === myRole && other.key === "knight") {
        const kpos = findUnitPos(id);
        if (kpos && isAdjacent(kpos.r, kpos.c, row, col)) {
          validMove = true;
          break;
        }
      }
    }
  }

  if (!validMove) {
    // Clicked non-adjacent empty cell (and not a valid knight leap) - deselect
    selectedUnitId = null;
    clearHighlights();
    renderAll();
    return;
  }

  const enemy = enemyOf(myRole);
  const rowHasHP = S.rowHP[row] > 0;
  const hasAttacked = S.attackedThisTurn.includes(selectedUnitId);
  const hasMoved = S.movedThisTurn.includes(selectedUnitId);
  
  // Check if this is an enemy home row
  const isEnemyHomeRow = (enemy === "gold" && row <= 1) || (enemy === "silver" && row >= 5);

  // Check if clicking on a row-attack-valid cell (enemy home row with HP, no enemy units there)
  if (isEnemyHomeRow && rowHasHP && !hasAttacked) {
    return sendAction({ type: "attackRow", attackerId: selectedUnitId, row });
  }

  // Can't move into enemy home row with HP remaining
  const isBlockedEnemyRow = isEnemyHomeRow && rowHasHP;

  // Otherwise try to move (only if not already moved and not blocked)
  if (!hasMoved && !isBlockedEnemyRow) {
    sendAction({ type: "move", unitId: selectedUnitId, toRow: row, toCol: col });
  } else if (hasMoved) {
    log("Already moved this unit.", "system");
  } else {
    log("Cannot move into enemy row until its HP is 0.", "system");
  }
}

socket.on("connect", () => log("Connected: " + socket.id, "system"));
socket.on("disconnect", () => log("Disconnected", "system"));
socket.on("log", (msg) => log(msg, parseLogType(msg)));

// Handle animation events
socket.on("animate", (data) => {
  if (data.type === "move") {
    animateUnitMove(data.unitId, data.fromRow, data.fromCol, data.toRow, data.toCol);
  } else if (data.type === "destroy") {
    animateDestruction(data.row, data.col);
  }
});

// Animate unit movement on board
function animateUnitMove(unitId, fromRow, fromCol, toRow, toCol) {
  const fromViewRow = toViewRow(fromRow);
  const toViewRowVal = toViewRow(toRow);
  
  const fromCell = document.getElementById(cellId(fromViewRow, fromCol));
  const toCell = document.getElementById(cellId(toViewRowVal, toCol));
  
  if (!fromCell || !toCell) return;
  
  const unit = S.units[unitId];
  if (!unit) return;
  
  const fromRect = fromCell.getBoundingClientRect();
  const toRect = toCell.getBoundingClientRect();
  
  // Create animated unit element
  const animUnit = document.createElement("div");
  animUnit.className = "animating-card";
  
  const icon = CARD_ICONS[unit.key] || '⚔️';
  const hasArt = unit.art;
  const artStyle = hasArt ? `background-image: url('${unit.art}'); background-size: cover; background-position: center;` : '';
  
  animUnit.innerHTML = `
    <div class="cardArt" style="${artStyle}">${hasArt ? '' : icon}</div>
  `;
  
  animUnit.style.left = fromRect.left + 'px';
  animUnit.style.top = fromRect.top + 'px';
  animUnit.style.width = fromRect.width + 'px';
  animUnit.style.height = fromRect.height + 'px';
  
  animationLayer.appendChild(animUnit);
  
  // Animate to destination
  requestAnimationFrame(() => {
    animUnit.style.left = toRect.left + 'px';
    animUnit.style.top = toRect.top + 'px';
    
    setTimeout(() => {
      animUnit.classList.add("arrived");
      setTimeout(() => animUnit.remove(), 150);
    }, 350);
  });
}

// Animate unit destruction
function animateDestruction(row, col) {
  const viewRow = toViewRow(row);
  const cell = document.getElementById(cellId(viewRow, col));
  if (!cell) return;
  
  const rect = cell.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  
  // Create destruction effect container
  const effect = document.createElement("div");
  effect.className = "destruction-effect";
  effect.style.left = centerX + 'px';
  effect.style.top = centerY + 'px';
  
  // Add flash
  const flash = document.createElement("div");
  flash.className = "destruction-flash";
  effect.appendChild(flash);
  
  // Add particles
  const colors = ['#ef4444', '#f97316', '#fbbf24', '#dc2626'];
  for (let i = 0; i < 12; i++) {
    const particle = document.createElement("div");
    particle.className = "destruction-particle";
    const angle = (i / 12) * Math.PI * 2;
    const distance = 40 + Math.random() * 30;
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance;
    particle.style.setProperty('--tx', tx + 'px');
    particle.style.setProperty('--ty', ty + 'px');
    particle.style.background = colors[Math.floor(Math.random() * colors.length)];
    particle.style.left = '-4px';
    particle.style.top = '-4px';
    effect.appendChild(particle);
  }
  
  // Add skull emoji
  const skull = document.createElement("div");
  skull.className = "skull-popup";
  skull.textContent = '💀';
  skull.style.left = '-16px';
  skull.style.top = '-16px';
  effect.appendChild(skull);
  
  animationLayer.appendChild(effect);
  
  // Remove after animation
  setTimeout(() => effect.remove(), 800);
}

socket.on("mustDiscard", (data) => {
  showDiscardModal();
});

function showDiscardModal() {
  if (!discardModal || !discardCardsEl) return;
  discardCardsEl.innerHTML = "";
  
  myHand.forEach(card => {
    const el = document.createElement("div");
    el.className = "handCard";
    if (card.type === "spell") el.classList.add("spell-card");
    
    const icon = CARD_ICONS[card.key] || '⚔️';
    const hasArt = card.art;
    const artStyle = hasArt ? `background-image: url('${card.art}')` : '';
    const artContent = hasArt ? '' : icon;
    const isInstant = card.effect === "instant";
    
    el.innerHTML = `
      <div class="cardArt ${card.type === 'spell' ? 'spell-art' : ''}" style="${artStyle}">${artContent}</div>
      <div class="cardCost">${card.cost}</div>
      <div class="cardInfoOverlay">
        <div class="cardName">${card.name}</div>
        ${!isInstant ? `<div class="cardStats">
          <div class="cardStat cardAtk"><span class="cardStatIcon">⚔</span>${card.atk}</div>
          <div class="cardStat cardHp"><span class="cardStatIcon">♥</span>${card.hp}</div>
        </div>` : '<div class="cardInstant">⚡ INSTANT</div>'}
      </div>
    `;
    
    el.onclick = () => {
      sendAction({ type: "discardCard", cardId: card.id });
      hideDiscardModal();
    };
    
    // Add tooltip on hover
    el.onmouseenter = (e) => showCardTooltip(card, e.clientX, e.clientY);
    el.onmousemove = (e) => {
      if (tooltipEl?.classList.contains("visible")) {
        positionTooltip(e.clientX, e.clientY);
      }
    };
    el.onmouseleave = hideTooltip;
    
    discardCardsEl.appendChild(el);
  });
  
  discardModal.classList.remove("hidden");
}

function hideDiscardModal() {
  if (discardModal) discardModal.classList.add("hidden");
  hideTooltip();
}

// Animate card from hand to target position
function animateCardPlay(card, targetEl, callback) {
  if (!animationLayer || !card) {
    if (callback) callback();
    return;
  }
  
  // Get source position (card in hand)
  const sourceEl = cardElements[card.id];
  if (!sourceEl) {
    if (callback) callback();
    return;
  }
  
  const sourceRect = sourceEl.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  
  // Create animated card element
  const animCard = document.createElement("div");
  animCard.className = "animating-card";
  
  const icon = CARD_ICONS[card.key] || '⚔️';
  const hasArt = card.art;
  const artStyle = hasArt ? `background-image: url('${card.art}'); background-size: cover; background-position: center;` : '';
  
  animCard.innerHTML = `
    <div class="cardArt ${card.type === 'spell' ? 'spell-art' : ''}" style="${artStyle}">${hasArt ? '' : icon}</div>
  `;
  
  // Position at source
  animCard.style.left = sourceRect.left + 'px';
  animCard.style.top = sourceRect.top + 'px';
  
  animationLayer.appendChild(animCard);
  
  // Trigger animation to target
  requestAnimationFrame(() => {
    animCard.style.left = targetRect.left + (targetRect.width - 68) / 2 + 'px';
    animCard.style.top = targetRect.top + (targetRect.height - 94) / 2 + 'px';
    
    // After animation completes
    setTimeout(() => {
      animCard.classList.add("arrived");
      setTimeout(() => {
        animCard.remove();
        if (callback) callback();
      }, 150);
    }, 400);
  });
}

socket.on("role", (role) => {
  myRole = role || "spectator";
  viewFlipped = (myRole === "gold");
  document.title = `Grid Card Game (${myRole.toUpperCase()})`;

  selectedUnitId = null;
  deployCardId = null;
  selectedCardId = null;
  selectedSpawnUnit = null;

  renderAll();
  renderHand();
});

// Private state now included in main state event

socket.on("state", (st) => {
  if (!st) return;

  // Store previous values before updating
  prevRowHP = [...S.rowHP];
  prevHeartHP = { ...S.heartHP };

  activeSide = st.activeSide;
  S.rowHP = st.rowHP;
  S.rowOwner = st.rowOwner;
  S.heartHP = st.heartHP;
  S.board = st.board;
  S.units = st.units;
  S.gameOver = !!st.gameOver;
  S.spawn = st.spawn || { gold: null, silver: null };
  S.movedThisTurn = st.movedThisTurn || [];
  S.attackedThisTurn = st.attackedThisTurn || [];
  S.firstTurn = !!st.firstTurn;
  S.buffTiles = st.buffTiles || {};
  S.moveCountThisTurn = st.moveCountThisTurn || {};

  // Handle private state (hand, energy, etc) - now included in state
  if (st.hand !== undefined) {
    myHand = Array.isArray(st.hand) ? st.hand : [];
    myDeckCount = st.deckCount ?? 0;
    myDiscardCount = st.discardCount ?? 0;
    myEnergy = st.energy ?? 0;
    myMaxEnergy = st.maxEnergy ?? 0;
    canDraw = !!st.canDraw;
    renderHand();
  }

  // Animate heart damage
  animateHeartDamage();

  if (!isMyTurn()) {
    deployCardId = null;
    selectedCardId = null;
    selectedSpawnUnit = null;
  }

  renderAll();
});

function animateHeartDamage() {
  const enemyHpEl = document.getElementById("enemyHeartHP");
  const yourHpEl = document.getElementById("yourHeartHP");
  
  const myHeart = myRole === "gold" ? "gold" : "silver";
  const enemyHeart = myRole === "gold" ? "silver" : "gold";
  
  if (S.heartHP[enemyHeart] < prevHeartHP[enemyHeart] && enemyHpEl) {
    enemyHpEl.classList.remove("damaged");
    void enemyHpEl.offsetWidth;
    enemyHpEl.classList.add("damaged");
  }
  
  if (S.heartHP[myHeart] < prevHeartHP[myHeart] && yourHpEl) {
    yourHpEl.classList.remove("damaged");
    void yourHpEl.offsetWidth;
    yourHpEl.classList.add("damaged");
  }
}

// ===== GAME MENU =====
if (menuBtn) {
  menuBtn.onclick = () => {
    if (gameMenu) gameMenu.classList.remove("hidden");
  };
}

const resumeBtn = document.getElementById("resumeBtn");
const restartBtn = document.getElementById("restartBtn");
const leaveBtn = document.getElementById("leaveBtn");

if (resumeBtn) {
  resumeBtn.onclick = () => {
    if (gameMenu) gameMenu.classList.add("hidden");
  };
}

if (restartBtn) {
  restartBtn.onclick = () => {
    if (confirm("Restart the game? This will reset all progress.")) {
      socket.emit("restartGame");
      if (gameMenu) gameMenu.classList.add("hidden");
    }
  };
}

if (leaveBtn) {
  leaveBtn.onclick = () => {
    if (confirm("Leave the game? This will end it for both players.")) {
      socket.emit("leaveGame");
      window.location.href = "/home.html";
    }
  };
}

// Show restart button only for host
socket.on("role", (role) => {
  if (restartBtn && isHost) {
    restartBtn.style.display = "block";
  }
});

// Handle errors (disconnection, etc)
socket.on("lobbyError", (msg) => {
  alert(msg);
  window.location.href = "/home.html";
});
