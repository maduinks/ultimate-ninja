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
      const stolen = target.hand.splice(Math.floor(Math.random() * target.hand.length), 1)[0];
      attacker.hand.push(stolen);
      GS.addLog(`${attacker.name} stole ${stolen.name} from ${target.name}!`, 'combo');
      UI.showCardEffect(card);
      SFX.vanish();
      setTimeout(() => { UI.render(); setTimeout(() => TM.endTurn(), 500); }, 400);
      return;
    }

    attacker.removeCard(card.uid);
    GS.deck.putDiscard(card);
    GS.selectedCard = null;
    if (GS.comboLeft > 0) GS.comboLeft--;
    else GS.actionDone = true;

    GS.pendingAttack = { attacker, target, card, comboLeft: GS.comboLeft };
    GS.addLog(`${attacker.name} attacks ${target.name} with ${card.name}!`, 'attack');
    TM.stopTimer();

    UI.showCardEffect(card);
    SFX[card.type === CT.ULTIMATE_ATTACK ? 'ultimateAttack' : 'attack']();

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
    const { attacker, target, card: atkCard, comboLeft } = GS.pendingAttack;
    GS.pendingAttack = null;

    let blocked = false;

    if (defCard) {
      target.removeCard(defCard.uid);
      GS.deck.putDiscard(defCard);

      const ultAtk = atkCard.type === CT.ULTIMATE_ATTACK;
      const ultDef = defCard.type === CT.ULTIMATE_DEFENSE;

      if (ultAtk && !ultDef) {
        blocked = false;
        GS.addLog(`${target.name}'s Defense failed vs Ultimate Attack!`, 'fail');
      } else {
        blocked = true;
        GS.addLog(`${target.name} blocked with ${ultDef ? 'Ultimate ' : ''}Defense!`, 'block');
      }
    }

    if (!blocked) {
      target.takeDamage();
      const isUlt = atkCard.type === CT.ULTIMATE_ATTACK;
      GS.addLog(
        `${attacker.name} hit ${target.name}! ${target.lives} ❤️ left.`,
        isUlt ? 'ultimate' : 'damage'
      );
      UI.animateDamage(target, isUlt);
      SFX.damage();
    } else {
      UI.animateBlock(target, defCard.type === CT.ULTIMATE_DEFENSE);
      SFX.block();
    }

    if (target.isEliminated) {
      GS.addLog(`☠ ${target.name} has been eliminated!`, 'eliminate');
      GS.deck.putDiscard(target.hand);
      target.hand = [];
      SFX.eliminate();
    }

    if (GS.winner) {
      SFX.victory();
      setTimeout(() => { GS.phase = PHASE.GAME_OVER; UI.render(); }, 1500);
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
    GS.phase = PHASE.DRAW_PHASE;
    UI.render();

    setTimeout(() => {
      const drawn = p.drawToFill(GS.deck, 5);
      GS.addLog(
        `${p.name}'s turn — drew ${drawn.length} card${drawn.length !== 1 ? 's' : ''}.`,
        'turn'
      );
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
    }, 700);
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

    let next = (GS.turn + 1) % GS.players.length;
    for (let i = 0; i < GS.players.length; i++) {
      if (!GS.players[next].isEliminated) break;
      next = (next + 1) % GS.players.length;
    }
    if (next <= GS.turn) GS.round++;
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
