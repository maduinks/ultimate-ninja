const Combat = {

  _tryAutoTarget() {
    const attacker = GS.current;
    const card = GS.selectedCard;
    let targets;
    if (card.type === CT.STEAL) {
      targets = GS.players.filter(t => !t.isEliminated && t !== attacker && t.hand.length > 0);
    } else {
      targets = GS.players.filter(t =>
        !t.isEliminated && t !== attacker &&
        (!t.isVanished || card.type === CT.ULTIMATE_ATTACK)
      );
    }
    if (targets.length !== 1) return false;
    if (Network.mode === 'guest') {
      Network.sendAction('SELECT_TARGET', { id: targets[0].id });
    } else {
      this.targetSelected(targets[0]);
    }
    return true;
  },

  playCard(card) {
    const p = GS.current;

    if (card.type === CT.HEAL) {
      if (GS.actionDone) { UI.flash('Already took an action this turn!', 'warn'); return; }
      if (p.lives >= 3) { UI.flash('Already at full health!', 'warn'); return; }
      p.removeCard(card.uid);
      GS.deck.putDiscard(card);
      p.lives = Math.min(3, p.lives + 1);
      GS.actionDone = true;
      GS.addLog(`${p.name} used Heal — restored to ${p.lives} ❤️!`, 'block');
      UI.showCardEffect(card);
      SFX.block();
      setTimeout(() => UI.render(), 400);
      return;
    }

    if (card.type === CT.STEAL) {
      if (GS.actionDone) { UI.flash('Already took an action this turn!', 'warn'); return; }
      const hasTargets = GS.players.some(t => !t.isEliminated && t !== p && t.hand.length > 0);
      if (!hasTargets) { UI.flash('No opponents have cards to steal!', 'warn'); return; }
      GS.selectedCard = card;
      GS.phase = PHASE.TARGETING;
      if (!this._tryAutoTarget()) UI.render();
      return;
    }

    if (card.type === CT.VANISH) {
      if (GS.vanishPlayed) { UI.flash('Already vanished this turn!', 'warn'); return; }
      if (GS.actionDone) { UI.flash('Vanish must be played at start of turn!', 'warn'); return; }
      p.removeCard(card.uid);
      GS.deck.putDiscard(card);
      p.isVanished = true;
      GS.vanishPlayed = true;
      GS.addLog(`${p.name} used Vanish — untargetable this round!`, 'vanish');
      UI.showCardEffect(card);
      SFX.vanish();
      setTimeout(() => UI.render(), 400);
      return;
    }

    if (card.type === CT.COMBO) {
      if (GS.actionDone) { UI.flash('Already took an action this turn!', 'warn'); return; }
      p.removeCard(card.uid);
      GS.deck.putDiscard(card);
      GS.comboLeft = 2;
      GS.comboHitsLanded = 0;
      GS.actionDone = true;
      GS.addLog(`${p.name} plays Combo — attack twice!`, 'combo');
      UI.showCardEffect(card);
      SFX.combo();
      UI.showCombo();
      setTimeout(() => {
        GS.phase = PHASE.COMBO_SELECT;
        UI.flash('Select your first attack card!', 'info');
        UI.render();
      }, 500);
      return;
    }

    if (card.type === CT.ATTACK || card.type === CT.ULTIMATE_ATTACK) {
      if (GS.phase === PHASE.COMBO_SELECT) {
        GS.selectedCard = card;
        GS.phase = PHASE.TARGETING;
        if (!this._tryAutoTarget()) UI.render();
        return;
      }
      if (GS.actionDone) { UI.flash('Already took an action this turn!', 'warn'); return; }
      GS.selectedCard = card;
      GS.phase = PHASE.TARGETING;
      if (!this._tryAutoTarget()) UI.render();
      return;
    }

    if (card.type === CT.DEFENSE || card.type === CT.ULTIMATE_DEFENSE) {
      UI.flash('Defense cards are played reactively when attacked.', 'info');
    }
  },

  cancelTarget() {
    GS.selectedCard = null;
    GS.phase = GS.comboLeft > 0 ? PHASE.COMBO_SELECT : PHASE.ACTION;
    UI.render();
  },

  stealSelected(idx) {
    if (!GS.pendingSteal) return;
    const { attacker, target } = GS.pendingSteal;
    GS.pendingSteal = null;
    const i = Math.max(0, Math.min(idx, target.hand.length - 1));
    const stolen = target.hand.splice(i, 1)[0];
    attacker.hand.push(stolen);
    GS.addLog(`${attacker.name} stole ${stolen.name} from ${target.name}!`, 'combo');
    UI.showStolenCard(stolen, target);
    setTimeout(() => { GS.phase = PHASE.ACTION; UI.render(); setTimeout(() => TM.endTurn(), 500); }, 300);
  },

  targetSelected(target) {
    const attacker = GS.current;
    const card = GS.selectedCard;
    if (!card || !target || target.isEliminated) return;

    if (target === attacker) { UI.flash("Can't target yourself!", 'warn'); return; }
    if (target.isVanished && card.type !== CT.ULTIMATE_ATTACK) {
      const back = GS.comboLeft > 0 ? PHASE.COMBO_SELECT : PHASE.ACTION;
      GS.selectedCard = null;
      GS.phase = back;
      if (attacker.isAI) {
        setTimeout(() => TM.endTurn(), 300);
      } else {
        UI.flash(`${target.name} has Vanished!`, 'warn');
        UI.render();
      }
      return;
    }

    if (card.type === CT.STEAL) {
      if (target.hand.length === 0) { UI.flash(`${target.name} has no cards!`, 'warn'); return; }
      attacker.removeCard(card.uid);
      GS.deck.putDiscard(card);
      GS.selectedCard = null;
      GS.actionDone = true;
      UI.showCardEffect(card);
      SFX.vanish();
      // Local human player picks which card to steal
      if (!Network.mode && !attacker.isAI) {
        GS.pendingSteal = { attacker, target };
        GS.phase = PHASE.STEAL_SELECT;
        setTimeout(() => UI.render(), 350);
        return;
      }
      // AI or online: random steal
      const stolen = target.hand.splice(Math.floor(Math.random() * target.hand.length), 1)[0];
      attacker.hand.push(stolen);
      GS.addLog(`${attacker.name} stole ${stolen.name} from ${target.name}!`, 'combo');
      UI.showStolenCard(stolen, target);
      setTimeout(() => { UI.render(); setTimeout(() => TM.endTurn(), 500); }, 400);
      return;
    }

    // Alliance check
    const allianceKey = [attacker.id, target.id].sort((a,b)=>a-b).join('-');
    if (GS.alliances.has(allianceKey)) {
      UI.flash(`Alliance! ${attacker.name} can't attack ${target.name} this round.`, 'warn');
      GS.selectedCard = null;
      GS.phase = GS.comboLeft > 0 ? PHASE.COMBO_SELECT : PHASE.ACTION;
      UI.render();
      return;
    }

    attacker.removeCard(card.uid);
    GS.deck.putDiscard(card);
    GS.selectedCard = null;
    const wasCombo = GS.comboLeft > 0;
    if (GS.comboLeft > 0) GS.comboLeft--;
    else GS.actionDone = true;

    GS.pendingAttack = { attacker, target, card, comboLeft: GS.comboLeft, wasCombo };
    GS.addLog(`${attacker.name} attacks ${target.name} with ${card.name}!`, 'attack');
    TM.stopTimer();

    UI.showCardEffect(card);
    SFX[card.type === CT.ULTIMATE_ATTACK ? 'ultimateAttack' : 'attack']();
    if (card.type === CT.ULTIMATE_ATTACK) UI.showUltimateAttackAura();

    setTimeout(() => {
      if (target.isAI) {
        const def = AI.chooseDefense(target, card);
        setTimeout(() => this.resolveAttack(def), 900);
      } else {
        // Skip pass screen in online mode — each player is on their own device
        const skipPass = typeof Network !== 'undefined' && Network.mode;
        if (!skipPass && target.canDefend(card.type)) {
          GS.phase = PHASE.DEFENSE_PASS;
        } else {
          GS.phase = PHASE.DEFENSE_PROMPT;
        }
        UI.render();
      }
    }, 600);
  },

  defenderRespond(defCard) {
    TM.stopTimer();
    this.resolveAttack(defCard);
  },

  resolveAttack(defCard) {
    const { attacker, target, card: atkCard, comboLeft, wasCombo } = GS.pendingAttack;
    GS.pendingAttack = null;

    let blocked = false;

    if (defCard) {
      target.removeCard(defCard.uid);
      GS.deck.putDiscard(defCard);

      if (defCard.type === CT.VANISH) {
        // Reactive vanish — dodges regular attacks, fails vs Ultimate
        if (atkCard.type === CT.ULTIMATE_ATTACK) {
          blocked = false;
          GS.addLog(`${target.name}'s Vanish failed vs Ultimate Attack!`, 'fail');
        } else {
          blocked = true;
          target.isVanished = true;
          GS.addLog(`${target.name} VANISHED — attack dodged!`, 'vanish');
          UI.showCardEffect(defCard);
          SFX.vanish();
        }
      } else {
        const ultAtk = atkCard.type === CT.ULTIMATE_ATTACK;
        const ultDef = defCard.type === CT.ULTIMATE_DEFENSE;
        if (ultAtk && !ultDef) {
          blocked = false;
          GS.addLog(`${target.name}'s Defense failed vs Ultimate Attack!`, 'fail');
        } else {
          blocked = true;
          GS.addLog(`${target.name} blocked with ${ultDef ? 'Ultimate ' : ''}Defense!`, 'block');
          if (ultDef) UI.showUltimateDefenseAura();
        }
      }
    }

    if (!blocked) {
      const preBounty = getBountyTarget();
      target.takeDamage();
      const isUlt = atkCard.type === CT.ULTIMATE_ATTACK;
      GS.addLog(`${attacker.name} hit ${target.name}! ${target.lives} ❤️ left.`, isUlt ? 'ultimate' : 'damage');
      UI.animateDamage(target, isUlt);
      SFX.damage();
      GS.hitThisTurn = true;
      if (wasCombo || comboLeft > 0) {
        GS.comboHitsLanded++;
        UI.showComboHit(comboLeft > 0 ? 1 : 2);
      }
      if (target.isEliminated) {
        GS.kills[attacker.id] = (GS.kills[attacker.id] || 0) + 1;
        if (preBounty && preBounty === target) {
          const bonus = GS.deck.drawN(2);
          bonus.forEach(c => { c._newlyDrawn = true; });
          attacker.addCards(bonus);
          GS.addLog(`💰 ${attacker.name} claimed the BOUNTY! +2 cards!`, 'combo');
          UI.flash(`💰 Bounty claimed! +2 cards`, 'info');
        }
      }
    } else {
      GS.momentumHits[attacker.id] = 0;
      GS.extraDrawNext.delete(attacker.id);
      if (defCard?.type !== CT.VANISH) {
        UI.animateBlock(target, defCard.type === CT.ULTIMATE_DEFENSE);
        SFX.block();
      }
    }

    if (target.isEliminated) {
      GS.addLog(`☠ ${target.name} has been eliminated!`, 'eliminate');
      GS.deck.putDiscard(target.hand);
      target.hand = [];
      SFX.eliminate();
      UI.showElimination(target);
    }

    if (GS.winner) {
      SFX.victory();
      UI.showVictoryConfetti();
      setTimeout(() => { GS.phase = PHASE.GAME_OVER; UI.render(); }, 1900);
      return;
    }

    if (comboLeft > 0) {
      const atk = attacker;
      const hasMore = atk.hasType(CT.ATTACK) || atk.hasType(CT.ULTIMATE_ATTACK);
      if (hasMore) {
        setTimeout(() => {
          GS.phase = PHASE.COMBO_SELECT;
          UI.flash('Select your second attack!', 'info');
          UI.render();
          if (attacker.isAI) setTimeout(() => AI.doComboSecond(attacker), 900);
        }, 800);
        return;
      }
      GS.comboLeft = 0;
      GS.addLog(`${attacker.name} has no more attacks for combo.`, '');
    }

    // Full combo bonus: both hits landed unblocked
    if (wasCombo && GS.comboHitsLanded >= 2 && !GS.winner) {
      const bonus = GS.deck.drawN(1);
      bonus.forEach(c => { c._newlyDrawn = true; });
      attacker.addCards(bonus);
      GS.addLog(`⚡ ${attacker.name} FULL COMBO — drew a bonus card!`, 'combo');
      UI.flash('⚡ Full Combo! +1 card!', 'info');
    }

    setTimeout(() => TM.endTurn(), 700);
  }
};

