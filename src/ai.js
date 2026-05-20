const AI = {

  takeTurn() {
    const p = GS.current;
    if (!p.isAI || !p.alive) return;

    const foes = GS.alive.filter(o => o !== p);
    if (foes.length === 0) { TM.endTurn(); return; }

    const hasUltAtk = p.hasType(CT.ULTIMATE_ATTACK);
    const hasCombo  = p.hasType(CT.COMBO);
    const hasAtk    = p.hasType(CT.ATTACK);
    const hasVanish = p.hasType(CT.VANISH);
    const hasHeal   = p.hasType(CT.HEAL);
    const hasSteal  = p.hasType(CT.STEAL);

    // Heal when at 1 life (top priority)
    if (hasHeal && p.lives === 1 && !GS.actionDone) {
      Combat.playCard(p.cardsByType(CT.HEAL)[0]);
      return;
    }

    // Vanish when low health and multiple enemies
    if (hasVanish && p.lives === 1 && foes.length > 1 && Math.random() > 0.25) {
      const vc = p.cardsByType(CT.VANISH)[0];
      Combat.playCard(vc);
    }

    const target = this._pickTarget(foes);
    if (!target) { TM.endTurn(); return; }

    // Choose main action
    let delay = GS.vanishPlayed ? 900 : 600;

    setTimeout(() => {
      if (GS.actionDone) { TM.endTurn(); return; }

      // Combo > Ultimate > Attack
      if (hasCombo && (hasAtk || hasUltAtk) && Math.random() > 0.35) {
        const cc = p.cardsByType(CT.COMBO)[0];
        Combat.playCard(cc);
        setTimeout(() => this._doAttack(p, foes, target), 1000);
      } else if (hasUltAtk) {
        this._queueAttack(p.cardsByType(CT.ULTIMATE_ATTACK)[0], target);
      } else if (hasAtk) {
        this._queueAttack(p.cardsByType(CT.ATTACK)[0], target);
      } else if (hasSteal && Math.random() > 0.3) {
        const stealFoes = foes.filter(f => f.hand.length > 0);
        if (stealFoes.length > 0) {
          const stealTarget = stealFoes.sort((a, b) => b.hand.length - a.hand.length)[0];
          this._queueSteal(p.cardsByType(CT.STEAL)[0], stealTarget);
        } else {
          TM.endTurn();
        }
      } else {
        TM.endTurn();
      }
    }, delay);
  },

  doComboSecond(attacker) {
    const foes = GS.alive.filter(o => o !== attacker);
    const target = this._pickTarget(foes) || foes[0];
    if (!target) { TM.endTurn(); return; }
    this._doAttack(attacker, foes, target);
  },

  _doAttack(p, foes, preferredTarget) {
    if (GS.comboLeft <= 0 && GS.phase !== PHASE.COMBO_SELECT) return;
    const hasUlt = p.hasType(CT.ULTIMATE_ATTACK);
    const hasAtk = p.hasType(CT.ATTACK);
    if (!hasUlt && !hasAtk) { TM.endTurn(); return; }

    // Use ultimate on low-health targets when possible
    let card;
    const lowHP = foes.find(f => f.lives === 1 && !f.isVanished);
    if (hasUlt && lowHP && Math.random() > 0.4) {
      card = p.cardsByType(CT.ULTIMATE_ATTACK)[0];
      this._queueAttack(card, lowHP);
    } else if (hasAtk) {
      card = p.cardsByType(CT.ATTACK)[0];
      this._queueAttack(card, preferredTarget);
    } else {
      card = p.cardsByType(CT.ULTIMATE_ATTACK)[0];
      this._queueAttack(card, preferredTarget);
    }
  },

  _queueAttack(card, target) {
    GS.selectedCard = card;
    GS.phase = PHASE.TARGETING;
    UI.render();
    setTimeout(() => Combat.targetSelected(target), 700);
  },

  _queueSteal(card, target) {
    GS.selectedCard = card;
    GS.phase = PHASE.TARGETING;
    UI.render();
    setTimeout(() => Combat.targetSelected(target), 700);
  },

  _pickTarget(foes) {
    if (!foes.length) return null;
    const nonVanished = foes.filter(f => !f.isVanished);
    const pool = nonVanished.length ? nonVanished : foes;
    return pool.reduce((best, f) => f.lives < best.lives ? f : best, pool[0]);
  },

  chooseDefense(defender, attackCard) {
    const isUlt = attackCard.type === CT.ULTIMATE_ATTACK;

    if (isUlt) {
      if (defender.hasType(CT.ULTIMATE_DEFENSE)) {
        // Always block ultimate if 1 life, usually otherwise
        return defender.lives <= 1 || Math.random() > 0.25
          ? defender.cardsByType(CT.ULTIMATE_DEFENSE)[0]
          : null;
      }
      return null; // regular defense useless vs ultimate
    }

    // Regular attack
    if (defender.hasType(CT.DEFENSE)) {
      // Save ultimate defense; use regular if available
      return Math.random() > 0.3 ? defender.cardsByType(CT.DEFENSE)[0] : null;
    }
    if (defender.hasType(CT.ULTIMATE_DEFENSE)) {
      // Spend ultimate defense on regular attack only when critical
      return defender.lives === 1 && Math.random() > 0.4
        ? defender.cardsByType(CT.ULTIMATE_DEFENSE)[0]
        : null;
    }
    return null;
  }
};
