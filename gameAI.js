/**
 * AI Opponent System for Campaign Mode
 * 
 * AI Levels:
 * 1 - Easy: Random valid moves, makes mistakes
 * 2 - Medium: Basic strategy, prioritizes attacks
 * 3 - Hard: Advanced strategy, threat assessment, efficient trades, board control
 */

class GameAI {
  constructor(level = 1) {
    this.level = level;
    this.role = 'silver'; // AI always plays as silver
  }

  /**
   * Main decision function - returns an action to take
   */
  decideAction(gameState, hand, energy, hasDrawn) {
    const actions = this.getAllPossibleActions(gameState, hand, energy, hasDrawn);
    
    if (actions.length === 0) {
      return { type: 'endTurn' };
    }

    // Score each action based on AI level
    const scoredActions = actions.map(action => ({
      action,
      score: this.scoreAction(action, gameState, hand, energy)
    }));

    // Sort by score
    scoredActions.sort((a, b) => b.score - a.score);

    let selectedAction;
    
    if (this.level === 1) {
      // Easy: 50% random, often makes suboptimal plays
      if (Math.random() < 0.5) {
        selectedAction = actions[Math.floor(Math.random() * actions.length)];
      } else {
        selectedAction = scoredActions[0].action;
      }
    } else if (this.level === 2) {
      // Medium: 85% best action, 15% random from top 3
      if (Math.random() < 0.85) {
        selectedAction = scoredActions[0].action;
      } else {
        const topActions = scoredActions.slice(0, Math.min(3, scoredActions.length));
        selectedAction = topActions[Math.floor(Math.random() * topActions.length)].action;
      }
    } else {
      // Hard: Always picks the best action, uses advanced scoring
      selectedAction = scoredActions[0].action;
    }

    return selectedAction;
  }

  /**
   * Get all possible actions the AI can take
   */
  getAllPossibleActions(gameState, hand, energy, hasDrawn) {
    const actions = [];
    const { board, units, rowHP, movedThisTurn, attackedThisTurn, spawn } = gameState;

    // Draw action (if hasn't drawn)
    if (!hasDrawn) {
      actions.push({ type: 'drawCard', priority: 5 });
    }

    // Play cards from hand
    hand.forEach(card => {
      if (card.cost <= energy) {
        if (card.type === 'spell' && card.effect === 'instant') {
          // Instant spells
          if (!card.requiresTarget) {
            actions.push({
              type: 'playCard',
              cardId: card.id,
              card: card,
              priority: 15
            });
          } else if (card.requiresTarget === 'row') {
            for (let r = 0; r < 7; r++) {
              actions.push({
                type: 'playCard',
                cardId: card.id,
                card: card,
                row: r,
                priority: 12
              });
            }
          } else if (card.requiresTarget === 'unit') {
            Object.keys(units).forEach(uid => {
              if (units[uid].owner === 'silver') {
                actions.push({
                  type: 'playCard',
                  cardId: card.id,
                  card: card,
                  targetUnitId: uid,
                  priority: 12
                });
              }
            });
          } else if (card.requiresTarget === 'enemy_unit') {
            Object.keys(units).forEach(uid => {
              if (units[uid].owner === 'gold') {
                actions.push({
                  type: 'playCard',
                  cardId: card.id,
                  card: card,
                  targetUnitId: uid,
                  priority: 14
                });
              }
            });
          }
        } else {
          // Unit/Structure cards - deploy to board or spawn
          const deployTiles = this.getValidDeployTiles(gameState, card);
          deployTiles.forEach(tile => {
            actions.push({
              type: 'playCard',
              cardId: card.id,
              card: card,
              row: tile.row,
              col: tile.col,
              priority: 10
            });
          });

          // Spawn deployment
          if (!spawn.silver && card.type !== 'spell') {
            actions.push({
              type: 'playCard',
              cardId: card.id,
              card: card,
              spawn: 'silver',
              priority: 8
            });
          }
        }
      }
    });

    // Move and attack with units on board
    Object.keys(units).forEach(uid => {
      const unit = units[uid];
      if (unit.owner !== 'silver') return;
      
      const pos = this.findUnitPos(board, uid);
      if (!pos) return; // Unit is in spawn

      // Move actions
      if (!movedThisTurn.has(uid)) {
        const moveTiles = this.getValidMoveTiles(gameState, uid, pos);
        moveTiles.forEach(tile => {
          actions.push({
            type: 'move',
            unitId: uid,
            unit: unit,
            fromRow: pos.r,
            fromCol: pos.c,
            toRow: tile.row,
            toCol: tile.col,
            priority: 7
          });
        });
      }

      // Attack actions
      if (!attackedThisTurn.has(uid)) {
        const attackTargets = this.getValidAttackTargets(gameState, uid, pos, unit);
        attackTargets.forEach(target => {
          actions.push({
            type: 'attackUnit',
            attackerId: uid,
            attacker: unit,
            targetId: target.id,
            target: target.unit,
            targetPos: target.pos,
            priority: 20
          });
        });

        // Row attacks
        const rowAttacks = this.getValidRowAttacks(gameState, uid, pos, unit);
        rowAttacks.forEach(row => {
          actions.push({
            type: 'attackRow',
            attackerId: uid,
            attacker: unit,
            row: row,
            priority: 18
          });
        });
        
        // Heart attacks
        if (this.canAttackHeart(gameState, uid, pos, unit, 'gold')) {
          actions.push({
            type: 'attackHeart',
            attackerId: uid,
            attacker: unit,
            target: 'gold',
            priority: 25
          });
        }
      }
    });

    // Move from spawn
    if (spawn.silver) {
      const spawnUnit = units[spawn.silver];
      if (spawnUnit && !movedThisTurn.has(spawn.silver)) {
        for (let r = 5; r <= 6; r++) {
          for (let c = 0; c < 6; c++) {
            if (!board[r][c]) {
              actions.push({
                type: 'moveFromSpawn',
                unitId: spawn.silver,
                unit: spawnUnit,
                toRow: r,
                toCol: c,
                priority: 9
              });
            }
          }
        }
        
        // Attack from spawn
        if (!attackedThisTurn.has(spawn.silver)) {
          const spawnTargets = this.getSpawnAttackTargets(gameState, spawnUnit);
          spawnTargets.forEach(target => {
            actions.push({
              type: 'attackFromSpawn',
              attackerId: spawn.silver,
              attacker: spawnUnit,
              targetId: target.id,
              target: target.unit,
              priority: 22
            });
          });
        }
      }
    }

    return actions;
  }

