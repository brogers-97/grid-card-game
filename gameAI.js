/**
 * AI Opponent System for Campaign Mode
 * 
 * AI Levels:
 * 1 - Easy: Random valid moves, no strategy
 * 2 - Medium: Prioritizes attacks, basic threat assessment
 * 3 - Hard: Considers card value, protects important units
 * 4 - Boss: Optimal plays, combo awareness
 */

class GameAI {
  constructor(level = 1) {
    this.level = level;
    this.role = 'silver'; // AI always plays as silver
  }

  /**
   * Main decision function - returns an action to take
   * @param {Object} gameState - Current game state
   * @param {Object} hand - AI's hand of cards
   * @param {number} energy - AI's current energy
   * @returns {Object} Action to take
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

    // AI level affects decision quality
    let selectedAction;
    
    if (this.level === 1) {
      // Easy: 50% chance of random action
      if (Math.random() < 0.5) {
        selectedAction = actions[Math.floor(Math.random() * actions.length)];
      } else {
        selectedAction = scoredActions[0].action;
      }
    } else if (this.level === 2) {
      // Medium: 80% best action, 20% random from top 3
      if (Math.random() < 0.8) {
        selectedAction = scoredActions[0].action;
      } else {
        const topActions = scoredActions.slice(0, Math.min(3, scoredActions.length));
        selectedAction = topActions[Math.floor(Math.random() * topActions.length)].action;
      }
    } else if (this.level === 3) {
      // Hard: 95% best action
      if (Math.random() < 0.95) {
        selectedAction = scoredActions[0].action;
      } else {
        selectedAction = scoredActions[Math.floor(Math.random() * Math.min(2, scoredActions.length))].action;
      }
    } else {
      // Boss: Always best action
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
        // Find valid deployment tiles
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
        if (!spawn.silver) {
          actions.push({
            type: 'playCard',
            cardId: card.id,
            card: card,
            spawn: 'silver',
            priority: 8
          });
        }

        // Instant spells
        if (card.effect === 'instant') {
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
            // Target friendly units
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
            // Target enemy units
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
        }
      }
    });

    // Move and attack with units
    Object.keys(units).forEach(uid => {
      const unit = units[uid];
      if (unit.owner !== 'silver') return;
      
      const pos = this.findUnitPos(board, uid);
      if (!pos) return;

      // Move actions
      if (!movedThisTurn.has(uid)) {
        const moveTiles = this.getValidMoveTiles(gameState, uid, pos);
        moveTiles.forEach(tile => {
          actions.push({
            type: 'move',
            unitId: uid,
            unit: unit,
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
      }
    });

    // Move from spawn
    if (spawn.silver) {
      const spawnUnit = units[spawn.silver];
      if (spawnUnit && !movedThisTurn.has(spawn.silver)) {
        // Can move to home rows (5, 6)
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
      }
    }

    return actions;
  }

  /**
   * Score an action based on how good it is
   */
  scoreAction(action, gameState, hand, energy) {
    let score = action.priority || 0;
    const { units, board, rowHP, heartHP } = gameState;

    switch (action.type) {
      case 'drawCard':
        score += 5;
        if (hand.length < 3) score += 10; // Prioritize draw when hand is low
        break;

      case 'playCard':
        const card = action.card;
        // Value based on stats
        score += (card.atk || 0) * 2 + (card.hp || 0) * 1.5;
        // Prefer playing higher cost cards when we have energy
        score += card.cost * 0.5;
        // Bonus for effects
        if (card.effectId) score += 5;
        // Position bonus - prefer front rows for attackers
        if (action.row !== undefined) {
          if (card.atk > 2) {
            // Offensive units prefer middle rows
            if (action.row >= 2 && action.row <= 4) score += 5;
          } else {
            // Defensive units prefer back rows
            if (action.row >= 5) score += 3;
          }
        }
        break;

      case 'move':
        // Prefer moving towards enemy
        const currentRow = this.findUnitPos(board, action.unitId)?.r || 6;
        if (action.toRow < currentRow) score += 5; // Moving forward
        // Bonus for positioning near enemies
        const nearbyEnemies = this.countNearbyEnemies(gameState, action.toRow, action.toCol);
        if (action.unit.atk > 2) {
          score += nearbyEnemies * 3; // Offensive units want to be near enemies
        }
        break;

      case 'attackUnit':
        const target = action.target;
        const attacker = action.attacker;
        // Always prioritize kills
        if (target.hp <= attacker.atk) {
          score += 50; // Guaranteed kill
          score += target.atk * 5; // Higher value targets
        } else {
          score += attacker.atk * 2; // Damage is still good
        }
        // Prioritize threats (high ATK enemies)
        score += target.atk * 3;
        break;

      case 'attackRow':
        // Value based on row HP and position
        score += 15;
        if (rowHP[action.row] < 10) score += 10; // Almost dead row
        if (action.row <= 1) score += 5; // Enemy home row
        break;

      case 'moveFromSpawn':
        score += 8;
        // Prefer front positions
        if (action.toRow === 5) score += 3;
        break;

      case 'endTurn':
        score = 0; // Last resort
        break;
    }

    // Add some randomness based on AI level
    const randomFactor = (5 - this.level) * 2;
    score += Math.random() * randomFactor;

    return score;
  }

