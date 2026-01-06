const socket = io();
const boardEl = document.getElementById("board");
const logEl = document.getElementById("log");
const combatLogEl = document.getElementById("combatLog");

const endTurnBtn = document.getElementById("endTurnBtn");
const turnLabelEl = document.getElementById("turnLabel");
const energyEl = document.getElementById("energyLabel");

const handEl = document.getElementById("hand");
const deckCountEl = document.getElementById("deckCount");
const discardPileCountEl = document.getElementById("discardPileCount");
const drawBtn = document.getElementById("drawBtn");
const discardPileEl = document.getElementById("discardPile");
const discardTooltipEl = document.getElementById("discardTooltip");

// Opponent discard pile elements
const opponentDiscardPileEl = document.getElementById("opponentDiscardPile");
const opponentDiscardCountEl = document.getElementById("opponentDiscardCount");
const opponentDiscardTooltipEl = document.getElementById("opponentDiscardTooltip");

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
const musicMuteBtn = document.getElementById("musicMuteBtn");
const musicSlider = document.getElementById("musicSlider");
const sfxMuteBtn = document.getElementById("sfxMuteBtn");
const sfxSlider = document.getElementById("sfxSlider");

let isMusicMuted = false;
let isSfxMuted = false;
let myDeckId = null;
let enemyDeckId = null;

// Audio setup
function setupAudio(deckId) {
  if (!bgMusic || !deckId) return;
  
  const audioSrc = `/audio/${deckId}-theme.mp3`;
  
  // Only change source if different
  if (bgMusic.src !== window.location.origin + audioSrc) {
    bgMusic.src = audioSrc;
    bgMusic.volume = (musicSlider?.value || 30) / 100;
    
    // Try to play (may be blocked by browser autoplay policy)
    bgMusic.play().catch(e => {
      console.log("Autoplay blocked - click anywhere to start music");
      // Add one-time click listener to start music
      document.addEventListener('click', startMusicOnInteraction, { once: true });
    });
  }
}

function startMusicOnInteraction() {
  if (bgMusic && myDeckId && !isMusicMuted) {
    bgMusic.play().catch(e => console.log("Could not play audio"));
  }
}

// Music mute button handler
if (musicMuteBtn) {
  musicMuteBtn.addEventListener('click', () => {
    isMusicMuted = !isMusicMuted;
    if (bgMusic) {
      bgMusic.muted = isMusicMuted;
    }
    musicMuteBtn.textContent = isMusicMuted ? '🔇' : '🔊';
    musicMuteBtn.classList.toggle('muted', isMusicMuted);
  });
}

// Music volume slider handler
if (musicSlider) {
  musicSlider.addEventListener('input', (e) => {
    if (bgMusic) {
      bgMusic.volume = e.target.value / 100;
    }
  });
}

// SFX mute button handler
if (sfxMuteBtn) {
  sfxMuteBtn.addEventListener('click', () => {
    isSfxMuted = !isSfxMuted;
    sfxMuteBtn.textContent = isSfxMuted ? '🔇' : '🔊';
    sfxMuteBtn.classList.toggle('muted', isSfxMuted);
  });
}

// SFX volume slider handler - value used in playSFX function
if (sfxSlider) {
  sfxSlider.addEventListener('input', (e) => {
    // Volume is read directly from slider in playSFX
  });
}

// ==================== SFX SOUND SYSTEM ====================
const SFX_VOLUME = 0.5; // SFX volume (0-1)

// Sounds that should be played louder (1.5x volume boost)
const BOOSTED_SOUNDS = ['move', 'draw'];

// Sound file mapping - all mp3 format unless noted
const SOUND_FILES = {
  // Universal sounds
  move: '/audio/sfx/move.mp3',
  draw: '/audio/sfx/draw.mp3',
  
  // Deck attack sounds
  sword: '/audio/sfx/sword.mp3',      // Medieval
  gunshot: '/audio/sfx/gunshot.mp3',  // Western Skeleton
  slash: '/audio/sfx/slash.mp3',      // Crimson Vampire
  twinkle: '/audio/sfx/twinkle.mp3',  // Gem Fairies
  laser: '/audio/sfx/laser.mp3',      // Aliens
  retro: '/audio/sfx/retro.mp3',      // 8-Bit Battalion
  
  // Boss event sounds (wav for seamless looping)
  siren: '/audio/sfx/siren.wav',      // Void collapse countdown (loopable)
  hum: '/audio/sfx/hum.wav',          // Black hole warning (loopable)
  implosion: '/audio/sfx/implosion.mp3', // Black hole explosion
  
  // Lottery sounds
  lotterySpin: '/audio/sfx/lottery-spin.mp3',
  lotteryWin: '/audio/sfx/lottery-win.mp3',
  lotteryWinLegendary: '/audio/sfx/lottery-win-legendary.mp3',
};

// Universal sounds for all cards
const UNIVERSAL_SOUNDS = {
  deploy: 'move',  // All card deployments use move.mp3
  draw: 'draw'     // All draws use draw.mp3
};

// Deck-based attack sounds - all units in a deck use the same attack sound
const DECK_ATTACK_SOUNDS = {
  medieval: 'sword',
  skeleton: 'gunshot',
  vampire: 'slash',
  fairy: 'twinkle',
  alien: 'laser',
  '8bit': 'retro',
};

// Audio cache for preloaded sounds
const audioCache = {};

// Sounds that should have fade in/out
const FADE_SOUNDS = ['warcry', 'trumpet'];
const FADE_DURATION = 150; // ms for fade in/out

// Start time offsets for sounds with silence at the beginning (in seconds)
const SOUND_START_OFFSETS = {
  magic: 0.15,  // Skip first 150ms of silence
  // Add more sounds here if needed: soundName: offsetInSeconds
};

// Preload all SFX sounds
function preloadSFX() {
  Object.entries(SOUND_FILES).forEach(([name, path]) => {
    const audio = new Audio(path);
    audio.preload = 'auto';
    audio.volume = SFX_VOLUME;
    audioCache[name] = audio;
  });
}

// Play a sound effect with optional fade
function playSFX(soundName) {
  console.log("[SFX] playSFX called:", soundName, "isSfxMuted:", isSfxMuted);
  if (isSfxMuted) return;
  
  const cachedAudio = audioCache[soundName];
  console.log("[SFX] cachedAudio:", cachedAudio ? "found" : "NOT FOUND");
  if (cachedAudio) {
    // Clone the audio to allow overlapping sounds
    const sound = cachedAudio.cloneNode();
    let targetVolume = (sfxSlider?.value || 50) / 100;
    
    // Apply 50% volume boost for move/draw sounds
    if (BOOSTED_SOUNDS.includes(soundName)) {
      targetVolume = Math.min(targetVolume * 1.5, 1.0);
    }
    
    const shouldFade = FADE_SOUNDS.includes(soundName);
    const startOffset = SOUND_START_OFFSETS[soundName] || 0;
    
    // Apply start offset to skip silence at beginning
    if (startOffset > 0) {
      sound.currentTime = startOffset;
    }
    
    if (shouldFade) {
      // Start at 0 volume and fade in
      sound.volume = 0;
      sound.play().catch(e => console.log("SFX blocked:", e));
      
      // Fade in
      const fadeInInterval = setInterval(() => {
        if (sound.volume < targetVolume - 0.05) {
          sound.volume = Math.min(sound.volume + 0.1, targetVolume);
        } else {
          sound.volume = targetVolume;
          clearInterval(fadeInInterval);
        }
      }, FADE_DURATION / 10);
      
      // Set up fade out near the end
      sound.addEventListener('timeupdate', function fadeOutHandler() {
        if (sound.duration - sound.currentTime < FADE_DURATION / 1000) {
          const fadeOutInterval = setInterval(() => {
            if (sound.volume > 0.05) {
              sound.volume = Math.max(sound.volume - 0.1, 0);
            } else {
              sound.volume = 0;
              clearInterval(fadeOutInterval);
            }
          }, FADE_DURATION / 10);
          sound.removeEventListener('timeupdate', fadeOutHandler);
        }
      });
    } else {
      // Play normally without fade
      sound.volume = targetVolume;
      console.log("[SFX] Playing sound at volume:", sound.volume);
      sound.play().catch(e => console.log("SFX blocked:", e));
    }
  }
}

// Play a looping sound effect (returns the audio element so it can be stopped)
function playLoopingSFX(soundName) {
  console.log("[SFX] playLoopingSFX called:", soundName, "isSfxMuted:", isSfxMuted);
  if (isSfxMuted) return null;
  
  const path = SOUND_FILES[soundName];
  if (path) {
    // Create fresh audio element for seamless looping
    const sound = new Audio(path);
    sound.volume = (sfxSlider?.value || 50) / 100;
    
    // Restart immediately when ended
    sound.addEventListener('ended', function() {
      sound.currentTime = 0;
      sound.play().catch(e => console.log("SFX loop blocked:", e));
    });
    
    sound.play().catch(e => console.log("SFX blocked:", e));
    return sound;
  }
  return null;
}

// Stop a looping sound with fade out
function stopLoopingSound(sound) {
  if (!sound) return;
  
  // Fade out over 300ms
  const fadeOutInterval = setInterval(() => {
    if (sound.volume > 0.05) {
      sound.volume = Math.max(sound.volume - 0.1, 0);
    } else {
      sound.volume = 0;
      sound.pause();
      clearInterval(fadeOutInterval);
    }
  }, 30);
}

// Play sound for a card action
function playCardSound(cardKey, action, archetype) {
  console.log("[SFX] playCardSound:", cardKey, action, "archetype:", archetype);
  
  // Deploy - universal sound for all cards
  if (action === 'deploy') {
    console.log("[SFX] Playing deploy sound");
    playSFX(UNIVERSAL_SOUNDS.deploy);
    return;
  }
  
  // Attack - archetype-based sounds
  if (action === 'attack' && archetype) {
    const deckSound = DECK_ATTACK_SOUNDS[archetype];
    if (deckSound) {
      console.log("[SFX] Playing archetype attack sound:", deckSound, "for archetype:", archetype);
      playSFX(deckSound);
      return;
    }
  }
  
  console.log("[SFX] No sound found for:", cardKey, action, archetype);
}

// Initialize SFX on page load
preloadSFX();
console.log("[SFX] Preloaded sounds:", Object.keys(audioCache));

// Listen for sound events from server
socket.on("sfx", (data) => {
  console.log("[SFX] Received sfx event:", data);
  if (data.sound) {
    playSFX(data.sound);
  } else if (data.cardKey && data.action) {
    playCardSound(data.cardKey, data.action, data.archetype);
  }
});

// ==================== END SFX SOUND SYSTEM ====================

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
const isCampaign = urlParams.get('campaign') === '1';
const bossName = urlParams.get('boss');
const bossId = urlParams.get('bossId');
const canAutoPlay = urlParams.get('canAutoPlay') === '1';

// Set boss-specific background if in campaign mode
if (isCampaign && bossId) {
  document.body.classList.add('boss-bg');
  document.body.style.backgroundImage = `url('/images/backgrounds/boss-${bossId}-bg.png')`;
}

// Show auto-play toggle if eligible (campaign mode and has beaten this boss)
let autoPlaySpeed = 1; // 1 = normal, 2 = fast

if (canAutoPlay && isCampaign) {
  const autoPlayToggle = document.getElementById("autoPlayToggle");
  const autoPlayCheckbox = document.getElementById("autoPlayCheckbox");
  const autoPlayIcon = document.getElementById("autoPlayIcon");
  
  if (autoPlayToggle && autoPlayCheckbox) {
    autoPlayToggle.style.display = "flex";
    
    // Handle toggle changes
    autoPlayCheckbox.addEventListener("change", () => {
      const enabled = autoPlayCheckbox.checked;
      socket.emit("toggleAutoPlay", { enabled, speed: autoPlaySpeed });
      
      // Update tooltip and visual state
      updateAutoPlayVisuals(enabled);
    });
    
    // Click on robot icon to toggle speed (only when auto-play is on)
    if (autoPlayIcon) {
      autoPlayIcon.addEventListener("click", (e) => {
        e.stopPropagation(); // Don't trigger checkbox
        if (autoPlayCheckbox.checked) {
          autoPlaySpeed = autoPlaySpeed === 1 ? 2 : 1;
          socket.emit("setAutoPlaySpeed", { speed: autoPlaySpeed });
          updateAutoPlayVisuals(true);
        }
      });
      
      // Double-click anywhere on toggle for speed change
      autoPlayToggle.addEventListener("dblclick", (e) => {
        if (autoPlayCheckbox.checked) {
          e.preventDefault();
          autoPlaySpeed = autoPlaySpeed === 1 ? 2 : 1;
          socket.emit("setAutoPlaySpeed", { speed: autoPlaySpeed });
          updateAutoPlayVisuals(true);
        }
      });
    }
  }
}

function updateAutoPlayVisuals(enabled) {
  const autoPlayToggle = document.getElementById("autoPlayToggle");
  if (!autoPlayToggle) return;
  
  const speedText = autoPlaySpeed === 2 ? " (2x Speed)" : "";
  autoPlayToggle.title = enabled ? `Auto-Play: On${speedText}` : "Auto-Play: Off";
  
  if (enabled) {
    autoPlayToggle.classList.add("active");
    if (autoPlaySpeed === 2) {
      autoPlayToggle.classList.add("fast");
    } else {
      autoPlayToggle.classList.remove("fast");
    }
  } else {
    autoPlayToggle.classList.remove("active", "fast");
  }
}

// Listen for auto-play status updates from server
socket.on("autoPlayStatus", (data) => {
  const autoPlayToggle = document.getElementById("autoPlayToggle");
  const autoPlayCheckbox = document.getElementById("autoPlayCheckbox");
  
  if (autoPlayToggle && autoPlayCheckbox) {
    autoPlayCheckbox.checked = data.enabled;
    if (data.speed) {
      autoPlaySpeed = data.speed;
    }
    updateAutoPlayVisuals(data.enabled);
  }
});

// Set enemy name from URL params (for campaign mode)
if (bossName) {
  const enemyNameEl = document.getElementById("enemyName");
  if (enemyNameEl) {
    enemyNameEl.textContent = bossName;
    enemyNameEl.classList.add("ai-opponent");
  }
}

// Get custom music and background from URL (from deck builder settings)
const customMusic = urlParams.get('music');
const customBackground = urlParams.get('background');
const firstTimeBoss = urlParams.get('firstTimeBoss') === '1';
const bossMusic = urlParams.get('bossMusic');