  /**
   * Score an action - this is where the AI intelligence lives
   */
  scoreAction(action, gameState, hand, energy) {
    try {
      let score = action.priority || 0;
      const { units, board, rowHP, heartHP, buffTiles } = gameState;
      
      // Hard AI uses much more sophisticated scoring
      const isHard = this.level >= 3;

      switch (action.type) {
        case 'drawCard':
          score += 5;
          if (hand.length < 3) score += 15;
          if (hand.length === 0) score += 30; // Desperately need cards
          if (isHard && energy <= 1 && hand.length < 5) score += 10; // Draw when low energy
          break;

        case 'playCard':
          score += this.scorePlayCard(action, gameState, hand, energy, isHard);
          break;

        case 'move':
          score += this.scoreMove(action, gameState, isHard);
          break;

        case 'attackUnit':
          score += this.scoreAttackUnit(action, gameState, isHard);
          break;

        case 'attackRow':
          score += this.scoreAttackRow(action, gameState, isHard);
          break;
          
        case 'attackHeart':
          score += this.scoreAttackHeart(action, gameState, isHard);
          break;

        case 'moveFromSpawn':
          score += this.scoreMoveFromSpawn(action, gameState, isHard);
          break;
          
        case 'attackFromSpawn':
          score += this.scoreAttackUnit(action, gameState, isHard);
          break;

        case 'endTurn':
          score = -100;
          break;
      }

      // Add randomness for lower AI levels
      if (this.level < 3) {
        const randomFactor = (4 - this.level) * 5;
        score += (Math.random() - 0.5) * randomFactor;
      }

      return score;
    } catch (err) {
      console.error('AI scoring error:', err.message, 'Action:', action.type);
      return 0; // Return neutral score on error
    }
  }