const TM = {
  _timer: null,

  startTurn() {
    const p = GS.current;
    p.isVanished = false;
    GS.vanishPlayed = false;
    GS.actionDone = false;
    GS.comboLeft = 0;
    GS.selectedCard = null;
    GS.handRevealed = false;
    GS.allianceMode = false;
    GS.allianceOfferCard = null;
    GS.hitThisTurn = false;
    GS.comboHitsLanded = 0;
    GS.pendingSteal = null;
    GS.toDiscard.clear();
    GS.phase = PHASE.DRAW_PHASE;
    UI.render();

    setTimeout(() => {
      const drawn = p.drawToFill(GS.deck, 5);
      GS.addLog(`${p.name}'s turn — drew ${drawn.length} card${drawn.length !== 1 ? 's' : ''}.`, 'turn');

      // Bonus draw from momentum streak
      if (GS.extraDrawNext.has(p.id)) {
        GS.extraDrawNext.delete(p.id);
        const bonus = GS.deck.drawN(1);
        bonus.forEach(c => { c._newlyDrawn = true; });
        p.addCards(bonus);
        GS.addLog(`🔥 ${p.name} draws a bonus card from momentum!`, 'combo');
      }

      // Hand limit — enter discard phase if over 7
      if (p.hand.length > 7) {
        GS.phase = PHASE.DISCARD;
        UI.render();
        if (p.isAI) setTimeout(() => AI.doDiscard(), 600);
        return;
      }

      this._beginAction(p);
    }, 700);
  },

  _beginAction(p) {
    GS.phase = PHASE.ACTION;
    if (p.isAI) {
      UI.render();
      setTimeout(() => AI.takeTurn(), 1100);
    } else {
      const isMyDevice = !Network.mode || Network.myPid === GS.turn;
      if (isMyDevice) UI.showYourTurn();
      this.startTimer();
      UI.render();
    }
  },

  finishDiscard() {
    const p = GS.current;
    GS.toDiscard.forEach(uid => {
      const c = p.removeCard(uid);
      if (c) GS.deck.putDiscard(c);
    });
    GS.toDiscard.clear();
    this._beginAction(p);
  },

  startTimer() {
    this.stopTimer();
    GS.timerSecs = 30;
    this._timer = setInterval(() => {
      GS.timerSecs--;
      UI.updateTimer(GS.timerSecs);
      if (GS.timerSecs <= 0) {
        this.stopTimer();
        GS.addLog(`${GS.current.name} timed out!`, '');
        this.endTurn();
      }
    }, 1000);
  },

  stopTimer() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },

  endTurn() {
    this.stopTimer();
    GS.comboLeft = 0;
    GS.selectedCard = null;

    // Update momentum streak
    if (GS.hitThisTurn) {
      GS.momentumHits[GS.turn] = (GS.momentumHits[GS.turn] || 0) + 1;
      if (GS.momentumHits[GS.turn] === 2) {
        GS.extraDrawNext.add(GS.turn);
        GS.addLog(`🔥 ${GS.current.name} is on a MOMENTUM streak! +1 card next turn!`, 'combo');
      }
    } else {
      GS.momentumHits[GS.turn] = 0;
    }

    let next = (GS.turn + 1) % GS.players.length;
    for (let i = 0; i < GS.players.length; i++) {
      if (!GS.players[next].isEliminated) break;
      next = (next + 1) % GS.players.length;
    }
    if (next <= GS.turn) { GS.round++; GS.alliances.clear(); setTimeout(() => UI.showRoundBanner(GS.round), 150); }
    GS.turn = next;

    const nextP = GS.current;
    const skipPass = typeof Network !== 'undefined' && Network.mode;
    if (!nextP.isAI && !skipPass) {
      GS.phase = PHASE.PASS_SCREEN;
      UI.render();
    } else {
      GS.phase = PHASE.DRAW_PHASE;   // clear any stale phase before render
      UI.render();
      setTimeout(() => this.startTurn(), 500);
    }
  },

  continueAfterPass() {
    this.startTurn();
  }
};