// Determine which music to use: 
// - First time boss fight = boss's music (forced)
// - Otherwise = custom setting or default to deck theme
function getMusicDeckId() {
  // First time fighting this boss - play boss's theme
  if (firstTimeBoss && bossMusic) {
    return bossMusic;
  }
  // Otherwise use player's custom music setting
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

// Discard pile hover tooltip
if (discardPileEl && discardTooltipEl) {
  discardPileEl.addEventListener("mouseenter", (e) => {
    showDiscardTooltip(e);
  });
  
  discardPileEl.addEventListener("mousemove", (e) => {
    positionDiscardTooltip(e);
  });
  
  discardPileEl.addEventListener("mouseleave", () => {
    discardTooltipEl.classList.remove("visible");
  });
}

function showDiscardTooltip(e) {
  if (!myDiscard || myDiscard.length === 0) {
    discardTooltipEl.innerHTML = `
      <div class="discard-tooltip-title">Discard Pile</div>
      <div class="discard-tooltip-empty">No cards in discard</div>
    `;
  } else {
    // Count cards by name
    const cardCounts = {};
    myDiscard.forEach(card => {
      const name = card.name;
      if (!cardCounts[name]) {
        cardCounts[name] = { count: 0, cost: card.cost };
      }
      cardCounts[name].count++;
    });
    
    // Sort by cost
    const sortedCards = Object.entries(cardCounts).sort((a, b) => a[1].cost - b[1].cost);
    
    let cardsHtml = sortedCards.map(([name, info]) => `
      <div class="discard-tooltip-card">
        <span class="discard-tooltip-card-cost">${info.cost}</span>
        <span class="discard-tooltip-card-name">${name}</span>
        ${info.count > 1 ? `<span class="discard-tooltip-card-count">x${info.count}</span>` : ''}
      </div>
    `).join('');
    
    discardTooltipEl.innerHTML = `
      <div class="discard-tooltip-title">Discard Pile (${myDiscard.length})</div>
      ${cardsHtml}
    `;
  }
  
  discardTooltipEl.classList.add("visible");
  positionDiscardTooltip(e);
}

function positionDiscardTooltip(e) {
  const tooltip = discardTooltipEl;
  const padding = 15;
  
  let x = e.clientX + padding;
  let y = e.clientY + padding;
  
  // Keep tooltip on screen
  const rect = tooltip.getBoundingClientRect();
  if (x + rect.width > window.innerWidth) {
    x = e.clientX - rect.width - padding;
  }
  if (y + rect.height > window.innerHeight) {
    y = e.clientY - rect.height - padding;
  }
  
  tooltip.style.left = x + "px";
  tooltip.style.top = y + "px";
}

// Opponent discard pile hover tooltip
let enemyDiscard = [];

if (opponentDiscardPileEl && opponentDiscardTooltipEl) {
  opponentDiscardPileEl.addEventListener("mouseenter", (e) => {
    showOpponentDiscardTooltip(e);
  });
  
  opponentDiscardPileEl.addEventListener("mousemove", (e) => {
    positionOpponentDiscardTooltip(e);
  });
  
  opponentDiscardPileEl.addEventListener("mouseleave", () => {
    opponentDiscardTooltipEl.classList.remove("visible");
  });
}

function showOpponentDiscardTooltip(e) {
  if (!enemyDiscard || enemyDiscard.length === 0) {
    opponentDiscardTooltipEl.innerHTML = `
      <div class="discard-tooltip-title">Opponent Discard</div>
      <div class="discard-tooltip-empty">No cards in discard</div>
    `;
  } else {
    // Count cards by name
    const cardCounts = {};
    enemyDiscard.forEach(card => {
      const name = card.name;
      if (!cardCounts[name]) {
        cardCounts[name] = { count: 0, cost: card.cost };
      }
      cardCounts[name].count++;
    });
    
    // Sort by cost
    const sortedCards = Object.entries(cardCounts).sort((a, b) => a[1].cost - b[1].cost);
    
    let cardsHtml = sortedCards.map(([name, info]) => `
      <div class="discard-tooltip-card">
        <span class="discard-tooltip-card-cost">${info.cost}</span>
        <span class="discard-tooltip-card-name">${name}</span>
        ${info.count > 1 ? `<span class="discard-tooltip-card-count">x${info.count}</span>` : ''}
      </div>
    `).join('');
    
    opponentDiscardTooltipEl.innerHTML = `
      <div class="discard-tooltip-title">Opponent Discard (${enemyDiscard.length})</div>
      ${cardsHtml}
    `;
  }
  
  opponentDiscardTooltipEl.classList.add("visible");
  positionOpponentDiscardTooltip(e);
}

function positionOpponentDiscardTooltip(e) {
  const tooltip = opponentDiscardTooltipEl;
  const padding = 15;
  
  let x = e.clientX + padding;
  let y = e.clientY + padding;
  
  // Keep tooltip on screen
  const rect = tooltip.getBoundingClientRect();
  if (x + rect.width > window.innerWidth) {
    x = e.clientX - rect.width - padding;
  }
  if (y + rect.height > window.innerHeight) {
    y = e.clientY - rect.height - padding;
  }
  
  tooltip.style.left = x + "px";
  tooltip.style.top = y + "px";
}

// Rejoin lobby when connected
socket.on('connect', () => {
  console.log(`[SOCKET] Connected! Socket ID: ${socket.id}`);
  if (lobbyCode) {
    console.log(`[SOCKET] Attempting to rejoin lobby: ${lobbyCode}, isHost: ${isHost}`);
    socket.emit('rejoinGame', { code: lobbyCode, isHost: isHost });
  } else {
    console.log(`[SOCKET] No lobby code found in URL`);
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
  const hpBuff = getHpBuff(unitId);
  
  // Special handling for Final Boss rage mode - show in purple
  const isRageMode = u.effectId === "rage_mode" && atkBuff > 0;
  const atkClass = isRageMode ? "atk rage" : "atk";
  const atkLabel = isRageMode ? `⚔ ATK (RAGE!)` : `⚔ ATK${atkBuff > 0 ? ` (+${atkBuff})` : ''}`;
  
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
            <div class="tooltip-stat-value ${atkClass}">${effectiveAtk}</div>
            <div class="tooltip-stat-label">${atkLabel}</div>
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

// Chalice tooltip
let chaliceTooltipEl = null;

function showChaliceTooltip(x, y) {
  if (!chaliceTooltipEl) {
    chaliceTooltipEl = document.createElement('div');
    chaliceTooltipEl.className = 'chalice-tooltip';
    document.body.appendChild(chaliceTooltipEl);
  }
  
  chaliceTooltipEl.innerHTML = `
    <div class="chalice-tooltip-image">
      <img src="/images/blood-chalice.png" alt="Blood Chalice">
    </div>
    <div class="chalice-tooltip-text">"To drink, or not to drink..."</div>
  `;
  
  positionChaliceTooltip(x, y);
  chaliceTooltipEl.classList.add("visible");
}

function positionChaliceTooltip(x, y) {
  if (!chaliceTooltipEl) return;
  const padding = 15;
  let left = x + padding;
  let top = y + padding;
  
  if (left + 220 > window.innerWidth) left = x - 220 - padding;
  if (top + 150 > window.innerHeight) top = y - 150 - padding;
  if (left < 0) left = padding;
  if (top < 0) top = padding;
  
  chaliceTooltipEl.style.left = left + "px";
  chaliceTooltipEl.style.top = top + "px";
}

function hideChaliceTooltip() {
  if (chaliceTooltipEl) chaliceTooltipEl.classList.remove("visible");
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
    .replace(/Row ([A-E])/g, 'Row <span class="log-row">$1</span>')
    // Gem colors
    .replace(/\bRuby\b/gi, '<span class="gem-ruby">Ruby</span>')
    .replace(/\bEmerald\b/gi, '<span class="gem-emerald">Emerald</span>')
    .replace(/\bTopaz\b/gi, '<span class="gem-topaz">Topaz</span>')
    .replace(/\bObsidian\b/gi, '<span class="gem-obsidian">Obsidian</span>')
    .replace(/\bDiamond\b/gi, '<span class="gem-diamond">Diamond</span>')
    // Card names in gem hits (captures the pattern "hits CardName!")
    .replace(/hits ([A-Z][a-zA-Z\s]+)!/g, 'hits <span class="gem-target">$1</span>!');
  
  // Store original and show runes if eclipse is active
  entry.dataset.originalText = html;
  if (S.eclipseActive) {
    entry.innerHTML = textToRunes(html);
  } else {
    entry.innerHTML = html;
  }
  
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
  
  // Store original and show runes if eclipse is active
  entry.dataset.originalText = html;
  if (S.eclipseActive) {
    entry.innerHTML = textToRunes(html);
  } else {
    entry.innerHTML = html;
  }
  
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
  if (msg.includes("BLACK HOLE EVENT:") || msg.includes("VOID COLLAPSE") || msg.includes("GHOST TRAIN")) return "boss-warning";
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
let myDiscard = [];
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
  moveCountThisTurn: {},
  attackCountThisTurn: {},
  turnNumber: 1
};

// Track cells that are currently showing damage animation
let damagingCells = new Set();

// Track cells showing effect source animation (glowing)
let effectSourceCells = new Set();

// Track cells showing effect hit animation (shaking)
let effectHitCells = new Set();

// Track units being destroyed by void collapse (hide from render)
let voidDestroyingUnits = new Set();

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

  if (card.effect === "instant" && card.requiresTarget === "friendly_unit") {
    // Save State, etc. - highlight friendly units
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
    // Highlight enemy units (some spells have HP restrictions, check effectId)
    for (let vr = 0; vr < ROWS; vr++) {
      const sr = toServerRow(vr);
      for (let c = 0; c < COLS; c++) {
        const unitId = S.board[sr][c];
        if (unitId && S.units[unitId] && S.units[unitId].owner !== myRole) {
          const u = S.units[unitId];
          // Check if untargetable
          if (u.untargetable) continue;
          // Assimilation only works on units with 2 or less HP
          if (card.effectId === "destroy_weak" && u.hp > 2) continue;
          const el = document.getElementById(cellId(vr, c));
          if (el) el.classList.add("attack-valid"); // Red highlight for enemy target
        }
      }
    }
    return;
  }

  if (card.effect === "instant" && card.requiresTarget === "any_unit") {
    // Blood Transfusion - highlight ALL units (friendly and enemy)
    for (let vr = 0; vr < ROWS; vr++) {
      const sr = toServerRow(vr);
      for (let c = 0; c < COLS; c++) {
        const unitId = S.board[sr][c];
        if (unitId && S.units[unitId]) {
          const u = S.units[unitId];
          if (!u.untargetable) {
            const el = document.getElementById(cellId(vr, c));
            if (el) {
              // Use different color based on owner
              if (u.owner === myRole) {
                el.classList.add("deploy-valid");
              } else {
                el.classList.add("attack-valid");
              }
            }
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

  if (card.effect === "instant" && card.requiresTarget === "tile") {
    // Lunar Barrage - highlight tiles in neutral zones (not home rows)
    for (let vr = 0; vr < ROWS; vr++) {
      const sr = toServerRow(vr);
      // Can't target home rows (0-1 or 5-6)
      const isHomeRow = sr <= 1 || sr >= 5;
      if (isHomeRow) continue;
      
      for (let c = 0; c < COLS; c++) {
        const el = document.getElementById(cellId(vr, c));
        if (el) el.classList.add("deploy-valid");
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
  // Exception: Night Shade Ambusher can deploy in neutral zones (rows 2-4)
  const isBurrower = card.effectId === "burrow";
  const isAmbusher = card.effectId === "ambush_deploy";
  
  // Debug: log ambusher detection
  if (card.key === "nightshadeambusher" || card.name === "Night Shade Ambusher") {
    console.log("Ambusher card detected:", card.name, "effectId:", card.effectId, "isAmbusher:", isAmbusher);
  }
  
  for (let vr = 0; vr < ROWS; vr++) {
    const sr = toServerRow(vr);
    for (let c = 0; c < COLS; c++) {
      if (S.board[sr][c]) continue;

      let canDeploy = canDeployOnRow(sr);
      
      // Night Shade Ambusher can deploy in neutral zones (rows 2-4)
      if (!canDeploy && isAmbusher) {
        if (sr >= 2 && sr <= 4) {
          canDeploy = true;
        }
      }
      
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
  const canLongMove = u.effectId === "stampede"; // Can move 2 tiles in one move
  const hasUnlimitedMoves = u.gemBuffs && u.gemBuffs.unlimitedMoves; // Diamond gem buff
  const maxMoves = hasUnlimitedMoves ? 999 : (canDoubleMove ? 2 : 1);
  const canStillMove = moveCount < maxMoves;
  const hasAttacked = S.attackedThisTurn.includes(unitId);
  const isFirstTurn = S.firstTurn;
  
  // Unit ability checks
  const canDiagonalAttack = u.effectId === "diagonal_attack" || u.effectId === "lifesteal_lord";
  const isRanged = u.effectId === "ranged" || u.effectId === "ranged_pierce" || u.effectId === "starweave_ranged";
  const canKnightLeap = u.effectId === "knight_leap";
  const canAbsorbAlly = u.effectId === "absorb_ally";
  const canConsumeGem = u.effectId === "consume_gem";
  const canFairySwap = u.effectId === "fairy_swap";
  const canHealAttack = u.effectId === "heal_attack";
  const bonusRange = u.bonusRange || 0; // From Hunting God's Blessing
  const fairyKeys = ['rubysprite', 'emeraldforager', 'sapphiredancer', 'topazminer', 
                     'amethystenchanter', 'diamondguardian', 'opaldevourer',
                     'garnetqueen', 'moonstonewitch', 'prismaticfairy', 'gemshard'];
  
  // Helper to check if a row is an enemy home row with HP remaining
  function isBlockedEnemyRow(row) {
    if (enemy === "gold" && row <= 1 && S.rowHP[row] > 0) return true;
    if (enemy === "silver" && row >= 5 && S.rowHP[row] > 0) return true;
    return false;
  }
  
  // Sapphire Dancer fairy_swap - can swap with any friendly Fairy on the board
  if (canFairySwap && canStillMove) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const targetId = S.board[r][c];
        if (!targetId) continue;
        const target = S.units[targetId];
        if (!target || target.owner !== myRole) continue;
        if (!fairyKeys.includes(target.key)) continue;
        if (targetId === selectedUnitId) continue; // Can't swap with self
        
        const viewRow = viewFlipped ? (ROWS - 1 - r) : r;
        const el = document.getElementById(cellId(viewRow, c));
        if (el && !el.classList.contains("move-valid")) {
          el.classList.add("swap-valid");
          const icon = document.createElement("div");
          icon.className = "attack-icon";
          icon.innerHTML = "🔄";
          el.appendChild(icon);
        }
      }
    }
  }
  
  // Stampede 2-tile move (cardinal only, path must be clear)
  if (canLongMove && canStillMove) {
    const longMoveOffsets = [
      { dr: -2, dc: 0, midDr: -1, midDc: 0 },
      { dr: 2, dc: 0, midDr: 1, midDc: 0 },
      { dr: 0, dc: -2, midDr: 0, midDc: -1 },
      { dr: 0, dc: 2, midDr: 0, midDc: 1 }
    ];
    for (const offset of longMoveOffsets) {
      const nr = pos.r + offset.dr;
      const nc = pos.c + offset.dc;
      const midR = pos.r + offset.midDr;
      const midC = pos.c + offset.midDc;
      
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (S.board[nr][nc]) continue; // Destination occupied
      if (S.board[midR][midC]) continue; // Path blocked
      if (isBlockedEnemyRow(nr)) continue; // Can't move into enemy row with HP
      
      const viewRow = viewFlipped ? (ROWS - 1 - nr) : nr;
      const el = document.getElementById(cellId(viewRow, nc));
      if (el && !el.classList.contains("move-valid")) {
        el.classList.add("move-valid");
      }
    }
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
        // Opal Devourer can attack friendly Gem Shards (cardinal only)
        else if (target && target.owner === myRole && canConsumeGem && target.key === "gemshard" && !hasAttacked && isCardinal) {
          el.classList.add("deploy-valid"); // Green highlight for consume
          const icon = document.createElement("div");
          icon.className = "attack-icon";
          icon.innerHTML = "💎";
          el.appendChild(icon);
        }
        // Lunar Priestess can attack friendly units to heal them (cardinal only)
        else if (target && target.owner === myRole && canHealAttack && !hasAttacked && isCardinal) {
          el.classList.add("deploy-valid"); // Green highlight for heal
          const icon = document.createElement("div");
          icon.className = "attack-icon";
          icon.innerHTML = "💚";
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
  
  // Archer ranged attack - can attack 1 OR 2 tiles away (cardinal only)
  // Also handles bonus range from Hunting God's Blessing
  const baseRange = isRanged ? 2 : 1;
  const totalRange = baseRange + bonusRange;
  
  if ((isRanged || bonusRange > 0) && !hasAttacked) {
    // Generate all cardinal offsets up to totalRange
    const rangedOffsets = [];
    for (let dist = 1; dist <= totalRange; dist++) {
      rangedOffsets.push({ dr: -dist, dc: 0 });
      rangedOffsets.push({ dr: dist, dc: 0 });
      rangedOffsets.push({ dr: 0, dc: -dist });
      rangedOffsets.push({ dr: 0, dc: dist });
    }
    
    for (const offset of rangedOffsets) {
      const nr = pos.r + offset.dr;
      const nc = pos.c + offset.dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      
      const targetId = S.board[nr][nc];
      const viewRow = viewFlipped ? (ROWS - 1 - nr) : nr;
      const el = document.getElementById(cellId(viewRow, nc));
      if (!el) continue;
      
      if (targetId) {
        const target = S.units[targetId];
        if (target && target.owner === enemy && !target.untargetable) {
          if (!el.classList.contains("attack-valid")) {
            el.classList.add("attack-valid");
            const icon = document.createElement("div");
            icon.className = "attack-icon";
            icon.innerHTML = isRanged ? "🏹" : "⚔️";
            el.appendChild(icon);
          }
        }
      } else {
        // Empty cell - check if enemy home row with HP (can attack the row at range)
        const isEnemyHomeRow = (enemy === "gold" && nr <= 1) || (enemy === "silver" && nr >= 5);
        if (isEnemyHomeRow && S.rowHP[nr] > 0 && !el.classList.contains("row-attack-valid")) {
          el.classList.add("row-attack-valid");
          const icon = document.createElement("div");
          icon.className = "attack-icon row-attack";
          icon.innerHTML = isRanged ? "🏹" : "🏰";
          el.appendChild(icon);
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
  
  // Sapphire Dancer fairy_swap - can swap with friendly fairies
  if (u.effectId === "fairy_swap" && canStillMove) {
    const fairyKeysForSwap = ['rubysprite', 'emeraldforager', 'sapphiredancer', 'topazminer', 
                              'amethystenchanter', 'diamondguardian', 'opaldevourer',
                              'garnetqueen', 'moonstonewitch', 'prismaticfairy', 'gemshard'];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const targetId = S.board[r][c];
        if (!targetId) continue;
        const target = S.units[targetId];
        if (!target || target.owner !== myRole) continue;
        if (!fairyKeysForSwap.includes(target.key)) continue;
        if (targetId === selectedUnitId) continue;
        
        const viewRow = viewFlipped ? (ROWS - 1 - r) : r;
        const el = document.getElementById(cellId(viewRow, c));
        if (el && !el.classList.contains("swap-valid")) {
          el.classList.add("swap-valid");
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
  if (!buffsList) return;
  
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
  
  if (S.buffTiles) {
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
  // Garnet Queen - adjacent friendlies gain +1 ATK
  if (getAdjacentUnitsWithEffect(unitId, "garnet_aura").length > 0) {
    atk += 1;
  }
  // Moonstone Witch - gains +1 ATK per Gem Shard on field
  if (u.effectId === "gem_transform") {
    for (const uid in S.units) {
      if (S.units[uid].key === "gemshard") {
        atk += 1;
      }
    }
  }
  // Wizard NPC - adjacent allies get +N/+N where N = wizardStacks (default 1)
  const wizardBuffs = getAdjacentUnitsWithEffect(unitId, "stacking_aura");
  for (const wizardId of wizardBuffs) {
    const wizard = S.units[wizardId];
    if (wizard) {
      atk += (wizard.wizardStacks || 1);
    }
  }
  // Final Boss - gains +1 ATK per HP lost (rage_mode)
  if (u.effectId === "rage_mode" && u.maxHp) {
    atk += (u.maxHp - u.hp);
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
  // Garnet Queen - adjacent friendlies gain +1 ATK
  if (getAdjacentUnitsWithEffect(unitId, "garnet_aura").length > 0) {
    buff += 1;
  }
  // Moonstone Witch - gains +1 ATK per Gem Shard on field
  if (u.effectId === "gem_transform") {
    for (const uid in S.units) {
      if (S.units[uid].key === "gemshard") {
        buff += 1;
      }
    }
  }
  // Wizard NPC - adjacent allies get +N/+N where N = wizardStacks (default 1)
  const wizardBuffs = getAdjacentUnitsWithEffect(unitId, "stacking_aura");
  for (const wizardId of wizardBuffs) {
    const wizard = S.units[wizardId];
    if (wizard) {
      buff += (wizard.wizardStacks || 1);
    }
  }
  // Final Boss - gains +1 ATK per HP lost (rage_mode)
  if (u.effectId === "rage_mode" && u.maxHp) {
    buff += (u.maxHp - u.hp);
  }
  return buff;
}

// Get HP buff amount (for display purposes)
function getHpBuff(unitId) {
  const u = S.units[unitId];
  if (!u) return 0;
  
  let buff = 0;
  // Legacy hpBuffed flag
  if (u.hpBuffed) buff += 1;
  
  // Wizard NPC - adjacent allies get +N/+N where N = wizardStacks (default 1)
  const wizardBuffs = getAdjacentUnitsWithEffect(unitId, "stacking_aura");
  for (const wizardId of wizardBuffs) {
    const wizard = S.units[wizardId];
    if (wizard) {
      buff += (wizard.wizardStacks || 1);
    }
  }
  return buff;
}

function sendAction(payload) {
  if (!socket.connected) {
    console.error("[ACTION] Socket not connected! Payload:", payload);
    log("Connection lost. Please refresh the page.", "system");
    return;
  }
  console.log("[ACTION] Sending:", payload.type, payload);
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

// Card rarities for holo effects
const CARD_RARITIES = {
  // Medieval
  peasant: 'common', squire: 'common', archer: 'common', manatarms: 'common', shieldbearer: 'common',
  warhound: 'common', battlefieldmedic: 'rare', knight: 'rare', crusader: 'rare', royalguard: 'rare',
  paladin: 'legendary', siegeram: 'rare', warbanner: 'rare', shrine: 'rare', armory: 'rare',
  healspring: 'rare', castlewalls: 'legendary', treasury: 'legendary', rally: 'common',
  // Void Alien
  voiddrone: 'common', scavengerlarva: 'common', spittercrawler: 'common', phaseskirmisher: 'common',
  energyleech: 'rare', burrowerbeast: 'rare', psionicoverseer: 'rare', neuralharvester: 'rare',
  adaptivecolossus: 'legendary', sporetitan: 'legendary', voidbroodmother: 'legendary', eclipsedevourer: 'legendary',
  ufoscraper: 'legendary', assimilation: 'rare', voidcollapse: 'rare', hiveascension: 'legendary',
  // Western Skeleton
  bonedeputy: 'common', dustyrattler: 'common', graverobber: 'rare', phantomscout: 'common',
  bonerevolver: 'rare', undeadsheriff: 'rare', coffintrapper: 'rare', undertaker: 'rare',
  thehangedman: 'legendary', ghostlystampede: 'legendary', bonecolossus: 'legendary',
  deadmanshand: 'common', mostwanted: 'rare', shallowgrave: 'legendary', highnoon: 'legendary',
  // Crimson Court
  thrall: 'common', bloodfamiliar: 'common', nightstalker: 'common', cryptkeeper: 'rare',
  vampirespawn: 'common', bloodpriest: 'rare', soulcollector: 'rare', nosferatu: 'rare',
  coffin: 'rare', bloodcountess: 'legendary', eldervampire: 'legendary', vampirelord: 'legendary',
  bloodmoon: 'legendary', crimsonsacrifice: 'rare', sanguinepact: 'rare', eternalhunger: 'legendary',
  // Moon Elf
  moonlitarcher: 'common', lunarfawn: 'common', starweaver: 'common', moonbladesentinel: 'common',
  celestialmender: 'rare', dreamwalker: 'rare', moonfiresprite: 'rare', eclipsewarden: 'rare',
  lunarqueen: 'legendary', moonshadowassassin: 'legendary', celestialdancer: 'legendary',
  moonfire: 'common', lunarblessing: 'rare', eclipseveil: 'rare', celestialconvergence: 'legendary',
  // Steampunk
  gearsmith: 'common', steamdrone: 'common', brassguardian: 'common', cogworksaboteur: 'common',
  aethericsniper: 'rare', mechanizedinfantry: 'rare', clockworkassassin: 'rare', steamtitan: 'rare',
  ironcladdreadnought: 'legendary', gearworkharvester: 'legendary', arcaneengine: 'legendary',
  overcharge: 'common', brassbarrier: 'rare', mechanizedassault: 'rare', clockworkapocalypse: 'legendary',
  // Forest
  sprite: 'common', forestfox: 'common', thornweaver: 'common', vinesnare: 'common',
  elderoak: 'rare', beehivebomber: 'rare', wolfpackleader: 'rare', livingcompost: 'rare',
  ancienttreant: 'legendary', blossomdragon: 'legendary', forestspirit: 'legendary',
  regrowth: 'common', naturesgrasp: 'rare', wildgrowth: 'rare', forestsvengeance: 'legendary',
  // Dragon Wizard
  meditationmonk: 'common', wyrmwhelp: 'common', wizardsrune: 'common', cinderwing: 'common',
  manasiphonmage: 'rare', arcanetether: 'rare', stormdrake: 'rare', mirrorwizard: 'rare', volcanicdragon: 'rare',
  redwizard: 'legendary', bluewizard: 'legendary', chronodrake: 'legendary',
  polymorph: 'rare', manadrain: 'rare', overchargebolt: 'rare', arcanerift: 'legendary', dragonsfury: 'legendary'
};

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
    if (card.isHolo) {
      const rarity = CARD_RARITIES[card.key] || 'common';
      el.classList.add("holo-card", `holo-${rarity}`); // Holographic effect based on rarity
    }

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
    
    // GREEDISGOOD cheat: show cost as 1
    const displayCost = S.cheatGreedActive ? 1 : card.cost;
    const costClass = S.cheatGreedActive ? 'cardCost cheat-discount' : 'cardCost';

    el.innerHTML = `
      <div class="cardArt ${card.type === 'spell' ? 'spell-art' : ''}" style="${artStyle}">${artContent}</div>
      <div class="${costClass}">${displayCost}</div>
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
      
      // Check if we have enough energy (GREEDISGOOD makes all cards cost 1)
      const effectiveCost = S.cheatGreedActive ? 1 : card.cost;
      if (myEnergy < effectiveCost) {
        return log("Not enough energy.", "system");
      }
      
      // Non-targeted instant spells play immediately
      if (card.effect === "instant" && !card.requiresTarget) {
        sendAction({ type: "playCard", cardId: card.id });
        selectedCardId = null;
        deployCardId = null;
        clearHighlights();
        renderHand();
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
  if (discardPileCountEl) discardPileCountEl.textContent = myDiscardCount;
  
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
  
  // Art display - same as board units
  const icon = CARD_ICONS[u.key] || '⚔️';
  const hasArt = u.art;
  const encodedArt = hasArt ? encodeURI(u.art) : '';
  const artStyle = hasArt ? `background: url('${encodedArt}') center/cover no-repeat` : '';
  const artContent = hasArt ? '' : icon;
  
  el.innerHTML = `
    <div class="unitArt" style="${artStyle}">${artContent}</div>
    <div class="unitInfoOverlay">
      <div class="unitName">${u.name}</div>
      <div class="unitStats">
        <div class="unitStat unitAtk"><span class="unitStatIcon">⚔</span>${u.atk}</div>
        <div class="unitStat unitHp"><span class="unitStatIcon">♥</span>${u.hp}</div>
      </div>
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
  
  // Hide chalice tooltip when re-rendering (fixes persistence bug)
  hideChaliceTooltip();

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

      cellEl.classList.remove("selected", "buff-tile", "buff-energy", "buff-heal", "buff-attack", "buff-draw", "buff-move", "buff-hp", "has-unit", "void-collapse-warning", "ghost-train-warning", "train-horizontal", "train-vertical", "blood-chalice-tile", "gem-rain-warning");
      cellEl.removeAttribute("data-buff-icon");
      cellEl.innerHTML = "";
      
      // Check if this cell is in a boss event warning zone
      if (S.bossEventWarning && S.bossEventWarning.type === 'void_collapse') {
        const isInWarningZone = S.bossEventWarning.tiles.some(t => t.r === sr && t.c === c);
        if (isInWarningZone) {
          console.log("Adding void-collapse-warning to cell", sr, c, "cellEl:", cellEl.id);
          cellEl.classList.add("void-collapse-warning");
          
          // Add danger icon
          const dangerIcon = document.createElement('span');
          dangerIcon.className = 'void-danger-icon';
          dangerIcon.textContent = '⚠️';
          cellEl.appendChild(dangerIcon);
        }
      }
      
      // Check for ghost train warning
      if (S.bossEventWarning && S.bossEventWarning.type === 'ghost_train') {
        const tile = S.bossEventWarning.tiles.find(t => t.r === sr && t.c === c);
        if (tile) {
          cellEl.classList.add("ghost-train-warning");
          cellEl.classList.add(tile.lineType === 'row' ? 'train-horizontal' : 'train-vertical');
        }
      }
      
      // Check for gem rain warning (generic glow - don't know which gems yet)
      if (S.bossEventWarning && S.bossEventWarning.type === 'gem_rain') {
        const isWarningTile = S.bossEventWarning.tiles.some(t => t.r === sr && t.c === c);
        if (isWarningTile) {
          cellEl.classList.add("gem-rain-warning");
          
          // Add particle container
          const particleContainer = document.createElement('div');
          particleContainer.className = 'gem-particles';
          for (let i = 0; i < 5; i++) {
            const particle = document.createElement('div');
            particle.className = 'gem-particle';
            particle.style.setProperty('--delay', `${i * 0.2}s`);
            particle.style.setProperty('--x-offset', `${(Math.random() - 0.5) * 30}px`);
            particleContainer.appendChild(particle);
          }
          cellEl.appendChild(particleContainer);
        }
      }
      
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
      
      // Check if this is a blood chalice tile
      const hasChalice = S.chaliceTiles && S.chaliceTiles.some(t => t.r === sr && t.c === c);
      if (hasChalice) {
        console.log("[CHALICE] Rendering chalice at", sr, c);
        cellEl.classList.add("blood-chalice-tile");
        // Add glow overlay
        const glowDiv = document.createElement('div');
        glowDiv.className = 'chalice-glow';
        cellEl.appendChild(glowDiv);
      }

      const unitId = S.board[sr][c];

      // If there's a unit on a buff tile or void collapse warning, add has-unit class
      if (unitId && buff) {
        cellEl.classList.add("has-unit");
      }
      if (unitId && cellEl.classList.contains("void-collapse-warning")) {
        cellEl.classList.add("has-unit");
      }
      if (unitId && cellEl.classList.contains("ghost-train-warning")) {
        cellEl.classList.add("has-unit");
      }

      if (!unitId) {
        cellEl.textContent = coordLabel(sr, c);
        // Add buff tile hover handlers
        if (buff) {
          cellEl.onmouseenter = (e) => showBuffTooltip(buff, e.clientX, e.clientY);
          cellEl.onmousemove = (e) => positionBuffTooltip(e.clientX, e.clientY);
          cellEl.onmouseleave = hideBuffTooltip;
        } else if (hasChalice) {
          cellEl.onmouseenter = (e) => showChaliceTooltip(e.clientX, e.clientY);
          cellEl.onmousemove = (e) => positionChaliceTooltip(e.clientX, e.clientY);
          cellEl.onmouseleave = hideChaliceTooltip;
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
      
      // Skip rendering units being destroyed by void collapse
      if (voidDestroyingUnits.has(unitId)) {
        cellEl.textContent = coordLabel(sr, c);
        continue;
      }

      const wrap = document.createElement("div");
      wrap.className = "unit";
      if (u.effectId) wrap.classList.add("has-effect");
      if (u.type === "spell") wrap.classList.add("spell-unit");
      
      // Add has-unit class to the cell for eclipse styling
      cellEl.classList.add("has-unit");
      
      // Add enemy class for visual distinction
      const isEnemy = u.owner !== myRole && myRole !== "spectator";
      if (isEnemy) wrap.classList.add("enemy-unit");
      
      // Add stolen class for Soul Collector stolen units
      if (u.stolen) wrap.classList.add("stolen-unit");
      
      // Add holo class for holographic cards with rarity-based effect
      if (u.isHolo) {
        const rarity = CARD_RARITIES[u.key] || 'common';
        wrap.classList.add("holo-unit", `holo-${rarity}`);
      }
      
      // Add untargetable class for burrowed/phantom units
      if (u.untargetable) wrap.classList.add("untargetable");
      
      // Add damage animation if this cell is being damaged
      const damageKey = `${sr}-${c}`;
      if (damagingCells.has(damageKey)) {
        wrap.classList.add("taking-damage");
      }
      
      // Add attack animation if this unit is attacking
      const attackKey = `${sr}-${c}`;
      if (attackingCells.has(attackKey)) {
        const { budgeX, budgeY } = attackingCells.get(attackKey);
        wrap.style.setProperty('--budge-x', `${budgeX}px`);
        wrap.style.setProperty('--budge-y', `${budgeY}px`);
        wrap.classList.add("attacking");
      }
      
      // Add effect source animation (AOE caster glowing)
      const effectKey = `${sr}-${c}`;
      if (effectSourceCells.has(effectKey)) {
        wrap.classList.add("effect-source");
      }
      
      // Add effect hit animation (AOE target shaking)
      if (effectHitCells.has(effectKey)) {
        wrap.classList.add("effect-hit");
      }
      
      // Calculate buffs
      const atkBuff = getAtkBuff(unitId);
      const hpBuff = getHpBuff(unitId);
      const hpBuffHtml = hpBuff > 0 ? `<span class="buff">+${hpBuff}</span>` : '';
      
      // Special handling for Final Boss rage mode - show total ATK in purple instead of +X
      let atkDisplayHtml;
      if (u.effectId === "rage_mode" && atkBuff > 0) {
        const totalAtk = u.atk + atkBuff;
        atkDisplayHtml = `<span class="rage-atk">${totalAtk}</span>`;
      } else {
        const atkBuffHtml = atkBuff > 0 ? `<span class="buff">+${atkBuff}</span>` : '';
        atkDisplayHtml = `${u.atk}${atkBuffHtml}`;
      }
      
      // Art display
      const icon = CARD_ICONS[u.key] || '⚔️';
      const hasArt = u.art;
      const encodedArt = hasArt ? encodeURI(u.art) : '';
      const artStyle = hasArt ? `background: url('${encodedArt}') center/cover no-repeat` : '';
      const artContent = hasArt ? '' : icon;
      const effectBadge = ''; // Removed star badge
      
      // Shield overlay for untargetable units
      const shieldOverlay = u.untargetable ? '<div class="shield-overlay"><div class="shield-icon">🛡️</div></div>' : '';
      
      // Save State glow overlay
      const saveStateOverlay = u.saveState ? '<div class="save-state-overlay"></div>' : '';
      if (u.saveState) {
        wrap.classList.add('has-save-state');
      }
      
      // Divine Judgment overlays
      let judgmentOverlay = '';
      if (u.judgedWrath) {
        wrap.classList.add('judged-wrath');
        judgmentOverlay += '<div class="judgment-wrath-overlay"></div>';
      }
      if (u.judgedPride) {
        wrap.classList.add('judged-pride');
        judgmentOverlay += '<div class="judgment-pride-overlay"></div>';
      }
      if (u.judgedViolence) {
        wrap.classList.add('judged-violence');
        judgmentOverlay += '<div class="judgment-violence-overlay"></div>';
      }
      
      wrap.innerHTML = `
        <div class="unitArt" style="${artStyle}">${artContent}</div>
        ${effectBadge}
        ${shieldOverlay}
        ${saveStateOverlay}
        ${judgmentOverlay}
        <div class="unitInfoOverlay">
          <div class="unitName">${u.name}</div>
          <div class="unitStats">
            <div class="unitStat unitAtk"><span class="unitStatIcon">⚔</span>${atkDisplayHtml}</div>
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
    playSFX('draw'); // Play draw sound immediately
    sendAction({ type: "drawCard" });
  };
}


function onCellClick(viewRow, col) {
  if (myRole !== "gold" && myRole !== "silver") return log("Spectator cannot act.");
  if (S.gameOver) return log("Game over.");

  const row = toServerRow(viewRow);
  const occId = S.board[row][col];

  // Handle Resurrection spell placement
  if (S.resurrectionPending && pendingResurrectionCard) {
    if (occId) {
      return log("Tile is occupied.");
    }
    
    // Can deploy anywhere except enemy home rows with HP
    const enemy = myRole === "gold" ? "silver" : "gold";
    const isEnemyHomeRow = (enemy === "gold" && row <= 1) || (enemy === "silver" && row >= 5);
    if (isEnemyHomeRow && S.rowHP[row] > 0) {
      return log("Cannot deploy in enemy home row with HP.");
    }
    
    sendAction({ 
      type: "resurrectionSelect", 
      cardId: pendingResurrectionCard.id,
      row: row,
      col: col
    });
    pendingResurrectionCard = null;
    S.resurrectionPending = false;
    return;
  }

  // Handle wizard summon from Wizard's Rune death
  if (pendingWizardSummon && pendingWizardSummon.selectedCardId) {
    if (occId) {
      return log("Tile is occupied.");
    }
    
    // Check if valid deployment tile
    const isHomeRow = myRole === "gold" ? row <= 1 : row >= 5;
    const isNeutral = row >= 2 && row <= 4;
    const canDeploy = isHomeRow || (isNeutral && S.rowHP[row] <= 0);
    
    if (!canDeploy) {
      return log("Cannot deploy there.");
    }
    
    sendAction({ 
      type: "summonFreeWizard", 
      cardId: pendingWizardSummon.selectedCardId,
      row: row,
      col: col
    });
    hideWizardSummonModal();
    return;
  }

  if (!isMyTurn()) return log("Not your turn.");

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
    
    if (card.effect === "instant" && card.requiresTarget === "friendly_unit") {
      // Save State, etc. - target a friendly unit
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
      // Target an enemy unit (some spells have HP restrictions)
      if (!occId || !S.units[occId] || S.units[occId].owner === myRole) {
        return log("Select an enemy unit.");
      }
      const target = S.units[occId];
      // Assimilation only works on units with 2 or less HP
      if (card.effectId === "destroy_weak" && target.hp > 2) {
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
    
    if (card.effect === "instant" && card.requiresTarget === "any_unit") {
      // Blood Transfusion - target any unit
      if (!occId || !S.units[occId]) {
        return log("Select a unit.");
      }
      const target = S.units[occId];
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
    
    if (card.effect === "instant" && card.requiresTarget === "tile") {
      // Lunar Barrage - target a tile (can have enemy unit on it)
      // Check that it's not a home row
      const isHomeRow = row <= 1 || row >= 5;
      if (isHomeRow) {
        return log("Cannot target home rows.");
      }
      const cardIdToPlay = deployCardId;
      deployCardId = null;
      selectedCardId = null;
      clearHighlights();
      sendAction({ type: "playCard", cardId: cardIdToPlay, row, col });
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
      
      // Opal Devourer can attack friendly Gem Shards to consume them
      const isConsumeGem = a && a.owner === myRole && a.effectId === "consume_gem" && clickedUnit.owner === myRole && clickedUnit.key === "gemshard";
      
      // Lunar Priestess can attack friendly units to heal them
      const isHealAttack = a && a.owner === myRole && a.effectId === "heal_attack" && clickedUnit.owner === myRole;
      
      // Sapphire Dancer can swap with friendly fairies
      const fairyKeysForSwap = ['rubysprite', 'emeraldforager', 'sapphiredancer', 'topazminer', 
                                'amethystenchanter', 'diamondguardian', 'opaldevourer',
                                'garnetqueen', 'moonstonewitch', 'prismaticfairy', 'gemshard'];
      const isFairySwap = a && a.owner === myRole && a.effectId === "fairy_swap" && 
                          clickedUnit.owner === myRole && fairyKeysForSwap.includes(clickedUnit.key);
      
      // Handle fairy swap as a move action (server handles the swap logic)
      if (isFairySwap) {
        sendAction({ type: "move", unitId: selectedUnitId, toRow: row, toCol: col });
        selectedUnitId = null;
        clearHighlights();
        renderAll();
        return;
      }
      
      if (a && a.owner === myRole && (clickedUnit.owner !== myRole || isAbsorbAttack || isConsumeGem || isHealAttack)) {
        const ap = findUnitPos(selectedUnitId);
        const tp = findUnitPos(occId);
        if (!ap || !tp) return log("Error: position not found.");
        
        // Check if this is a valid attack based on unit abilities
        let canAttack = false;
        const bonusRange = a.bonusRange || 0;
        const isRangedUnit = a.effectId === "ranged" || a.effectId === "ranged_pierce" || a.effectId === "starweave_ranged";
        const baseRange = isRangedUnit ? 2 : 1;
        const totalRange = baseRange + bonusRange;
        
        const rowDist = Math.abs(ap.r - tp.r);
        const colDist = Math.abs(ap.c - tp.c);
        
        // Peasant/Vampire Lord diagonal attack
        if (a.effectId === "diagonal_attack" || a.effectId === "lifesteal_lord") {
          canAttack = isAdjacent(ap.r, ap.c, tp.r, tp.c);
        }
        // Ranged or bonus range attack (cardinal only)
        else if (isRangedUnit || bonusRange > 0) {
          canAttack = (rowDist <= totalRange && colDist === 0) || (colDist <= totalRange && rowDist === 0);
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

  // Check if this is a valid move (adjacent OR knight leap for squires OR stampede 2-tile)
  let validMove = isAdjacent(ap.r, ap.c, row, col);
  
  // Stampede can move up to 2 tiles in a straight line (cardinal)
  if (a.effectId === "stampede" && !validMove) {
    const rowDist = Math.abs(ap.r - row);
    const colDist = Math.abs(ap.c - col);
    const isStraightLine = (rowDist <= 2 && colDist === 0) || (colDist <= 2 && rowDist === 0);
    if (isStraightLine) {
      // Check path is clear for 2-tile move
      let pathClear = true;
      if (rowDist === 2 && colDist === 0) {
        const midRow = ap.r + (row > ap.r ? 1 : -1);
        if (S.board[midRow][ap.c]) pathClear = false;
      } else if (colDist === 2 && rowDist === 0) {
        const midCol = ap.c + (col > ap.c ? 1 : -1);
        if (S.board[ap.r][midCol]) pathClear = false;
      }
      if (pathClear) validMove = true;
    }
  }
  
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
  
  // Ranged units (archer) can attack rows from 2 tiles away
  const isRanged = a.effectId === "ranged" || a.effectId === "ranged_pierce" || a.effectId === "starweave_ranged";
  const bonusRange = a.bonusRange || 0;
  const totalRange = (isRanged ? 2 : 1) + bonusRange;
  const rowDist = Math.abs(ap.r - row);
  const colDist = Math.abs(ap.c - col);
  const isCardinal = (rowDist > 0 && colDist === 0) || (colDist > 0 && rowDist === 0);
  const enemy = enemyOf(myRole);
  const isEnemyHomeRow = (enemy === "gold" && row <= 1) || (enemy === "silver" && row >= 5);
  
  if (!validMove && isEnemyHomeRow && S.rowHP[row] > 0 && isCardinal) {
    const maxDist = Math.max(rowDist, colDist);
    if (maxDist <= totalRange) {
      validMove = true; // Allow ranged row attack at distance
    }
  }

  if (!validMove) {
    // Clicked non-adjacent empty cell (and not a valid knight leap or ranged row attack) - deselect
    selectedUnitId = null;
    clearHighlights();
    renderAll();
    return;
  }

  const rowHasHP = S.rowHP[row] > 0;
  const hasAttacked = S.attackedThisTurn.includes(selectedUnitId);
  const hasMoved = S.movedThisTurn.includes(selectedUnitId);

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
socket.on("log", (data) => {
  // Handle both old string format and new object format
  if (typeof data === 'string') {
    log(data, parseLogType(data));
  } else {
    log(data.msg, data.type || parseLogType(data.msg));
  }
});
socket.on("combatLog", (data) => combatLog(data.msg, data.type));

// Handle boss event warnings (visual effects)
// Track looping sounds so we can stop them
let warningSirenSound = null;
let blackHoleHumSound = null;

socket.on("bossEventWarning", (data) => {
  if (data.type === 'void_collapse') {
    // Play humming sound during warning phase (looping)
    stopLoopingSound(blackHoleHumSound);
    blackHoleHumSound = playLoopingSFX('hum');
    
    // Play warning sound or show notification
    combatLog(`⚠️ VOID COLLAPSE WARNING: ${data.size}x${data.size} zone marked!`, "boss-warning");
    // The visual effect is handled by renderAll via bossEventWarning in state
  } else if (data.type === 'ghost_train') {
    const lineDescriptions = data.lines.map(l => l.type === 'row' ? `Row ${l.index + 1}` : `Col ${l.index + 1}`);
    combatLog(`🚂 GHOST TRAIN WARNING: ${lineDescriptions.join(', ')}!`, "boss-warning");
  }
});

// Handle boss event execution (destruction effects)
socket.on("bossEventExecute", (data) => {
  if (data.type === 'void_collapse') {
    // Stop humming, start siren for countdown
    stopLoopingSound(blackHoleHumSound);
    blackHoleHumSound = null;
    warningSirenSound = playLoopingSFX('siren');
    
    // Show dramatic countdown sequence with destroyed units info
    showVoidCollapseSequence(data.tiles, data.destroyed, data.destroyedUnits || []);
  } else if (data.type === 'ghost_train') {
    // Show ghost train sequence
    showGhostTrainSequence(data.lines, data.tiles, data.destroyed, data.destroyedUnits);
  }
});

// Handle blood chalice spawn
socket.on("bloodChaliceSpawn", (data) => {
  console.log("Blood chalice spawn:", data);
  combatLog(`🍷 ${data.tiles.length} Blood Chalices appeared!`, "boss-benefit");
  
  // Animate chalices falling onto tiles
  data.tiles.forEach((tile, index) => {
    setTimeout(() => {
      animateChaliceSpawn(tile.r, tile.c);
    }, index * 150);
  });
});

// Handle blood chalice consumption
socket.on("bloodChaliceConsumed", (data) => {
  console.log("Blood chalice consumed:", data);
  animateChaliceConsume(data.row, data.col);
});

// Handle gem rain warning
// Gem rain warning sound (loops until gems fall)
let gemWarningSound = null;

socket.on("gemRainWarning", (data) => {
  console.log("Gem rain warning:", data);
  combatLog(`💎 GEM RAIN: ${data.tiles.length} tiles are glowing!`, "boss-event");
  
  // Play warning sound (looping)
  gemWarningSound = new Audio('/audio/sfx/gem-warning.mp3');
  gemWarningSound.volume = 0.5;
  gemWarningSound.loop = true;
  gemWarningSound.play().catch(() => {});
});

// Handle gem rain execution
socket.on("gemRainExecute", (data) => {
  console.log("Gem rain execute:", data);
  
  // Stop the warning sound
  if (gemWarningSound) {
    gemWarningSound.pause();
    gemWarningSound = null;
  }
  
  // Clear warning tiles immediately when gems start falling
  S.bossEventWarning = null;
  renderAll();
  
  // Show falling gems with staggered timing
  data.results.forEach((result, index) => {
    setTimeout(() => {
      animateGemFall(result.r, result.c, result.gemType, result.effect, result.unitName);
      
      // Play impact sound for each gem
      const impactSound = new Audio('/audio/sfx/gem-impact.mp3');
      impactSound.volume = 0.2;
      impactSound.play().catch(() => {});
    }, index * 300);
  });
});

// Eclipse event handlers
socket.on("eclipseStart", (data) => {
  console.log("Eclipse starts:", data);
  S.eclipseActive = true;
  S.eclipseEffect = data.effect;
  
  // Play eclipse sound
  const eclipseSound = new Audio('/audio/sfx/eclipse.mp3');
  eclipseSound.volume = 0.4;
  eclipseSound.play().catch(() => {});
  
  // Show eclipse overlay with effect label
  showEclipseOverlay(data.effect);
  renderAll();
});

socket.on("eclipseEnd", (data) => {
  console.log("Eclipse ends");
  S.eclipseActive = false;
  S.eclipseEffect = null;
  
  // Hide eclipse overlay
  hideEclipseOverlay();
  renderAll();
});

// Polymorph event handlers
socket.on("polymorphStart", (data) => {
  console.log("Polymorph starts:", data);
  S.polymorphActive = true;
  S.polymorphTurnsLeft = data.turnsLeft;
  
  // Play polymorph sound (use a magic sound)
  const polymorphSound = new Audio('/audio/sfx/polymorph.mp3');
  polymorphSound.volume = 0.5;
  polymorphSound.play().catch(() => {});
  
  // Show polymorph indicator
  showPolymorphOverlay(data.turnsLeft);
  renderAll();
});

socket.on("polymorphEnd", (data) => {
  console.log("Polymorph ends");
  S.polymorphActive = false;
  S.polymorphTurnsLeft = 0;
  
  // Play restore sound
  const restoreSound = new Audio('/audio/sfx/polymorph-end.mp3');
  restoreSound.volume = 0.5;
  restoreSound.play().catch(() => {});
  
  // Hide polymorph indicator
  hidePolymorphOverlay();
  renderAll();
});

function showPolymorphOverlay(turnsLeft) {
  // Add polymorph class to game container for visual effect
  const gameContainer = document.getElementById('gameContainer') || document.body;
  gameContainer.classList.add('polymorph-active');
  document.body.classList.add('polymorph-active');
  
  // Create or update polymorph indicator
  let indicator = document.getElementById('polymorphIndicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'polymorphIndicator';
    document.body.appendChild(indicator);
  }
  indicator.innerHTML = `🐑 POLYMORPH (${turnsLeft} turns)`;
  indicator.classList.add('visible');
}

function hidePolymorphOverlay() {
  const gameContainer = document.getElementById('gameContainer') || document.body;
  gameContainer.classList.remove('polymorph-active');
  document.body.classList.remove('polymorph-active');
  
  const indicator = document.getElementById('polymorphIndicator');
  if (indicator) {
    indicator.classList.remove('visible');
  }
}

// ==================== DIVINE JUDGMENT EVENT ====================

socket.on("divineJudgmentStart", (data) => {
  console.log("Divine Judgment starts:", data);
  S.divineJudgmentActive = true;
  S.divineJudgmentTurnsLeft = data.turnsLeft;
  
  // Start cinematic sequence
  playDivineJudgmentCinematic(data);
});

socket.on("divineJudgmentUpdate", (data) => {
  console.log("Divine Judgment update:", data);
  S.divineJudgmentTurnsLeft = data.turnsLeft;
  updateDivineJudgmentOverlay(data.turnsLeft);
});

socket.on("divineJudgmentEnd", (data) => {
  console.log("Divine Judgment ends");
  S.divineJudgmentActive = false;
  S.divineJudgmentTurnsLeft = 0;
  
  // Play restore sound
  const restoreSound = new Audio('/audio/sfx/blessing.mp3');
  restoreSound.volume = 0.5;
  restoreSound.play().catch(() => {});
  
  // Fade out divine judgment indicator
  hideDivineJudgmentOverlay();
  renderAll();
});

function playDivineJudgmentCinematic(data) {
  const gameContainer = document.getElementById('gameContainer') || document.body;
  
  // Block all game actions during cinematic
  S.divineJudgmentCinematicActive = true;
  
  // Create cinematic overlay
  let cinematicOverlay = document.getElementById('divineJudgmentCinematic');
  if (!cinematicOverlay) {
    cinematicOverlay = document.createElement('div');
    cinematicOverlay.id = 'divineJudgmentCinematic';
    document.body.appendChild(cinematicOverlay);
  }
  
  cinematicOverlay.innerHTML = `
    <div class="dj-cinematic-content">
      <div class="dj-title">⚖️ DIVINE JUDGMENT ⚖️</div>
      <div class="dj-subtitle">The Seraph passes judgment upon your forces...</div>
      <div class="dj-phases">
        <div class="dj-phase wrath" id="djPhaseWrath">
          <span class="dj-phase-icon">🔥</span>
          <span class="dj-phase-name">WRATH</span>
          <span class="dj-phase-desc">High power units are burned</span>
        </div>
        <div class="dj-phase pride" id="djPhasePride">
          <span class="dj-phase-icon">💚</span>
          <span class="dj-phase-name">PRIDE</span>
          <span class="dj-phase-desc">Buffed units lose their blessings</span>
        </div>
        <div class="dj-phase violence" id="djPhaseViolence">
          <span class="dj-phase-icon">🖤</span>
          <span class="dj-phase-name">VIOLENCE</span>
          <span class="dj-phase-desc">Killers are silenced</span>
        </div>
      </div>
    </div>
  `;
  
  // Play judgment sound
  const judgmentSound = new Audio('/audio/sfx/divine-judgment.mp3');
  judgmentSound.volume = 0.6;
  judgmentSound.play().catch(() => {});
  
  // Start screen shake
  gameContainer.classList.add('divine-judgment-shake');
  document.body.classList.add('divine-judgment-shake');
  
  // Show cinematic overlay
  cinematicOverlay.classList.add('visible');
  
  // Timeline of events
  const timeline = {
    titleFadeIn: 100,        // Title fades in
    wrathStart: 1200,        // Wrath phase starts
    wrathCardsEffect: 1500,  // Cards burn red
    prideStart: 2800,        // Pride phase starts  
    prideCardsEffect: 3100,  // Cards turn green
    violenceStart: 4400,     // Violence phase starts
    violenceCardsEffect: 4700, // Cards darken
    shakeEnd: 5500,          // Screen stops shaking
    cinematicEnd: 6000       // Cinematic fades, key appears
  };
  
  // Render immediately so the judgment state from server is applied to cards
  // This will apply the persistent judged-wrath/pride/violence classes
  renderAll();
  
  // Title fade in (already visible from CSS animation)
  
  // WRATH phase
  setTimeout(() => {
    const wrathPhase = document.getElementById('djPhaseWrath');
    if (wrathPhase) wrathPhase.classList.add('active');
    
    // Play wrath sound
    const wrathSound = new Audio('/audio/sfx/fire-damage.mp3');
    wrathSound.volume = 0.4;
    wrathSound.play().catch(() => {});
  }, timeline.wrathStart);
  
  // Apply wrath visual to cards
  setTimeout(() => {
    if (data.wrathful && data.wrathful.length > 0) {
      data.wrathful.forEach(unit => {
        applyJudgmentEffectToUnit(unit, 'wrath');
      });
    }
  }, timeline.wrathCardsEffect);
  
  // PRIDE phase
  setTimeout(() => {
    const pridePhase = document.getElementById('djPhasePride');
    if (pridePhase) pridePhase.classList.add('active');
    
    // Play pride sound
    const prideSound = new Audio('/audio/sfx/debuff.mp3');
    prideSound.volume = 0.4;
    prideSound.play().catch(() => {});
  }, timeline.prideStart);
  
  // Apply pride visual to cards
  setTimeout(() => {
    if (data.prideful && data.prideful.length > 0) {
      data.prideful.forEach(unit => {
        applyJudgmentEffectToUnit(unit, 'pride');
      });
    }
  }, timeline.prideCardsEffect);
  
  // VIOLENCE phase
  setTimeout(() => {
    const violencePhase = document.getElementById('djPhaseViolence');
    if (violencePhase) violencePhase.classList.add('active');
    
    // Play violence sound
    const violenceSound = new Audio('/audio/sfx/stun.mp3');
    violenceSound.volume = 0.4;
    violenceSound.play().catch(() => {});
  }, timeline.violenceStart);
  
  // Apply violence visual to cards
  setTimeout(() => {
    if (data.violent && data.violent.length > 0) {
      data.violent.forEach(unit => {
        applyJudgmentEffectToUnit(unit, 'violence');
      });
    }
  }, timeline.violenceCardsEffect);
  
  // Stop screen shake
  setTimeout(() => {
    gameContainer.classList.remove('divine-judgment-shake');
    document.body.classList.remove('divine-judgment-shake');
  }, timeline.shakeEnd);
  
  // End cinematic, show persistent key
  setTimeout(() => {
    cinematicOverlay.classList.remove('visible');
    cinematicOverlay.classList.add('fading');
    
    // Unblock game actions
    S.divineJudgmentCinematicActive = false;
    
    setTimeout(() => {
      cinematicOverlay.remove();
    }, 500);
    
    // Show the persistent key indicator
    gameContainer.classList.add('divine-judgment-active');
    document.body.classList.add('divine-judgment-active');
    showDivineJudgmentOverlay(data);
    renderAll();
  }, timeline.cinematicEnd);
}

function applyJudgmentEffectToUnit(unitData, effectType) {
  // Find the unit on the board by searching through cells
  const board = document.getElementById('board');
  if (!board) return;
  
  // Find units that have the judgment class already applied (from renderAll)
  // and add a flash effect on top
  const units = board.querySelectorAll('.unit');
  units.forEach(unitEl => {
    const nameEl = unitEl.querySelector('.unitName');
    if (nameEl && nameEl.textContent === unitData.name) {
      // Apply cinematic flash effect class on top of persistent state
      if (effectType === 'wrath' && unitEl.classList.contains('judged-wrath')) {
        unitEl.classList.add('judgment-wrath-flash');
        setTimeout(() => {
          unitEl.classList.remove('judgment-wrath-flash');
        }, 800);
      } else if (effectType === 'pride' && unitEl.classList.contains('judged-pride')) {
        unitEl.classList.add('judgment-pride-flash');
        setTimeout(() => {
          unitEl.classList.remove('judgment-pride-flash');
        }, 800);
      } else if (effectType === 'violence' && unitEl.classList.contains('judged-violence')) {
        unitEl.classList.add('judgment-violence-flash');
        setTimeout(() => {
          unitEl.classList.remove('judgment-violence-flash');
        }, 800);
      }
    }
  });
}

function showDivineJudgmentOverlay(data) {
  // Create or update divine judgment key indicator
  let indicator = document.getElementById('divineJudgmentIndicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'divineJudgmentIndicator';
    document.body.appendChild(indicator);
  }
  
  indicator.innerHTML = `
    <div class="divine-judgment-title">⚖️ DIVINE JUDGMENT (${data.turnsLeft} turns)</div>
    <div class="divine-judgment-key">
      <div class="judgment-key-item wrath">
        <span class="judgment-icon">🔥</span>
        <span class="judgment-label">WRATH</span>
        <span class="judgment-desc">4+ ATK = 2 damage</span>
      </div>
      <div class="judgment-key-item pride">
        <span class="judgment-icon">💚</span>
        <span class="judgment-label">PRIDE</span>
        <span class="judgment-desc">Buffed = Buffs suppressed</span>
      </div>
      <div class="judgment-key-item violence">
        <span class="judgment-icon">🖤</span>
        <span class="judgment-label">VIOLENCE</span>
        <span class="judgment-desc">Killed = Stunned</span>
      </div>
    </div>
  `;
  indicator.classList.add('visible');
}

function updateDivineJudgmentOverlay(turnsLeft) {
  const indicator = document.getElementById('divineJudgmentIndicator');
  if (indicator) {
    const title = indicator.querySelector('.divine-judgment-title');
    if (title) {
      title.innerHTML = `⚖️ DIVINE JUDGMENT (${turnsLeft} turns)`;
    }
  }
}

function hideDivineJudgmentOverlay() {
  const gameContainer = document.getElementById('gameContainer') || document.body;
  gameContainer.classList.remove('divine-judgment-active');
  document.body.classList.remove('divine-judgment-active');
  
  const indicator = document.getElementById('divineJudgmentIndicator');
  if (indicator) {
    indicator.classList.remove('visible');
  }
}

// ==================== END DIVINE JUDGMENT EVENT ====================

// ==================== CHEAT CODE EVENT ====================

socket.on("cheatCodeStart", (data) => {
  console.log("Cheat Code activated:", data);
  
  // Store active cheat effects
  if (data.cheat.code === 'HESOYAM') {
    S.cheatHesoyamActive = true;
    S.cheatHesoyamTurnsLeft = data.hesoyamTurnsLeft;
  } else if (data.cheat.code === 'GREEDISGOOD') {
    S.cheatGreedActive = true;
    S.cheatGreedTurnsLeft = data.greedTurnsLeft;
  }
  
  // Start cinematic sequence
  playCheatCodeCinematic(data);
});

socket.on("cheatCodeUpdate", (data) => {
  console.log("Cheat Code update:", data);
  if (data.cheat === 'HESOYAM') {
    S.cheatHesoyamTurnsLeft = data.turnsLeft;
    updateCheatCodeIndicator();
  } else if (data.cheat === 'GREEDISGOOD') {
    S.cheatGreedTurnsLeft = data.turnsLeft;
    updateCheatCodeIndicator();
  }
});

socket.on("cheatCodeEnd", (data) => {
  console.log("Cheat Code ended:", data);
  if (data.cheat === 'HESOYAM') {
    S.cheatHesoyamActive = false;
    S.cheatHesoyamTurnsLeft = 0;
  } else if (data.cheat === 'GREEDISGOOD') {
    S.cheatGreedActive = false;
    S.cheatGreedTurnsLeft = 0;
  }
  
  updateCheatCodeIndicator();
  renderAll();
});

function playCheatCodeCinematic(data) {
  const gameContainer = document.getElementById('gameContainer') || document.body;
  const cheat = data.cheat;
  
  // Block game actions during cinematic
  S.cheatCodeCinematicActive = true;
  
  // Create cinematic overlay
  let cinematicOverlay = document.getElementById('cheatCodeCinematic');
  if (!cinematicOverlay) {
    cinematicOverlay = document.createElement('div');
    cinematicOverlay.id = 'cheatCodeCinematic';
    document.body.appendChild(cinematicOverlay);
  }
  
  cinematicOverlay.innerHTML = `
    <div class="cc-cinematic-content">
      <div class="cc-glitch-bg"></div>
      <div class="cc-code-input" id="ccCodeInput"></div>
      <div class="cc-activated">CHEAT ACTIVATED</div>
      <div class="cc-effect-name" id="ccEffectName">${cheat.name}</div>
      <div class="cc-effect-desc" id="ccEffectDesc">${cheat.description}</div>
    </div>
  `;
  
  // Play glitch sound
  const glitchSound = new Audio('/audio/sfx/glitch.mp3');
  glitchSound.volume = 0.5;
  glitchSound.play().catch(() => {});
  
  // Start screen glitch effect
  gameContainer.classList.add('cheat-code-glitch');
  document.body.classList.add('cheat-code-glitch');
  
  // Show cinematic overlay
  cinematicOverlay.classList.add('visible');
  
  // Type out the cheat code letter by letter
  const codeInput = document.getElementById('ccCodeInput');
  const code = cheat.code;
  let charIndex = 0;
  
  const typeInterval = setInterval(() => {
    if (charIndex < code.length) {
      codeInput.textContent += code[charIndex];
      // Play key press sound
      const keySound = new Audio('/audio/sfx/key-press.mp3');
      keySound.volume = 0.2;
      keySound.play().catch(() => {});
      charIndex++;
    } else {
      clearInterval(typeInterval);
    }
  }, 120);
  
  // Timeline
  const timeline = {
    codeTypeDone: code.length * 120 + 500,  // After code is typed + pause
    activatedShow: code.length * 120 + 800,  // Show "CHEAT ACTIVATED"
    effectShow: code.length * 120 + 1500,    // Show effect name/desc
    applyEffect: code.length * 120 + 2000,   // Apply visual effect to cards
    glitchEnd: code.length * 120 + 3500,     // Stop glitch
    cinematicEnd: code.length * 120 + 4000   // End cinematic
  };
  
  // Show "CHEAT ACTIVATED" text
  setTimeout(() => {
    const activated = cinematicOverlay.querySelector('.cc-activated');
    if (activated) activated.classList.add('visible');
    
    // Play activation sound
    const activateSound = new Audio('/audio/sfx/cheat-activate.mp3');
    activateSound.volume = 0.6;
    activateSound.play().catch(() => {});
  }, timeline.activatedShow);
  
  // Show effect name and description
  setTimeout(() => {
    const effectName = document.getElementById('ccEffectName');
    const effectDesc = document.getElementById('ccEffectDesc');
    if (effectName) effectName.classList.add('visible');
    if (effectDesc) effectDesc.classList.add('visible');
  }, timeline.effectShow);
  
  // Apply visual effect to affected units
  setTimeout(() => {
    if (data.affectedUnits && data.affectedUnits.length > 0) {
      data.affectedUnits.forEach(unit => {
        applyCheatEffectToUnit(unit, cheat.code);
      });
    }
    renderAll();
  }, timeline.applyEffect);
  
  // Stop glitch effect
  setTimeout(() => {
    gameContainer.classList.remove('cheat-code-glitch');
    document.body.classList.remove('cheat-code-glitch');
  }, timeline.glitchEnd);
  
  // End cinematic
  setTimeout(() => {
    cinematicOverlay.classList.remove('visible');
    cinematicOverlay.classList.add('fading');
    
    // Unblock game actions
    S.cheatCodeCinematicActive = false;
    
    setTimeout(() => {
      cinematicOverlay.remove();
    }, 500);
    
    // Show persistent indicator if duration effect
    if (cheat.code === 'HESOYAM' || cheat.code === 'GREEDISGOOD') {
      showCheatCodeIndicator(cheat);
    }
    
    renderAll();
  }, timeline.cinematicEnd);
}

function applyCheatEffectToUnit(unitData, cheatCode) {
  const board = document.getElementById('board');
  if (!board) return;
  
  const units = board.querySelectorAll('.unit');
  units.forEach(unitEl => {
    const nameEl = unitEl.querySelector('.unitName');
    if (nameEl && nameEl.textContent === unitData.name) {
      // Flash effect based on cheat type
      if (cheatCode === 'IDKFA' || cheatCode === 'BIGHEAD') {
        unitEl.classList.add('cheat-buff-flash');
        setTimeout(() => unitEl.classList.remove('cheat-buff-flash'), 800);
      } else if (cheatCode === 'HOWDOITURNTHISON') {
        unitEl.classList.add('cheat-swap-flash');
        setTimeout(() => unitEl.classList.remove('cheat-swap-flash'), 800);
      }
    }
  });
}

function showCheatCodeIndicator(cheat) {
  let indicator = document.getElementById('cheatCodeIndicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'cheatCodeIndicator';
    document.body.appendChild(indicator);
  }
  
  updateCheatCodeIndicator();
  indicator.classList.add('visible');
}

function updateCheatCodeIndicator() {
  const indicator = document.getElementById('cheatCodeIndicator');
  if (!indicator) return;
  
  let content = '<div class="cc-indicator-title">🎮 ACTIVE CHEATS</div>';
  let hasActiveCheat = false;
  
  if (S.cheatHesoyamActive && S.cheatHesoyamTurnsLeft > 0) {
    content += `<div class="cc-indicator-item hesoyam">
      <span class="cc-indicator-code">HESOYAM</span>
      <span class="cc-indicator-effect">Bankrupt (${S.cheatHesoyamTurnsLeft} turns)</span>
    </div>`;
    hasActiveCheat = true;
  }
  
  if (S.cheatGreedActive && S.cheatGreedTurnsLeft > 0) {
    content += `<div class="cc-indicator-item greed">
      <span class="cc-indicator-code">GREEDISGOOD</span>
      <span class="cc-indicator-effect">All cards cost 1 (${S.cheatGreedTurnsLeft} turns)</span>
    </div>`;
    hasActiveCheat = true;
  }
  
  indicator.innerHTML = content;
  
  if (hasActiveCheat) {
    indicator.classList.add('visible');
  } else {
    indicator.classList.remove('visible');
  }
}

function hideCheatCodeIndicator() {
  const indicator = document.getElementById('cheatCodeIndicator');
  if (indicator) {
    indicator.classList.remove('visible');
  }
}

// ==================== END CHEAT CODE EVENT ====================

// Rune characters for eclipse obfuscation
const RUNE_CHARS = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟᚳᚴᚵᚶᚸᚻᚼᚽᚿᛀᛂᛄᛅᛆᛋᛍᛎᛐᛑᛓᛔᛕᛖᛘᛙᛛᛝᛠᛡᛢᛣᛤᛥᛦᛧᛨᛩᛪ';

function textToRunes(text) {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === ' ' || char === '\n') {
      result += char;
    } else if (/[a-zA-Z0-9]/.test(char)) {
      // Convert alphanumeric to runes
      result += RUNE_CHARS[Math.floor(Math.random() * RUNE_CHARS.length)];
    } else {
      // Keep punctuation and emojis
      result += char;
    }
  }
  return result;
}

function obfuscateEventLog() {
  // Obfuscate event log
  const eventLog = document.getElementById('log');
  if (eventLog) {
    const entries = eventLog.querySelectorAll('.log-entry');
    entries.forEach(entry => {
      if (!entry.dataset.originalText) {
        entry.dataset.originalText = entry.innerHTML;
      }
      entry.innerHTML = textToRunes(entry.dataset.originalText);
    });
  }
  
  // Obfuscate combat log too
  const combatLog = document.getElementById('combatLog');
  if (combatLog) {
    const entries = combatLog.querySelectorAll('.combat-entry');
    entries.forEach(entry => {
      if (!entry.dataset.originalText) {
        entry.dataset.originalText = entry.innerHTML;
      }
      entry.innerHTML = textToRunes(entry.dataset.originalText);
    });
  }
}

function restoreEventLog() {
  // Restore event log
  const eventLog = document.getElementById('log');
  if (eventLog) {
    const entries = eventLog.querySelectorAll('.log-entry');
    entries.forEach(entry => {
      if (entry.dataset.originalText) {
        entry.innerHTML = entry.dataset.originalText;
        delete entry.dataset.originalText;
      }
    });
  }
  
  // Restore combat log too
  const combatLog = document.getElementById('combatLog');
  if (combatLog) {
    const entries = combatLog.querySelectorAll('.combat-entry');
    entries.forEach(entry => {
      if (entry.dataset.originalText) {
        entry.innerHTML = entry.dataset.originalText;
        delete entry.dataset.originalText;
      }
    });
  }
}

function showEclipseOverlay(effect) {
  // Add eclipse class to game container, body, and animation layer for visual effect
  const gameContainer = document.getElementById('gameContainer') || document.body;
  gameContainer.classList.add('eclipse-active');
  document.body.classList.add('eclipse-active');
  
  const animLayer = document.getElementById('cardAnimationLayer');
  if (animLayer) animLayer.classList.add('eclipse-active');
  
  // Create or show background darkening overlay
  let bgOverlay = document.getElementById('eclipseBackgroundOverlay');
  if (!bgOverlay) {
    bgOverlay = document.createElement('div');
    bgOverlay.id = 'eclipseBackgroundOverlay';
    document.body.insertBefore(bgOverlay, document.body.firstChild);
  }
  // Small delay to trigger CSS transition
  requestAnimationFrame(() => {
    bgOverlay.classList.add('active');
  });
  
  // Obfuscate event log with runes
  obfuscateEventLog();
  
  // Create or update eclipse indicator
  let indicator = document.getElementById('eclipseIndicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'eclipseIndicator';
    document.body.appendChild(indicator);
  }
  
  // Display the effect label
  const label = effect ? effect.label : '???';
  indicator.innerHTML = `🌑 ECLIPSE ${label}`;
  indicator.classList.add('visible');
}

function hideEclipseOverlay() {
  const gameContainer = document.getElementById('gameContainer') || document.body;
  gameContainer.classList.remove('eclipse-active');
  document.body.classList.remove('eclipse-active');
  
  const animLayer = document.getElementById('cardAnimationLayer');
  if (animLayer) animLayer.classList.remove('eclipse-active');
  
  // Fade out background overlay
  const bgOverlay = document.getElementById('eclipseBackgroundOverlay');
  if (bgOverlay) {
    bgOverlay.classList.remove('active');
  }
  
  // Restore event log text
  restoreEventLog();
  
  const indicator = document.getElementById('eclipseIndicator');
  if (indicator) {
    indicator.classList.remove('visible');
  }
}

// Animate chalice falling onto a tile
function animateChaliceSpawn(serverRow, col) {
  const viewRow = toViewRow(serverRow);
  const cellEl = document.getElementById(cellId(viewRow, col));
  if (!cellEl) return;
  
  const rect = cellEl.getBoundingClientRect();
  
  // Create falling chalice (emoji)
  const chalice = document.createElement('div');
  chalice.className = 'chalice-spawn-anim';
  chalice.textContent = '🍷';
  chalice.style.left = rect.left + rect.width / 2 + 'px';
  chalice.style.top = rect.top - 100 + 'px';
  
  document.body.appendChild(chalice);
  
  // Animate fall
  requestAnimationFrame(() => {
    chalice.style.top = rect.top + rect.height / 2 + 'px';
    chalice.style.opacity = '1';
    chalice.style.transform = 'translateX(-50%) translateY(-50%) scale(1)';
  });
  
  // Remove after animation and re-render
  setTimeout(() => {
    chalice.remove();
    renderAll();
  }, 600);
}

// Animate chalice being consumed
function animateChaliceConsume(serverRow, col) {
  const viewRow = toViewRow(serverRow);
  const cellEl = document.getElementById(cellId(viewRow, col));
  if (!cellEl) return;
  
  const rect = cellEl.getBoundingClientRect();
  
  // Create consumption effect (emoji rising)
  const effect = document.createElement('div');
  effect.className = 'chalice-consume-anim';
  effect.innerHTML = '🍷<span class="heal-text">+1 MAX HP</span>';
  effect.style.left = rect.left + rect.width / 2 + 'px';
  effect.style.top = rect.top + rect.height / 2 + 'px';
  
  document.body.appendChild(effect);
  
  // Animate upward and fade
  requestAnimationFrame(() => {
    effect.style.top = rect.top - 30 + 'px';
    effect.style.opacity = '0';
  });
  
  setTimeout(() => effect.remove(), 800);
}

// Gem fall and impact animation for gem rain event
function animateGemFall(serverRow, col, gemType, effect, unitName) {
  const viewRow = toViewRow(serverRow);
  const cellEl = document.getElementById(cellId(viewRow, col));
  if (!cellEl) return;
  
  const rect = cellEl.getBoundingClientRect();
  
  // Create falling gem image
  const gemEl = document.createElement('div');
  gemEl.className = 'gem-falling';
  gemEl.style.cssText = `
    position: fixed;
    left: ${rect.left + rect.width / 2}px;
    top: -60px;
    width: 50px;
    height: 50px;
    background-image: url('/images/gems/gem-${gemType}.png');
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    transform: translateX(-50%);
    z-index: 1000;
    filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.8));
    pointer-events: none;
  `;
  document.body.appendChild(gemEl);
  
  // Animate the fall (slower - 700ms)
  const targetY = rect.top + rect.height / 2;
  const duration = 700;
  const startTime = performance.now();
  const startY = -60;
  
  function animateFall(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Easing function for acceleration (ease-in)
    const easeIn = progress * progress;
    const currentY = startY + (targetY - startY) * easeIn;
    
    // Add slight rotation during fall
    const rotation = progress * 360;
    
    gemEl.style.top = currentY + 'px';
    gemEl.style.transform = `translateX(-50%) rotate(${rotation}deg)`;
    
    if (progress < 1) {
      requestAnimationFrame(animateFall);
    } else {
      // Gem has landed - show impact effect
      gemEl.remove();
      showGemImpact(cellEl, rect, gemType, effect, unitName);
    }
  }
  
  requestAnimationFrame(animateFall);
}

// Show gem impact effect after landing
function showGemImpact(cellEl, rect, gemType, effect, unitName) {
  // Color mapping for each gem type
  const gemColors = {
    ruby: { main: 'rgba(239, 68, 68, 1)', glow: 'rgba(239, 68, 68, 0.6)', enshroud: 'rgba(239, 68, 68, 0.5)' },
    emerald: { main: 'rgba(34, 197, 94, 1)', glow: 'rgba(34, 197, 94, 0.6)', enshroud: 'rgba(34, 197, 94, 0.5)' },
    topaz: { main: 'rgba(251, 146, 60, 1)', glow: 'rgba(251, 146, 60, 0.6)', enshroud: 'rgba(251, 146, 60, 0.5)' },
    obsidian: { main: 'rgba(30, 30, 40, 1)', glow: 'rgba(60, 60, 80, 0.6)', enshroud: 'rgba(0, 0, 0, 0.6)' },
    diamond: { main: 'rgba(255, 255, 255, 1)', glow: 'rgba(200, 220, 255, 0.8)', enshroud: 'rgba(255, 255, 255, 0.5)' }
  };
  
  const colors = gemColors[gemType] || gemColors.diamond;
  
  // Create enshroud overlay on the tile
  const enshroud = document.createElement('div');
  enshroud.className = 'gem-enshroud';
  enshroud.style.cssText = `
    position: absolute;
    inset: 0;
    background: ${colors.enshroud};
    z-index: 50;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s ease-in;
  `;
  cellEl.style.position = 'relative';
  cellEl.appendChild(enshroud);
  
  // Fade in the enshroud
  requestAnimationFrame(() => {
    enshroud.style.opacity = '1';
  });
  
  // Remove enshroud after 1.5 seconds
  setTimeout(() => {
    enshroud.style.transition = 'opacity 0.5s ease-out';
    enshroud.style.opacity = '0';
    setTimeout(() => enshroud.remove(), 500);
  }, 1500);
  
  // Create shockwave ring
  const shockwave = document.createElement('div');
  shockwave.className = 'gem-shockwave';
  shockwave.style.cssText = `
    position: fixed;
    left: ${rect.left + rect.width / 2}px;
    top: ${rect.top + rect.height / 2}px;
    width: 20px;
    height: 20px;
    border: 3px solid ${colors.main};
    border-radius: 50%;
    transform: translate(-50%, -50%);
    z-index: 1001;
    pointer-events: none;
    box-shadow: 0 0 15px ${colors.glow}, inset 0 0 10px ${colors.glow};
  `;
  document.body.appendChild(shockwave);
  
  // Animate shockwave expanding
  requestAnimationFrame(() => {
    shockwave.style.transition = 'all 0.4s ease-out';
    shockwave.style.width = '100px';
    shockwave.style.height = '100px';
    shockwave.style.opacity = '0';
    shockwave.style.borderWidth = '1px';
  });
  
  setTimeout(() => shockwave.remove(), 500);
  
  // Create flash effect
  const flash = document.createElement('div');
  flash.className = 'gem-flash';
  flash.style.cssText = `
    position: fixed;
    left: ${rect.left + rect.width / 2}px;
    top: ${rect.top + rect.height / 2}px;
    width: 80px;
    height: 80px;
    background: radial-gradient(circle, ${colors.main} 0%, ${colors.glow} 40%, transparent 70%);
    border-radius: 50%;
    transform: translate(-50%, -50%) scale(0.3);
    z-index: 1000;
    pointer-events: none;
    opacity: 1;
  `;
  document.body.appendChild(flash);
  
  // Animate flash
  requestAnimationFrame(() => {
    flash.style.transition = 'all 0.3s ease-out';
    flash.style.transform = 'translate(-50%, -50%) scale(1.5)';
    flash.style.opacity = '0';
  });
  
  setTimeout(() => flash.remove(), 400);
  
  // Create sparkle particles
  for (let i = 0; i < 8; i++) {
    const particle = document.createElement('div');
    const angle = (i / 8) * Math.PI * 2;
    const distance = 40 + Math.random() * 20;
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance;
    
    particle.style.cssText = `
      position: fixed;
      left: ${rect.left + rect.width / 2}px;
      top: ${rect.top + rect.height / 2}px;
      width: 6px;
      height: 6px;
      background: ${colors.main};
      border-radius: 50%;
      transform: translate(-50%, -50%);
      z-index: 1002;
      pointer-events: none;
      box-shadow: 0 0 8px ${colors.main}, 0 0 15px ${colors.glow};
    `;
    document.body.appendChild(particle);
    
    // Animate particle outward
    requestAnimationFrame(() => {
      particle.style.transition = 'all 0.4s ease-out';
      particle.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(0)`;
      particle.style.opacity = '0';
    });
    
    setTimeout(() => particle.remove(), 500);
  }
  
  // Show floating effect text
  if (effect && effect !== 'miss') {
    const textEl = document.createElement('div');
    textEl.style.cssText = `
      position: fixed;
      left: ${rect.left + rect.width / 2}px;
      top: ${rect.top + rect.height / 2}px;
      transform: translate(-50%, -50%);
      font-family: 'Cinzel', serif;
      font-size: 14px;
      font-weight: bold;
      color: ${colors.main};
      text-shadow: 0 0 10px rgba(0,0,0,0.8), 0 0 20px ${colors.glow};
      z-index: 1003;
      pointer-events: none;
      white-space: nowrap;
    `;
    textEl.textContent = effect;
    document.body.appendChild(textEl);
    
    // Animate upward and fade
    requestAnimationFrame(() => {
      textEl.style.transition = 'all 0.8s ease-out';
      textEl.style.top = (rect.top - 30) + 'px';
      textEl.style.opacity = '0';
    });
    
    setTimeout(() => textEl.remove(), 900);
  }
  
  // Log to combat log
  if (unitName) {
    const gemNames = { ruby: '💎 Ruby', emerald: '💎 Emerald', topaz: '💎 Topaz', obsidian: '💎 Obsidian', diamond: '💎 Diamond' };
    combatLog(`${gemNames[gemType]} hits ${unitName}: ${effect}`, gemType === 'obsidian' ? 'damage' : 'buff');
  }
}

// Dramatic void collapse countdown and destruction sequence
function showVoidCollapseSequence(tiles, destroyedCount, destroyedUnits = []) {
  // Clear the warning tiles immediately so black hole images disappear
  S.bossEventWarning = null;
  renderAll();
  
  // Create overlay with caution tape wrapped content
  const overlay = document.createElement('div');
  overlay.className = 'void-collapse-overlay';
  overlay.innerHTML = `
    <div class="void-collapse-content">
      <div class="void-collapse-inner">
        <div class="void-collapse-title">VOID COLLAPSE</div>
        <div class="void-collapse-countdown">3</div>
        <div class="void-collapse-subtitle">IMMINENT</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  
  const countdownEl = overlay.querySelector('.void-collapse-countdown');
  const subtitleEl = overlay.querySelector('.void-collapse-subtitle');
  
  // Countdown sequence
  setTimeout(() => {
    countdownEl.textContent = '2';
    countdownEl.classList.add('pulse');
  }, 800);
  
  setTimeout(() => {
    countdownEl.textContent = '1';
  }, 1600);
  
  setTimeout(() => {
    countdownEl.textContent = '💀';
    subtitleEl.textContent = 'DETONATING';
    overlay.classList.add('detonating');
  }, 2400);
  
  // Fade out overlay
  setTimeout(() => {
    overlay.classList.add('fade-out');
    
    // Stop the siren sound when detonation starts
    stopLoopingSound(warningSirenSound);
    warningSirenSound = null;
    
    setTimeout(() => {
      overlay.remove();
      
      // Sort tiles from bottom-left to top-right (highest row first, then lowest col)
      // In server coordinates: higher row = bottom, lower col = left
      const sortedTiles = [...tiles].sort((a, b) => {
        if (b.r !== a.r) return b.r - a.r; // Higher row (bottom) first
        return a.c - b.c; // Lower col (left) first
      });
      
      // Create a map of tile positions to their explosion timing
      const tileTimingMap = {};
      sortedTiles.forEach((tile, index) => {
        tileTimingMap[`${tile.r}-${tile.c}`] = index * 150;
      });
      
      // Trigger implosions in sorted order, with unit death synced to each tile
      sortedTiles.forEach((tile, index) => {
        setTimeout(() => {
          playSFX('implosion');
          animateVoidCollapse(tile.r, tile.c);
          
          // Find if there's a unit on this tile and animate its death
          const unitOnTile = destroyedUnits.find(u => u.r === tile.r && u.c === tile.c);
          if (unitOnTile) {
            // Add to destroying set so it's hidden from render immediately
            voidDestroyingUnits.add(unitOnTile.id);
            renderAll(); // Re-render to hide the unit
            animateUnitVoidDeath(unitOnTile.r, unitOnTile.c, unitOnTile.art);
          }
        }, index * 150);
      });
      
      // Show result in combat log and clear destroying set after all implosions
      const implosionDuration = sortedTiles.length * 150 + 500;
      setTimeout(() => {
        // Clear the destroying set
        voidDestroyingUnits.clear();
        
        if (destroyedCount > 0) {
          combatLog(`VOID COLLAPSE DETONATED! ${destroyedCount} unit(s) obliterated!`, "boss-execute");
        } else {
          combatLog(`VOID COLLAPSE - All units escaped!`, "boss-execute");
        }
      }, implosionDuration);
    }, 500);
  }, 3000);
}

// Animate a unit disintegrating into the void
function animateUnitVoidDeath(serverRow, col, artPath) {
  const viewRow = toViewRow(serverRow);
  const cellEl = document.getElementById(cellId(viewRow, col));
  if (!cellEl) return;
  
  const rect = cellEl.getBoundingClientRect();
  
  // Create container for the disintegration effect
  const container = document.createElement('div');
  container.className = 'void-death-container';
  container.style.left = rect.left + 'px';
  container.style.top = rect.top + 'px';
  container.style.width = rect.width + 'px';
  container.style.height = rect.height + 'px';
  
  // Create the unit image that will fade
  const unitGhost = document.createElement('div');
  unitGhost.className = 'void-death-unit';
  unitGhost.style.width = '100%';
  unitGhost.style.height = '100%';
  if (artPath) {
    unitGhost.style.backgroundImage = `url('${encodeURI(artPath)}')`;
  }
  container.appendChild(unitGhost);
  
  // Create disintegration particles
  const particleCount = 30;
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'void-death-particle';
    
    // Random position within the unit
    const startX = Math.random() * 100;
    const startY = Math.random() * 100;
    
    // Random direction outward then inward to center
    const angle = Math.random() * Math.PI * 2;
    const distance = 30 + Math.random() * 50;
    const size = 2 + Math.random() * 4;
    const delay = Math.random() * 0.3;
    const duration = 0.5 + Math.random() * 0.3;
    
    particle.style.left = startX + '%';
    particle.style.top = startY + '%';
    particle.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
    particle.style.setProperty('--ty', `${Math.sin(angle) * distance}px`);
    particle.style.setProperty('--size', `${size}px`);
    particle.style.setProperty('--delay', `${delay}s`);
    particle.style.setProperty('--duration', `${duration}s`);
    
    container.appendChild(particle);
  }
  
  document.body.appendChild(container);
  
  // Trigger the disintegration animation
  requestAnimationFrame(() => {
    unitGhost.classList.add('disintegrating');
  });
  
  // Remove after animation (150ms - before next tile explodes)
  setTimeout(() => {
    container.remove();
  }, 150);
}

// Animate void collapse destruction effect on a single tile
function animateVoidCollapse(serverRow, col) {
  const viewRow = toViewRow(serverRow);
  const cellEl = document.getElementById(cellId(viewRow, col));
  if (!cellEl) return;
  
  const rect = cellEl.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  
  // 1. Create bright flash
  const flash = document.createElement('div');
  flash.className = 'void-detonation-flash';
  cellEl.appendChild(flash);
  
  // 2. Create shockwave ring
  const shockwave = document.createElement('div');
  shockwave.className = 'void-detonation-shockwave';
  cellEl.appendChild(shockwave);
  
  // 3. Create disintegrating particles
  const particleCount = 20;
  const particles = [];
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'void-detonation-particle';
    
    // Random direction and distance
    const angle = (Math.PI * 2 * i / particleCount) + (Math.random() * 0.5 - 0.25);
    const distance = 40 + Math.random() * 60;
    const size = 3 + Math.random() * 5;
    const duration = 0.4 + Math.random() * 0.4;
    
    particle.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
    particle.style.setProperty('--ty', `${Math.sin(angle) * distance}px`);
    particle.style.setProperty('--size', `${size}px`);
    particle.style.setProperty('--duration', `${duration}s`);
    particle.style.setProperty('--delay', `${Math.random() * 0.1}s`);
    
    cellEl.appendChild(particle);
    particles.push(particle);
  }
  
  // Screen shake effect
  document.body.classList.add('screen-shake');
  setTimeout(() => {
    document.body.classList.remove('screen-shake');
  }, 300);
  
  // Purple flash effect on the cell itself using a box-shadow
  cellEl.style.transition = 'none';
  cellEl.style.boxShadow = '0 0 40px rgba(147, 51, 234, 1), 0 0 80px rgba(147, 51, 234, 0.8), inset 0 0 30px rgba(192, 132, 252, 0.9)';
  
  setTimeout(() => {
    cellEl.style.transition = 'box-shadow 0.4s ease-out';
    cellEl.style.boxShadow = '';
  }, 100);
  
  // Cleanup
  setTimeout(() => {
    flash.remove();
    shockwave.remove();
    particles.forEach(p => p.remove());
  }, 1000);
}

// ==================== GHOST TRAIN SEQUENCE ====================

// Dramatic ghost train arrival and destruction sequence
function showGhostTrainSequence(lines, tiles, destroyedCount, destroyedUnits) {
  // Create overlay with western/spooky theme
  const overlay = document.createElement('div');
  overlay.className = 'ghost-train-overlay';
  overlay.innerHTML = `
    <div class="ghost-train-content">
      <div class="ghost-train-inner">
        <div class="ghost-train-whistle"><img src="/images/ghost-train-horizontal.png" alt="Ghost Train" style="height: 80px; width: auto; filter: drop-shadow(0 0 20px rgba(100, 200, 255, 0.8));"></div>
        <div class="ghost-train-title">GHOST TRAIN</div>
        <div class="ghost-train-countdown">3</div>
        <div class="ghost-train-subtitle">ALL ABOARD THE DEATH EXPRESS</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  
  const countdownEl = overlay.querySelector('.ghost-train-countdown');
  const whistleEl = overlay.querySelector('.ghost-train-whistle');
  const subtitleEl = overlay.querySelector('.ghost-train-subtitle');
  
  // Countdown sequence with train horn effects
  setTimeout(() => {
    countdownEl.textContent = '2';
    countdownEl.classList.add('pulse');
    whistleEl.classList.add('shake');
  }, 800);
  
  setTimeout(() => {
    countdownEl.textContent = '1';
  }, 1600);
  
  setTimeout(() => {
    countdownEl.textContent = '💀';
    subtitleEl.textContent = 'IMPACT';
    overlay.classList.add('impact');
    whistleEl.classList.add('rushing');
  }, 2400);
  
  // Fade out overlay
  setTimeout(() => {
    overlay.classList.add('fade-out');
    
    setTimeout(() => {
      overlay.remove();
      
      // NOW trigger the train passing animation on each line
      lines.forEach((line, index) => {
        setTimeout(() => {
          animateGhostTrainLine(line, tiles.filter(t => 
            (line.type === 'row' && t.r === line.index) ||
            (line.type === 'col' && t.c === line.index)
          ));
        }, index * 400);
      });
      
      // Show result in combat log after animations
      const animationDuration = lines.length * 400 + 1500;
      setTimeout(() => {
        if (destroyedCount > 0) {
          combatLog(`🚂 GHOST TRAIN STRIKES! ${destroyedCount} unit(s) destroyed!`, "boss-execute");
        } else {
          combatLog(`🚂 GHOST TRAIN - All units escaped!`, "boss-execute");
        }
      }, animationDuration);
    }, 500);
  }, 3000);
}

// Animate ghost train passing through a single line (row or column)
function animateGhostTrainLine(line, tiles) {
  const isRow = line.type === 'row';
  
  // For rows: sort right to left (descending column)
  // For columns: we'll sort by actual screen position after getting rects
  if (isRow) {
    tiles.sort((a, b) => b.c - a.c);
  }
  
  // Create the train element that will travel across
  const train = document.createElement('div');
  train.className = 'ghost-train-sprite';
  train.style.position = 'fixed';
  train.style.zIndex = '9999';
  train.style.pointerEvents = 'none';
  train.style.opacity = '0';
  train.style.transition = 'opacity 0.3s ease-in';
  
  // Use image based on direction
  const trainImg = document.createElement('img');
  trainImg.src = isRow ? '/images/ghost-train-horizontal.png' : '/images/ghost-train-vertical.png';
  trainImg.style.height = isRow ? '80px' : '140px';
  trainImg.style.width = 'auto';
  trainImg.style.filter = 'drop-shadow(0 0 15px rgba(100, 200, 255, 0.8)) drop-shadow(0 0 30px rgba(100, 200, 255, 0.5))';
  train.appendChild(trainImg);
  
  document.body.appendChild(train);
  
  // Get all cell positions for this line
  const cellRects = tiles.map(tile => {
    const cell = document.getElementById(cellId(toViewRow(tile.r), tile.c));
    return cell ? cell.getBoundingClientRect() : null;
  }).filter(r => r !== null);
  
  if (cellRects.length === 0) {
    train.remove();
    return;
  }
  
  // For vertical, sort by screen Y position (top to bottom)
  if (!isRow) {
    cellRects.sort((a, b) => a.top - b.top);
  }
  
  const firstRect = cellRects[0];
  const lastRect = cellRects[cellRects.length - 1];
  
  // Position train at start (off-screen)
  // Rows: come from right
  // Columns: come from top, centered on column
  if (isRow) {
    train.style.left = (firstRect.right + 100) + 'px';
    train.style.top = (firstRect.top + firstRect.height / 2 - 40) + 'px';
  } else {
    // Center the train on the column - will adjust after image loads
    const colCenterX = firstRect.left + firstRect.width / 2;
    train.style.left = colCenterX + 'px';
    train.style.transform = 'translateX(-50%)';
    train.style.top = (firstRect.top - 150) + 'px';
  }
  
  // Fade in
  requestAnimationFrame(() => {
    train.style.opacity = '1';
  });
  
  // Screen shake
  document.body.classList.add('screen-shake-heavy');
  
  // Start movement after fade in
  setTimeout(() => {
    train.style.transition = 'left 0.7s linear, top 0.7s linear, opacity 0.3s ease-out';
    if (isRow) {
      train.style.left = (lastRect.left - 200) + 'px';
    } else {
      train.style.top = (lastRect.bottom + 100) + 'px';
    }
  }, 150);
  
  // Trigger impact effects on each tile as train passes
  // For vertical, use the sorted screen positions
  const sortedTiles = isRow ? tiles : tiles.slice().sort((a, b) => {
    const cellA = document.getElementById(cellId(toViewRow(a.r), a.c));
    const cellB = document.getElementById(cellId(toViewRow(b.r), b.c));
    if (!cellA || !cellB) return 0;
    return cellA.getBoundingClientRect().top - cellB.getBoundingClientRect().top;
  });
  
  sortedTiles.forEach((tile, index) => {
    const delay = 150 + (index / sortedTiles.length) * 500;
    setTimeout(() => {
      animateGhostTrainImpact(tile.r, tile.c);
    }, delay);
  });
  
  // Fade out near the end
  setTimeout(() => {
    train.style.opacity = '0';
  }, 700);
  
  // Cleanup
  setTimeout(() => {
    document.body.classList.remove('screen-shake-heavy');
    train.remove();
  }, 1000);
}

// Animate impact effect on a single tile from ghost train
function animateGhostTrainImpact(serverRow, col) {
  const viewRow = toViewRow(serverRow);
  const cellEl = document.getElementById(cellId(viewRow, col));
  if (!cellEl) return;
  
  // Create impact flash - blue/ghostly
  const flash = document.createElement('div');
  flash.className = 'ghost-train-impact-flash';
  cellEl.appendChild(flash);
  
  // Create sparks/debris
  const sparkCount = 12;
  const sparks = [];
  for (let i = 0; i < sparkCount; i++) {
    const spark = document.createElement('div');
    spark.className = 'ghost-train-spark';
    
    const angle = (Math.PI * 2 * i / sparkCount) + (Math.random() * 0.5 - 0.25);
    const distance = 30 + Math.random() * 50;
    const size = 2 + Math.random() * 4;
    const duration = 0.3 + Math.random() * 0.3;
    
    spark.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
    spark.style.setProperty('--ty', `${Math.sin(angle) * distance}px`);
    spark.style.setProperty('--size', `${size}px`);
    spark.style.setProperty('--duration', `${duration}s`);
    
    cellEl.appendChild(spark);
    sparks.push(spark);
  }
  
  // Create smoke puff
  const smoke = document.createElement('div');
  smoke.className = 'ghost-train-smoke';
  cellEl.appendChild(smoke);
  
  // Blue/ghostly flash effect on the cell
  cellEl.style.transition = 'none';
  cellEl.style.boxShadow = '0 0 30px rgba(100, 200, 255, 1), 0 0 60px rgba(100, 200, 255, 0.8), inset 0 0 20px rgba(150, 220, 255, 0.9)';
  
  setTimeout(() => {
    cellEl.style.transition = 'box-shadow 0.4s ease-out';
    cellEl.style.boxShadow = '';
  }, 100);
  
  // Cleanup
  setTimeout(() => {
    flash.remove();
    smoke.remove();
    sparks.forEach(s => s.remove());
  }, 800);
}

// ==================== END GHOST TRAIN SEQUENCE ====================

// Track cells that are currently showing attack animation
let attackingCells = new Map(); // key -> {budgeX, budgeY, timestamp}

// Handle animation events
socket.on("animate", (data) => {
  console.log("Animate event received:", data);
  if (data.type === "move") {
    animateUnitMove(data.unitId, data.fromRow, data.fromCol, data.toRow, data.toCol);
  } else if (data.type === "destroy") {
    animateDestruction(data.row, data.col);
  } else if (data.type === "effect") {
    // AOE/effect animation - source glows, targets shake
    animateEffect(data);
  } else if (data.type === "attack") {
    console.log("Attack animation:", data);
    // Track attacker for budge animation
    const attackerViewRow = toViewRow(data.attackerRow);
    const targetViewRow = toViewRow(data.targetRow);
    
    console.log("attackerViewRow:", attackerViewRow, "targetViewRow:", targetViewRow);
    
    // Calculate direction from attacker to target (in view coordinates)
    const dRow = targetViewRow - attackerViewRow;
    const dCol = data.targetCol - data.attackerCol;
    
    // Normalize and scale for budge distance (15px)
    const len = Math.sqrt(dRow * dRow + dCol * dCol) || 1;
    const budgeX = (dCol / len) * 15;
    const budgeY = (dRow / len) * 15;
    
    console.log("budgeX:", budgeX, "budgeY:", budgeY);
    
    const key = `${data.attackerRow}-${data.attackerCol}`;
    attackingCells.set(key, { budgeX, budgeY });
    
    // Apply animation immediately by finding the unit and adding the class
    const cellIdStr = cellId(attackerViewRow, data.attackerCol);
    console.log("Looking for cell:", cellIdStr);
    const attackerCell = document.getElementById(cellIdStr);
    console.log("Found cell:", attackerCell);
    if (attackerCell) {
      const unitEl = attackerCell.querySelector('.unit');
      console.log("Found unit:", unitEl);
      if (unitEl) {
        unitEl.style.setProperty('--budge-x', `${budgeX}px`);
        unitEl.style.setProperty('--budge-y', `${budgeY}px`);
        unitEl.classList.add('attacking');
        console.log("Added attacking class");
      }
    }
    
    // Remove after animation completes
    setTimeout(() => {
      attackingCells.delete(key);
    }, 300);
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

// Apply attack animation - called from renderAll
function applyAttackAnimation(cell, serverRow, col) {
  const key = `${serverRow}-${col}`;
  if (attackingCells.has(key)) {
    const unitEl = cell.querySelector('.unit');
    if (unitEl) {
      const { budgeX, budgeY } = attackingCells.get(key);
      unitEl.style.setProperty('--budge-x', `${budgeX}px`);
      unitEl.style.setProperty('--budge-y', `${budgeY}px`);
      unitEl.classList.add('attacking');
    }
  }
}

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

// Animate AOE/effect - source unit glows/pulses, targets shake
function animateEffect(data) {
  const { effectType, sourcePos, sourceUnitId, targets } = data;
  console.log("[EFFECT ANIM] effectType:", effectType, "sourcePos:", sourcePos, "targets:", targets);
  
  // Special handling for barrel explosion - ripple effect
  if (effectType === "barrel_explosion" && sourcePos) {
    animateBarrelExplosion(sourcePos, targets);
    return;
  }
  
  // Special handling for reset button - cards fly to deck
  if (effectType === "reset_button" && data.units) {
    animateResetButton(data.units);
    return;
  }
  
  // Special handling for save state resurrection - white glow
  if (effectType === "save_state_revive" && data.targetPos) {
    animateSaveStateRevive(data.targetPos);
    return;
  }
  
  // If there's a source unit, add to tracking set so renderAll applies the animation
  if (sourcePos) {
    const key = `${sourcePos.r}-${sourcePos.c}`;
    effectSourceCells.add(key);
    console.log("[EFFECT ANIM] Added source to tracking:", key);
    
    // Remove after animation completes
    setTimeout(() => {
      effectSourceCells.delete(key);
    }, 700);
  }
  
  // Add targets to hit tracking set after a short delay (for source to glow first)
  setTimeout(() => {
    if (targets && targets.length > 0) {
      targets.forEach((target, index) => {
        setTimeout(() => {
          const key = `${target.r}-${target.c}`;
          effectHitCells.add(key);
          console.log("[EFFECT ANIM] Added hit target to tracking:", key);
          
          // Also directly apply the class since no render will happen
          const viewRow = toViewRow(target.r);
          const targetCell = document.getElementById(cellId(viewRow, target.c));
          if (targetCell) {
            const unitEl = targetCell.querySelector('.unit');
            if (unitEl) {
              unitEl.classList.add('effect-hit');
              console.log("[EFFECT ANIM] Applied effect-hit class to unit");
            }
          }
          
          // Remove after animation completes
          setTimeout(() => {
            effectHitCells.delete(key);
            // Also remove class directly
            if (targetCell) {
              const unitEl = targetCell.querySelector('.unit');
              if (unitEl) {
                unitEl.classList.remove('effect-hit');
              }
            }
          }, 400);
        }, index * 50);
      });
    }
  }, 200);
}

// Barrel explosion ripple animation
function animateBarrelExplosion(sourcePos, targets) {
  const sourceViewRow = toViewRow(sourcePos.r);
  const sourceCell = document.getElementById(cellId(sourceViewRow, sourcePos.c));
  
  // Create explosion overlay on source
  if (sourceCell) {
    const explosionCenter = document.createElement('div');
    explosionCenter.className = 'barrel-explosion-center';
    sourceCell.appendChild(explosionCenter);
    
    setTimeout(() => {
      explosionCenter.remove();
    }, 600);
  }
  
  // Animate ripple to all 8 adjacent tiles (whether they have targets or not)
  const adjacentOffsets = [
    { dr: -1, dc: 0 },  // up
    { dr: 1, dc: 0 },   // down
    { dr: 0, dc: -1 },  // left
    { dr: 0, dc: 1 },   // right
    { dr: -1, dc: -1 }, // up-left
    { dr: -1, dc: 1 },  // up-right
    { dr: 1, dc: -1 },  // down-left
    { dr: 1, dc: 1 }    // down-right
  ];
  
  adjacentOffsets.forEach((offset, index) => {
    const adjRow = sourcePos.r + offset.dr;
    const adjCol = sourcePos.c + offset.dc;
    
    if (adjRow < 0 || adjRow >= ROWS || adjCol < 0 || adjCol >= COLS) return;
    
    const viewRow = toViewRow(adjRow);
    const adjCell = document.getElementById(cellId(viewRow, adjCol));
    
    if (adjCell) {
      // Stagger the ripple slightly based on distance
      const delay = 50 + (Math.abs(offset.dr) + Math.abs(offset.dc) === 2 ? 30 : 0);
      
      setTimeout(() => {
        // Add ripple effect to tile
        const ripple = document.createElement('div');
        ripple.className = 'barrel-explosion-ripple';
        adjCell.appendChild(ripple);
        
        setTimeout(() => {
          ripple.remove();
        }, 500);
      }, delay);
    }
  });
  
  // Shake units that were hit
  if (targets && targets.length > 0) {
    setTimeout(() => {
      targets.forEach((target) => {
        const viewRow = toViewRow(target.r);
        const targetCell = document.getElementById(cellId(viewRow, target.c));
        if (targetCell) {
          const unitEl = targetCell.querySelector('.unit');
          if (unitEl) {
            unitEl.classList.add('effect-hit');
            setTimeout(() => {
              unitEl.classList.remove('effect-hit');
            }, 400);
          }
        }
      });
    }, 100);
  }
}

// Reset Button animation - all cards fly off to their owner's deck
function animateResetButton(units) {
  console.log("[RESET BUTTON] Animating", units.length, "units flying to deck");
  
  // Get the deck positions (top-right for gold, bottom-right for silver from player's perspective)
  const boardEl = document.getElementById('board');
  if (!boardEl) return;
  
  const boardRect = boardEl.getBoundingClientRect();
  
  // Create a flash overlay on the whole board first
  const flashOverlay = document.createElement('div');
  flashOverlay.className = 'reset-button-flash';
  flashOverlay.style.cssText = `
    position: fixed;
    top: ${boardRect.top}px;
    left: ${boardRect.left}px;
    width: ${boardRect.width}px;
    height: ${boardRect.height}px;
    pointer-events: none;
    z-index: 1000;
  `;
  document.body.appendChild(flashOverlay);
  
  setTimeout(() => {
    flashOverlay.remove();
  }, 400);
  
  // Animate each unit flying to their deck
  units.forEach((unit, index) => {
    const viewRow = toViewRow(unit.r);
    const sourceCell = document.getElementById(cellId(viewRow, unit.c));
    if (!sourceCell) return;
    
    const sourceRect = sourceCell.getBoundingClientRect();
    
    // Determine target position based on owner and current player's perspective
    // Gold deck is top-right, Silver deck is bottom-right (from viewer's perspective)
    let targetX, targetY;
    if (unit.owner === 'gold') {
      // Fly to top-right (gold's deck area)
      targetX = boardRect.right + 50;
      targetY = boardRect.top - 50;
    } else {
      // Fly to bottom-right (silver's deck area)
      targetX = boardRect.right + 50;
      targetY = boardRect.bottom + 50;
    }
    
    // Create flying card element
    const flyingCard = document.createElement('div');
    flyingCard.className = 'reset-flying-card';
    
    const artStyle = unit.art ? `background: url('${encodeURI(unit.art)}') center/cover no-repeat` : 'background: linear-gradient(135deg, #4a5568, #2d3748)';
    const ownerColor = unit.owner === 'gold' ? 'rgba(251, 191, 36, 0.8)' : 'rgba(148, 163, 184, 0.8)';
    
    flyingCard.innerHTML = `<div class="flying-card-art" style="${artStyle}"></div>`;
    flyingCard.style.cssText = `
      position: fixed;
      left: ${sourceRect.left}px;
      top: ${sourceRect.top}px;
      width: ${sourceRect.width}px;
      height: ${sourceRect.height}px;
      border-radius: 8px;
      overflow: hidden;
      pointer-events: none;
      z-index: ${1001 + index};
      border: 2px solid ${ownerColor};
      box-shadow: 0 0 15px ${ownerColor};
      transition: all 0.6s cubic-bezier(0.23, 1, 0.32, 1);
    `;
    
    document.body.appendChild(flyingCard);
    
    // Stagger the animations slightly
    setTimeout(() => {
      flyingCard.style.left = `${targetX}px`;
      flyingCard.style.top = `${targetY}px`;
      flyingCard.style.transform = 'scale(0.3) rotate(360deg)';
      flyingCard.style.opacity = '0';
    }, 50 + index * 30);
    
    // Remove after animation
    setTimeout(() => {
      flyingCard.remove();
    }, 700 + index * 30);
  });
  
  // Play a whoosh sound if available
  playSFX('cardDraw');
}

// Save State resurrection animation - bright white glow that fades
function animateSaveStateRevive(targetPos) {
  console.log("[SAVE STATE REVIVE] Animating resurrection at", targetPos);
  
  const viewRow = toViewRow(targetPos.r);
  const targetCell = document.getElementById(cellId(viewRow, targetPos.c));
  if (!targetCell) return;
  
  // Create the white glow overlay
  const glowOverlay = document.createElement('div');
  glowOverlay.className = 'save-state-revive-glow';
  targetCell.appendChild(glowOverlay);
  
  // Also add a class to the unit for the white flash effect
  const unitEl = targetCell.querySelector('.unit');
  if (unitEl) {
    unitEl.classList.add('save-state-reviving');
    
    // Remove the class after animation
    setTimeout(() => {
      unitEl.classList.remove('save-state-reviving');
    }, 800);
  }
  
  // Remove overlay after animation
  setTimeout(() => {
    glowOverlay.remove();
  }, 800);
  
  // Play a sound effect
  playSFX('heal');
}

// Animate unit movement on board
function animateUnitMove(unitId, fromRow, fromCol, toRow, toCol) {
  console.log("[SFX] animateUnitMove called");
  const fromViewRow = toViewRow(fromRow);
  const toViewRowVal = toViewRow(toRow);
  
  const fromCell = document.getElementById(cellId(fromViewRow, fromCol));
  const toCell = document.getElementById(cellId(toViewRowVal, toCol));
  
  if (!fromCell || !toCell) return;
  
  const unit = S.units[unitId];
  if (!unit) return;
  
  // Play move sound
  playSFX('move');
  
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

// Wizard's Rune death trigger - show wizard selection
socket.on("wizardRuneTrigger", (data) => {
  showWizardSummonModal(data.wizards, data.deathPos);
});

let pendingWizardSummon = null;

function showWizardSummonModal(wizards, deathPos) {
  pendingWizardSummon = { wizards, deathPos };
  
  // Create modal if it doesn't exist
  let modal = document.getElementById("wizardSummonModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "wizardSummonModal";
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modalContent">
        <h2>🧙 Wizards Rune - Summon a Wizard!</h2>
        <p>Select a wizard to summon for free, then click a valid tile to place it.</p>
        <div id="wizardSummonCards" class="discardCards"></div>
        <button id="skipWizardSummon" class="modalBtn">Skip</button>
      </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById("skipWizardSummon").onclick = () => {
      sendAction({ type: "skipWizardSummon" });
      hideWizardSummonModal();
    };
  }
  
  const cardsEl = document.getElementById("wizardSummonCards");
  cardsEl.innerHTML = "";
  
  wizards.forEach(wizard => {
    const card = myHand.find(c => c.id === wizard.id);
    if (!card) return;
    
    const el = document.createElement("div");
    el.className = "handCard";
    
    const icon = CARD_ICONS[card.key] || '🧙';
    const hasArt = card.art;
    const artStyle = hasArt ? `background: url('${card.art}') center/cover no-repeat` : '';
    const artContent = hasArt ? '' : icon;
    
    el.innerHTML = `
      <div class="cardArt" style="${artStyle}">${artContent}</div>
      <div class="cardCost">${card.cost}</div>
      <div class="freeTag">FREE!</div>
      <div class="cardInfoOverlay">
        <div class="cardName">${card.name}</div>
        <div class="cardStats">
          <div class="cardStat cardAtk"><span class="cardStatIcon">⚔</span>${card.atk}</div>
          <div class="cardStat cardHp"><span class="cardStatIcon">♥</span>${card.hp}</div>
        </div>
      </div>
    `;
    
    el.onclick = () => {
      // Select this wizard for placement
      pendingWizardSummon.selectedCardId = card.id;
      pendingWizardSummon.selectedCard = card;
      
      // Highlight valid deployment tiles
      highlightWizardDeployTiles();
      
      // Update UI to show selected
      cardsEl.querySelectorAll(".handCard").forEach(c => c.classList.remove("selected"));
      el.classList.add("selected");
      
      log("Click a valid tile to summon " + card.name);
    };
    
    // Add tooltip on hover
    el.onmouseenter = (e) => showCardTooltip(card, e.clientX, e.clientY);
    el.onmousemove = (e) => {
      if (tooltipEl?.classList.contains("visible")) {
        positionTooltip(e.clientX, e.clientY);
      }
    };
    el.onmouseleave = hideTooltip;
    
    cardsEl.appendChild(el);
  });
  
  modal.classList.remove("hidden");
}

function highlightWizardDeployTiles() {
  clearHighlights();
  // Highlight valid deployment tiles (same as normal deploy)
  for (let vr = 0; vr < ROWS; vr++) {
    const sr = toServerRow(vr);
    for (let c = 0; c < COLS; c++) {
      if (S.board[sr][c]) continue; // Skip occupied
      
      // Check if this is a valid deploy row for player
      const isHomeRow = myRole === "gold" ? sr <= 1 : sr >= 5;
      const isNeutral = sr >= 2 && sr <= 4;
      const canDeploy = isHomeRow || (isNeutral && S.rowHP[sr] <= 0);
      
      if (canDeploy) {
        const el = document.getElementById(cellId(vr, c));
        if (el) el.classList.add("deploy-valid");
      }
    }
  }
}

function hideWizardSummonModal() {
  const modal = document.getElementById("wizardSummonModal");
  if (modal) modal.classList.add("hidden");
  pendingWizardSummon = null;
  clearHighlights();
  hideTooltip();
}

// Time Rift - Chrono Drake resurrection
socket.on("timeRiftTrigger", (data) => {
  console.log("timeRiftTrigger received:", data);
  showTimeRiftModal(data.units, data.deployPos);
});

function showTimeRiftModal(units, deployPos) {
  console.log("showTimeRiftModal called with", units.length, "units");
  
  // Create modal if it doesn't exist
  let modal = document.getElementById("timeRiftModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "timeRiftModal";
    modal.className = "modal hidden";
    modal.innerHTML = `
      <div class="modalContent timeRiftContent">
        <h2>⏳ Time Rift - Resurrect a Unit!</h2>
        <p>Choose a unit from your discard to bring back with full stats.</p>
        <div id="timeRiftCards" class="discardCards"></div>
        <button id="skipTimeRift" class="modalBtn">Skip</button>
      </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById("skipTimeRift").onclick = () => {
      sendAction({ type: "skipTimeRift" });
      hideTimeRiftModal();
    };
  }
  
  const cardsEl = document.getElementById("timeRiftCards");
  cardsEl.innerHTML = "";
  
  if (units.length === 0) {
    cardsEl.innerHTML = "<p>No units in discard!</p>";
  }
  
  units.forEach(unit => {
    const el = document.createElement("div");
    el.className = "handCard";
    
    const icon = CARD_ICONS[unit.key] || '⚔️';
    const hasArt = unit.art;
    const artStyle = hasArt ? `background: url('${unit.art}') center/cover no-repeat` : '';
    const artContent = hasArt ? '' : icon;
    
    el.innerHTML = `
      <div class="cardArt" style="${artStyle}">${artContent}</div>
      <div class="cardInfoOverlay">
        <div class="cardName">${unit.name}</div>
        <div class="cardStats">
          <div class="cardStat cardAtk"><span class="cardStatIcon">⚔</span>${unit.atk}</div>
          <div class="cardStat cardHp"><span class="cardStatIcon">♥</span>${unit.hp}</div>
        </div>
      </div>
    `;
    
    el.onclick = () => {
      sendAction({ type: "timeRiftResurrect", cardId: unit.id });
      hideTimeRiftModal();
    };
    
    cardsEl.appendChild(el);
  });
  
  // Show the modal
  modal.classList.remove("hidden");
  console.log("Modal should be visible now");
}

function hideTimeRiftModal() {
  const modal = document.getElementById("timeRiftModal");
  if (modal) modal.classList.add("hidden");
}

// Resurrection spell handler
socket.on("resurrectionTrigger", (data) => {
  console.log("resurrectionTrigger received:", data);
  showResurrectionModal(data.units);
});

let pendingResurrectionCard = null;

function showResurrectionModal(units) {
  console.log("showResurrectionModal called with", units.length, "units");
  
  // Create modal if it doesn't exist
  let modal = document.getElementById("resurrectionModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "resurrectionModal";
    modal.className = "modal hidden";
    modal.innerHTML = `
      <div class="modalContent resurrectionContent">
        <h2>✨ Resurrection - Choose a Unit!</h2>
        <p>Select a unit from your discard to resurrect anywhere. It gains Immune this turn.</p>
        <div id="resurrectionCards" class="discardCards"></div>
        <button id="skipResurrection" class="modalBtn">Skip</button>
      </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById("skipResurrection").onclick = () => {
      sendAction({ type: "skipResurrection" });
      hideResurrectionModal();
    };
  }
  
  const cardsEl = document.getElementById("resurrectionCards");
  cardsEl.innerHTML = "";
  
  if (units.length === 0) {
    cardsEl.innerHTML = "<p>No units in discard!</p>";
  }
  
  units.forEach(unit => {
    const el = document.createElement("div");
    el.className = "handCard";
    
    const icon = CARD_ICONS[unit.key] || '⚔️';
    const hasArt = unit.art;
    const artStyle = hasArt ? `background: url('${unit.art}') center/cover no-repeat` : '';
    const artContent = hasArt ? '' : icon;
    
    el.innerHTML = `
      <div class="cardArt" style="${artStyle}">${artContent}</div>
      <div class="cardInfoOverlay">
        <div class="cardName">${unit.name}</div>
        <div class="cardStats">
          <div class="cardStat cardAtk"><span class="cardStatIcon">⚔</span>${unit.atk}</div>
          <div class="cardStat cardHp"><span class="cardStatIcon">♥</span>${unit.hp}</div>
        </div>
      </div>
    `;
    
    el.onclick = () => {
      // Store selected card, then let player click a tile
      pendingResurrectionCard = unit;
      hideResurrectionModal();
      S.resurrectionPending = true;
      addLogEntry("Click a tile to place " + unit.name);
    };
    
    cardsEl.appendChild(el);
  });
  
  // Show the modal
  modal.classList.remove("hidden");
  console.log("Resurrection modal should be visible now");
}

function hideResurrectionModal() {
  const modal = document.getElementById("resurrectionModal");
  if (modal) modal.classList.add("hidden");
}

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
  if (!st) {
    console.log("[STATE] Received null/empty state");
    return;
  }
  
  console.log(`[STATE] Received state. Active side: ${st.activeSide}, Turn: ${st.turnNumber}`);

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
  S.attackCountThisTurn = st.attackCountThisTurn || {};
  S.bossEventWarning = st.bossEventWarning || null;
  S.chaliceTiles = st.chaliceTiles || [];
  S.turnNumber = st.turnNumber || 1;
  
  // Handle eclipse state
  const wasEclipseActive = S.eclipseActive;
  S.eclipseActive = st.eclipseActive || false;
  S.eclipseEffect = st.eclipseEffect || null;
  
  // Update eclipse overlay based on state
  if (S.eclipseActive && !wasEclipseActive) {
    showEclipseOverlay(S.eclipseEffect);
  } else if (!S.eclipseActive && wasEclipseActive) {
    hideEclipseOverlay();
  }
  
  // Handle polymorph state
  const wasPolymorphActive = S.polymorphActive;
  S.polymorphActive = st.polymorphActive || false;
  S.polymorphTurnsLeft = st.polymorphTurnsLeft || 0;
  
  // Update polymorph overlay based on state
  if (S.polymorphActive && !wasPolymorphActive) {
    showPolymorphOverlay(S.polymorphTurnsLeft);
  } else if (!S.polymorphActive && wasPolymorphActive) {
    hidePolymorphOverlay();
  } else if (S.polymorphActive && S.polymorphTurnsLeft) {
    // Update turns left display
    const indicator = document.getElementById('polymorphIndicator');
    if (indicator) {
      indicator.innerHTML = `🐑 POLYMORPH (${S.polymorphTurnsLeft} turns)`;
    }
  }
  
  // Debug log boss event warning
  if (st.bossEventWarning) {
    console.log("BOSS EVENT WARNING RECEIVED:", JSON.stringify(st.bossEventWarning));
  }

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
    myDiscard = Array.isArray(st.discard) ? st.discard : [];
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
    
    // Update enemy discard data
    enemyDiscard = Array.isArray(st.enemyDiscard) ? st.enemyDiscard : [];
    if (opponentDiscardCountEl) {
      opponentDiscardCountEl.textContent = enemyDiscard.length;
    }
    
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
  
  // Show game over screen if game ended
  if (S.gameOver && st.winner) {
    showGameOverScreen(st.winner);
  }
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
  console.log("[SFX] animatePlayerDraw called, cardCount:", cardCount);
  const deckEl = document.getElementById("deckTile");
  const handEl = document.getElementById("handSection");
  const animationLayer = document.getElementById("cardAnimationLayer");
  
  if (!deckEl || !handEl || !animationLayer) return;
  
  // Play draw sound
  playSFX('draw');
  
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
  console.log("[SFX] animateOpponentDraw called, cardCount:", cardCount);
  const deckEl = document.getElementById("opponentDeckTile");
  const handEl = document.getElementById("opponentHandSection");
  const animationLayer = document.getElementById("cardAnimationLayer");
  
  if (!deckEl || !handEl || !animationLayer) return;
  
  // Play draw sound
  playSFX('draw');
  
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

// Show game over screen (Victory or Defeat)
function showGameOverScreen(winner) {
  // Don't show for campaign/boss battles - they have their own victory/defeat handling
  if (isCampaign) return;
  
  // Don't show if already shown or if campaign victory will show
  if (document.querySelector('.game-over-overlay')) return;
  
  const isVictory = (myRole === winner);
  
  const overlay = document.createElement('div');
  overlay.className = 'game-over-overlay';
  
  const title = isVictory ? 'VICTORY!' : 'DEFEAT';
  const subtitle = isVictory ? 'You have conquered your enemy!' : 'Your heart has been destroyed...';
  const titleClass = isVictory ? 'victory-title' : 'defeat-title';
  
  overlay.innerHTML = `
    <div class="game-over-content">
      <h1 class="game-over-title ${titleClass}">${title}</h1>
      <p class="game-over-subtitle">${subtitle}</p>
      <div class="game-over-buttons">
        <button class="game-over-btn primary" onclick="window.location.href='/home.html'">Return to Menu</button>
        <button class="game-over-btn secondary" onclick="window.location.reload()">Play Again</button>
      </div>
    </div>
  `;
  
  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    .game-over-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
      animation: fadeIn 0.5s ease-out;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
    .game-over-content {
      text-align: center;
      animation: slideUp 0.6s ease-out;
    }
    
    @keyframes slideUp {
      from { transform: translateY(50px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    
    .game-over-title {
      font-size: 5rem;
      font-weight: bold;
      margin-bottom: 1rem;
      text-shadow: 0 0 40px currentColor, 0 0 80px currentColor;
      animation: pulse 2s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }
    
    .victory-title {
      color: #fbbf24;
      text-shadow: 0 0 40px rgba(251, 191, 36, 0.8), 0 0 80px rgba(251, 191, 36, 0.5);
    }
    
    .defeat-title {
      color: #ef4444;
      text-shadow: 0 0 40px rgba(239, 68, 68, 0.8), 0 0 80px rgba(239, 68, 68, 0.5);
    }
    
    .game-over-subtitle {
      font-size: 1.5rem;
      color: #94a3b8;
      margin-bottom: 3rem;
    }
    
    .game-over-buttons {
      display: flex;
      gap: 1rem;
      justify-content: center;
    }
    
    .game-over-btn {
      padding: 1rem 2rem;
      font-size: 1.2rem;
      font-weight: bold;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .game-over-btn.primary {
      background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
      color: #1e293b;
    }
    
    .game-over-btn.primary:hover {
      transform: translateY(-3px);
      box-shadow: 0 10px 30px rgba(251, 191, 36, 0.4);
    }
    
    .game-over-btn.secondary {
      background: rgba(255, 255, 255, 0.1);
      color: #e2e8f0;
      border: 2px solid rgba(255, 255, 255, 0.3);
    }
    
    .game-over-btn.secondary:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: translateY(-3px);
    }
  `;
  
  document.head.appendChild(style);
  document.body.appendChild(overlay);
}

// Campaign victory - show rewards popup
socket.on("campaignVictory", (data) => {
  // Remove basic game over screen if shown (campaign victory replaces it)
  const basicOverlay = document.querySelector('.game-over-overlay');
  if (basicOverlay) basicOverlay.remove();
  
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
    /* === HOLO CARD EFFECTS BY RARITY === */
    
    /* COMMON HOLO - Simple purple/pink gradient with gentle shimmer */
    .slot-card.holo.common {
      position: relative;
    }
    .slot-card.holo.common::before {
      content: '';
      position: absolute;
      inset: -3px;
      background: linear-gradient(45deg, #a855f7, #ec4899, #a855f7);
      background-size: 200% 200%;
      border-radius: 12px;
      z-index: -1;
      animation: holoCommonShift 4s ease-in-out infinite;
      filter: blur(3px);
    }
    .slot-card.holo.common .card-reveal .card-art {
      position: relative;
    }
    .slot-card.holo.common .card-reveal .card-art::after {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: linear-gradient(135deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0) 100%);
      background-size: 200% 200%;
      animation: holoShine 3s ease-in-out infinite;
      pointer-events: none;
    }
    .slot-card.holo.common .card-reveal .card-name {
      color: #e879f9;
    }
    @keyframes holoCommonShift {
      0%, 100% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
    }
    
    /* RARE HOLO - Electric blue plasma with crackling energy */
    .slot-card.holo.rare {
      position: relative;
    }
    .slot-card.holo.rare::before {
      content: '';
      position: absolute;
      inset: -4px;
      background: linear-gradient(45deg, #06b6d4, #3b82f6, #8b5cf6, #06b6d4, #3b82f6);
      background-size: 300% 300%;
      border-radius: 12px;
      z-index: -1;
      animation: holoRareShift 2s linear infinite;
      filter: blur(4px);
    }
    .slot-card.holo.rare::after {
      content: '⚡';
      position: absolute;
      top: -8px;
      right: -8px;
      font-size: 18px;
      animation: holoRareSpark 1s ease-in-out infinite;
      z-index: 10;
    }
    .slot-card.holo.rare .card-reveal .card-art {
      position: relative;
      overflow: hidden;
    }
    .slot-card.holo.rare .card-reveal .card-art::after {
      content: '';
      position: absolute;
      top: -50%; left: -50%;
      width: 200%; height: 200%;
      background: conic-gradient(from 0deg, transparent, rgba(59, 130, 246, 0.3), transparent, rgba(139, 92, 246, 0.3), transparent);
      animation: holoRareSpin 3s linear infinite;
      pointer-events: none;
    }
    .slot-card.holo.rare .card-reveal .card-art::before {
      content: '';
      position: absolute;
      top: 0; left: -100%;
      width: 50%; height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
      animation: holoRareStreak 2s ease-in-out infinite;
      z-index: 1;
    }
    .slot-card.holo.rare .card-reveal .card-name {
      color: #67e8f9;
      text-shadow: 0 0 10px rgba(103, 232, 249, 0.7);
    }
    @keyframes holoRareShift {
      0% { background-position: 0% 50%; }
      100% { background-position: 300% 50%; }
    }
    @keyframes holoRareSpin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes holoRareStreak {
      0% { left: -100%; }
      100% { left: 200%; }
    }
    @keyframes holoRareSpark {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.3); }
    }
    
    /* LEGENDARY HOLO - ULTIMATE prismatic explosion with particles and fire */
    .slot-card.holo.legendary {
      position: relative;
    }
    .slot-card.holo.legendary::before {
      content: '';
      position: absolute;
      inset: -6px;
      background: linear-gradient(45deg, 
        #ff0000, #ff4400, #ff8800, #ffcc00, #ffff00, 
        #88ff00, #00ff00, #00ff88, #00ffff, #0088ff, 
        #0000ff, #4400ff, #8800ff, #ff00ff, #ff0088, #ff0000);
      background-size: 600% 600%;
      border-radius: 14px;
      z-index: -1;
      animation: holoLegendaryRainbow 2s linear infinite;
      filter: blur(6px);
    }
    .slot-card.holo.legendary::after {
      content: '👑';
      position: absolute;
      top: -15px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 24px;
      animation: holoLegendaryCrown 1s ease-in-out infinite;
      z-index: 10;
      filter: drop-shadow(0 0 8px rgba(251, 191, 36, 0.8));
    }
    .slot-card.holo.legendary .card-reveal {
      position: relative;
      overflow: visible;
    }
    .slot-card.holo.legendary .card-reveal::before {
      content: '';
      position: absolute;
      inset: -2px;
      background: linear-gradient(45deg, rgba(255,215,0,0.5), rgba(255,140,0,0.5), rgba(255,69,0,0.3));
      border-radius: 8px;
      animation: holoLegendaryPulse 1s ease-in-out infinite;
      pointer-events: none;
    }
    .slot-card.holo.legendary .card-reveal .card-art {
      position: relative;
      overflow: hidden;
    }
    .slot-card.holo.legendary .card-reveal .card-art::after {
      content: '';
      position: absolute;
      top: -100%; left: -100%;
      width: 300%; height: 300%;
      background: conic-gradient(from 0deg at 50% 50%, 
        transparent 0deg, rgba(255,215,0,0.4) 60deg, transparent 120deg,
        rgba(255,140,0,0.4) 180deg, transparent 240deg,
        rgba(255,69,0,0.4) 300deg, transparent 360deg);
      animation: holoLegendarySpin 2s linear infinite;
      pointer-events: none;
    }
    .slot-card.holo.legendary .card-reveal .card-art::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: 
        radial-gradient(circle at 20% 20%, rgba(255,255,255,0.5) 0%, transparent 30%),
        radial-gradient(circle at 80% 30%, rgba(255,215,0,0.4) 0%, transparent 25%),
        radial-gradient(circle at 40% 80%, rgba(255,140,0,0.4) 0%, transparent 25%);
      animation: holoLegendarySparkles 1.5s ease-in-out infinite;
      z-index: 1;
    }
    .slot-card.holo.legendary .card-reveal .card-name {
      color: #fcd34d;
      text-shadow: 0 0 10px rgba(252, 211, 77, 0.8), 0 0 20px rgba(251, 146, 60, 0.6), 0 0 30px rgba(239, 68, 68, 0.4);
      animation: holoLegendaryText 1s ease-in-out infinite;
    }
    @keyframes holoLegendaryRainbow {
      0% { background-position: 0% 50%; }
      100% { background-position: 600% 50%; }
    }
    @keyframes holoLegendarySpin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes holoLegendaryPulse {
      0%, 100% { opacity: 0.3; }
      50% { opacity: 0.6; }
    }
    @keyframes holoLegendarySparkles {
      0%, 100% { opacity: 0.5; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.1); }
    }
    @keyframes holoLegendaryText {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }
    @keyframes holoLegendaryCrown {
      0%, 100% { transform: translateX(-50%) translateY(0) rotate(-5deg); }
      50% { transform: translateX(-50%) translateY(-5px) rotate(5deg); }
    }
    
    /* Holo label styling by rarity */
    .holo-label {
      position: absolute;
      bottom: 5px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 10px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 4px;
      color: white;
      font-family: 'Cinzel', serif;
      z-index: 10;
    }
    .slot-card.holo.common .holo-label {
      background: linear-gradient(135deg, #a855f7, #ec4899);
    }
    .slot-card.holo.rare .holo-label {
      background: linear-gradient(135deg, #06b6d4, #3b82f6);
      box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
      animation: holoLabelRare 1s ease-in-out infinite;
    }
    .slot-card.holo.legendary .holo-label {
      background: linear-gradient(135deg, #f59e0b, #fbbf24, #fcd34d);
      color: #1a1a2e;
      box-shadow: 0 0 15px rgba(251, 191, 36, 0.7), 0 0 30px rgba(245, 158, 11, 0.5);
      animation: holoLabelLegendary 0.5s ease-in-out infinite;
    }
    @keyframes holoLabelRare {
      0%, 100% { transform: translateX(-50%) scale(1); }
      50% { transform: translateX(-50%) scale(1.05); }
    }
    @keyframes holoLabelLegendary {
      0%, 100% { transform: translateX(-50%) scale(1); box-shadow: 0 0 15px rgba(251, 191, 36, 0.7), 0 0 30px rgba(245, 158, 11, 0.5); }
      50% { transform: translateX(-50%) scale(1.1); box-shadow: 0 0 25px rgba(251, 191, 36, 1), 0 0 50px rgba(245, 158, 11, 0.8); }
    }
    
    @keyframes holoShine {
      0% { background-position: -100% -100%; }
      100% { background-position: 200% 200%; }
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
    'sanguinefeast': 'Sanguine Feast',
    // Jeweled Court cards
    'rubysprite': 'Ruby Sprite',
    'emeraldforager': 'Emerald Forager',
    'sapphiredancer': 'Sapphire Dancer',
    'topazminer': 'Topaz Miner',
    'amethystenchanter': 'Amethyst Enchanter',
    'diamondguardian': 'Diamond Guardian',
    'opaldevourer': 'Opal Devourer',
    'pearlblessing': 'Pearl Blessing',
    'garnetqueen': 'Garnet Queen',
    'moonstonewitch': 'Moonstone Witch',
    'prismaticfairy': 'Prismatic Fairy',
    'gemstonecurse': 'Gemstone Curse',
    'fairyring': 'Fairy Ring',
    'gemshard': 'Gem Shard',
    // Elune's Chosen cards
    'moonsentinel': 'Moon Sentinel',
    'starweavearcher': 'Star Weave Archer',
    'moonlitbladedancer': 'Moonlit Blade Dancer',
    'lunarpriestess': 'Lunar Priestess',
    'twilightsrespite': 'Twilights Respite',
    'huntinggodsblessing': 'Hunting Gods Blessing',
    'stonegiant': 'Stone Giant',
    'nightshadeambusher': 'Night Shade Ambusher',
    'moonshadowwarden': 'Moon Shadow Warden',
    'moonflaresorceress': 'Moon Flare Sorceress',
    'elunesmoonwell': 'Elunes Moonwell',
    'lunarprayer': 'Lunar Prayer',
    'starlitchampion': 'Starlit Champion',
    'starinvoker': 'Star Invoker',
    'templeofthemoon': 'Temple of the Moon',
    'lunarbarrage': 'Lunar Barrage',
    // Dragon Wizard
    'meditationmonk': 'Meditation Monk',
    'wyrmwhelp': 'Wyrm Whelp',
    'wizardsrune': "Wizards Rune",
    'cinderwing': 'Cinderwing',
    'manasiphonmage': 'Mana Siphon Mage',
    'arcanetether': 'Arcane Tether',
    'stormdrake': 'Storm Drake',
    'mirrorwizard': 'Mirror Wizard',
    'volcanicdragon': 'Volcanic Dragon',
    'redwizard': 'Red Wizard',
    'bluewizard': 'Blue Wizard',
    'chronodrake': 'Chrono Drake',
    'polymorph': 'Polymorph',
    'manadrain': 'Mana Drain',
    'overchargebolt': 'Overcharge Bolt',
    'arcanerift': 'Arcane Rift',
    'dragonsfury': "Dragon's Fury",
    'sheep': 'Sheep'
  };
  
  // Slot machine reveal animation
  const slots = [
    document.getElementById('slot1'),
    document.getElementById('slot2'),
    document.getElementById('slot3')
  ];
  
  // Start spinning all slots
  slots.forEach(slot => slot.classList.add('spinning'));
  
  // Play lottery spin sound (looping) - use preloaded audio
  const spinSound = audioCache['lotterySpin'] ? audioCache['lotterySpin'].cloneNode() : new Audio('/audio/sfx/lottery-spin.mp3');
  spinSound.loop = true;
  spinSound.volume = isSfxMuted ? 0 : (parseFloat(sfxSlider?.value) / 100 || 0.5);
  console.log('[LOTTERY] Starting spin sound, volume:', spinSound.volume, 'muted:', isSfxMuted);
  spinSound.play().then(() => {
    console.log('[LOTTERY] Spin sound playing');
  }).catch((err) => {
    console.log('[LOTTERY] Spin sound failed:', err);
  });
  
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
    'sanguinefeast': '/images/Sanguine Feast.png',
    // Jeweled Court cards
    'rubysprite': '/images/Ruby Sprite.png',
    'emeraldforager': '/images/Emerald Forager.png',
    'sapphiredancer': '/images/Sapphire Dancer.png',
    'topazminer': '/images/Topaz Miner.png',
    'amethystenchanter': '/images/Amethyst Enchanter.png',
    'diamondguardian': '/images/Diamond Guardian.png',
    'opaldevourer': '/images/Opal Devourer.png',
    'pearlblessing': '/images/Pearl Blessing.png',
    'garnetqueen': '/images/Garnet Queen.png',
    'moonstonewitch': '/images/Moonstone Witch.png',
    'prismaticfairy': '/images/Prismatic Fairy.png',
    'gemstonecurse': '/images/Gemstone Curse.png',
    'fairyring': '/images/Fairy Ring.png',
    'gemshard': '/images/Gem Shard.png',
    // Elune's Chosen cards
    'moonsentinel': '/images/Moon Sentinel.png',
    'starweavearcher': '/images/Star Weave Archer.png',
    'moonlitbladedancer': '/images/Moonlit Blade Dancer.png',
    'lunarpriestess': '/images/Lunar Priestess.png',
    'twilightsrespite': '/images/Twilights Respite.png',
    'huntinggodsblessing': '/images/Hunting Gods Blessing.png',
    'stonegiant': '/images/Stone Giant.png',
    'nightshadeambusher': '/images/Night Shade Ambusher.png',
    'moonshadowwarden': '/images/Moon Shadow Warden.png',
    'moonflaresorceress': '/images/Moon Flare Sorceress.png',
    'elunesmoonwell': '/images/Elunes Moonwell.png',
    'lunarprayer': '/images/Lunar Prayer.png',
    'starlitchampion': '/images/Starlit Champion.png',
    'starinvoker': '/images/Star Invoker.png',
    'templeofthemoon': '/images/Temple of the Moon.png',
    'lunarbarrage': '/images/Lunar Barrage.png',
    // Dragon Wizard
    'meditationmonk': '/images/Meditation Monk.png',
    'wyrmwhelp': '/images/Wyrm Whelp.png',
    'wizardsrune': '/images/Wizards Rune.png',
    'cinderwing': '/images/Cinderwing.png',
    'manasiphonmage': '/images/Mana Siphon Mage.png',
    'arcanetether': '/images/Arcane Tether.png',
    'stormdrake': '/images/Storm Drake.png',
    'mirrorwizard': '/images/Mirror Wizard.png',
    'volcanicdragon': '/images/Volcanic Dragon.png',
    'redwizard': '/images/Red Wizard.png',
    'bluewizard': '/images/Blue Wizard.png',
    'chronodrake': '/images/Chrono Drake.png',
    'polymorph': '/images/Polymorph.png',
    'manadrain': '/images/Mana Drain.png',
    'overchargebolt': '/images/Overcharge Bolt.png',
    'arcanerift': '/images/Arcane Rift.png',
    'dragonsfury': '/images/Dragons Fury.png',
    'sheep': '/images/Sheep.png'
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
    'gemshard': 'common',
    // Elune's Chosen
    'moonsentinel': 'common',
    'starweavearcher': 'common',
    'moonlitbladedancer': 'common',
    'lunarpriestess': 'common',
    'twilightsrespite': 'common',
    'huntinggodsblessing': 'common',
    'stonegiant': 'rare',
    'nightshadeambusher': 'rare',
    'moonshadowwarden': 'rare',
    'moonflaresorceress': 'rare',
    'elunesmoonwell': 'rare',
    'lunarprayer': 'rare',
    'starlitchampion': 'legendary',
    'starinvoker': 'legendary',
    'templeofthemoon': 'legendary',
    'lunarbarrage': 'legendary',
    // Dragon Wizard
    'meditationmonk': 'common',
    'wyrmwhelp': 'common',
    'wizardsrune': 'common',
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
    'overchargebolt': 'rare',
    'arcanerift': 'legendary',
    'dragonsfury': 'legendary'
  };
  
  // Reveal cards one by one with delays
  let hasLegendary = false;
  data.rewards.cards.forEach((cardData, index) => {
    setTimeout(() => {
      const slot = slots[index];
      
      // Handle both old string format and new object format
      const cardKey = typeof cardData === 'object' ? cardData.card : cardData;
      const isHolo = typeof cardData === 'object' ? cardData.isHolo : false;
      const rarity = cardRarities[cardKey] || 'common';
      
      // Track if any legendary
      if (rarity === 'legendary') hasLegendary = true;
      
      slot.classList.remove('spinning');
      slot.classList.add('revealed', rarity);
      if (isHolo) slot.classList.add('holo');
      
      // Stop spin sound on first reveal
      if (index === 0) {
        console.log('[LOTTERY] Stopping spin sound');
        spinSound.pause();
        spinSound.currentTime = 0;
      }
      
      // Play win sound based on rarity - use preloaded audio
      const winSoundKey = rarity === 'legendary' ? 'lotteryWinLegendary' : 'lotteryWin';
      const winSoundPath = rarity === 'legendary' 
        ? '/audio/sfx/lottery-win-legendary.mp3' 
        : '/audio/sfx/lottery-win.mp3';
      console.log('[LOTTERY] Playing win sound:', winSoundKey, 'rarity:', rarity);
      const winSound = audioCache[winSoundKey] ? audioCache[winSoundKey].cloneNode() : new Audio(winSoundPath);
      winSound.volume = isSfxMuted ? 0 : (parseFloat(sfxSlider?.value) / 100 || 0.5);
      winSound.play().then(() => {
        console.log('[LOTTERY] Win sound playing');
      }).catch((err) => {
        console.log('[LOTTERY] Win sound failed:', err);
      });
      
      // Use actual card art image - encode URL for spaces
      const artPath = encodeURI(cardArtPaths[cardKey] || `/images/${cardKey}.png`);
      
      // Build particles HTML for legendary
      const particlesHtml = rarity === 'legendary' ? `
        <div class="legendary-particles">
          <span></span><span></span><span></span><span></span><span></span>
        </div>
      ` : '';
      
      // Holo label
      const holoLabel = isHolo ? '<div class="holo-label">✨ HOLO</div>' : '';
      
      slot.innerHTML = `
        ${particlesHtml}
        <div class="card-reveal${isHolo ? ' holo-card' : ''}">
          <div class="card-art" style="background-image: url('${artPath}')"></div>
          <div class="card-info">
            <div class="card-name">${cardNames[cardKey] || cardKey}</div>
          </div>
        </div>
        <div class="rarity-label ${rarity}">${rarity}</div>
        ${holoLabel}
      `;
      
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

// ==================== KEYBOARD HIGHLIGHT FEATURE ====================
// Q = highlight units that can still move
// W = highlight units that can still attack

let highlightingMoves = false;
let highlightingAttacks = false;

// Update the highlight indicator on left side of board
function updateHighlightIndicator() {
  const indicator = document.getElementById('highlightIndicator');
  const moveLabel = document.getElementById('highlightMove');
  const attackLabel = document.getElementById('highlightAttack');
  
  if (!indicator || !moveLabel || !attackLabel) return;
  
  if (highlightingMoves || highlightingAttacks) {
    indicator.classList.add('visible');
  } else {
    indicator.classList.remove('visible');
  }
  
  if (highlightingMoves) {
    moveLabel.classList.add('active');
  } else {
    moveLabel.classList.remove('active');
  }
  
  if (highlightingAttacks) {
    attackLabel.classList.add('active');
  } else {
    attackLabel.classList.remove('active');
  }
}

document.addEventListener('keydown', (e) => {
  if (e.repeat) return; // Ignore key repeat
  
  console.log("[HIGHLIGHT] keydown:", e.key);
  
  if (e.key.toLowerCase() === 'q' && !highlightingMoves) {
    console.log("[HIGHLIGHT] Q pressed - highlighting moves");
    highlightingMoves = true;
    updateUnitHighlights();
    updateHighlightIndicator();
  }
  if (e.key.toLowerCase() === 'w' && !highlightingAttacks) {
    console.log("[HIGHLIGHT] W pressed - highlighting attacks");
    highlightingAttacks = true;
    updateUnitHighlights();
    updateHighlightIndicator();
  }
});

document.addEventListener('keyup', (e) => {
  console.log("[HIGHLIGHT] keyup:", e.key);
  
  if (e.key.toLowerCase() === 'q') {
    highlightingMoves = false;
    updateUnitHighlights();
    updateHighlightIndicator();
  }
  if (e.key.toLowerCase() === 'w') {
    highlightingAttacks = false;
    updateUnitHighlights();
    updateHighlightIndicator();
  }
});

// Update unit highlights based on current key state
function updateUnitHighlights() {
  console.log("[HIGHLIGHT] updateUnitHighlights called, moves:", highlightingMoves, "attacks:", highlightingAttacks);
  
  // Remove all existing highlights
  document.querySelectorAll('.unit').forEach(el => {
    el.classList.remove('highlight-can-move', 'highlight-can-attack', 'highlight-dimmed');
  });
  
  // Also remove from spawn units
  document.querySelectorAll('.spawnUnit').forEach(el => {
    el.classList.remove('highlight-can-move', 'highlight-can-attack', 'highlight-dimmed');
  });
  
  if (!highlightingMoves && !highlightingAttacks) return;
  
  console.log("[HIGHLIGHT] myRole:", myRole, "S.board:", S.board);
  
  // Find all units on the board
  for (let vr = 0; vr < ROWS; vr++) {
    const sr = toServerRow(vr);
    for (let c = 0; c < COLS; c++) {
      const unitId = S.board[sr][c];
      if (!unitId) continue;
      
      const unit = S.units[unitId];
      if (!unit || unit.owner !== myRole) continue; // Only highlight own units
      
      console.log("[HIGHLIGHT] Found own unit:", unit.name, "at", sr, c);
      
      const cellEl = document.getElementById(cellId(vr, c));
      if (!cellEl) continue;
      
      const unitEl = cellEl.querySelector('.unit');
      if (!unitEl) continue;
      
      const hasMoved = S.movedThisTurn.includes(unitId);
      const hasAttacked = S.attackedThisTurn.includes(unitId);
      
      // Check move count for double-move units and diamond gem buff
      const moveCount = S.moveCountThisTurn ? (S.moveCountThisTurn[unitId] || 0) : (hasMoved ? 1 : 0);
      const hasUnlimitedMoves = unit.gemBuffs && unit.gemBuffs.unlimitedMoves;
      const maxMoves = hasUnlimitedMoves ? 999 : (unit.effectId === 'double_move' ? 2 : 1);
      const canStillMove = moveCount < maxMoves;
      
      // Check attack count for double-attack units and topaz gem buff
      const attackCount = S.attackCountThisTurn ? (S.attackCountThisTurn[unitId] || 0) : 0;
      const topazBonus = (unit.gemBuffs && unit.gemBuffs.extraAttacks) || 0;
      const maxAttacks = (unit.canDoubleAttack ? 2 : 1) + topazBonus;
      const canStillAttack = attackCount < maxAttacks && !hasAttacked;
      
      if (highlightingMoves) {
        if (canStillMove) {
          unitEl.classList.add('highlight-can-move');
        } else {
          unitEl.classList.add('highlight-dimmed');
        }
      }
      
      if (highlightingAttacks) {
        if (canStillAttack) {
          unitEl.classList.add('highlight-can-attack');
        } else if (!highlightingMoves) {
          // Only dim if not also highlighting moves
          unitEl.classList.add('highlight-dimmed');
        }
      }
    }
  }
  
  // Also check spawn units
  const spawnId = S.spawn[myRole];
  if (spawnId && S.units[spawnId]) {
    const unit = S.units[spawnId];
    const spawnEl = myRole === 'gold' ? spawnYouUnitEl : spawnEnemyUnitEl;
    if (spawnEl) {
      const hasMoved = S.movedThisTurn.includes(spawnId);
      const hasAttacked = S.attackedThisTurn.includes(spawnId);
      
      if (highlightingMoves && !hasMoved) {
        spawnEl.classList.add('highlight-can-move');
      } else if (highlightingMoves) {
        spawnEl.classList.add('highlight-dimmed');
      }
      
      if (highlightingAttacks && !hasAttacked) {
        spawnEl.classList.add('highlight-can-attack');
      } else if (highlightingAttacks && !highlightingMoves) {
        spawnEl.classList.add('highlight-dimmed');
      }
    }
  }
}