  /**
   * Score playing a card
   */
  scorePlayCard(action, gameState, hand, energy, isHard) {
    let score = 0;
    const card = action.card;
    if (!card) return 0; // Safety check
    
    const { units, board, rowHP, heartHP } = gameState;

    // Base value from stats
    const statValue = (card.atk || 0) * 2.5 + (card.hp || 0) * 1.5;
    score += statValue;

    // Mana efficiency - prefer using all our mana
    if (isHard) {
      const remainingEnergy = energy - card.cost;
      // Bonus for efficient mana usage
      if (remainingEnergy === 0) score += 8;
      else if (remainingEnergy <= 1) score += 4;
      
      // Prefer playing cards that match remaining mana with other cards in hand
      const canPlayMore = hand.some(c => c.id !== card.id && c.cost <= remainingEnergy);
      if (canPlayMore) score += 5;
    }

    // === CARD-SPECIFIC INTELLIGENCE ===
    
    // BURROWER BEAST - Only play when we have units in middle to deploy next to
    if (card.effectId === 'burrow') {
      const middleAllies = this.countAlliesInRows(gameState, [2, 3, 4], 'silver');
      if (middleAllies === 0) {
        score -= 50; // Don't play if no allies in middle - waste of effect
      } else {
        score += middleAllies * 15; // Great value when we can deploy aggressively
        // Prefer deploying next to allies in middle, not in home rows
        if (action.row !== undefined && action.row >= 2 && action.row <= 4) {
          score += 25; // Deploy in middle next to ally
        } else if (action.row !== undefined && action.row >= 5) {
          score -= 30; // Don't deploy in home row - defeats the purpose
        }
        if (action.spawn) {
          score -= 40; // Never put in spawn - completely wastes the effect
        }
      }
    }
    
    // WAR BANNER / ATTACK AURA - Must be placed next to allies
    if (card.effectId === 'attack_aura') {
      if (action.row !== undefined && action.col !== undefined) {
        const nearbyAllies = this.countNearbyAlliesAt(gameState, action.row, action.col, 'silver');
        if (nearbyAllies === 0) {
          score -= 40; // Useless if not buffing anyone
        } else {
          score += nearbyAllies * 20; // Huge value for each ally buffed
        }
      }
      if (action.spawn) {
        score -= 30; // Bad in spawn - can't buff anyone
      }
    }
    
    // SHIELD BEARER / SHIELD AURA - Place next to allies to protect them
    if (card.effectId === 'shield_aura') {
      if (action.row !== undefined && action.col !== undefined) {
        const nearbyAllies = this.countNearbyAlliesAt(gameState, action.row, action.col, 'silver');
        if (nearbyAllies === 0) {
          score -= 30; // Less useful alone
        } else {
          score += nearbyAllies * 15;
        }
      }
    }
    
    // UFO SCRAPER - Play in back rows to grow safely
    if (card.effectId === 'absorb_ally') {
      // Count friendly aliens we can absorb
      const friendlyAliens = Object.values(units).filter(u => 
        u.owner === 'silver' && u.key !== 'ufoscraper'
      ).length;
      
      if (friendlyAliens === 0) {
        score -= 20; // No allies to absorb
      } else {
        score += friendlyAliens * 8;
      }
      
      // Prefer back rows where it's safe
      if (action.row !== undefined) {
        if (action.row >= 5) {
          score += 20; // Safe in back
        } else if (action.row <= 3) {
          score -= 15; // Too aggressive before it grows
        }
      }
      if (action.spawn) {
        score += 10; // Spawn is safe for growing
      }
    }
    
    // UNITS WITH DOUBLE MOVE - Great for grabbing buff tiles
    if (card.effectId === 'double_move' || card.effectId === 'move_buff') {
      // Check if there are unclaimed buff tiles
      const unclaimedBuffs = this.countUnclaimedBuffTiles(gameState);
      if (unclaimedBuffs > 0) {
        score += 15; // Can grab buff tiles
      }
      // Prefer forward deployment
      if (action.row !== undefined && action.row === 5) {
        score += 10;
      }
    }
    
    // SIEGE UNITS - Very valuable for breaking walls
    if (card.effectId === 'siege') {
      score += 15; // Always good
      // Even better if we're close to enemy walls
      const unitsNearWalls = this.countAlliesInRows(gameState, [2, 3], 'silver');
      if (unitsNearWalls > 0) {
        score += 20; // We have units ready to push
      }
    }
    
    // RANGED UNITS - Keep in back where they're safe
    if (card.effectId === 'ranged') {
      if (action.row !== undefined) {
        if (action.row >= 4) score += 15; // Safe back position
        if (action.row <= 2) score -= 10; // Too forward
      }
    }

    // Effect bonuses (general)
    if (card.effectId) {
      score += this.scoreCardEffect(card, gameState, action, isHard);
    }

    // Position scoring for units
    if (action.row !== undefined && card.type !== 'spell') {
      score += this.scoreDeployPosition(action.row, action.col, card, gameState, isHard);
    }

    // Spawn scoring
    if (action.spawn) {
      if (isHard) {
        // Spawn is safer but slower - use for valuable units
        if (card.hp >= 4 || card.effectId) score += 5;
        // Don't put glass cannons in spawn
        if (card.atk > card.hp) score -= 3;
      }
    }

    // Instant spell targeting
    if (card.effect === 'instant' && action.targetUnitId) {
      const target = units[action.targetUnitId];
      if (target) {
        // Value destroying/buffing based on target value
        if (card.effectId === 'destroy_random' || card.requiresTarget === 'enemy_unit') {
          score += target.atk * 3 + target.hp * 2;
        }
      }
    }

    return score;
  }

  /**
   * Score a card's effect
   */
  scoreCardEffect(card, gameState, action, isHard) {
    let score = 5; // Base bonus for having an effect
    const { units, board } = gameState;

    switch (card.effectId) {
      case 'ranged':
        score += 8; // Ranged is very strong
        break;
      case 'shield_aura':
        // Better when we have units nearby
        if (isHard) {
          const nearbyAllies = this.countNearbyAllies(gameState, action.row, action.col);
          score += nearbyAllies * 4;
        }
        break;
      case 'attack_aura':
        if (isHard) {
          const nearbyAllies = this.countNearbyAllies(gameState, action.row, action.col);
          score += nearbyAllies * 5;
        }
        break;
      case 'heal_aura':
        if (isHard) {
          const nearbyAllies = this.countNearbyAllies(gameState, action.row, action.col);
          score += nearbyAllies * 3;
        }
        break;
      case 'siege':
        score += 10; // Great for breaking walls
        break;
      case 'draw_two':
        score += 12; // Card advantage is huge
        break;
      case 'cleave':
        score += 6;
        break;
      case 'spawn_drone':
        score += 8; // Value generation
        break;
      case 'burrow':
        score += 10; // Surprise factor
        break;
      case 'energy_on_hit':
        score += 7;
        break;
      case 'adapt_hp':
        score += 6;
        break;
    }

    return score;
  }

