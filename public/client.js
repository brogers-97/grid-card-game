const socket = io();
const boardEl = document.getElementById("board");
const logEl = document.getElementById("log");
const combatLogEl = document.getElementById("combatLog");

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

// Get custom music and background from URL (from deck builder settings)
const customMusic = urlParams.get('music');
const customBackground = urlParams.get('background');

// Determine which music to use: custom setting, or default to deck theme
function getMusicDeckId() {
  if (customMusic && customMusic !== 'default') {
    return customMusic;
  }
  return myDeckId;
}

// Determine which background to use: custom setting, or default to deck theme
function getBackgroundDeckId() {
  if (customBackground && customBackground !== 'default') {
    return customBackground;
  }
  return myDeckId;
}

// Initialize audio and backgrounds when page loads
if (myDeckId) {
  setupAudio(getMusicDeckId());
  setBackgroundImages(getBackgroundDeckId(), enemyDeckId);
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
  const hpBuff = u.hpBuffed ? 1 : 0;
  
  // HP display with max HP
  const maxHp = u.maxHp || u.hp;
  const hpDisplay = `${u.hp}/${maxHp}`;
  
  // Art section
  const icon = CARD_ICONS[u.key] || '⚔️';
  const hasArt = u.art;
  const encodedArt = hasArt ? encodeURI(u.art) : '';
  const artStyle = hasArt ? `background: url('${encodedArt}') center/cover no-repeat` : '';
  const artIconHtml = hasArt ? '' : `<div class="tooltip-art-icon">${icon}</div>`;
  const costBadgeHtml = `<div class="tooltip-cost-badge">${u.cost || 0}</div>`;
  
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
  
  // Status effects
  let statusHtml = '';
  if (u.untargetable) {
    statusHtml = '<div class="tooltip-status">🛡️ Untargetable</div>';
  }
  
  tooltipEl.innerHTML = `
    <div class="tooltip-card ${typeClass}">
      <div class="tooltip-art" style="${artStyle}">
        ${costBadgeHtml}
        ${artIconHtml}
      </div>
      <div class="tooltip-content">
        <div class="tooltip-header">
          <span class="tooltip-name">${u.name}</span>
          <span class="tooltip-type ${u.type || 'monster'}">${u.type || 'Monster'}</span>
        </div>
        <div class="tooltip-owner ${u.owner}">${u.owner.toUpperCase()}'s Unit</div>
        <div class="tooltip-stats">
          <div class="tooltip-stat">
            <div class="tooltip-stat-value atk">${effectiveAtk}</div>
            <div class="tooltip-stat-label">⚔ ATK${atkBuff > 0 ? ` (+${atkBuff})` : ''}</div>
          </div>
          <div class="tooltip-stat">
            <div class="tooltip-stat-value hp">${hpDisplay}</div>
            <div class="tooltip-stat-label">♥ HP${hpBuff > 0 ? ` (+${hpBuff})` : ''}</div>
          </div>
        </div>
        ${statusHtml}
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
  const encodedArt = hasArt ? encodeURI(card.art) : '';
  const artStyle = hasArt ? `background: url('${encodedArt}') center/cover no-repeat` : '';
  const artIconHtml = hasArt ? '' : `<div class="tooltip-art-icon">${icon}</div>`;
  const costBadgeHtml = `<div class="tooltip-cost-badge">${card.cost}</div>`;
  
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
        <div class="tooltip-stat-label">⚔ ATK</div>
      </div>
      <div class="tooltip-stat">
        <div class="tooltip-stat-value hp">${card.hp}</div>
        <div class="tooltip-stat-label">♥ HP</div>
      </div>
    </div>
  ` : '<div class="tooltip-instant-badge">⚡ INSTANT SPELL</div>';
  
  tooltipEl.innerHTML = `
    <div class="tooltip-card ${typeClass}">
      <div class="tooltip-art ${card.type === 'spell' ? 'spell' : ''}" style="${artStyle}">
        ${costBadgeHtml}
        ${artIconHtml}
      </div>
      <div class="tooltip-content">
        <div class="tooltip-header">
          <span class="tooltip-name">${card.name}</span>
          <span class="tooltip-type ${card.type || 'monster'}">${card.type || 'Monster'}</span>
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
  if (left + 300 > window.innerWidth) left = x - 300 - padding;
  if (top + 350 > window.innerHeight) top = y - 350 - padding;
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

// Combat log for detailed damage calculations
function combatLog(msg, type = "combat-step") {
  if (!combatLogEl) return;
  
  const entry = document.createElement("div");
  entry.className = `combat-entry ${type}`;
  
  // Apply color coding
  let html = msg
    .replace(/(\d+) ATK/g, '<span class="combat-atk">$1 ATK</span>')
    .replace(/(\d+) HP/g, '<span class="combat-hp">$1 HP</span>')
    .replace(/(\d+) damage/g, '<span class="combat-dmg">$1 damage</span>')
    .replace(/heals? (\d+)/g, 'heals <span class="combat-heal">$1</span>')
    .replace(/Lifesteal/g, '<span class="combat-heal">Lifesteal</span>');
  
  entry.innerHTML = html;
  combatLogEl.appendChild(entry);
  combatLogEl.scrollTop = combatLogEl.scrollHeight;
}

// Tab switching for battle log
document.querySelectorAll('.logTab').forEach(tab => {
  tab.addEventListener('click', () => {
    // Remove active from all tabs and contents
    document.querySelectorAll('.logTab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.logContent').forEach(c => c.classList.remove('active'));
    
    // Activate clicked tab
    tab.classList.add('active');
    const tabName = tab.dataset.tab;
    if (tabName === 'events') {
      logEl?.classList.add('active');
    } else if (tabName === 'combat') {
      combatLogEl?.classList.add('active');
    }
  });
});

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

// Track cells that are currently showing damage animation
let damagingCells = new Set();

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

  if (card.effect === "instant" && card.requiresTarget === "enemy_unit") {
    // Assimilation - highlight enemy units with 2 or less HP
    for (let vr = 0; vr < ROWS; vr++) {
      const sr = toServerRow(vr);
      for (let c = 0; c < COLS; c++) {
        const unitId = S.board[sr][c];
        if (unitId && S.units[unitId] && S.units[unitId].owner !== myRole) {
          const u = S.units[unitId];
          // Only highlight if HP <= 2 and not untargetable
          if (u.hp <= 2 && !u.untargetable) {
            const el = document.getElementById(cellId(vr, c));
            if (el) el.classList.add("attack-valid"); // Red highlight for enemy target
          }
        }
      }
    }
    return;
  }

  if (card.effect === "instant" && card.requiresTarget === "row") {
    // Castle Walls / Void Collapse - highlight rows
    // Castle Walls targets your rows, Void Collapse can target any row
    for (let vr = 0; vr < ROWS; vr++) {
      const sr = toServerRow(vr);
      // For fortify_row (Castle Walls), only your rows
      // For row_damage (Void Collapse), any row
      if (card.effectId === "fortify_row") {
        if (canDeployOnRow(sr)) {
          for (let c = 0; c < COLS; c++) {
            const el = document.getElementById(cellId(vr, c));
            if (el) el.classList.add("deploy-valid");
          }
        }
      } else {
        // Void Collapse can target any row
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
  // Exception: Burrower Beast can deploy cardinal-adjacent to any friendly unit
  const isBurrower = card.effectId === "burrow";
  
  for (let vr = 0; vr < ROWS; vr++) {
    const sr = toServerRow(vr);
    for (let c = 0; c < COLS; c++) {
      if (S.board[sr][c]) continue;

      let canDeploy = canDeployOnRow(sr);
      
      // Burrower Beast can also deploy adjacent to friendly units
      if (!canDeploy && isBurrower) {
        const cardinalOffsets = [{r: -1, c: 0}, {r: 1, c: 0}, {r: 0, c: -1}, {r: 0, c: 1}];
        for (const offset of cardinalOffsets) {
          const nr = sr + offset.r;
          const nc = c + offset.c;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
          const adjId = S.board[nr][nc];
          if (adjId && S.units[adjId] && S.units[adjId].owner === myRole) {
            // Check it's not an enemy home row with HP
            const enemy = enemyOf(myRole);
            const isEnemyHomeRow = (enemy === "gold" && sr <= 1) || (enemy === "silver" && sr >= 5);
            if (!isEnemyHomeRow || S.rowHP[sr] <= 0) {
              canDeploy = true;
              break;
            }
          }
        }
      }
      
      if (canDeploy) {
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
  const canAbsorbAlly = u.effectId === "absorb_ally";
  
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
        
        // UFO Scraper can attack friendly units (cardinal only)
        if (target && target.owner === myRole && canAbsorbAlly && !hasAttacked && isCardinal) {
          el.classList.add("deploy-valid"); // Green highlight for absorb
          const icon = document.createElement("div");
          icon.className = "attack-icon";
          icon.innerHTML = "🛸";
          el.appendChild(icon);
        }
        // Normal attack on enemies
        else if (target && target.owner === enemy && !hasAttacked && canAttackHere) {
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

// Battery energy display
function updateBatteryDisplay(energy) {
  const slots = document.querySelectorAll('.batterySlot');
  const batteryBody = document.querySelector('.batteryBody');
  const energyLabel = document.getElementById('energyLabel');
  const isMaxed = energy >= 10;
  
  // Update battery body glow
  if (batteryBody) {
    batteryBody.classList.toggle('maxed', isMaxed);
  }
  
  // Update energy label glow
  if (energyLabel) {
    energyLabel.classList.toggle('maxed', isMaxed);
  }
  
  slots.forEach((slot, index) => {
    const slotNum = index + 1;
    slot.classList.remove('filled', 'low', 'medium', 'maxed');
    if (slotNum <= energy) {
      slot.classList.add('filled');
      if (isMaxed) {
        slot.classList.add('maxed');
      } else if (energy <= 2) {
        slot.classList.add('low');
      } else if (energy <= 5) {
        slot.classList.add('medium');
      }
    }
  });
}

// Active buffs display
function updateActiveBuffsDisplay() {
  const buffsList = document.getElementById('activeBuffsList');
  if (!buffsList || !S.buffTiles) return;
  
  const BUFF_INFO = {
    'energy_buff': { icon: '⚡', name: 'Energy Well', class: 'energy' },
    'heal_buff': { icon: '💚', name: 'Healing Spring', class: 'heal' },
    'atk_row_buff': { icon: '⚔️', name: 'War Shrine', class: 'attack' },
    'draw_buff': { icon: '🎴', name: 'Mystic Altar', class: 'draw' },
    'move_buff': { icon: '💨', name: 'Wind Temple', class: 'move' },
    'hp_buff': { icon: '🛡️', name: 'Stone Circle', class: 'hp' }
  };
  
  // Find which buff tiles have the player's units on them
  const activeBuffs = [];
  for (const key in S.buffTiles) {
    const buff = S.buffTiles[key];
    const [row, col] = key.split('-').map(Number);
    const unitId = S.board[row][col];
    if (unitId && S.units[unitId] && S.units[unitId].owner === myRole) {
      const buffInfo = BUFF_INFO[buff.id];
      if (buffInfo && !activeBuffs.find(b => b.id === buff.id)) {
        activeBuffs.push({ ...buffInfo, id: buff.id });
      }
    }
  }
  
  if (activeBuffs.length === 0) {
    buffsList.innerHTML = '<span class="noBuffs">No active buffs</span>';
  } else {
    buffsList.innerHTML = activeBuffs.map(b => `
      <div class="activeBuff ${b.class}">
        <span class="activeBuffIcon">${b.icon}</span>
        <span class="activeBuffName">${b.name}</span>
      </div>
    `).join('');
  }
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
  // Medieval
  peasant: '🧑‍🌾', squire: '🗡️', archer: '🏹', manatarms: '⚔️', shieldbearer: '🛡️',
  warhound: '🐕', battlefieldmedic: '💊', knight: '🐴', crusader: '✝️', royalguard: '👑',
  paladin: '⚜️', siegeram: '🪵', warbanner: '🚩', shrine: '⛪', armory: '🏛️',
  healspring: '💧', castlewalls: '🏰', treasury: '💰', rally: '📯',
  // Void Alien
  voiddrone: '🛸', scavengerlarva: '🐛', spittercrawler: '🕷️', phaseskirmisher: '👾',
  energyleech: '🦠', burrowerbeast: '🪱', psionicoverseer: '🧠', neuralharvester: '🎃',
  adaptivecolossus: '🦑', sporetitan: '🍄', voidbroodmother: '👽', eclipsedevourer: '🌑',
  ufoscraper: '🛸', assimilation: '💀', voidcollapse: '🌀', hiveascension: '⬆️'
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
    if (card.stolen) el.classList.add("stolen-card"); // Grayscale for Soul Collector stolen cards

    const icon = CARD_ICONS[card.key] || '⚔️';
    const effectLabel = card.effectDesc ? card.effectDesc.split(':')[0] : '';
    const isInstant = card.effect === "instant";
    
    // Art style - use image or gradient with icon
    const hasArt = card.art;
    const artContent = hasArt ? '' : icon;
    
    // Encode URL to handle spaces and special characters
    const encodedArt = hasArt ? encodeURI(card.art) : '';
    
    // Set background directly in style if art exists (use shorthand to override CSS)
    const artStyle = hasArt ? `background: url('${encodedArt}') center/cover no-repeat` : '';

    el.innerHTML = `
      <div class="cardArt ${card.type === 'spell' ? 'spell-art' : ''}" style="${artStyle}">${artContent}</div>
      <div class="cardCost">${card.cost}</div>
      ${card.type === 'spell' ? '<div class="cardType">SPELL</div>' : ''}
      ${card.stolen ? '<div class="stolenBadge">👻</div>' : ''}
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

  // Calculate dynamic overlap based on card count - always fit in single row
  const cardCount = myHand.length;
  const containerWidth = 280; // usable width inside handSection
  const cardWidth = 68;
  
  const cards = handEl.querySelectorAll('.handCard');
  
  if (cardCount > 1) {
    // Calculate exact overlap needed to fit all cards in container
    // Formula: cardWidth + (cardCount - 1) * (cardWidth + marginLeft) = containerWidth
    // Solving for marginLeft: marginLeft = (containerWidth - cardWidth * cardCount) / (cardCount - 1)
    const marginLeft = (containerWidth - (cardWidth * cardCount)) / (cardCount - 1);
    
    cards.forEach((card, index) => {
      card.style.marginLeft = index === 0 ? '0px' : `${marginLeft}px`;
      // Each subsequent card has higher z-index so it overlaps the previous
      card.style.zIndex = index + 1;
    });
  } else {
    cards.forEach((card, index) => {
      card.style.zIndex = 1;
    });
  }

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

// Render opponent's hand (face-down cards), deck, and energy
function renderOpponentInfo(handCount, deckCount, energy, maxEnergy) {
  const opponentHandEl = document.getElementById("opponentHand");
  const opponentDeckCountEl = document.getElementById("opponentDeckCount");
  const opponentEnergyEl = document.getElementById("opponentEnergyLabel");
  const opponentNameEl = document.getElementById("opponentNameLabel");
  
  // Update opponent name from the existing enemy name element
  const enemyNameEl = document.getElementById("enemyName");
  if (opponentNameEl && enemyNameEl) {
    opponentNameEl.textContent = enemyNameEl.textContent || "Opponent";
  }
  
  // Update deck count
  if (opponentDeckCountEl) {
    opponentDeckCountEl.textContent = deckCount || 0;
  }
  
  // Update energy
  if (opponentEnergyEl) {
    opponentEnergyEl.textContent = `${energy || 0}/${maxEnergy || 10}`;
  }
  
  // Render face-down cards
  if (opponentHandEl) {
    opponentHandEl.innerHTML = "";
    
    // Calculate overlap for opponent cards (similar to player hand)
    const containerWidth = 250; // width of opponentHandSection minus padding
    const cardWidth = 40;
    let marginLeft = 0;
    
    if (handCount > 1) {
      const totalNeeded = handCount * cardWidth;
      if (totalNeeded > containerWidth) {
        marginLeft = (containerWidth - totalNeeded) / (handCount - 1);
      }
    }
    
    for (let i = 0; i < handCount; i++) {
      const card = document.createElement("div");
      card.className = "opponentCard";
      if (i > 0) {
        card.style.marginLeft = `${marginLeft}px`;
      }
      // Each subsequent card has higher z-index so it overlaps the previous
      card.style.zIndex = i + 1;
      opponentHandEl.appendChild(card);
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
    <div class="unitName">${u.name}</div>
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
      
      // Add stolen class for Soul Collector stolen units
      if (u.stolen) wrap.classList.add("stolen-unit");
      
      // Add untargetable class for burrowed/phantom units
      if (u.untargetable) wrap.classList.add("untargetable");
      
      // Add damage animation if this cell is being damaged
      const damageKey = `${sr}-${c}`;
      if (damagingCells.has(damageKey)) {
        wrap.classList.add("taking-damage");
      }
      
      // Calculate buffs
      const atkBuff = getAtkBuff(unitId);
      const atkBuffHtml = atkBuff > 0 ? `<span class="buff">+${atkBuff}</span>` : '';
      const hpBuffHtml = u.hpBuffed ? `<span class="buff">+1</span>` : '';
      
      // Art display
      const icon = CARD_ICONS[u.key] || '⚔️';
      const hasArt = u.art;
      const encodedArt = hasArt ? encodeURI(u.art) : '';
      const artStyle = hasArt ? `background: url('${encodedArt}') center/cover no-repeat` : '';
      const artContent = hasArt ? '' : icon;
      const effectBadge = ''; // Removed star badge
      
      // Shield overlay for untargetable units
      const shieldOverlay = u.untargetable ? '<div class="shield-overlay"><div class="shield-icon">🛡️</div></div>' : '';
      
      wrap.innerHTML = `
        <div class="unitArt" style="${artStyle}">${artContent}</div>
        ${effectBadge}
        ${shieldOverlay}
        <div class="unitInfoOverlay">
          <div class="unitName">${u.name}</div>
          <div class="unitStats">
            <div class="unitStat unitAtk"><span class="unitStatIcon">⚔</span>${u.atk}${atkBuffHtml}</div>
            <div class="unitStat unitHp"><span class="unitStatIcon">♥</span>${u.hp}${hpBuffHtml}</div>
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

  // Update turn counter
  const turnNumberEl = document.getElementById("turnNumber");
  if (turnNumberEl && S.turnNumber) {
    turnNumberEl.textContent = S.turnNumber;
  }

  // Update battery energy display
  updateBatteryDisplay(myEnergy);
  if (energyEl) energyEl.textContent = `${myEnergy}/10`;

  // Update active buffs display
  updateActiveBuffsDisplay();

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
    
    if (card.effect === "instant" && card.requiresTarget === "enemy_unit") {
      // Assimilation - target an enemy unit with 2 or less HP
      if (!occId || !S.units[occId] || S.units[occId].owner === myRole) {
        return log("Select an enemy unit.");
      }
      const target = S.units[occId];
      if (target.hp > 2) {
        return log("Target must have 2 or less HP.");
      }
      if (target.untargetable) {
        return log("That unit is untargetable.");
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
      // Castle Walls / Void Collapse - target a row
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
      
      // UFO Scraper can attack friendly units to absorb them
      const isAbsorbAttack = a && a.owner === myRole && a.effectId === "absorb_ally" && clickedUnit.owner === myRole;
      
      if (a && a.owner === myRole && (clickedUnit.owner !== myRole || isAbsorbAttack)) {
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
socket.on("combatLog", (data) => combatLog(data.msg, data.type));

// Handle animation events
socket.on("animate", (data) => {
  if (data.type === "move") {
    animateUnitMove(data.unitId, data.fromRow, data.fromCol, data.toRow, data.toCol);
  } else if (data.type === "destroy") {
    animateDestruction(data.row, data.col);
  } else if (data.type === "damage") {
    // Add to tracking set and let renderAll apply the class
    const key = `${data.row}-${data.col}`;
    damagingCells.add(key);
    // Remove after animation completes
    setTimeout(() => {
      damagingCells.delete(key);
    }, 500);
  }
});

// Animate unit taking damage - called from renderAll
function applyDamageAnimation(cell, serverRow, col) {
  const key = `${serverRow}-${col}`;
  if (damagingCells.has(key)) {
    const unitEl = cell.querySelector('.unit');
    if (unitEl) {
      unitEl.classList.add('taking-damage');
    }
  }
}

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
  const artStyle = hasArt ? `background: url('${unit.art}') center/cover no-repeat` : '';
  
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
    const artStyle = hasArt ? `background: url('${card.art}') center/cover no-repeat` : '';
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
  const artStyle = hasArt ? `background: url('${card.art}') center/cover no-repeat` : '';
  
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
  
  // Track previous hand counts for draw animation
  const prevMyHandCount = myHand ? myHand.length : 0;
  const prevEnemyHandCount = window.prevEnemyHandCount || 0;

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
    const newHandCount = Array.isArray(st.hand) ? st.hand.length : 0;
    
    // Detect player draw (hand count increased)
    if (newHandCount > prevMyHandCount && prevMyHandCount > 0) {
      animatePlayerDraw(newHandCount - prevMyHandCount);
    }
    
    myHand = Array.isArray(st.hand) ? st.hand : [];
    myDeckCount = st.deckCount ?? 0;
    myDiscardCount = st.discardCount ?? 0;
    myEnergy = st.energy ?? 0;
    myMaxEnergy = st.maxEnergy ?? 0;
    canDraw = !!st.canDraw;
    renderHand();
  }

  // Handle opponent info
  if (st.enemyHandCount !== undefined) {
    // Detect opponent draw (hand count increased)
    if (st.enemyHandCount > prevEnemyHandCount && prevEnemyHandCount > 0) {
      animateOpponentDraw(st.enemyHandCount - prevEnemyHandCount);
    }
    window.prevEnemyHandCount = st.enemyHandCount;
    
    renderOpponentInfo(st.enemyHandCount, st.enemyDeckCount, st.enemyEnergy, st.enemyMaxEnergy);
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

// Animate player drawing a card from deck to hand
function animatePlayerDraw(cardCount = 1) {
  const deckEl = document.getElementById("deckTile");
  const handEl = document.getElementById("handSection");
  const animationLayer = document.getElementById("cardAnimationLayer");
  
  if (!deckEl || !handEl || !animationLayer) return;
  
  const deckRect = deckEl.getBoundingClientRect();
  const handRect = handEl.getBoundingClientRect();
  
  for (let i = 0; i < cardCount; i++) {
    setTimeout(() => {
      const card = document.createElement("div");
      card.className = "draw-anim-card player-draw";
      card.innerHTML = '<div class="draw-card-back">?</div>';
      
      // Start at deck position
      card.style.left = deckRect.left + deckRect.width / 2 - 34 + 'px';
      card.style.top = deckRect.top + deckRect.height / 2 - 47 + 'px';
      
      animationLayer.appendChild(card);
      
      // Animate to hand
      requestAnimationFrame(() => {
        card.style.left = handRect.left + handRect.width / 2 - 34 + 'px';
        card.style.top = handRect.top + handRect.height / 2 - 47 + 'px';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.8)';
        
        setTimeout(() => card.remove(), 400);
      });
    }, i * 100);
  }
}

// Animate opponent drawing a card from deck to hand
function animateOpponentDraw(cardCount = 1) {
  const deckEl = document.getElementById("opponentDeckTile");
  const handEl = document.getElementById("opponentHandSection");
  const animationLayer = document.getElementById("cardAnimationLayer");
  
  if (!deckEl || !handEl || !animationLayer) return;
  
  const deckRect = deckEl.getBoundingClientRect();
  const handRect = handEl.getBoundingClientRect();
  
  for (let i = 0; i < cardCount; i++) {
    setTimeout(() => {
      const card = document.createElement("div");
      card.className = "draw-anim-card opponent-draw";
      card.innerHTML = '<div class="draw-card-back">?</div>';
      
      // Start at deck position
      card.style.left = deckRect.left + deckRect.width / 2 - 20 + 'px';
      card.style.top = deckRect.top + deckRect.height / 2 - 28 + 'px';
      
      animationLayer.appendChild(card);
      
      // Animate to hand
      requestAnimationFrame(() => {
        card.style.left = handRect.left + handRect.width / 2 - 20 + 'px';
        card.style.top = handRect.top + handRect.height / 2 - 28 + 'px';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.8)';
        
        setTimeout(() => card.remove(), 400);
      });
    }, i * 100);
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

// Enemy info display
socket.on("enemyInfo", (data) => {
  const enemyNameEl = document.getElementById("enemyName");
  if (enemyNameEl) {
    enemyNameEl.textContent = data.username || "Enemy";
    if (data.isAI) {
      enemyNameEl.classList.add("ai-opponent");
    }
  }
});

// Campaign victory - show rewards popup
socket.on("campaignVictory", (data) => {
  // Update local storage with new user data
  if (data.user) {
    localStorage.setItem('gridCardUser', JSON.stringify(data.user));
  }
  
  // Show victory popup
  showCampaignVictoryPopup(data);
});

function showCampaignVictoryPopup(data) {
  const popup = document.createElement("div");
  popup.className = "victory-popup";
  popup.innerHTML = `
    <div class="victory-content">
      <h2>🎉 Victory!</h2>
      <div class="victory-stars">
        ${[1,2,3].map(i => `<span class="victory-star ${i <= data.stars ? 'earned' : ''}">★</span>`).join('')}
      </div>
      <div class="victory-rewards">
        <h3>Cards Won</h3>
        <div class="slot-machine">
          <div class="slot-card" id="slot1">
            <div class="slot-spinner">?</div>
          </div>
          <div class="slot-card" id="slot2">
            <div class="slot-spinner">?</div>
          </div>
          <div class="slot-card" id="slot3">
            <div class="slot-spinner">?</div>
          </div>
        </div>
        ${data.rewards.music ? `<div class="reward-unlock" id="musicUnlock" style="opacity: 0;">🎵 Unlocked: ${data.rewards.music} music!</div>` : ''}
        ${data.rewards.background ? `<div class="reward-unlock" id="bgUnlock" style="opacity: 0;">🖼️ Unlocked: ${data.rewards.background} background!</div>` : ''}
      </div>
      <button class="victory-btn" id="victoryBtn" style="opacity: 0;" onclick="window.location.href='/home.html'">Continue</button>
    </div>
  `;
  
  // Add styles
  const style = document.createElement("style");
  style.textContent = `
    .victory-popup {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .victory-content {
      background: linear-gradient(145deg, rgba(30, 30, 60, 0.98), rgba(20, 20, 40, 0.98));
      border: 3px solid #fbbf24;
      border-radius: 20px;
      padding: 30px;
      text-align: center;
      max-width: 500px;
      animation: scaleIn 0.3s ease;
    }
    @keyframes scaleIn {
      from { transform: scale(0.8); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    .victory-content h2 {
      font-family: 'Cinzel', serif;
      font-size: 32px;
      color: #fbbf24;
      margin-bottom: 20px;
    }
    .victory-stars {
      font-size: 48px;
      margin-bottom: 20px;
    }
    .victory-star { color: #64748b; }
    .victory-star.earned { color: #fbbf24; text-shadow: 0 0 20px rgba(251, 191, 36, 0.8); }
    .victory-rewards h3 {
      font-family: 'Cinzel', serif;
      color: #a78bfa;
      margin-bottom: 15px;
    }
    .slot-machine {
      display: flex;
      justify-content: center;
      gap: 15px;
      margin-bottom: 20px;
    }
    .slot-card {
      width: 120px;
      height: 160px;
      background: linear-gradient(145deg, #1a1a2e, #16213e);
      border: 3px solid #64748b;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      position: relative;
    }
    .slot-spinner {
      font-size: 48px;
      color: #64748b;
    }
    .slot-card.spinning .slot-spinner {
      animation: slotSpin 0.1s linear infinite;
    }
    @keyframes slotSpin {
      0% { transform: translateY(-20px); opacity: 0.5; }
      50% { transform: translateY(0); opacity: 1; }
      100% { transform: translateY(20px); opacity: 0.5; }
    }
    .slot-card.revealed {
      border-color: #fbbf24;
      box-shadow: 0 0 20px rgba(251, 191, 36, 0.6);
      animation: slotReveal 0.5s ease;
    }
    /* Common reveal - simple gold border */
    .slot-card.revealed.common {
      border-color: #9ca3af;
      box-shadow: 0 0 15px rgba(156, 163, 175, 0.5);
    }
    /* Rare reveal - blue glow with pulse */
    .slot-card.revealed.rare {
      border-color: #3b82f6;
      box-shadow: 0 0 25px rgba(59, 130, 246, 0.8), 0 0 50px rgba(59, 130, 246, 0.4);
      animation: slotReveal 0.5s ease, rareGlow 1.5s ease-in-out infinite;
    }
    @keyframes rareGlow {
      0%, 100% { box-shadow: 0 0 25px rgba(59, 130, 246, 0.8), 0 0 50px rgba(59, 130, 246, 0.4); }
      50% { box-shadow: 0 0 35px rgba(59, 130, 246, 1), 0 0 70px rgba(59, 130, 246, 0.6); }
    }
    /* Legendary reveal - EPIC rainbow shimmer with particles */
    .slot-card.revealed.legendary {
      border-color: #fbbf24;
      animation: slotReveal 0.5s ease, legendaryGlow 2s ease-in-out infinite, legendaryBorder 3s linear infinite;
      position: relative;
    }
    .slot-card.revealed.legendary::before {
      content: '';
      position: absolute;
      inset: -4px;
      background: linear-gradient(45deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3, #ff0000);
      background-size: 400% 400%;
      border-radius: 12px;
      z-index: -1;
      animation: legendaryRainbow 2s linear infinite;
      filter: blur(8px);
    }
    .slot-card.revealed.legendary::after {
      content: '✦';
      position: absolute;
      top: -10px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 24px;
      color: #fbbf24;
      text-shadow: 0 0 10px #fbbf24, 0 0 20px #fbbf24, 0 0 30px #ff8c00;
      animation: legendarySparkle 0.5s ease-in-out infinite alternate;
    }
    @keyframes legendaryGlow {
      0%, 100% { 
        box-shadow: 0 0 30px rgba(251, 191, 36, 0.9), 
                    0 0 60px rgba(251, 191, 36, 0.6),
                    0 0 90px rgba(255, 140, 0, 0.4),
                    inset 0 0 30px rgba(251, 191, 36, 0.2);
      }
      50% { 
        box-shadow: 0 0 50px rgba(251, 191, 36, 1), 
                    0 0 100px rgba(251, 191, 36, 0.8),
                    0 0 150px rgba(255, 140, 0, 0.6),
                    inset 0 0 50px rgba(251, 191, 36, 0.3);
      }
    }
    @keyframes legendaryRainbow {
      0% { background-position: 0% 50%; }
      100% { background-position: 400% 50%; }
    }
    @keyframes legendaryBorder {
      0%, 100% { border-color: #fbbf24; }
      25% { border-color: #ff8c00; }
      50% { border-color: #ff6b6b; }
      75% { border-color: #ffd700; }
    }
    @keyframes legendarySparkle {
      0% { transform: translateX(-50%) scale(1) rotate(0deg); opacity: 1; }
      100% { transform: translateX(-50%) scale(1.3) rotate(15deg); opacity: 0.8; }
    }
    /* Legendary particles */
    .legendary-particles {
      position: absolute;
      inset: 0;
      pointer-events: none;
      overflow: hidden;
      border-radius: 10px;
    }
    .legendary-particles span {
      position: absolute;
      width: 6px;
      height: 6px;
      background: #fbbf24;
      border-radius: 50%;
      animation: particle 1.5s ease-in-out infinite;
      box-shadow: 0 0 6px #fbbf24, 0 0 12px #ff8c00;
    }
    .legendary-particles span:nth-child(1) { left: 10%; animation-delay: 0s; }
    .legendary-particles span:nth-child(2) { left: 30%; animation-delay: 0.2s; }
    .legendary-particles span:nth-child(3) { left: 50%; animation-delay: 0.4s; }
    .legendary-particles span:nth-child(4) { left: 70%; animation-delay: 0.6s; }
    .legendary-particles span:nth-child(5) { left: 90%; animation-delay: 0.8s; }
    @keyframes particle {
      0%, 100% { bottom: 0; opacity: 0; transform: scale(0); }
      10% { opacity: 1; transform: scale(1); }
      90% { opacity: 1; }
      100% { bottom: 100%; opacity: 0; transform: scale(0.5); }
    }
    /* Rarity label */
    .rarity-label {
      position: absolute;
      top: 5px;
      right: 5px;
      font-size: 8px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      font-family: 'Cinzel', serif;
    }
    .rarity-label.common { background: #4b5563; color: #e5e7eb; }
    .rarity-label.rare { background: #1d4ed8; color: #bfdbfe; text-shadow: 0 0 5px #3b82f6; }
    .rarity-label.legendary { 
      background: linear-gradient(135deg, #f59e0b, #fbbf24); 
      color: #1a1a2e; 
      text-shadow: none;
      animation: legendaryLabelPulse 1s ease-in-out infinite;
    }
    @keyframes legendaryLabelPulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }
    @keyframes slotReveal {
      0% { transform: scale(1.2); }
      50% { transform: scale(0.9); }
      100% { transform: scale(1); }
    }
    .slot-card .card-reveal {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      width: 100%;
      height: 100%;
    }
    .card-reveal .card-art {
      flex: 1;
      background-size: cover;
      background-position: center;
      background-color: rgba(139, 92, 246, 0.3);
    }
    .card-reveal .card-info {
      background: linear-gradient(to top, rgba(15, 15, 35, 1), rgba(15, 15, 35, 0.9));
      padding: 8px;
      text-align: center;
    }
    .card-reveal .card-name {
      font-size: 10px;
      color: #fbbf24;
      font-weight: 700;
      text-transform: uppercase;
      font-family: 'Cinzel', serif;
    }
    .reward-unlock {
      color: #4ade80;
      font-size: 14px;
      margin-top: 10px;
      transition: opacity 0.5s ease;
    }
    .victory-btn {
      margin-top: 20px;
      padding: 12px 30px;
      background: linear-gradient(135deg, #fbbf24, #f59e0b);
      border: none;
      border-radius: 10px;
      font-family: 'Cinzel', serif;
      font-size: 16px;
      font-weight: 700;
      color: #1a1a2e;
      cursor: pointer;
      transition: all 0.3s ease;
    }
    .victory-btn:hover { transform: translateY(-2px); box-shadow: 0 4px 20px rgba(251, 191, 36, 0.4); }
  `;
  document.head.appendChild(style);
  document.body.appendChild(popup);
  
  // Card name mapping
  const cardNames = {
    'voiddrone': 'Void Drone',
    'scavengerlarva': 'Scavenger Larva', 
    'spittercrawler': 'Spitter Crawler',
    'phaseskirmisher': 'Phase Skirmisher',
    'energyleech': 'Energy Leech',
    'burrowerbeast': 'Burrower Beast',
    'psionicoverseer': 'Psionic Overseer',
    'neuralharvester': 'Neural Harvester',
    'adaptivecolossus': 'Adaptive Colossus',
    'sporetitan': 'Spore Titan',
    'voidbroodmother': 'Void Broodmother',
    'eclipsedevourer': 'Eclipse Devourer',
    'ufoscraper': 'UFO Scraper',
    'assimilation': 'Assimilation',
    'voidcollapse': 'Void Collapse',
    'hiveascension': 'Hive Ascension',
    // Western Skeleton cards
    'bonedeputy': 'Bone Deputy',
    'dustyrattler': 'Dusty Rattler',
    'graverobber': 'Grave Robber',
    'phantomscout': 'Phantom Scout',
    'bonerevolver': 'Bone Revolver',
    'undeadsheriff': 'Undead Sheriff',
    'coffintrapper': 'Coffin Trapper',
    'undertaker': 'Undertaker',
    'thehangedman': 'The Hanged Man',
    'ghostlystampede': 'Ghostly Stampede',
    'bonecolossus': 'Bone Colossus',
    'deadmanshand': 'Dead Mans Hand',
    'mostwanted': 'Most Wanted',
    'shallowgrave': 'Shallow Grave',
    'highnoon': 'High Noon',
    // Crimson Court cards
    'thrall': 'Thrall',
    'bloodfamiliar': 'Blood Familiar',
    'nightstalker': 'Nightstalker',
    'cryptkeeper': 'Crypt Keeper',
    'vampirespawn': 'Vampire Spawn',
    'bloodpriest': 'Blood Priest',
    'soulcollector': 'Soul Collector',
    'nosferatu': 'Nosferatu',
    'coffin': 'Coffin',
    'bloodcountess': 'Blood Countess',
    'eldervampire': 'Elder Vampire',
    'vampirelord': 'Vampire Lord',
    'bloodpact': 'Blood Pact',
    'bloodtransfusion': 'Blood Transfusion',
    'crimsonrevival': 'Crimson Revival',
    'sanguinefeast': 'Sanguine Feast'
  };
  
  // Slot machine reveal animation
  const slots = [
    document.getElementById('slot1'),
    document.getElementById('slot2'),
    document.getElementById('slot3')
  ];
  
  // Start spinning all slots
  slots.forEach(slot => slot.classList.add('spinning'));
  
  // Card art paths (matching server definitions)
  const cardArtPaths = {
    'voiddrone': '/images/Void Drone.png',
    'scavengerlarva': '/images/Scavenger Larva.png', 
    'spittercrawler': '/images/Spitter Crawler.png',
    'phaseskirmisher': '/images/Phase Skirmisher.png',
    'energyleech': '/images/Energy Leech.png',
    'burrowerbeast': '/images/Burrower Beast.png',
    'psionicoverseer': '/images/Psionic Overseer.png',
    'neuralharvester': '/images/Neural Harvester.png',
    'adaptivecolossus': '/images/Adaptive Colossus.png',
    'sporetitan': '/images/Spore Titan.png',
    'voidbroodmother': '/images/Void Broodmother.png',
    'eclipsedevourer': '/images/Eclipse Devourer.png',
    'ufoscraper': '/images/UFO Scraper.png',
    'assimilation': '/images/Assimilation.png',
    'voidcollapse': '/images/Void Collapse.png',
    'hiveascension': '/images/Hive Ascension.png',
    // Western Skeleton cards
    'bonedeputy': '/images/Bone Deputy.png',
    'dustyrattler': '/images/Dusty Rattler.png',
    'graverobber': '/images/Grave Robber.png',
    'phantomscout': '/images/Phantom Scout.png',
    'bonerevolver': '/images/Bone Revolver.png',
    'undeadsheriff': '/images/Undead Sheriff.png',
    'coffintrapper': '/images/Coffin Trapper.png',
    'undertaker': '/images/Undertaker.png',
    'thehangedman': '/images/The Hanged Man.png',
    'ghostlystampede': '/images/Ghostly Stampede.png',
    'bonecolossus': '/images/Bone Colossus.png',
    'deadmanshand': '/images/Dead Mans Hand.png',
    'mostwanted': '/images/Most Wanted.png',
    'shallowgrave': '/images/Shallow Grave.png',
    'highnoon': '/images/High Noon.png',
    // Crimson Court cards
    'thrall': '/images/Thrall.png',
    'bloodfamiliar': '/images/Blood Familiar.png',
    'nightstalker': '/images/Nightstalker.png',
    'cryptkeeper': '/images/Crypt Keeper.png',
    'vampirespawn': '/images/Vampire Spawn.png',
    'bloodpriest': '/images/Blood Priest.png',
    'soulcollector': '/images/Soul Collector.png',
    'nosferatu': '/images/Nosferatu.png',
    'coffin': '/images/Coffin.png',
    'bloodcountess': '/images/Blood Countess.png',
    'eldervampire': '/images/Elder Vampire.png',
    'vampirelord': '/images/Vampire Lord.png',
    'bloodpact': '/images/Blood Pact.png',
    'bloodtransfusion': '/images/Blood Transfusion.png',
    'crimsonrevival': '/images/Crimson Revival.png',
    'sanguinefeast': '/images/Sanguine Feast.png'
  };
  
  // Card rarities for visual effects
  const cardRarities = {
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
    // Crimson Court
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
  
  // Reveal cards one by one with delays
  data.rewards.cards.forEach((card, index) => {
    setTimeout(() => {
      const slot = slots[index];
      const rarity = cardRarities[card] || 'common';
      
      slot.classList.remove('spinning');
      slot.classList.add('revealed', rarity);
      
      // Use actual card art image - encode URL for spaces
      const artPath = encodeURI(cardArtPaths[card] || `/images/${card}.png`);
      
      // Build particles HTML for legendary
      const particlesHtml = rarity === 'legendary' ? `
        <div class="legendary-particles">
          <span></span><span></span><span></span><span></span><span></span>
        </div>
      ` : '';
      
      slot.innerHTML = `
        ${particlesHtml}
        <div class="card-reveal">
          <div class="card-art" style="background-image: url('${artPath}')"></div>
          <div class="card-info">
            <div class="card-name">${cardNames[card] || card}</div>
          </div>
        </div>
        <div class="rarity-label ${rarity}">${rarity}</div>
      `;
      
      // Play a sound effect (optional - just visual for now)
    }, 1000 + (index * 800)); // 1s initial delay, then 0.8s between each
  });
  
  // Show unlocks after cards
  setTimeout(() => {
    const musicUnlock = document.getElementById('musicUnlock');
    const bgUnlock = document.getElementById('bgUnlock');
    if (musicUnlock) musicUnlock.style.opacity = '1';
    if (bgUnlock) bgUnlock.style.opacity = '1';
  }, 3800);
  
  // Show continue button after everything
  setTimeout(() => {
    document.getElementById('victoryBtn').style.opacity = '1';
  }, 4200);
}

// Handle errors (disconnection, etc)
socket.on("lobbyError", (msg) => {
  alert(msg);
  window.location.href = "/home.html";
});