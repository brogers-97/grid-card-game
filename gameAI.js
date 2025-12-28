/**
 * AI Opponent System for Campaign Mode
 * 
 * AI Levels:
 * 1 - Easy: Random valid moves, makes mistakes
 * 2 - Medium: Basic strategy, prioritizes attacks
 * 3 - Hard: Advanced strategy, threat assessment, efficient trades, board control
 */

// Debug mode - set to focus logging on specific AI behaviors
// Options: 'none', 'all', 'effects', 'movement', 'attacks', 'spells', 'deployment'
const AI_DEBUG_MODE = 'attacks';

class GameAI {
  constructor(level = 1, role = 'silver') {
    this.level = level;
    this.role = role; // AI role - 'silver' for boss AI, 'gold' for player AI
  }
  
  /**
   * Debug log helper - only logs if debug mode matches AND it's the Player AI
   */
  debugLog(category, message) {
    if (AI_DEBUG_MODE === 'none') return;
    // Only log for Player AI (gold), not Boss AI (silver)
    if (this.role !== 'gold') return;
    if (AI_DEBUG_MODE === 'all' || AI_DEBUG_MODE === category) {
      console.log(`[AI-${category.toUpperCase()}] ${message}`);
    }
  }

  /**
   * Get the opposing role
   */
  getOpponent() {
    return this.role === 'silver' ? 'gold' : 'silver';
  }

  /**
   * Check if a row is in "our back" (safe) area
   * Silver: rows 5,6 are back; Gold: rows 0,1 are back
   */
  isBackRow(row) {
    return this.role === 'silver' ? row >= 5 : row <= 1;
  }

  /**
   * Check if a row is in "forward/aggressive" territory
   * Silver: rows 0-2 are forward; Gold: rows 4-6 are forward
   */
  isForwardRow(row) {
    return this.role === 'silver' ? row <= 2 : row >= 4;
  }

  /**
   * Check if a row is in the middle (contested) area
   */
  isMiddleRow(row) {
    return row >= 2 && row <= 4;
  }

  /**
   * Get distance to enemy heart (lower = closer to winning)
   * Silver wants to reach row 0; Gold wants to reach row 6
   */
  distanceToEnemyHeart(row) {
    return this.role === 'silver' ? row : (6 - row);
  }

  /**
   * Get distance to own heart (higher = safer)
   */
  distanceToOwnHeart(row) {
    return this.role === 'silver' ? (6 - row) : row;
  }

  /**
   * Check if a unit/card has ranged attack capability
   */
  isRangedUnit(unit) {
    if (!unit || !unit.effectId) return false;
    return unit.effectId === 'ranged' || unit.effectId === 'ranged_pierce' || unit.effectId === 'starweave_ranged';
  }

  /**
   * Main decision function - returns an action to take
   */
  decideAction(gameState, hand, energy, hasDrawn, enableLogging = false) {
    const actions = this.getAllPossibleActions(gameState, hand, energy, hasDrawn);
    
    // Only log for Player AI (gold), not Boss AI (silver)
    const shouldLog = enableLogging && this.role === 'gold';
    
    // Condensed logging - one line per decision
    if (shouldLog) {
      const actionCounts = {};
      actions.forEach(a => { actionCounts[a.type] = (actionCounts[a.type] || 0) + 1; });
      console.log(`[${this.role.toUpperCase()}] E:${energy} H:${hand.length} Actions:${actions.length} (${Object.entries(actionCounts).map(([k,v]) => `${k}:${v}`).join(', ')})`);
      
      // Debug: Log available attacks
      const attackActions = actions.filter(a => a.type === 'attackUnit' || a.type === 'attackHeart' || a.type === 'attackRow');
      if (attackActions.length > 0) {
        this.debugLog('attacks', `Available attacks (${attackActions.length}):`);
        attackActions.forEach(a => {
          if (a.type === 'attackUnit') {
            this.debugLog('attacks', `  ${a.attacker?.name} can attack ${a.target?.name} (${a.target?.hp}hp)`);
          } else if (a.type === 'attackHeart') {
            this.debugLog('attacks', `  ${a.attacker?.name} can attack HEART`);
          } else if (a.type === 'attackRow') {
            this.debugLog('attacks', `  ${a.attacker?.name} can attack row ${a.row}`);
          }
        });
      } else {
        this.debugLog('attacks', `No attacks available this turn`);
      }
    }
    
    if (actions.length === 0) {
      if (enableLogging) console.log(`[${this.role.toUpperCase()}] -> END TURN (no actions)`);
      return { type: 'endTurn' };
    }

    // Score each action based on AI level
    const scoredActions = actions.map(action => ({
      action,
      score: this.scoreAction(action, gameState, hand, energy)
    }));

    // Sort by score
    scoredActions.sort((a, b) => b.score - a.score);
    
    // Filter out negative-score card plays (don't waste cards on bad plays)
    // Also filter out very negative moves (moving INTO danger zones)
    // Exception: if ALL options are negative, we're in a desperate situation
    const safeActions = scoredActions.filter(sa => {
      // Always keep positive actions
      if (sa.score >= 0) return true;
      // Filter out bad card plays
      if (sa.action.type === 'playCard' && sa.score < 0) return false;
      // Filter out very bad moves (likely danger zone moves with -150 or worse penalty)
      if (sa.action.type === 'move' && sa.score < -100) return false;
      return true;
    });
    const actionsToConsider = safeActions.length > 0 ? safeActions : scoredActions;
    actionsToConsider.sort((a, b) => b.score - a.score);
    
    // End turn early if best action is very low value (just pointless shuffling)
    const bestScore = actionsToConsider[0]?.score || 0;
    const bestAction = actionsToConsider[0]?.action;
    
    // If best action is a low-value move (< 10) and we've done useful things, end turn
    // Exception: don't end early if we haven't drawn or have playable cards with positive value
    const hasUsefulCardToPlay = scoredActions.some(sa => 
      sa.action.type === 'playCard' && 
      sa.score >= 15 && 
      (sa.action.card?.cost || 0) <= energy
    );
    const shouldEndEarly = bestScore < 10 && 
                           bestAction?.type === 'move' && 
                           hasDrawn && 
                           !hasUsefulCardToPlay;
    
    if (shouldEndEarly) {
      if (enableLogging) {
        console.log(`[${this.role.toUpperCase()}] -> END TURN (best move only ${Math.round(bestScore)} points)`);
      }
      return { type: 'endTurn' };
    }

    let selectedAction;
    
    if (this.level === 1) {
      // EASY AI: Makes lots of mistakes
      // - 40% completely random action
      // - 30% picks from bottom half of actions (intentionally bad)
      // - 30% picks a decent action
      const rand = Math.random();
      if (rand < 0.40) {
        // Completely random - might do something stupid
        selectedAction = actions[Math.floor(Math.random() * actions.length)];
      } else if (rand < 0.70) {
        // Pick from WORSE actions (bottom half)
        const bottomHalf = actionsToConsider.slice(Math.floor(actionsToConsider.length / 2));
        if (bottomHalf.length > 0) {
          selectedAction = bottomHalf[Math.floor(Math.random() * bottomHalf.length)].action;
        } else {
          selectedAction = actionsToConsider[actionsToConsider.length - 1].action;
        }
      } else {
        // Occasionally make a good play
        selectedAction = actionsToConsider[0].action;
      }
      
      // Easy AI sometimes "forgets" to attack (20% chance to skip attacks)
      if (selectedAction.type === 'attackUnit' || selectedAction.type === 'attackHeart') {
        if (Math.random() < 0.20) {
          // Skip the attack, pick a move or draw instead
          const nonAttacks = actionsToConsider.filter(sa => 
            sa.action.type !== 'attackUnit' && sa.action.type !== 'attackHeart'
          );
          if (nonAttacks.length > 0) {
            selectedAction = nonAttacks[Math.floor(Math.random() * nonAttacks.length)].action;
          }
        }
      }
      
    } else if (this.level === 2) {
      // MEDIUM AI: Makes some mistakes
      // - 60% best action
      // - 25% random from top 5
      // - 15% random from any action
      const rand = Math.random();
      if (rand < 0.60) {
        selectedAction = actionsToConsider[0].action;
      } else if (rand < 0.85) {
        const topActions = actionsToConsider.slice(0, Math.min(5, actionsToConsider.length));
        selectedAction = topActions[Math.floor(Math.random() * topActions.length)].action;
      } else {
        // Sometimes just random
        selectedAction = actions[Math.floor(Math.random() * actions.length)];
      }
      
      // Medium AI sometimes misses lethal (10% chance)
      if (selectedAction.type === 'attackHeart' && Math.random() < 0.10) {
        const nonHeartAttacks = actionsToConsider.filter(sa => sa.action.type !== 'attackHeart');
        if (nonHeartAttacks.length > 0) {
          selectedAction = nonHeartAttacks[0].action;
        }
      }
      
    } else {
      // HARD AI: Always picks the best action from filtered list
      selectedAction = actionsToConsider[0].action;
    }

    // Condensed action log - only for Player AI (gold)
    if (shouldLog) {
      const a = selectedAction;
      const score = scoredActions.find(sa => sa.action === a)?.score || actionsToConsider.find(sa => sa.action === a)?.score || 0;
      let desc = `[${this.role.toUpperCase()}] -> ${a.type}`;
      
      if (a.type === 'playCard') {
        desc += ` ${a.card?.name}`;
        if (a.row !== undefined && a.col !== undefined) desc += ` @(${a.row},${a.col})`;
        else if (a.spawn) desc += ` spawn`;
        if (a.targetUnitId) desc += ` target:${gameState.units[a.targetUnitId]?.name}`;
      } else if (a.type === 'move') {
        desc += ` ${a.unit?.name} (${a.fromRow},${a.fromCol})->(${a.toRow},${a.toCol})`;
      } else if (a.type === 'moveFromSpawn') {
        desc += ` ${a.unit?.name} ->(${a.toRow},${a.toCol})`;
      } else if (a.type === 'attackUnit') {
        desc += ` ${a.attacker?.name} -> ${a.target?.name}`;
      } else if (a.type === 'attackRow') {
        desc += ` ${a.attacker?.name} -> row${a.row}`;
      } else if (a.type === 'attackHeart') {
        desc += ` ${a.attacker?.name} -> HEART`;
      } else if (a.type === 'attackFromSpawn') {
        desc += ` ${a.attacker?.name} -> ${a.target?.name || 'target'}`;
      }
      desc += ` [${Math.round(score)}]`;
      console.log(desc);
    }

    return selectedAction;
  }