  /**
   * Score a deploy position
   */
  scoreDeployPosition(row, col, card, gameState, isHard) {
    let score = 0;
    const { board, units, buffTiles, rowHP } = gameState;

    if (!isHard) {
      // Simple positioning for lower AI
      if (row === 5) score += 3;
      return score;
    }

    // Advanced positioning for Hard AI
    
    // Check for buff tiles
    const buffKey = `${row}-${col}`;
    if (buffTiles && buffTiles[buffKey]) {
      const buff = buffTiles[buffKey];
      switch (buff.id) {
        case 'energy_buff': score += 15; break;
        case 'hp_buff': score += 12; break;
        case 'atk_row_buff': score += 10; break;
        case 'draw_buff': score += 14; break;
        case 'heal_buff': score += 8; break;
        case 'move_buff': score += 7; break;
      }
    }

    // Offensive units should be forward
    if (card.atk >= 3) {
      if (row <= 4) score += 5;
      if (row <= 3) score += 3;
    }

    // Defensive units protect the back
    if (card.hp > card.atk) {
      if (row >= 5) score += 4;
    }

    // Support units (auras) should be near other units
    if (card.effectId && (card.effectId.includes('aura') || card.effectId === 'shield_aura')) {
      const nearbyAllies = this.countNearbyAllies(gameState, row, col);
      score += nearbyAllies * 4;
    }

    // Don't clump too much in one column (vulnerable to cleave)
    let unitsInCol = 0;
    for (let r = 0; r < 7; r++) {
      if (board[r][col] && units[board[r][col]]?.owner === 'silver') unitsInCol++;
    }
    if (unitsInCol >= 2) score -= 3;

    // Prefer spreading out initially
    const totalUnits = Object.values(units).filter(u => u.owner === 'silver').length;
    if (totalUnits < 3) {
      // Early game - spread across columns
      let colHasUnit = false;
      for (let r = 0; r < 7; r++) {
        if (board[r][col] && units[board[r][col]]?.owner === 'silver') {
          colHasUnit = true;
          break;
        }
      }
      if (colHasUnit) score -= 4;
    }

    return score;
  }

  /**
   * Score a move action
   */
  scoreMove(action, gameState, isHard) {
    let score = 0;
    const { board, units, rowHP, buffTiles, heartHP } = gameState;
    const unit = action.unit;
    if (!unit) return 0; // Safety check
    
    // Moving forward is generally good
    const forwardProgress = (action.fromRow || 6) - action.toRow;
    score += forwardProgress * 3;

    if (!isHard) {
      const nearbyEnemies = this.countNearbyEnemies(gameState, action.toRow, action.toCol);
      if (unit.atk > 2) score += nearbyEnemies * 2;
      return score;
    }

    // Hard AI advanced move scoring
    
    // === DOUBLE MOVE UNITS - Use for positioning and buff tiles ===
    if (unit.canDoubleMove) {
      // Huge bonus for grabbing buff tiles
      const buffKey = `${action.toRow}-${action.toCol}`;
      if (buffTiles && buffTiles[buffKey]) {
        score += 30; // Double move units are perfect for grabbing buffs
      }
      // Bonus for reaching middle of field
      if (action.toRow >= 2 && action.toRow <= 4) {
        score += 15; // Control the middle
      }
    }
    
    // Move onto buff tiles (all units)
    const buffKey = `${action.toRow}-${action.toCol}`;
    if (buffTiles && buffTiles[buffKey]) {
      score += 20;
      // Extra value for powerful buffs
      const buff = buffTiles[buffKey];
      if (buff.id === 'energy_buff') score += 15;
      if (buff.id === 'draw_buff') score += 12;
    }

    // Position for attacks next turn
    const enemiesInRange = this.countEnemiesInAttackRange(gameState, action.toRow, action.toCol, unit);
    score += enemiesInRange * 4;

    // High ATK units should advance aggressively
    if (unit.atk >= 3) {
      score += forwardProgress * 2;
      
      // Move toward enemy heart
      if (action.toRow <= 2 && rowHP[0] <= 0 && rowHP[1] <= 0) {
        score += 15; // Path to heart is open!
      }
    }

    // Protect valuable units - don't move them into danger
    if (unit.effectId || unit.hp >= 4) {
      const threats = this.countThreats(gameState, action.toRow, action.toCol);
      score -= threats * 3;
    }

    // Ranged units should stay back
    if (unit.effectId === 'ranged') {
      if (action.toRow >= 3) score += 4;
      if (action.toRow <= 2) score -= 5; // Too aggressive
    }

    // Support units stay with allies
    if (unit.effectId && unit.effectId.includes && unit.effectId.includes('aura')) {
      const currentAllies = this.countNearbyAllies(gameState, action.fromRow || 6, action.fromCol || 0);
      const newAllies = this.countNearbyAllies(gameState, action.toRow, action.toCol);
      score += (newAllies - currentAllies) * 5;
    }
    
    // UFO Scraper - stay back until strong
    if (unit.effectId === 'absorb_ally') {
      if (unit.atk < 5) {
        // Still growing - stay safe
        if (action.toRow >= 5) score += 15;
        if (action.toRow <= 3) score -= 20;
      } else {
        // Strong enough - go attack!
        score += forwardProgress * 5;
      }
    }

    // Move to contest rows we don't own
    const rowOwner = gameState.rowOwner ? gameState.rowOwner[action.toRow] : null;
    if (rowOwner === 'gold') score += 5;

    return score;
  }