  /**
   * Helper: Find valid deployment tiles
   */
  getValidDeployTiles(gameState, card) {
    const tiles = [];
    const { board, rowHP } = gameState;
    
    // Silver home rows are 5 and 6
    for (let r = 5; r <= 6; r++) {
      if (rowHP[r] <= 0) continue; // Row destroyed
      for (let c = 0; c < 6; c++) {
        if (!board[r][c]) {
          tiles.push({ row: r, col: c });
        }
      }
    }

    // Burrower Beast can deploy adjacent to allies
    if (card.effectId === 'burrow') {
      const { units } = gameState;
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 6; c++) {
          if (board[r][c]) continue;
          // Check cardinal adjacent for friendly unit
          const offsets = [[-1,0], [1,0], [0,-1], [0,1]];
          for (const [dr, dc] of offsets) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= 7 || nc < 0 || nc >= 6) continue;
            const adjId = board[nr][nc];
            if (adjId && units[adjId] && units[adjId].owner === 'silver') {
              // Don't deploy in enemy home rows with HP
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

  /**
   * Helper: Find valid move tiles
   */
  getValidMoveTiles(gameState, unitId, pos) {
    const tiles = [];
    const { board, rowHP, units } = gameState;
    const unit = units[unitId];

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = pos.r + dr, nc = pos.c + dc;
        if (nr < 0 || nr >= 7 || nc < 0 || nc >= 6) continue;
        if (board[nr][nc]) continue; // Occupied

        // Can't move into enemy home rows with HP
        if (nr <= 1 && rowHP[nr] > 0) continue;

        tiles.push({ row: nr, col: nc });
      }
    }

    return tiles;
  }

  /**
   * Helper: Find valid attack targets
   */
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
          // Cardinal adjacent
          canAttack = (rowDist === 1 && colDist === 0) || (rowDist === 0 && colDist === 1);
        }

        if (canAttack) {
          targets.push({ id: targetId, unit: target });
        }
      }
    }

    return targets;
  }

  /**
   * Helper: Find valid row attacks
   */
  getValidRowAttacks(gameState, unitId, pos, unit) {
    const rows = [];
    const { rowHP } = gameState;

    // Can attack adjacent enemy rows (gold rows 0, 1)
    for (let r = 0; r <= 1; r++) {
      if (rowHP[r] <= 0) continue;
      const rowDist = Math.abs(pos.r - r);
      const isSiege = unit.effectId === 'siege';
      
      // Must be adjacent (within 1 row)
      if (rowDist <= 1) {
        rows.push(r);
      }
    }

    return rows;
  }

  /**
   * Helper: Find unit position
   */
  findUnitPos(board, unitId) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 6; c++) {
        if (board[r][c] === unitId) return { r, c };
      }
    }
    return null;
  }

  /**
   * Helper: Count nearby enemies
   */
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
}

module.exports = GameAI;