  /**
   * Get all possible actions the AI can take
   */
  getAllPossibleActions(gameState, hand, energy, hasDrawn) {
    const actions = [];
    const { board, units, rowHP, movedThisTurn, attackedThisTurn, spawn, moveCountThisTurn } = gameState;

    // Convert arrays to Sets if needed (state is serialized as arrays for network transfer)
    const movedSet = movedThisTurn instanceof Set ? movedThisTurn : new Set(movedThisTurn || []);
    const attackedSet = attackedThisTurn instanceof Set ? attackedThisTurn : new Set(attackedThisTurn || []);
    const moveCounts = moveCountThisTurn || {};

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
              if (units[uid].owner === this.role) {
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
              if (units[uid].owner === this.getOpponent()) {
                actions.push({
                  type: 'playCard',
                  cardId: card.id,
                  card: card,
                  targetUnitId: uid,
                  priority: 14
                });
              }
            });
          } else if (card.requiresTarget === 'tile') {
            // Tile-targeted spells like Lunar Barrage
            // Target tiles where enemies might be grouped (avoid home row edges that can't hit much)
            for (let r = 1; r <= 5; r++) {
              for (let c = 1; c < 5; c++) {
                // Count enemies that would be hit (target + adjacent)
                const enemiesHit = this.countEnemiesInAOE(gameState, r, c);
                if (enemiesHit > 0) {
                  actions.push({
                    type: 'playCard',
                    cardId: card.id,
                    card: card,
                    row: r,
                    col: c,
                    enemiesHit: enemiesHit,
                    priority: 13 + enemiesHit // Higher priority if more enemies hit
                  });
                }
              }
            }
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
          if (!spawn[this.role] && card.type !== 'spell') {
            actions.push({
              type: 'playCard',
              cardId: card.id,
              card: card,
              spawn: this.role,
              priority: 8
            });
          }
        }
      }
    });

    // Move and attack with units on board
    Object.keys(units).forEach(uid => {
      const unit = units[uid];
      if (unit.owner !== this.role) return;
      
      const pos = this.findUnitPos(board, uid);
      if (!pos) return; // Unit is in spawn

      // Check if unit is rooted (by Moon Shadow Warden's shadow_root)
      const isRootedByEffect = !!unit.rooted;
      
      // Check if unit is adjacent to enemy Coffin Trapper (root_aura)
      let isRootedByAura = false;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = pos.r + dr, nc = pos.c + dc;
          if (nr < 0 || nr >= 7 || nc < 0 || nc >= 6) continue;
          const adjId = board[nr][nc];
          if (adjId && units[adjId] && units[adjId].owner !== this.role && units[adjId].effectId === 'root_aura') {
            isRootedByAura = true;
            break;
          }
        }
        if (isRootedByAura) break;
      }
      
      // Rooted units can't move, but CAN still attack!
      const canMove = !isRootedByEffect && !isRootedByAura;

      // Move actions - check both movedSet and moveCountThisTurn
      const canDoubleMove = unit.effectId === 'double_move' || unit.effectId === 'stampede';
      const maxMoves = canDoubleMove ? 2 : 1;
      const currentMoveCount = moveCounts[uid] || 0;
      const canStillMove = canMove && !movedSet.has(uid) && currentMoveCount < maxMoves;
      
      if (canStillMove) {
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
        
        // Sapphire Dancer fairy_swap - can swap with friendly fairies
        if (unit.effectId === 'fairy_swap') {
          const fairyKeys = ['rubysprite', 'emeraldforager', 'sapphiredancer', 'topazminer', 
                             'amethystenchanter', 'diamondguardian', 'opaldevourer',
                             'garnetqueen', 'moonstonewitch', 'prismaticfairy', 'gemshard'];
          Object.keys(units).forEach(targetUid => {
            if (targetUid === uid) return; // Can't swap with self
            const targetUnit = units[targetUid];
            if (targetUnit.owner !== this.role) return;
            if (!fairyKeys.includes(targetUnit.key)) return;
            const targetPos = this.findUnitPos(board, targetUid);
            if (!targetPos) return;
            
            actions.push({
              type: 'move',
              unitId: uid,
              unit: unit,
              fromRow: pos.r,
              fromCol: pos.c,
              toRow: targetPos.r,
              toCol: targetPos.c,
              isFairySwap: true,
              swapTargetId: targetUid,
              swapTarget: targetUnit,
              priority: 12 // Higher than normal moves
            });
          });
        }
      }

      // Attack actions - skip if unit has 0 ATK (no point attacking)
      if (!attackedSet.has(uid) && unit.atk > 0) {
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
        if (this.canAttackHeart(gameState, uid, pos, unit, this.getOpponent())) {
          actions.push({
            type: 'attackHeart',
            attackerId: uid,
            attacker: unit,
            target: this.getOpponent(),
            priority: 25
          });
        }
      }
    });

    // Move from spawn
    const mySpawnId = spawn[this.role];
    if (mySpawnId) {
      const spawnUnit = units[mySpawnId];
      // Home rows depend on role: gold = 0,1; silver = 5,6
      const homeRows = this.role === 'gold' ? [0, 1] : [5, 6];
      if (spawnUnit && !movedSet.has(mySpawnId)) {
        for (const r of homeRows) {
          for (let c = 0; c < 6; c++) {
            if (!board[r][c]) {
              actions.push({
                type: 'moveFromSpawn',
                unitId: mySpawnId,
                unit: spawnUnit,
                toRow: r,
                toCol: c,
                priority: 9
              });
            }
          }
        }
        
        // Attack from spawn - skip if unit has 0 ATK
        if (!attackedSet.has(mySpawnId) && spawnUnit.atk > 0) {
          const spawnTargets = this.getSpawnAttackTargets(gameState, spawnUnit);
          spawnTargets.forEach(target => {
            actions.push({
              type: 'attackFromSpawn',
              attackerId: mySpawnId,
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
      
      // Evaluate board state to determine strategy
      const boardEval = this.evaluateBoardState(gameState);
      const isLosing = boardEval.unitAdvantage < -3 || boardEval.myUnits <= 2;
      const isWinning = boardEval.unitAdvantage > 3 || boardEval.enemyHeartLow;
      const canWinNow = boardEval.canKillHeart;
      const noEnemies = boardEval.enemyUnits === 0;
      const fewEnemies = boardEval.enemyUnits <= 2;

      switch (action.type) {
        case 'drawCard':
          score += 5;
          if (hand.length < 3) score += 15;
          if (hand.length === 0) score += 30; // Desperately need cards
          if (isHard && energy <= 1 && hand.length < 5) score += 10; // Draw when low energy
          // When losing, prioritize drawing to rebuild
          if (isLosing && hand.length < 4) score += 20;
          // When winning with no enemies, don't waste time drawing
          if (noEnemies && hand.length >= 2) score -= 20;
          break;

        case 'playCard':
          score += this.scorePlayCard(action, gameState, hand, energy, isHard);
          // When losing badly, prefer defensive deployment in back rows
          if (isLosing && action.row !== undefined) {
            if (this.isBackRow(action.row)) {
              score += 30; // Stay safe, build up forces
            } else if (this.isForwardRow(action.row)) {
              score -= 40; // Don't send units to die
            }
          }
          // Prefer spawn when losing (safer)
          if (isLosing && action.spawn) {
            score += 20;
          }
          // When winning with no enemies, deploy forward to push
          if (noEnemies && action.row !== undefined && this.isForwardRow(action.row)) {
            score += 25;
          }
          break;

        case 'move':
          score += this.scoreMove(action, gameState, isHard);
          // When losing, penalize aggressive moves
          if (isLosing) {
            if (this.isForwardRow(action.toRow) && !this.isForwardRow(action.fromRow)) {
              score -= 30; // Don't advance when outnumbered
            }
            if (this.isBackRow(action.toRow) && !this.isBackRow(action.fromRow)) {
              score += 15; // Retreat to safety
            }
          }
          // NO ENEMIES = RUSH FORWARD!
          if (noEnemies || fewEnemies) {
            const unit = action.unit;
            // Non-ranged, non-structure units should rush forward
            if (unit && !this.isRangedUnit(unit) && unit.type !== 'structure') {
              const forwardProgress = this.role === 'silver' 
                ? (action.fromRow - action.toRow)
                : (action.toRow - action.fromRow);
              score += forwardProgress * 30; // HUGE bonus for advancing
              
              // Extra bonus for getting to enemy rows
              if (this.isForwardRow(action.toRow)) {
                score += 40; // Get to their side!
              }
            }
          }
          break;

        case 'attackUnit':
          score += this.scoreAttackUnit(action, gameState, isHard);
          // BOOST ALL ATTACKS - attacks should generally be prioritized over moves
          score += 50; // Base attack priority boost
          this.debugLog('attacks', `attackUnit ${action.attacker?.name} -> ${action.target?.name}: base=${score-50}, +50 boost = ${score}`);
          break;

        case 'attackRow':
          score += this.scoreAttackRow(action, gameState, isHard);
          // Boost wall attacks when we have board control
          if (isWinning || fewEnemies) {
            score += 30; // Push advantage by breaking walls
          }
          this.debugLog('attacks', `attackRow ${action.attacker?.name} -> row${action.row}: score=${score}`);
          break;
          
        case 'attackHeart':
          score += this.scoreAttackHeart(action, gameState, isHard);
          // If we can win, massively prioritize this
          if (canWinNow) {
            score += 500;
          }
          // Boost heart attacks when no enemies blocking
          if (noEnemies) {
            score += 100; // Go for the kill!
          }
          this.debugLog('attacks', `attackHeart ${action.attacker?.name}: score=${score}, canWinNow=${canWinNow}`);
          break;

        case 'moveFromSpawn':
          score += this.scoreMoveFromSpawn(action, gameState, isHard);
          // When losing, prefer safer spawn positions
          if (isLosing) {
            if (this.isBackRow(action.toRow)) {
              score += 25;
            } else if (this.isForwardRow(action.toRow)) {
              score -= 30;
            }
          }
          // When winning/no enemies, deploy forward
          if (noEnemies && this.isForwardRow(action.toRow)) {
            score += 20;
          }
          break;
          
        case 'attackFromSpawn':
          score += this.scoreAttackUnit(action, gameState, isHard);
          break;

        case 'endTurn':
          score = -100;
          break;
      }

      // Add significant randomness for lower AI levels
      // This makes Easy/Medium AI less consistent and more beatable
      if (this.level === 1) {
        // Easy: Large random variance (+/- 40 points)
        score += (Math.random() - 0.5) * 80;
        // Sometimes completely ignore effect bonuses
        if (Math.random() < 0.3 && action.type === 'playCard') {
          score = (action.card?.atk || 0) * 2 + (action.card?.hp || 0) + Math.random() * 20;
        }
      } else if (this.level === 2) {
        // Medium: Moderate random variance (+/- 20 points)
        score += (Math.random() - 0.5) * 40;
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
      const middleAllies = this.countAlliesInRows(gameState, [2, 3, 4], this.role);
      if (middleAllies === 0) {
        score -= 50; // Don't play if no allies in middle - waste of effect
      } else {
        score += middleAllies * 15; // Great value when we can deploy aggressively
        // Prefer deploying next to allies in middle, not in home rows
        if (action.row !== undefined && this.isMiddleRow(action.row)) {
          score += 25; // Deploy in middle next to ally
        } else if (action.row !== undefined && this.isBackRow(action.row)) {
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
        const nearbyAllies = this.countNearbyAlliesAt(gameState, action.row, action.col, this.role);
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
        const nearbyAllies = this.countNearbyAlliesAt(gameState, action.row, action.col, this.role);
        const nearbyHighValueAllies = this.countNearbyHighValueAllies(gameState, action.row, action.col, this.role);
        if (nearbyAllies === 0) {
          score -= 50; // Useless alone - the whole point is to protect allies!
        } else {
          score += nearbyAllies * 20; // Good value for each ally protected
          score += nearbyHighValueAllies * 15; // Extra for protecting valuable units
        }
        // Position in front of allies to absorb attacks
        if (this.isForwardRow(action.row) || this.isMiddleRow(action.row)) {
          score += 10; // Good defensive position
        }
      }
      if (action.spawn) {
        score -= 40; // Bad in spawn - can't protect anyone
      }
    }
    
    // WEAKEN AURA (Undead Sheriff, Nosferatu) - Place next to enemies to debuff them
    if (card.effectId === 'weaken_aura' || card.effectId === 'lifesteal_weaken') {
      if (action.row !== undefined && action.col !== undefined) {
        const nearbyEnemies = this.countNearbyEnemiesAt(gameState, action.row, action.col, this.role);
        if (nearbyEnemies === 0) {
          score -= 20; // Less useful if not debuffing enemies
        } else {
          score += nearbyEnemies * 15; // Debuffing enemies is great
        }
        // Position in contested area where enemies will be
        if (this.isMiddleRow(action.row)) {
          score += 15;
        }
      }
    }
    
    // ROOT AURA (Coffin Trapper) - Place where it will lock down enemies
    if (card.effectId === 'root_aura') {
      if (action.row !== undefined && action.col !== undefined) {
        const nearbyEnemies = this.countNearbyEnemiesAt(gameState, action.row, action.col, this.role);
        score += nearbyEnemies * 25; // Huge value for locking down enemies
        // Position in contested area
        if (this.isMiddleRow(action.row)) {
          score += 20; // Great for controlling the middle
        }
        // Also good near our walls to lock down attackers
        if (this.isBackRow(action.row)) {
          score += 10;
        }
      }
    }
    
    // HEAL ADJACENT (Blood Priest) - Place next to allies
    if (card.effectId === 'heal_adjacent') {
      if (action.row !== undefined && action.col !== undefined) {
        const nearbyAllies = this.countNearbyAlliesAt(gameState, action.row, action.col, this.role);
        const damagedAllies = this.countNearbyDamagedAllies(gameState, action.row, action.col);
        if (nearbyAllies === 0) {
          score -= 30; // Useless alone
        } else {
          score += nearbyAllies * 12;
          score += damagedAllies * 20; // Extra value if allies need healing
        }
      }
    }
    
    // LIFESTEAL units - Position where they can fight and sustain
    if (card.effectId === 'lifesteal' || card.effectId === 'lifesteal_grow' || card.effectId === 'lifesteal_lord') {
      // These units want to be in combat to heal
      if (action.row !== undefined && this.isMiddleRow(action.row)) {
        score += 15; // Good position for sustained combat
      }
    }
    
    // BODYGUARD - Place in front of valuable allies
    if (card.effectId === 'bodyguard') {
      if (action.row !== undefined && action.col !== undefined) {
        // Check if there are valuable allies behind this position
        const alliesBehind = this.countAlliesBehind(gameState, action.row, action.col);
        score += alliesBehind * 10;
        // Position forward to intercept attacks
        if (this.isMiddleRow(action.row) || this.isForwardRow(action.row)) {
          score += 10;
        }
      }
    }
    
    // DAMAGE REDUCTION (thick_bones, damage_reduction) - Frontline tanks
    if (card.effectId === 'thick_bones' || card.effectId === 'damage_reduction') {
      // These are great frontline tanks
      if (action.row !== undefined && this.isMiddleRow(action.row)) {
        score += 15;
      }
      if (action.row !== undefined && this.isForwardRow(action.row)) {
        score += 10;
      }
    }
    
    // GROW ON ALLY DEATH (Undertaker, Crypt Keeper) - Play when you have fodder
    if (card.effectId === 'grow_on_ally_death' || card.effectId === 'grow_max_hp_on_ally_death') {
      const fodderCount = Object.values(units).filter(u => 
        u.owner === this.role && (u.hp <= 2 || u.effectId === 'energy_on_death' || u.effectId === 'spawn_bone_pile')
      ).length;
      if (fodderCount >= 2) {
        score += 25; // Great synergy with fodder units
      } else if (fodderCount === 0) {
        score -= 15; // Less valuable without death triggers
      }
    }
    
    // DEATH EXPLOSION (The Hanged Man) - Position near enemies
    if (card.effectId === 'death_explosion') {
      if (action.row !== undefined && action.col !== undefined) {
        const nearbyEnemies = this.countNearbyEnemiesAt(gameState, action.row, action.col, this.role);
        score += nearbyEnemies * 15; // Great if it will hit enemies when it dies
      }
      // Position aggressively
      if (action.row !== undefined && this.isForwardRow(action.row)) {
        score += 10;
      }
    }
    
    // CLEAVE - Position where it can hit multiple enemies
    if (card.effectId === 'cleave') {
      // Cleave is best when enemies are grouped
      if (action.row !== undefined && this.isMiddleRow(action.row)) {
        score += 10;
      }
    }
    
    // DOUBLE ATTACK - Very valuable, position aggressively
    if (card.effectId === 'double_attack') {
      score += 15; // Always good
      if (action.row !== undefined && !this.isBackRow(action.row)) {
        score += 10;
      }
    }
    
    // REFLECT DAMAGE - Position as bait for enemies
    if (card.effectId === 'reflect_damage') {
      if (action.row !== undefined && this.isMiddleRow(action.row)) {
        score += 15; // Good position to get attacked
      }
    }
    
    // GEM SYNERGIES (Jeweled Court)
    if (card.effectId === 'gem_adjacent_buff') {
      // Diamond Guardian - place next to gems
      const nearbyGems = this.countNearbyGemsAt(gameState, action.row, action.col);
      score += nearbyGems * 20;
    }
    
    // UFO SCRAPER - Play in back rows to grow safely
    if (card.effectId === 'absorb_ally') {
      // Count friendly aliens we can absorb
      const friendlyAliens = Object.values(units).filter(u => 
        u.owner === this.role && u.key !== 'ufoscraper'
      ).length;
      
      if (friendlyAliens === 0) {
        score -= 20; // No allies to absorb
      } else {
        score += friendlyAliens * 8;
      }
      
      // Prefer back rows where it's safe
      if (action.row !== undefined) {
        if (this.isBackRow(action.row)) {
          score += 20; // Safe in back
        } else if (this.isForwardRow(action.row)) {
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
      if (action.row !== undefined && !this.isBackRow(action.row)) {
        score += 10;
      }
    }
    
    // SIEGE UNITS - Very valuable for breaking walls
    if (card.effectId === 'siege') {
      score += 15; // Always good
      // Even better if we're close to enemy walls
      const unitsNearWalls = this.countAlliesInRows(gameState, [2, 3], this.role);
      if (unitsNearWalls > 0) {
        score += 20; // We have units ready to push
      }
    }
    
    // TEMPLE OF THE MOON - Must be placed adjacent to 2+ non-structure allies
    if (card.effectId === 'temple_blessing') {
      if (action.row !== undefined && action.col !== undefined) {
        const nearbyNonStructures = this.countNearbyNonStructureAlliesAt(gameState, action.row, action.col, this.role);
        this.debugLog('effects', `Temple of the Moon at (${action.row},${action.col}): ${nearbyNonStructures} non-structure allies nearby`);
        
        if (nearbyNonStructures < 2) {
          score -= 80; // HUGE penalty - effect won't trigger without 2+ allies!
          this.debugLog('effects', `  -> PENALTY -80 (needs 2+ allies, has ${nearbyNonStructures})`);
        } else {
          score += nearbyNonStructures * 25; // +25 per ally that will get buffed
          this.debugLog('effects', `  -> BONUS +${nearbyNonStructures * 25} (will buff ${nearbyNonStructures} allies)`);
        }
        
        // Strong units nearby = even more value from the ATK buff
        const nearbyStrongAllies = this.countNearbyStrongAlliesAt(gameState, action.row, action.col, this.role);
        if (nearbyStrongAllies > 0) {
          score += nearbyStrongAllies * 10; // Extra value for buffing strong units
        }
      }
      if (action.spawn) {
        score -= 100; // NEVER put in spawn - completely wastes the structure
        this.debugLog('effects', `Temple of the Moon -> spawn: PENALTY -100 (useless in spawn)`);
      }
    }
    
    // LUNAR PRIESTESS - Can heal allies, position near them
    if (card.effectId === 'heal_attack') {
      if (action.row !== undefined && action.col !== undefined) {
        const nearbyAllies = this.countNearbyAlliesAt(gameState, action.row, action.col, this.role);
        const damagedAllies = this.countNearbyDamagedAllies(gameState, action.row, action.col);
        score += nearbyAllies * 8;
        score += damagedAllies * 15; // Extra value if allies need healing
        this.debugLog('effects', `Lunar Priestess at (${action.row},${action.col}): ${nearbyAllies} allies, ${damagedAllies} damaged`);
      }
    }
    
    // STAR INVOKER - Deals 2 random damage per turn, very valuable
    if (card.effectId === 'star_strike') {
      score += 20; // Always good - free 2 damage per turn
      // Better when enemies are on the field
      const enemyCount = Object.values(units).filter(u => u.owner !== this.role).length;
      if (enemyCount >= 3) score += 10;
      // Keep in back where it's safe
      if (action.row !== undefined && this.isBackRow(action.row)) {
        score += 15;
      }
    }
    
    // MOONWELL - Great economy card
    if (card.effectId === 'moonwell') {
      score += 25; // Excellent value - +1 energy and +1 card per turn
      // Keep in back where it's safe
      if (action.row !== undefined && this.isBackRow(action.row)) {
        score += 20;
      }
      if (action.spawn) {
        score -= 30; // Bad in spawn
      }
    }
    
    // RANGED UNITS (Archers, etc) - ALWAYS deploy in back row, never forward
    if (this.isRangedUnit(card)) {
      if (action.row !== undefined) {
        const homeRow = this.role === 'gold' ? 0 : 6;
        const forwardHomeRow = this.role === 'gold' ? 1 : 5;
        
        if (action.row === homeRow) {
          score += 40; // BEST - safest position, can still attack
        } else if (action.row === forwardHomeRow) {
          score += 20; // OK - still in home rows
        } else if (this.isMiddleRow(action.row)) {
          score -= 30; // BAD - ranged units shouldn't be in middle
        } else if (this.isForwardRow(action.row)) {
          score -= 60; // TERRIBLE - ranged units will die
        }
      }
      if (action.spawn) {
        score -= 20; // Spawn is suboptimal for ranged
      }
    }
    
    // STRUCTURES (Armory, Treasury, etc) - Deploy in HOME ROW (row 0 for gold, row 6 for silver)
    if (card.type === 'structure') {
      if (action.row !== undefined) {
        const homeRow = this.role === 'gold' ? 0 : 6;
        if (action.row === homeRow) {
          score += 50; // BEST - structures are safest in back
        } else if (this.isBackRow(action.row)) {
          score += 20; // OK
        } else {
          score -= 40; // BAD - structures shouldn't be forward
        }
      }
      if (action.spawn) {
        score -= 50; // Structures in spawn are usually bad
      }
    }
    
    // === JEWELED COURT CARD-SPECIFIC AI ===
    
    // EMERALD FORAGER - Spawns gem shards, prioritize playing early
    if (card.effectId === 'gem_spawn') {
      score += 15; // Good value - spawns a free unit
      // Better early game to get gem engine going
      const gemCount = Object.values(units).filter(u => u.key === 'gemshard').length;
      if (gemCount < 3) score += 10;
    }
    
    // MOONSTONE WITCH - Gets stronger with more gems
    if (card.effectId === 'gem_transform') {
      const gemCount = Object.values(units).filter(u => u.key === 'gemshard').length;
      score += gemCount * 8; // More valuable with more gems
      // Keep in back to stay safe and farm kills
      if (action.row !== undefined && this.isBackRow(action.row)) score += 15;
      if (action.row !== undefined && this.isForwardRow(action.row)) score -= 15;
    }
    
    // OPAL DEVOURER - Eats gems to grow
    if (card.effectId === 'consume_gem') {
      const gemCount = Object.values(units).filter(u => u.key === 'gemshard').length;
      if (gemCount >= 2) {
        score += 25; // Great if we have gems to eat
      } else if (gemCount === 0) {
        score -= 15; // Not as good without gems
      }
    }
    
    // GARNET QUEEN - Place where she can debuff enemies and buff allies
    if (card.effectId === 'garnet_aura') {
      if (action.row !== undefined && action.col !== undefined) {
        const nearbyAllies = this.countNearbyAlliesAt(gameState, action.row, action.col, this.role);
        const nearbyEnemies = this.countNearbyEnemiesAt(gameState, action.row, action.col, this.role);
        score += nearbyAllies * 15; // Buff allies
        score += nearbyEnemies * 20; // Debuff enemies is even better
      }
      // Middle rows are best for her aura
      if (action.row !== undefined && action.row >= 3 && action.row <= 4) score += 15;
    }
    
    // DIAMOND GUARDIAN - Place next to valuable allies to protect them
    if (card.effectId === 'bodyguard') {
      if (action.row !== undefined && action.col !== undefined) {
        const nearbyAllies = this.countNearbyAlliesAt(gameState, action.row, action.col, this.role);
        score += nearbyAllies * 12;
        // Extra value if protecting high-value units
        const nearbyHighValue = this.countNearbyHighValueAllies(gameState, action.row, action.col, this.role);
        score += nearbyHighValue * 10;
      }
    }
    
    // PRISMATIC FAIRY - More valuable with gems on field (triggers AOE when gems die)
    if (card.effectId === 'gem_death_aoe') {
      const gemCount = Object.values(units).filter(u => u.key === 'gemshard').length;
      score += gemCount * 10;
      // Extra valuable if we have Opal Devourer to eat gems and trigger AOE
      const hasOpalDevourer = Object.values(units).some(u => u.effectId === 'consume_gem');
      if (hasOpalDevourer) score += 20;
    }
    
    // FAIRY RING SPELL - Spawns 2 gems, great for gem engine
    if (card.effectId === 'summon_gems') {
      score += 20; // Always good value
      // Even better if we have gem synergy cards
      const hasGemSynergy = Object.values(units).some(u => 
        u.effectId === 'gem_transform' || u.effectId === 'consume_gem' || u.effectId === 'gem_death_aoe'
      );
      if (hasGemSynergy) score += 25;
    }
    
    // PEARL BLESSING - Better with more units on field
    if (card.effectId === 'fairy_blessing') {
      const fairyKeys = ['rubysprite', 'emeraldforager', 'sapphiredancer', 'topazminer', 
                         'amethystenchanter', 'diamondguardian', 'opaldevourer',
                         'garnetqueen', 'moonstonewitch', 'prismaticfairy'];
      const allyCount = Object.values(units).filter(u => u.owner === this.role).length;
      const fairyCount = Object.values(units).filter(u => 
        u.owner === this.role && fairyKeys.includes(u.key)
      ).length;
      score += allyCount * 5; // +1 HP to all
      score += fairyCount * 8; // +1 ATK to fairies too
    }
    
    // GEMSTONE CURSE - Target high ATK enemies
    if (card.effectId === 'halve_atk' && action.targetUnitId) {
      const target = units[action.targetUnitId];
      if (target) {
        score += target.atk * 5; // More valuable against high ATK
        if (target.atk >= 5) score += 25; // Huge value against big threats
      }
    }

    // Effect bonuses (general)
    if (card.effectId) {
      score += this.scoreCardEffect(card, gameState, action, isHard);
    }
    
    // AOE spell scoring (Lunar Barrage, etc.)
    if (card.requiresTarget === 'tile' && action.enemiesHit) {
      // Base value per enemy hit
      score += action.enemiesHit * 25;
      
      // Bonus for hitting multiple enemies (AOE efficiency)
      if (action.enemiesHit >= 3) score += 30;
      else if (action.enemiesHit >= 2) score += 15;
      
      // Check if any hits would be kills
      const { units, board } = gameState;
      let potentialKills = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = action.row + dr, nc = action.col + dc;
          if (nr < 0 || nr >= 7 || nc < 0 || nc >= 6) continue;
          const uid = board[nr][nc];
          if (uid && units[uid] && units[uid].owner === this.getOpponent()) {
            // Lunar Barrage does 2 damage
            if (units[uid].hp <= 2) potentialKills++;
          }
        }
      }
      score += potentialKills * 20; // Bonus for kills
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
      case 'ranged_pierce':
      case 'starweave_ranged':
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
    const { board, units, buffTiles, rowHP, bossEventWarning } = gameState;

    // === BOSS EVENT AVOIDANCE (Critical for player AI) ===
    // Never deploy into a danger zone!
    if (bossEventWarning && bossEventWarning.tiles) {
      const isInDanger = bossEventWarning.tiles.some(t => t.r === row && t.c === col);
      if (isInDanger) {
        score -= 300; // NEVER deploy into danger
      }
    }

    if (!isHard) {
      // Simple positioning for lower AI
      const forwardHomeRow = this.role === 'gold' ? 1 : 5;
      if (row === forwardHomeRow) score += 3;
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
    
    // === DEPLOY ADJACENT TO BENEFICIAL STRUCTURES ===
    // Non-structure cards should try to deploy adjacent to Temple of the Moon, War Banner, etc
    if (card.type !== 'structure') {
      const structures = this.findFriendlyStructures(gameState, this.role);
      
      for (const struct of structures) {
        const dist = Math.abs(row - struct.row) + Math.abs(col - struct.col);
        
        // Temple of the Moon - huge value if we can be adjacent
        if (struct.effectId === 'temple_blessing' && dist === 1) {
          score += 35; // Will get +1 ATK every turn!
          this.debugLog('effects', `Deploying ${card.name} adjacent to Temple of the Moon: +35`);
        }
        
        // War Banner - +1 ATK while adjacent
        if (struct.effectId === 'attack_aura' && dist === 1) {
          score += 20;
        }
        
        // Shield Bearer - damage reduction while adjacent
        if (struct.effectId === 'shield_aura' && dist === 1) {
          score += 12;
        }
        
        // Moonwell - no need to be adjacent, but don't block it
        if (struct.effectId === 'moonwell' && dist === 0) {
          score -= 50; // Don't deploy ON the moonwell (can't anyway, but safety)
        }
      }
    }

    // Offensive units should be forward
    if (card.atk >= 3) {
      if (!this.isBackRow(row)) score += 5;
      if (this.isForwardRow(row)) score += 3;
    }

    // Defensive units protect the back
    if (card.hp > card.atk) {
      if (this.isBackRow(row)) score += 4;
    }

    // Support units (auras) should be near other units
    if (card.effectId && (card.effectId.includes('aura') || card.effectId === 'shield_aura')) {
      const nearbyAllies = this.countNearbyAllies(gameState, row, col);
      score += nearbyAllies * 4;
    }

    // Don't clump too much in one column (vulnerable to cleave)
    let unitsInCol = 0;
    for (let r = 0; r < 7; r++) {
      if (board[r][col] && units[board[r][col]]?.owner === this.role) unitsInCol++;
    }
    if (unitsInCol >= 2) score -= 3;

    // Prefer spreading out initially
    const totalUnits = Object.values(units).filter(u => u.owner === this.role).length;
    if (totalUnits < 3) {
      // Early game - spread across columns
      let colHasUnit = false;
      for (let r = 0; r < 7; r++) {
        if (board[r][col] && units[board[r][col]]?.owner === this.role) {
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
    const { board, units, rowHP, buffTiles, heartHP, bossEventWarning } = gameState;
    const unit = action.unit;
    if (!unit) return 0; // Safety check
    
    // === BOSS EVENT AVOIDANCE (Critical for player AI) ===
    // Heavily penalize moving INTO danger zones, reward moving OUT
    if (bossEventWarning && bossEventWarning.tiles) {
      const isCurrentlyInDanger = bossEventWarning.tiles.some(t => t.r === action.fromRow && t.c === action.fromCol);
      const isMovingIntoDanger = bossEventWarning.tiles.some(t => t.r === action.toRow && t.c === action.toCol);
      
      if (isMovingIntoDanger && !isCurrentlyInDanger) {
        score -= 200; // NEVER move into danger
      } else if (isMovingIntoDanger && isCurrentlyInDanger) {
        score -= 50; // Staying in danger is bad but not as bad
      } else if (!isMovingIntoDanger && isCurrentlyInDanger) {
        score += 150; // GREAT - escaping danger!
      }
    }
    
    // Moving forward is generally good
    // Silver moves toward row 0, Gold moves toward row 6
    const fromRow = action.fromRow !== undefined ? action.fromRow : (this.role === 'silver' ? 6 : 0);
    const forwardProgress = this.role === 'silver' 
      ? (fromRow - action.toRow)  // Silver: lower row = forward
      : (action.toRow - fromRow); // Gold: higher row = forward
    score += forwardProgress * 3;

    // Easy/Medium AI don't value forward movement as much
    if (this.level === 1) {
      // Easy AI sometimes moves backwards or sideways for no reason
      score += (Math.random() - 0.3) * 20; // Random bonus/penalty
    } else if (this.level === 2) {
      score += (Math.random() - 0.4) * 10;
    }

    if (!isHard) {
      const nearbyEnemies = this.countNearbyEnemies(gameState, action.toRow, action.toCol);
      if (unit.atk > 2) score += nearbyEnemies * 2;
      
      // Easy AI doesn't care much about buff tiles
      if (this.level === 1) {
        // 50% chance to ignore buff tiles completely
        if (Math.random() < 0.5) {
          return score;
        }
      }
      
      // Medium AI has some buff tile awareness
      if (this.level === 2 && buffTiles) {
        const buffKey = `${action.toRow}-${action.toCol}`;
        if (buffTiles[buffKey]) {
          score += 15; // Some bonus but not as much as Hard
        }
      }
      
      return score;
    }

    // Hard AI advanced move scoring
    
    // Enemy wall rows for checking if path to heart is open
    const enemyWallRows = this.role === 'silver' ? [0, 1] : [5, 6];
    
    // === BUFF TILE PRIORITY - HIGH VALUE ===
    const buffKey = `${action.toRow}-${action.toCol}`;
    if (buffTiles && buffTiles[buffKey]) {
      const buff = buffTiles[buffKey];
      // Base bonus for any buff tile
      score += 40;
      // Extra value for powerful buffs
      if (buff.id === 'energy_buff') score += 25; // Energy is crucial
      if (buff.id === 'draw_buff') score += 20; // Cards are valuable
      if (buff.id === 'atk_buff') score += 15;
      if (buff.id === 'hp_buff') score += 10;
      
      // Even more valuable if unit has low HP (buff heals)
      if (unit.hp <= 2) score += 15;
      
      // Double move units are perfect for grabbing buffs
      if (unit.effectId === 'double_move' || unit.effectId === 'stampede') {
        score += 20;
      }
    }
    
    // Bonus for moving toward unclaimed buff tiles (even if not landing on them)
    if (buffTiles) {
      for (const key in buffTiles) {
        const buff = buffTiles[key];
        const buffR = buff.row, buffC = buff.col;
        // Skip if buff tile is occupied
        if (board[buffR][buffC]) continue;
        
        // Calculate distance improvement
        const currentDist = Math.abs(action.fromRow - buffR) + Math.abs(action.fromCol - buffC);
        const newDist = Math.abs(action.toRow - buffR) + Math.abs(action.toCol - buffC);
        if (newDist < currentDist) {
          score += (currentDist - newDist) * 5; // Bonus for getting closer
        }
      }
    }
    
    // Bonus for reaching middle of field
    if (this.isMiddleRow(action.toRow)) {
      score += 8; // Control the middle
    }
    
    // Position for attacks next turn
    const enemiesInRange = this.countEnemiesInAttackRange(gameState, action.toRow, action.toCol, unit);
    score += enemiesInRange * 4;

    // High ATK units should advance aggressively
    if (unit.atk >= 3 && !this.isRangedUnit(unit)) {
      score += forwardProgress * 2;
      
      // Move toward enemy heart if walls are down
      if (this.isForwardRow(action.toRow) && rowHP[enemyWallRows[0]] <= 0 && rowHP[enemyWallRows[1]] <= 0) {
        score += 15; // Path to heart is open!
      }
    }

    // Protect valuable units - don't move them into danger
    if (unit.effectId || unit.hp >= 4) {
      const threats = this.countThreats(gameState, action.toRow, action.toCol);
      score -= threats * 3;
    }

    // RANGED UNITS - Stay in back row, never advance
    if (this.isRangedUnit(unit)) {
      const homeRow = this.role === 'gold' ? 0 : 6;
      const forwardHomeRow = this.role === 'gold' ? 1 : 5;
      
      if (action.toRow === homeRow) {
        score += 30; // BEST - safest, can still attack
      } else if (action.toRow === forwardHomeRow) {
        score += 10; // OK
      } else if (this.isMiddleRow(action.toRow)) {
        score -= 40; // BAD - ranged shouldn't advance
      } else if (this.isForwardRow(action.toRow)) {
        score -= 80; // TERRIBLE - ranged will die
      }
      
      // Penalize moving forward, reward staying put or moving back
      if (forwardProgress > 0) {
        score -= forwardProgress * 20; // Don't advance ranged units
      } else if (forwardProgress < 0) {
        score += Math.abs(forwardProgress) * 10; // Retreating is good
      }
    }
    
    // STRUCTURES - Should NEVER move forward (they're 0 ATK usually)
    if (unit.type === 'structure') {
      const homeRow = this.role === 'gold' ? 0 : 6;
      if (action.toRow === homeRow) {
        score += 20; // Good - stay in back
      } else if (forwardProgress > 0) {
        score -= 50; // Don't advance structures!
      }
    }

    // === AURA/SUPPORT UNIT MOVEMENT ===
    const defaultFromRow = this.role === 'silver' ? 6 : 0;
    const currentAllies = this.countNearbyAllies(gameState, action.fromRow || defaultFromRow, action.fromCol || 0);
    const newAllies = this.countNearbyAllies(gameState, action.toRow, action.toCol);
    
    // SHIELD AURA - Must stay adjacent to allies to protect them
    if (unit.effectId === 'shield_aura') {
      if (newAllies === 0) {
        score -= 100; // NEVER move away from all allies - loses the entire point!
      } else if (newAllies > currentAllies) {
        score += 30; // Great - protecting more allies
      } else if (newAllies < currentAllies) {
        score -= 20; // Bad - protecting fewer allies
      }
    }
    
    // ATTACK AURA - Stay adjacent to allies to buff them
    if (unit.effectId === 'attack_aura') {
      if (newAllies === 0) {
        score -= 80; // Useless if not buffing anyone
      } else if (newAllies > currentAllies) {
        score += 25;
      } else if (newAllies < currentAllies) {
        score -= 15;
      }
    }
    
    // WEAKEN AURA - Move toward enemies to debuff them
    if (unit.effectId === 'weaken_aura' || unit.effectId === 'lifesteal_weaken') {
      const currentEnemies = this.countNearbyEnemiesAt(gameState, action.fromRow || defaultFromRow, action.fromCol || 0, this.role);
      const newEnemies = this.countNearbyEnemiesAt(gameState, action.toRow, action.toCol, this.role);
      if (newEnemies > currentEnemies) {
        score += 20; // Good - debuffing more enemies
      }
    }
    
    // ROOT AURA - Move toward enemies to lock them down
    if (unit.effectId === 'root_aura') {
      const currentEnemies = this.countNearbyEnemiesAt(gameState, action.fromRow || defaultFromRow, action.fromCol || 0, this.role);
      const newEnemies = this.countNearbyEnemiesAt(gameState, action.toRow, action.toCol, this.role);
      if (newEnemies > currentEnemies) {
        score += 30; // Great - locking down more enemies
      }
    }
    
    // HEAL ADJACENT - Stay near allies, especially damaged ones
    if (unit.effectId === 'heal_adjacent') {
      const newDamaged = this.countNearbyDamagedAllies(gameState, action.toRow, action.toCol);
      if (newAllies === 0) {
        score -= 60; // Useless alone
      } else if (newDamaged > 0) {
        score += newDamaged * 15; // Great - can heal wounded allies
      }
    }
    
    // === MOVE TOWARD BENEFICIAL STRUCTURES ===
    // Non-structure units should try to be adjacent to Temple of the Moon, War Banner, etc
    if (unit.type !== 'structure') {
      const structures = this.findFriendlyStructures(gameState, this.role);
      
      for (const struct of structures) {
        // Temple of the Moon - needs 2+ adjacent allies to trigger
        if (struct.effectId === 'temple_blessing') {
          const currentDist = Math.abs(action.fromRow - struct.row) + Math.abs(action.fromCol - struct.col);
          const newDist = Math.abs(action.toRow - struct.row) + Math.abs(action.toCol - struct.col);
          
          // Moving to be adjacent (distance 1)
          if (newDist === 1 && currentDist > 1) {
            score += 35; // Excellent - will benefit from +1 ATK each turn!
            this.debugLog('effects', `${unit.name} moving adjacent to Temple of the Moon: +35`);
          } else if (newDist <= 2 && currentDist > 2) {
            score += 15; // Good - getting closer
          } else if (newDist > currentDist && currentDist <= 2) {
            score -= 20; // Bad - moving away from the Temple
          }
        }
        
        // War Banner - stay adjacent for +1 ATK
        if (struct.effectId === 'attack_aura') {
          const newDist = Math.abs(action.toRow - struct.row) + Math.abs(action.toCol - struct.col);
          const currentDist = Math.abs(action.fromRow - struct.row) + Math.abs(action.fromCol - struct.col);
          if (newDist === 1 && currentDist > 1) {
            score += 20; // Good - get the ATK buff
          } else if (newDist > currentDist && currentDist <= 1) {
            score -= 15; // Bad - losing the buff
          }
        }
        
        // Shield Bearer - stay adjacent for damage reduction
        if (struct.effectId === 'shield_aura') {
          const newDist = Math.abs(action.toRow - struct.row) + Math.abs(action.toCol - struct.col);
          const currentDist = Math.abs(action.fromRow - struct.row) + Math.abs(action.fromCol - struct.col);
          if (newDist === 1 && currentDist > 1 && unit.hp <= 3) {
            score += 15; // Low HP units should get shield protection
          }
        }
      }
    }
    
    // Generic aura support units - stay with allies
    if (unit.effectId && unit.effectId.includes && unit.effectId.includes('aura') && 
        !['shield_aura', 'attack_aura', 'weaken_aura', 'root_aura'].includes(unit.effectId)) {
      score += (newAllies - currentAllies) * 5;
    }
    
    // UFO Scraper - stay back until strong
    if (unit.effectId === 'absorb_ally') {
      if (unit.atk < 5) {
        // Still growing - stay safe
        if (this.isBackRow(action.toRow)) score += 15;
        if (this.isForwardRow(action.toRow)) score -= 20;
      } else {
        // Strong enough - go attack!
        score += forwardProgress * 5;
      }
    }

    // Move to contest rows we don't own
    const rowOwner = gameState.rowOwner ? gameState.rowOwner[action.toRow] : null;
    if (rowOwner === this.getOpponent()) score += 5;
    
    // === SAPPHIRE DANCER FAIRY SWAP ===
    if (action.isFairySwap && action.swapTarget) {
      score = 0; // Reset score for swap-specific evaluation
      const swapTarget = action.swapTarget;
      
      // Goal: Bring strong units from back to front, send weak units back
      const targetCurrentRow = action.toRow; // Where the swap target currently is
      const dancerCurrentRow = action.fromRow; // Where the dancer currently is
      
      // Is the swap target a high-value attacker? Bring them forward!
      const isHighValue = swapTarget.atk >= 3 || swapTarget.effectId === 'gem_transform' || 
                          swapTarget.effectId === 'garnet_aura' || swapTarget.effectId === 'consume_gem';
      
      // Check if swap brings unit forward (role-dependent)
      const targetDistToEnemy = this.distanceToEnemyHeart(targetCurrentRow);
      const dancerDistToEnemy = this.distanceToEnemyHeart(dancerCurrentRow);
      
      if (isHighValue && targetDistToEnemy > dancerDistToEnemy) {
        // Swap target is behind dancer - bring them forward!
        const rowsAdvanced = targetDistToEnemy - dancerDistToEnemy;
        score += rowsAdvanced * 25;
        
        // Extra bonus for bringing attackers to the front line
        if (this.isForwardRow(dancerCurrentRow) || this.isMiddleRow(dancerCurrentRow)) {
          score += 30; // Dancer is near front - great swap position
        }
        
        // Huge bonus for enabling attacks
        const enemiesNearDancer = this.countEnemiesInAttackRange(gameState, dancerCurrentRow, action.fromCol, swapTarget);
        score += enemiesNearDancer * 20;
      }
      
      // Swap a low HP unit to safety
      if (swapTarget.hp <= 2 && this.isForwardRow(targetCurrentRow) && this.isBackRow(dancerCurrentRow)) {
        score += 25; // Save the wounded unit
      }
      
      // Don't swap for no reason
      if (Math.abs(targetCurrentRow - dancerCurrentRow) <= 1) {
        score -= 10; // Pointless swap
      }
    }

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
    
    let debugReason = `dmg=${damageDealt}*3=${damageDealt*3}`;

    // === GANG UP BONUS - Multiple allies can attack the same target ===
    // Count how many of OUR units can attack this target
    const targetPos = action.targetPos || this.findUnitPos(board, action.targetId);
    if (targetPos) {
      let alliesInRange = 0;
      let totalDamageAvailable = 0;
      
      Object.keys(units).forEach(uid => {
        const u = units[uid];
        if (u.owner !== this.role || u.atk <= 0) return;
        const uPos = this.findUnitPos(board, uid);
        if (!uPos) return;
        
        // Check if this ally can attack the target
        const rowDist = Math.abs(uPos.r - targetPos.r);
        const colDist = Math.abs(uPos.c - targetPos.c);
        const isRanged = this.isRangedUnit(u);
        const isDiagonal = u.effectId === 'diagonal_attack';
        
        let canAttackTarget = false;
        if (isRanged) {
          canAttackTarget = (rowDist <= 2 && colDist === 0) || (colDist <= 2 && rowDist === 0);
        } else if (isDiagonal) {
          canAttackTarget = rowDist <= 1 && colDist <= 1 && !(rowDist === 0 && colDist === 0);
        } else {
          canAttackTarget = (rowDist === 1 && colDist === 0) || (rowDist === 0 && colDist === 1);
        }
        
        if (canAttackTarget) {
          alliesInRange++;
          totalDamageAvailable += u.atk;
        }
      });
      
      // If we can kill with combined damage but not alone, bonus!
      if (!willKill && totalDamageAvailable >= target.hp && alliesInRange >= 2) {
        score += 40; // Gang up kill bonus
        debugReason += `, GANG-UP +40 (${alliesInRange} allies, ${totalDamageAvailable} total dmg)`;
      } else if (alliesInRange >= 2) {
        // Even if not a kill, focusing fire is good
        score += alliesInRange * 10;
        debugReason += `, focus +${alliesInRange * 10}`;
      }
    }

    // === IF YOU CAN KILL, YOU SHOULD KILL ===
    if (willKill) {
      score += 100; // MASSIVE bonus for kills - always prioritize kills
      score += target.atk * 8; // Extra for high-damage targets
      score += (target.maxHp || target.hp) * 3; // Extra for tanky targets
      debugReason += `, KILL +100 +atk*8=${target.atk*8} +hp*3=${(target.maxHp||target.hp)*3}`;
      
      // Killing units with effects is extra valuable
      if (target.effectId) {
        score += 25;
        debugReason += `, effect +25`;
      }
    }

    // Priority targets (even if we can't kill)
    score += target.atk * 3; // High ATK = high threat
    debugReason += `, threat +${target.atk*3}`;
    
    this.debugLog('attacks', `  scoreAttackUnit ${attacker.name}(${attacker.atk}) -> ${target.name}(${target.hp}hp): ${debugReason} = ${score}`);
    
    if (!isHard) return score;

    // Hard AI advanced combat scoring
    
    // === STRATEGIC THREAT ANALYSIS ===
    // Understand what the opponent is trying to do and counter it
    
    // Our wall rows depend on role
    const ourWallRows = this.role === 'silver' ? [5, 6] : [0, 1];
    const ourHeartKey = this.role; // 'silver' or 'gold'
    
    // 1. KILL UNITS THREATENING OUR HEART
    if (targetPos) {
      const distToOurHeart = this.distanceToOwnHeart(targetPos.r);
      if (distToOurHeart <= 2) {
        score += 20; // Unit is close to our side
        if (target.atk >= 3) score += 15; // High damage threat
      }
      // Unit in our home rows is critical threat
      if (this.isBackRow(targetPos.r)) {
        score += 30;
      }
    }
    
    // 2. KILL SIEGE UNITS BEFORE THEY BREAK WALLS
    if (target.effectId === 'siege') {
      score += 25;
      // Extra urgent if our walls are low
      if (rowHP[ourWallRows[0]] > 0 && rowHP[ourWallRows[0]] <= 15) score += 20;
      if (rowHP[ourWallRows[1]] > 0 && rowHP[ourWallRows[1]] <= 15) score += 20;
    }
    
    // 3. KILL SUPPORT UNITS THAT BUFF OTHERS
    if (targetPos && (target.effectId === 'attack_aura' || target.effectId === 'shield_aura' || target.effectId === 'heal_aura')) {
      // Count how many units this aura is buffing
      const buffedUnits = this.countNearbyAlliesOf(gameState, targetPos.r, targetPos.c, this.getOpponent());
      score += 15 + (buffedUnits * 10); // More valuable if buffing multiple units
    }
    
    // 4. KILL RANGED UNITS - they're annoying and safe
    if (this.isRangedUnit(target)) {
      score += 18;
      // Extra priority if they're in a safe back position (enemy's back)
      if (targetPos && this.isForwardRow(targetPos.r)) score += 10;
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
    // If both our walls are down, units in our home rows can hit our heart
    if (rowHP[ourWallRows[0]] <= 0 && rowHP[ourWallRows[1]] <= 0) {
      if (targetPos && this.isBackRow(targetPos.r)) {
        score += 40; // CRITICAL - they can hit our heart!
        if (target.atk >= heartHP[ourHeartKey]) score += 100; // They can kill us!
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
    if (target.effectId === 'gem_transform') score += 15; // Moonstone Witch snowballs
    if (target.effectId === 'consume_gem') score += 12; // Opal Devourer can grow
    
    // 9. IDENTIFY WIN CONDITION UNITS
    // If opponent has few units, each one is more valuable to kill
    const enemyUnitCount = Object.values(units).filter(u => u.owner === this.getOpponent()).length;
    if (enemyUnitCount <= 2) {
      score += 20; // Cripple their board presence
    }
    if (enemyUnitCount === 1 && willKill) {
      score += 30; // Wipe their board!
    }
    
    // === JEWELED COURT: OPAL DEVOURER GEM CONSUMING ===
    if (action.isGemConsume) {
      // Opal Devourer eating a Gem Shard - gains +2/+2
      score = 80; // High priority - it's free stats!
      
      // Even higher if Opal Devourer is low on stats
      if (attacker.atk <= 3) score += 20;
      if (attacker.hp <= 3) score += 20;
      
      // Check if there's a Prismatic Fairy - eating gems triggers AOE damage to enemies!
      const hasPrismaticFairy = Object.values(units).some(u => 
        u.owner === this.role && u.effectId === 'gem_death_aoe'
      );
      if (hasPrismaticFairy) {
        score += 40; // Eating gems also damages all enemies!
      }
      
      // But don't eat all gems if Moonstone Witch needs them for ATK buff
      const hasMoonstoneWitch = Object.values(units).some(u => 
        u.owner === this.role && u.effectId === 'gem_transform'
      );
      const gemCount = Object.values(units).filter(u => u.key === 'gemshard').length;
      if (hasMoonstoneWitch && gemCount <= 2) {
        score -= 30; // Keep some gems for Moonstone Witch's ATK buff
      }
      
      return score; // Skip normal trade evaluation for gem consuming
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
        if (uid && units[uid]?.owner === this.role) unitsReadyToAdvance++;
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
    
    // Enemy heart is the opposite of our role
    const enemyHeart = this.role === 'silver' ? heartHP.gold : heartHP.silver;
    
    let score = 50; // Base - heart damage is always valuable

    // Going for lethal!
    if (enemyHeart <= attacker.atk) {
      score += 500; // WIN THE GAME
    }

    // Heart is low
    if (enemyHeart <= 10) {
      score += 30;
    }

    score += attacker.atk * 3; // More damage = better

    if (isHard) {
      // Check if we should attack heart or save for better attacks
      const availableKills = this.countAvailableKills(gameState, action.attackerId, attacker);
      // Only skip heart if we can kill something very valuable
      if (availableKills > 0 && enemyHeart > 10) {
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
    const { buffTiles, bossEventWarning } = gameState;
    const unit = action.unit;
    if (!unit) return 0; // Safety check

    // === BOSS EVENT AVOIDANCE ===
    // Don't move from spawn into danger!
    if (bossEventWarning && bossEventWarning.tiles) {
      const isInDanger = bossEventWarning.tiles.some(t => t.r === action.toRow && t.c === action.toCol);
      if (isInDanger) {
        score -= 200; // Don't move into danger
      }
    }

    // Prefer the forward home row (row 1 for gold, row 5 for silver)
    const forwardHomeRow = this.role === 'gold' ? 1 : 5;
    if (action.toRow === forwardHomeRow) score += 5;

    if (isHard) {
      // Move onto buff tiles
      const buffKey = `${action.toRow}-${action.toCol}`;
      if (buffTiles && buffTiles[buffKey]) {
        score += 15;
      }

      // Position based on unit type
      if (unit.atk >= 3) {
        if (action.toRow === forwardHomeRow) score += 3; // Forward
      }

      // Spread out
      const unitsInCol = this.countUnitsInColumn(gameState, action.toCol, this.role);
      if (unitsInCol >= 1) score -= 3;
    }

    return score;
  }

  // ==================== HELPER FUNCTIONS ====================

  getValidDeployTiles(gameState, card) {
    const tiles = [];
    const { board, rowHP, units } = gameState;
    
    // Home rows: gold = 0,1; silver = 5,6
    const homeRows = this.role === 'gold' ? [0, 1] : [5, 6];
    const enemyHomeRows = this.role === 'gold' ? [5, 6] : [0, 1];
    
    // Can always deploy to own home rows (wall HP doesn't matter for your own rows)
    for (const r of homeRows) {
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
            if (adjId && units[adjId] && units[adjId].owner === this.role) {
              // Can't deploy in enemy home rows if walls are up
              if (enemyHomeRows.includes(r) && rowHP[r] > 0) continue;
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
    const canDoubleMove = unit.effectId === 'double_move';
    const canStampede = unit.effectId === 'stampede';
    
    // Enemy home rows that have wall restrictions
    const enemyHomeRows = this.role === 'gold' ? [5, 6] : [0, 1];
    const isEnemyHomeRow = (r) => enemyHomeRows.includes(r);

    // Cardinal directions only (no diagonal movement)
    const directions = [
      { dr: -1, dc: 0 }, // up
      { dr: 1, dc: 0 },  // down
      { dr: 0, dc: -1 }, // left
      { dr: 0, dc: 1 }   // right
    ];

    if (canStampede) {
      // Stampede: Move up to 2 tiles in a STRAIGHT LINE only (cardinal)
      // Must have clear path for 2-tile moves
      for (const dir of directions) {
        // Check 1 tile away
        const nr1 = pos.r + dir.dr;
        const nc1 = pos.c + dir.dc;
        if (nr1 >= 0 && nr1 < 7 && nc1 >= 0 && nc1 < 6) {
          if (!board[nr1][nc1] && !(isEnemyHomeRow(nr1) && rowHP[nr1] > 0)) {
            tiles.push({ row: nr1, col: nc1 });
            
            // Check 2 tiles away (only if 1 tile was clear)
            const nr2 = pos.r + (dir.dr * 2);
            const nc2 = pos.c + (dir.dc * 2);
            if (nr2 >= 0 && nr2 < 7 && nc2 >= 0 && nc2 < 6) {
              if (!board[nr2][nc2] && !(isEnemyHomeRow(nr2) && rowHP[nr2] > 0)) {
                tiles.push({ row: nr2, col: nc2 });
              }
            }
          }
        }
      }
    } else if (canDoubleMove) {
      // Double move: Can move 2 tiles total, including L-shapes
      for (let dist = 1; dist <= 2; dist++) {
        for (const dir of directions) {
          const nr = pos.r + (dir.dr * dist);
          const nc = pos.c + (dir.dc * dist);
          if (nr < 0 || nr >= 7 || nc < 0 || nc >= 6) continue;
          if (board[nr][nc]) continue;
          // Can't move into enemy's home rows if they have HP
          if (isEnemyHomeRow(nr) && rowHP[nr] > 0) continue;
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
          if (isEnemyHomeRow(nr) && rowHP[nr] > 0) continue;
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
        if (isEnemyHomeRow(nr) && rowHP[nr] > 0) continue;
        tiles.push({ row: nr, col: nc });
      }
    }

    return tiles;
  }

  getValidAttackTargets(gameState, unitId, pos, unit) {
    const targets = [];
    const { board, units } = gameState;

    const isRanged = this.isRangedUnit(unit);
    const isDiagonal = unit.effectId === 'diagonal_attack';
    const canConsumeGem = unit.effectId === 'consume_gem';

    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 6; c++) {
        const targetId = board[r][c];
        if (!targetId) continue;
        const target = units[targetId];
        if (!target) continue;
        
        // Normal attacks can't target own units, unless Opal Devourer eating Gem Shards
        if (target.owner === this.role) {
          // Opal Devourer can attack friendly Gem Shards
          if (canConsumeGem && target.key === 'gemshard') {
            const rowDist = Math.abs(pos.r - r);
            const colDist = Math.abs(pos.c - c);
            const canAttack = (rowDist === 1 && colDist === 0) || (rowDist === 0 && colDist === 1);
            if (canAttack) {
              targets.push({ id: targetId, unit: target, pos: { r, c }, isGemConsume: true });
            }
          }
          continue;
        }
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
    const isRanged = this.isRangedUnit(unit);
    const maxRange = isRanged ? 2 : 1;

    // Target enemy walls: gold AI targets rows 5,6; silver AI targets rows 0,1
    const targetRows = this.role === 'gold' ? [5, 6] : [0, 1];
    
    for (const r of targetRows) {
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
    const isRanged = this.isRangedUnit(unit);
    const maxRange = isRanged ? 1 : 0;

    // Can only attack if walls are down
    // Gold heart requires rows 0,1 down; Silver heart requires rows 5,6 down
    if (targetHeart === 'gold' && (rowHP[0] > 0 || rowHP[1] > 0)) return false;
    if (targetHeart === 'silver' && (rowHP[5] > 0 || rowHP[6] > 0)) return false;

    return distance <= maxRange;
  }

  getSpawnAttackTargets(gameState, unit) {
    const targets = [];
    const { board, units } = gameState;
    
    // Spawn can attack units in the adjacent enemy row
    // Gold spawn attacks row 0, Silver spawn attacks row 6
    const targetRow = this.role === 'gold' ? 0 : 6;
    
    for (let c = 0; c < 6; c++) {
      const targetId = board[targetRow][c];
      if (!targetId) continue;
      const target = units[targetId];
      if (!target || target.owner === this.role) continue;
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
        if (uid && units[uid] && units[uid].owner === this.getOpponent()) count++;
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
        if (uid && units[uid] && units[uid].owner === this.role) count++;
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
    const isRanged = this.isRangedUnit(unit);
    const range = isRanged ? 2 : 1;

    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 6; c++) {
        const uid = board[r][c];
        if (!uid || !units[uid] || units[uid].owner === this.role) continue;
        
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
        if (!uid || !units[uid] || units[uid].owner === this.role) continue;
        
        const enemy = units[uid];
        const rowDist = Math.abs(row - r);
        const colDist = Math.abs(col - c);
        const isRanged = this.isRangedUnit(enemy);
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
  
  // Count nearby non-structure allies (for Temple of the Moon)
  countNearbyNonStructureAlliesAt(gameState, row, col, owner) {
    let count = 0;
    const { board, units } = gameState;
    
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr, nc = col + dc;
        if (nr < 0 || nr >= 7 || nc < 0 || nc >= 6) continue;
        const uid = board[nr][nc];
        if (uid && units[uid] && units[uid].owner === owner && units[uid].type !== 'structure') {
          count++;
        }
      }
    }
    
    return count;
  }
  
  // Count nearby strong allies (ATK >= 3)
  countNearbyStrongAlliesAt(gameState, row, col, owner) {
    let count = 0;
    const { board, units } = gameState;
    
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr, nc = col + dc;
        if (nr < 0 || nr >= 7 || nc < 0 || nc >= 6) continue;
        const uid = board[nr][nc];
        if (uid && units[uid] && units[uid].owner === owner && units[uid].atk >= 3) {
          count++;
        }
      }
    }
    
    return count;
  }
  
  // Find all friendly structures on the board (for movement toward them)
  findFriendlyStructures(gameState, owner) {
    const structures = [];
    const { board, units } = gameState;
    
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 6; c++) {
        const uid = board[r][c];
        if (uid && units[uid] && units[uid].owner === owner && units[uid].type === 'structure') {
          structures.push({
            id: uid,
            row: r,
            col: c,
            effectId: units[uid].effectId,
            name: units[uid].name
          });
        }
      }
    }
    
    return structures;
  }
  
  countNearbyEnemiesAt(gameState, row, col, owner) {
    let count = 0;
    const { board, units } = gameState;
    const enemyOwner = owner === 'silver' ? 'gold' : 'silver';
    
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr, nc = col + dc;
        if (nr < 0 || nr >= 7 || nc < 0 || nc >= 6) continue;
        const uid = board[nr][nc];
        if (uid && units[uid] && units[uid].owner === enemyOwner) count++;
      }
    }
    
    return count;
  }
  
  countNearbyHighValueAllies(gameState, row, col, owner) {
    let count = 0;
    const { board, units } = gameState;
    
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr, nc = col + dc;
        if (nr < 0 || nr >= 7 || nc < 0 || nc >= 6) continue;
        const uid = board[nr][nc];
        if (uid && units[uid] && units[uid].owner === owner) {
          const u = units[uid];
          // High value = has effect, high ATK, or high stats overall
          if (u.effectId || u.atk >= 4 || (u.atk + u.hp) >= 7) count++;
        }
      }
    }
    
    return count;
  }
  
  countNearbyDamagedAllies(gameState, row, col) {
    let count = 0;
    const { board, units } = gameState;
    
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr, nc = col + dc;
        if (nr < 0 || nr >= 7 || nc < 0 || nc >= 6) continue;
        const uid = board[nr][nc];
        if (uid && units[uid] && units[uid].owner === this.role) {
          const u = units[uid];
          if (u.hp < (u.maxHp || u.hp + 1)) count++; // Damaged if below max HP
        }
      }
    }
    
    return count;
  }
  
  countAlliesBehind(gameState, row, col) {
    let count = 0;
    const { board, units } = gameState;
    
    // "Behind" depends on role - for silver it's higher rows, for gold it's lower rows
    const behindRows = this.role === 'silver' 
      ? [row + 1, row + 2].filter(r => r < 7)
      : [row - 1, row - 2].filter(r => r >= 0);
    
    for (const r of behindRows) {
      for (let c = 0; c < 6; c++) {
        const uid = board[r][c];
        if (uid && units[uid] && units[uid].owner === this.role) {
          count++;
        }
      }
    }
    
    return count;
  }
  
  countNearbyGemsAt(gameState, row, col) {
    if (row === undefined || col === undefined) return 0;
    let count = 0;
    const { board, units } = gameState;
    
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr, nc = col + dc;
        if (nr < 0 || nr >= 7 || nc < 0 || nc >= 6) continue;
        const uid = board[nr][nc];
        if (uid && units[uid] && units[uid].key === 'gemshard') {
          count++;
        }
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
  
  /**
   * Count enemies in AOE (target tile + adjacent tiles)
   * Used for Lunar Barrage and similar spells
   */
  countEnemiesInAOE(gameState, row, col) {
    let count = 0;
    const { board, units } = gameState;
    
    // Check target tile and all adjacent tiles
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = row + dr, nc = col + dc;
        if (nr < 0 || nr >= 7 || nc < 0 || nc >= 6) continue;
        const uid = board[nr][nc];
        if (uid && units[uid] && units[uid].owner === this.getOpponent()) {
          count++;
        }
      }
    }
    
    return count;
  }
  
  /**
   * Get info about buff tiles for AI decision making
   */
  getBuffTileInfo(gameState) {
    const { board, units, buffTiles } = gameState;
    if (!buffTiles) return { unclaimed: [], enemyOwned: [], allyOwned: [] };
    
    const unclaimed = [];
    const enemyOwned = [];
    const allyOwned = [];
    
    for (const key in buffTiles) {
      const buff = buffTiles[key];
      const uid = board[buff.row][buff.col];
      
      if (!uid) {
        unclaimed.push({ ...buff, key });
      } else if (units[uid]) {
        if (units[uid].owner === this.role) {
          allyOwned.push({ ...buff, key, unit: units[uid] });
        } else {
          enemyOwned.push({ ...buff, key, unit: units[uid] });
        }
      }
    }
    
    return { unclaimed, enemyOwned, allyOwned };
  }
  
  /**
   * Evaluate overall board state to determine strategic mode
   */
  evaluateBoardState(gameState) {
    const { units, board, rowHP, heartHP } = gameState;
    const myRole = this.role;
    const enemyRole = this.getOpponent();
    
    let myUnits = 0;
    let myTotalStats = 0;
    let enemyUnits = 0;
    let enemyTotalStats = 0;
    let myUnitsNearEnemyHeart = 0;
    let myDamageToHeart = 0;
    
    // Count units and stats
    Object.values(units).forEach(u => {
      if (u.owner === myRole) {
        myUnits++;
        myTotalStats += u.atk + u.hp;
        
        // Check if unit can attack enemy heart
        const pos = this.findUnitPos(board, u.id);
        if (pos) {
          const enemyHeartRow = enemyRole === 'gold' ? 0 : 6;
          const enemyWallRows = enemyRole === 'gold' ? [0, 1] : [5, 6];
          const wallsDown = rowHP[enemyWallRows[0]] <= 0 && rowHP[enemyWallRows[1]] <= 0;
          
          if (wallsDown) {
            // Check if adjacent to heart row
            if (Math.abs(pos.r - enemyHeartRow) <= 1) {
              myUnitsNearEnemyHeart++;
              myDamageToHeart += u.atk;
            }
          }
        }
      } else if (u.owner === enemyRole) {
        enemyUnits++;
        enemyTotalStats += u.atk + u.hp;
      }
    });
    
    const myHeart = heartHP[myRole];
    const enemyHeart = heartHP[enemyRole];
    
    return {
      myUnits,
      enemyUnits,
      unitAdvantage: myUnits - enemyUnits,
      statsAdvantage: myTotalStats - enemyTotalStats,
      myHeartLow: myHeart <= 10,
      enemyHeartLow: enemyHeart <= 10,
      canKillHeart: myDamageToHeart >= enemyHeart,
      myUnitsNearEnemyHeart,
      myDamageToHeart,
      enemyHeart,
      myHeart
    };
  }
}

module.exports = GameAI;