  /**
   * Score attacking a unit
   */
  scoreAttackUnit(action, gameState, isHard) {
    let score = 0;
    const target = action.target;
    const attacker = action.attacker;
    if (!target || !attacker) return 0; // Safety check
    
    const { units, board, rowHP, heartHP } = gameState;

    // Calculate if this is a kill
    const willKill = target.hp <= attacker.atk;
    
    // Base value of the attack
    const damageDealt = Math.min(attacker.atk, target.hp);
    score += damageDealt * 3;

    // === IF YOU CAN KILL, YOU SHOULD KILL ===
    if (willKill) {
      score += 100; // MASSIVE bonus for kills - always prioritize kills
      score += target.atk * 8; // Extra for high-damage targets
      score += (target.maxHp || target.hp) * 3; // Extra for tanky targets
      
      // Killing units with effects is extra valuable
      if (target.effectId) score += 25;
    }

    // Priority targets (even if we can't kill)
    score += target.atk * 3; // High ATK = high threat
    
    if (!isHard) return score;

    // Hard AI advanced combat scoring
    
    // === STRATEGIC THREAT ANALYSIS ===
    // Understand what the opponent is trying to do and counter it
    
    const targetPos = action.targetPos || this.findUnitPos(board, action.targetId);
    
    // 1. KILL UNITS THREATENING OUR HEART
    if (targetPos) {
      const distToOurHeart = 6 - targetPos.r; // Distance to row 6
      if (distToOurHeart <= 2) {
        score += 20; // Unit is close to our side
        if (target.atk >= 3) score += 15; // High damage threat
      }
      // Unit in our home rows is critical threat
      if (targetPos.r >= 5) {
        score += 30;
      }
    }
    
    // 2. KILL SIEGE UNITS BEFORE THEY BREAK WALLS
    if (target.effectId === 'siege') {
      score += 25;
      // Extra urgent if our walls are low
      if (rowHP[5] > 0 && rowHP[5] <= 15) score += 20;
      if (rowHP[6] > 0 && rowHP[6] <= 15) score += 20;
    }
    
    // 3. KILL SUPPORT UNITS THAT BUFF OTHERS
    if (targetPos && (target.effectId === 'attack_aura' || target.effectId === 'shield_aura' || target.effectId === 'heal_aura')) {
      // Count how many units this aura is buffing
      const buffedUnits = this.countNearbyAlliesOf(gameState, targetPos.r, targetPos.c, 'gold');
      score += 15 + (buffedUnits * 10); // More valuable if buffing multiple units
    }
    
    // 4. KILL RANGED UNITS - they're annoying and safe
    if (target.effectId === 'ranged') {
      score += 18;
      // Extra priority if they're in a safe back position
      if (targetPos && targetPos.r <= 2) score += 10;
    }
    
    // 5. KILL UNITS ON BUFF TILES - deny them the buff
    if (targetPos) {
      const buffKey = `${targetPos.r}-${targetPos.c}`;
      if (gameState.buffTiles && gameState.buffTiles[buffKey]) {
        const buff = gameState.buffTiles[buffKey];
        score += 15; // Deny the buff tile
        // Extra value for powerful buffs
        if (buff.id === 'energy_buff') score += 15;
        if (buff.id === 'draw_buff') score += 12;
        if (buff.id === 'hp_buff' || buff.id === 'atk_row_buff') score += 10;
      }
    }
    
    // 6. KILL UNITS ABOUT TO ATTACK OUR HEART
    // If both our walls are down, units in rows 5-6 can hit our heart
    if (rowHP[5] <= 0 && rowHP[6] <= 0) {
      if (targetPos && targetPos.r >= 5) {
        score += 40; // CRITICAL - they can hit our heart!
        if (target.atk >= heartHP.silver) score += 100; // They can kill us!
      }
    }
    
    // 7. FOCUS FIRE - finish off damaged units
    if (target.hp < target.maxHp) {
      const missingHp = (target.maxHp || target.hp) - target.hp;
      score += missingHp * 2; // Prefer finishing damaged units
    }
    if (willKill && target.hp <= 2) {
      score += 10; // Easy cleanup
    }
    
    // 8. KILL SNOWBALL THREATS
    // Units that get stronger over time
    if (target.effectId === 'adapt_hp') score += 12; // Adaptive Colossus
    if (target.effectId === 'absorb_ally') score += 10; // UFO Scraper
    if (target.effectId === 'spawn_drone') score += 15; // Broodmother creates value
    
    // 9. IDENTIFY WIN CONDITION UNITS
    // If opponent has few units, each one is more valuable to kill
    const enemyUnitCount = Object.values(units).filter(u => u.owner === 'gold').length;
    if (enemyUnitCount <= 2) {
      score += 20; // Cripple their board presence
    }
    if (enemyUnitCount === 1 && willKill) {
      score += 30; // Wipe their board!
    }
    
    // === TRADE EVALUATION ===
    const myValue = attacker.atk * 2 + attacker.hp * 1.5 + (attacker.effectId ? 10 : 0);
    let theirValue = target.atk * 2 + target.hp * 1.5 + (target.effectId ? 10 : 0);
    
    // Add strategic value to their unit
    if (target.effectId) theirValue += 10;
    
    // Will we die to counterattack?
    const willDie = !willKill && target.atk >= attacker.hp;
    
    if (willKill && !willDie) {
      score += 20; // Clean kill - excellent
    } else if (willKill && willDie) {
      // Trade - evaluate if it's worth it
      if (theirValue > myValue) {
        score += 15; // Good trade
      } else if (theirValue < myValue * 0.7) {
        score -= 10; // Bad trade
      }
    } else if (!willKill && willDie) {
      // We die without killing - usually bad
      if (theirValue > myValue * 1.5) {
        score += 5; // Sacrifice for high value chip damage
      } else {
        score -= 25; // Bad suicide
      }
    }

    // Don't attack untargetable units
    if (target.untargetable) score -= 1000;

    return score;
  }

  /**
   * Score attacking a row/wall
   */
  scoreAttackRow(action, gameState, isHard) {
    let score = 0;
    const { rowHP, heartHP, units, board } = gameState;
    const attacker = action.attacker;
    if (!attacker) return 0; // Safety check
    
    const row = action.row;

    // Base value
    score += 10;

    // Siege units are amazing at this
    if (attacker.effectId === 'siege') {
      score += 20;
    }

    // Almost dead walls are priority
    if (rowHP[row] <= attacker.atk * (attacker.effectId === 'siege' ? 2 : 1)) {
      score += 25; // Will destroy the wall!
    } else if (rowHP[row] <= 10) {
      score += 10;
    }

    if (!isHard) return score;

    // Hard AI - strategic wall targeting
    
    // Prefer row 1 (inner wall) once row 0 is down
    if (row === 1 && rowHP[0] <= 0) {
      score += 15; // Opens path to heart
    }

    // Check if we have units ready to advance
    let unitsReadyToAdvance = 0;
    for (let r = 2; r <= 4; r++) {
      for (let c = 0; c < 6; c++) {
        const uid = board[r][c];
        if (uid && units[uid]?.owner === 'silver') unitsReadyToAdvance++;
      }
    }
    if (unitsReadyToAdvance >= 2) score += 10;

    // Don't waste attacks on walls when we could kill units
    const availableKills = this.countAvailableKills(gameState, action.attackerId, attacker);
    if (availableKills > 0) score -= 15;

    return score;
  }

  /**
   * Score attacking the heart
   */
  scoreAttackHeart(action, gameState, isHard) {
    const { heartHP } = gameState;
    const attacker = action.attacker;
    if (!attacker) return 0; // Safety check
    
    let score = 50; // Base - heart damage is always valuable

    // Going for lethal!
    if (heartHP.gold <= attacker.atk) {
      score += 500; // WIN THE GAME
    }

    // Heart is low
    if (heartHP.gold <= 10) {
      score += 30;
    }

    score += attacker.atk * 3; // More damage = better

    if (isHard) {
      // Check if we should attack heart or save for better attacks
      const availableKills = this.countAvailableKills(gameState, action.attackerId, attacker);
      // Only skip heart if we can kill something very valuable
      if (availableKills > 0 && heartHP.gold > 10) {
        score -= 10;
      }
    }

    return score;
  }

  /**
   * Score moving from spawn
   */
  scoreMoveFromSpawn(action, gameState, isHard) {
    let score = 8; // Base - getting units on board is good
    const { buffTiles } = gameState;
    const unit = action.unit;
    if (!unit) return 0; // Safety check

    // Prefer row 5 (further forward)
    if (action.toRow === 5) score += 5;

    if (isHard) {
      // Move onto buff tiles
      const buffKey = `${action.toRow}-${action.toCol}`;
      if (buffTiles && buffTiles[buffKey]) {
        score += 15;
      }

      // Position based on unit type
      if (unit.atk >= 3) {
        if (action.toRow === 5) score += 3; // Forward
      }

      // Spread out
      const unitsInCol = this.countUnitsInColumn(gameState, action.toCol, 'silver');
      if (unitsInCol >= 1) score -= 3;
    }

    return score;
  }

  // ==================== HELPER FUNCTIONS ====================

  getValidDeployTiles(gameState, card) {
    const tiles = [];
    const { board, rowHP, units } = gameState;
    
    for (let r = 5; r <= 6; r++) {
      if (rowHP[r] <= 0) continue;
      for (let c = 0; c < 6; c++) {
        if (!board[r][c]) {
          tiles.push({ row: r, col: c });
        }
      }
    }

    // Burrower Beast can deploy adjacent to allies
    if (card.effectId === 'burrow') {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 6; c++) {
          if (board[r][c]) continue;
          const offsets = [[-1,0], [1,0], [0,-1], [0,1]];
          for (const [dr, dc] of offsets) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= 7 || nc < 0 || nc >= 6) continue;
            const adjId = board[nr][nc];
            if (adjId && units[adjId] && units[adjId].owner === 'silver') {
              if (r <= 1 && rowHP[r] > 0) continue;
              tiles.push({ row: r, col: c });
              break;
            }
          }
        }
      }
    }

    return tiles;
  }

  getValidMoveTiles(gameState, unitId, pos) {
    const tiles = [];
    const { board, rowHP, units } = gameState;
    const unit = units[unitId];
    const canDoubleMove = unit.effectId === 'double_move' || unit.effectId === 'stampede';
    const maxDist = canDoubleMove ? 2 : 1;

    // Cardinal directions only (no diagonal movement)
    const directions = [
      { dr: -1, dc: 0 }, // up
      { dr: 1, dc: 0 },  // down
      { dr: 0, dc: -1 }, // left
      { dr: 0, dc: 1 }   // right
    ];

    if (canDoubleMove) {
      // For double move, check tiles within 2 steps (cardinal only)
      for (let dist = 1; dist <= maxDist; dist++) {
        for (const dir of directions) {
          const nr = pos.r + (dir.dr * dist);
          const nc = pos.c + (dir.dc * dist);
          if (nr < 0 || nr >= 7 || nc < 0 || nc >= 6) continue;
          if (board[nr][nc]) continue;
          // Can't move into gold's home rows if they have HP
          if (nr <= 1 && rowHP[nr] > 0) continue;
          tiles.push({ row: nr, col: nc });
        }
      }
      // Also check L-shaped moves (1 cardinal + 1 cardinal different direction)
      for (const dir1 of directions) {
        const midR = pos.r + dir1.dr;
        const midC = pos.c + dir1.dc;
        if (midR < 0 || midR >= 7 || midC < 0 || midC >= 6) continue;
        // Mid tile must be empty to pass through
        if (board[midR][midC]) continue;
        for (const dir2 of directions) {
          if (dir1.dr === -dir2.dr && dir1.dc === -dir2.dc) continue; // Don't go back
          const nr = midR + dir2.dr;
          const nc = midC + dir2.dc;
          if (nr < 0 || nr >= 7 || nc < 0 || nc >= 6) continue;
          if (nr === pos.r && nc === pos.c) continue; // Back to start
          if (board[nr][nc]) continue;
          if (nr <= 1 && rowHP[nr] > 0) continue;
          // Avoid duplicates
          if (!tiles.some(t => t.row === nr && t.col === nc)) {
            tiles.push({ row: nr, col: nc });
          }
        }
      }
    } else {
      // Single move - cardinal directions only
      for (const dir of directions) {
        const nr = pos.r + dir.dr;
        const nc = pos.c + dir.dc;
        if (nr < 0 || nr >= 7 || nc < 0 || nc >= 6) continue;
        if (board[nr][nc]) continue;
        if (nr <= 1 && rowHP[nr] > 0) continue;
        tiles.push({ row: nr, col: nc });
      }
    }

    return tiles;
  }

  getValidAttackTargets(gameState, unitId, pos, unit) {
    const targets = [];
    const { board, units } = gameState;

    const isRanged = unit.effectId === 'ranged';
    const isDiagonal = unit.effectId === 'diagonal_attack';

    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 6; c++) {
        const targetId = board[r][c];
        if (!targetId) continue;
        const target = units[targetId];
        if (!target || target.owner === 'silver') continue;
        if (target.untargetable) continue;

        const rowDist = Math.abs(pos.r - r);
        const colDist = Math.abs(pos.c - c);

        let canAttack = false;
        if (isRanged) {
          canAttack = (rowDist <= 2 && colDist === 0) || (colDist <= 2 && rowDist === 0);
        } else if (isDiagonal) {
          canAttack = rowDist <= 1 && colDist <= 1 && !(rowDist === 0 && colDist === 0);
        } else {
          canAttack = (rowDist === 1 && colDist === 0) || (rowDist === 0 && colDist === 1);
        }

        if (canAttack) {
          targets.push({ id: targetId, unit: target, pos: { r, c } });
        }
      }
    }

    return targets;
  }

  getValidRowAttacks(gameState, unitId, pos, unit) {
    const rows = [];
    const { rowHP } = gameState;
    const isRanged = unit.effectId === 'ranged';
    const maxRange = isRanged ? 2 : 1;

    for (let r = 0; r <= 1; r++) {
      if (rowHP[r] <= 0) continue;
      const rowDist = Math.abs(pos.r - r);
      if (rowDist <= maxRange) {
        rows.push(r);
      }
    }

    return rows;
  }

  canAttackHeart(gameState, unitId, pos, unit, targetHeart) {
    const { rowHP } = gameState;
    const heartRow = targetHeart === 'gold' ? 0 : 6;
    const distance = Math.abs(pos.r - heartRow);
    const isRanged = unit.effectId === 'ranged';
    const maxRange = isRanged ? 1 : 0;

    // Can only attack if walls are down
    if (targetHeart === 'gold' && (rowHP[0] > 0 || rowHP[1] > 0)) return false;

    return distance <= maxRange;
  }

  getSpawnAttackTargets(gameState, unit) {
    const targets = [];
    const { board, units } = gameState;
    
    // Spawn can attack units in row 6
    for (let c = 0; c < 6; c++) {
      const targetId = board[6][c];
      if (!targetId) continue;
      const target = units[targetId];
      if (!target || target.owner === 'silver') continue;
      if (target.untargetable) continue;
      targets.push({ id: targetId, unit: target });
    }

    return targets;
  }

  findUnitPos(board, unitId) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 6; c++) {
        if (board[r][c] === unitId) return { r, c };
      }
    }
    return null;
  }

  countNearbyEnemies(gameState, row, col) {
    let count = 0;
    const { board, units } = gameState;
    
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr, nc = col + dc;
        if (nr < 0 || nr >= 7 || nc < 0 || nc >= 6) continue;
        const uid = board[nr][nc];
        if (uid && units[uid] && units[uid].owner === 'gold') count++;
      }
    }
    
    return count;
  }

  countNearbyAllies(gameState, row, col) {
    let count = 0;
    const { board, units } = gameState;
    
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr, nc = col + dc;
        if (nr < 0 || nr >= 7 || nc < 0 || nc >= 6) continue;
        const uid = board[nr][nc];
        if (uid && units[uid] && units[uid].owner === 'silver') count++;
      }
    }
    
    return count;
  }

  countNearbyAlliesOf(gameState, row, col, owner) {
    let count = 0;
    const { board, units } = gameState;
    
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr, nc = col + dc;
        if (nr < 0 || nr >= 7 || nc < 0 || nc >= 6) continue;
        const uid = board[nr][nc];
        if (uid && units[uid] && units[uid].owner === owner) count++;
      }
    }
    
    return count;
  }

  countEnemiesInAttackRange(gameState, row, col, unit) {
    let count = 0;
    const { board, units } = gameState;
    const isRanged = unit.effectId === 'ranged';
    const range = isRanged ? 2 : 1;

    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 6; c++) {
        const uid = board[r][c];
        if (!uid || !units[uid] || units[uid].owner === 'silver') continue;
        
        const rowDist = Math.abs(row - r);
        const colDist = Math.abs(col - c);
        
        if (isRanged) {
          if ((rowDist <= range && colDist === 0) || (colDist <= range && rowDist === 0)) count++;
        } else {
          if ((rowDist === 1 && colDist === 0) || (rowDist === 0 && colDist === 1)) count++;
        }
      }
    }

    return count;
  }

  countThreats(gameState, row, col) {
    let threats = 0;
    const { board, units } = gameState;

    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 6; c++) {
        const uid = board[r][c];
        if (!uid || !units[uid] || units[uid].owner === 'silver') continue;
        
        const enemy = units[uid];
        const rowDist = Math.abs(row - r);
        const colDist = Math.abs(col - c);
        const isRanged = enemy.effectId === 'ranged';
        const range = isRanged ? 2 : 1;

        let canAttack = false;
        if (isRanged) {
          canAttack = (rowDist <= range && colDist === 0) || (colDist <= range && rowDist === 0);
        } else {
          canAttack = (rowDist === 1 && colDist === 0) || (rowDist === 0 && colDist === 1);
        }

        if (canAttack) threats += enemy.atk;
      }
    }

    return threats;
  }

  countAvailableKills(gameState, attackerId, attacker) {
    const pos = this.findUnitPos(gameState.board, attackerId);
    if (!pos) return 0;

    const targets = this.getValidAttackTargets(gameState, attackerId, pos, attacker);
    return targets.filter(t => t.unit.hp <= attacker.atk).length;
  }

  countUnitsInColumn(gameState, col, owner) {
    let count = 0;
    const { board, units } = gameState;
    for (let r = 0; r < 7; r++) {
      const uid = board[r][col];
      if (uid && units[uid] && units[uid].owner === owner) count++;
    }
    return count;
  }

  countAlliesInRows(gameState, rows, owner) {
    let count = 0;
    const { board, units } = gameState;
    for (const r of rows) {
      for (let c = 0; c < 6; c++) {
        const uid = board[r][c];
        if (uid && units[uid] && units[uid].owner === owner) count++;
      }
    }
    return count;
  }

  countNearbyAlliesAt(gameState, row, col, owner) {
    let count = 0;
    const { board, units } = gameState;
    
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr, nc = col + dc;
        if (nr < 0 || nr >= 7 || nc < 0 || nc >= 6) continue;
        const uid = board[nr][nc];
        if (uid && units[uid] && units[uid].owner === owner) count++;
      }
    }
    
    return count;
  }

  countUnclaimedBuffTiles(gameState) {
    let count = 0;
    const { board, units, buffTiles } = gameState;
    if (!buffTiles) return 0;
    
    for (const key in buffTiles) {
      const buff = buffTiles[key];
      const uid = board[buff.row][buff.col];
      if (!uid) count++; // Empty buff tile
    }
    return count;
  }
}

module.exports = GameAI;