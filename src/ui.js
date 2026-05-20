const UI = {
  _cardCache: new Map(),

  clearCardCache() { this._cardCache.clear(); },

  render() {
    switch (GS.phase) {
      case PHASE.SETUP:          this._showOnly('setup-screen'); break;
      case PHASE.PASS_SCREEN:    this._renderPassScreen(false); break;
      case PHASE.DEFENSE_PASS:   this._renderPassScreen(true); break;
      case PHASE.DRAW_PHASE:
      case PHASE.ACTION:
      case PHASE.TARGETING:
      case PHASE.COMBO_SELECT:   this._renderGame(); break;
      case PHASE.DEFENSE_PROMPT: this._renderDefensePrompt(); break;
      case PHASE.GAME_OVER:      this._renderGameOver(); break;
    }
  },

  _showOnly(id) {
    ['setup-screen','online-screen','lobby-screen','pass-screen','game-screen','gameover-screen']
      .forEach(s => {
        const el = document.getElementById(s);
        if (el) el.style.display = (s === id) ? 'flex' : 'none';
      });
    const dm = document.getElementById('defense-modal');
    if (dm) dm.style.display = 'none';
  },

  _renderPassScreen(isDefensePass) {
    this._showOnly('pass-screen');
    if (isDefensePass) {
      const { target, card, attacker } = GS.pendingAttack;
      document.getElementById('pass-title').textContent = `Pass to ${target.name}`;
      document.getElementById('pass-sub').textContent =
        `⚠️ ${attacker.name} is attacking you with ${card.name}!`;
      document.getElementById('pass-detail').textContent =
        `${target.lives} ❤️  ·  ${target.hand.length} cards in hand`;
      document.getElementById('pass-ready-btn').textContent = 'RESPOND TO ATTACK';
    } else {
      const p = GS.current;
      document.getElementById('pass-title').textContent = `Pass to ${p.name}`;
      document.getElementById('pass-sub').textContent = `Round ${GS.round} — Your turn!`;
      document.getElementById('pass-detail').textContent =
        `${p.lives} ❤️  ·  ${p.hand.length} cards in hand`;
      document.getElementById('pass-ready-btn').textContent = 'READY';
    }
  },

  _renderGame() {
    this._showOnly('game-screen');

    const p     = GS.current;
    const phase = GS.phase;

    // In online mode always show this device's player at the bottom
    const myPlayer = Network.mode ? (GS.players[Network.myPid] || p) : p;
    const isMyTurn = Network.mode ? Network.myPid === GS.turn : !p.isAI;

    // Turn indicator
    const turnTag = Network.mode && p === myPlayer ? ' ← YOUR TURN' : (p.isAI ? ' 🤖' : '');
    document.getElementById('turn-indicator').textContent = `Round ${GS.round}  ·  ${p.name}${turnTag}`;

    // Phase label
    const labels = {
      [PHASE.DRAW_PHASE]:   'Drawing cards...',
      [PHASE.ACTION]:       isMyTurn ? 'Play a card or End Turn' : `${p.name}'s turn…`,
      [PHASE.TARGETING]:    isMyTurn ? `Choose a target for ${GS.selectedCard?.name || ''}` : `${p.name} is targeting…`,
      [PHASE.COMBO_SELECT]: isMyTurn ? `Combo! Select attack ${GS.comboLeft < 2 ? '2' : '1'} of 2` : `${p.name} combo…`
    };
    document.getElementById('phase-label').textContent = labels[phase] || '';

    // Timer — show only on this device's turn
    const showTimer = isMyTurn && !p.isAI && [PHASE.ACTION, PHASE.TARGETING, PHASE.COMBO_SELECT].includes(phase);
    const timerEl = document.getElementById('timer-display');
    timerEl.style.display = showTimer ? 'flex' : 'none';
    timerEl.textContent = GS.timerSecs;
    timerEl.className = 'timer-display' + (GS.timerSecs <= 10 ? ' urgent' : '');

    // Opponents
    this._renderOpponents(myPlayer);

    // My player info + hand
    document.getElementById('curr-name').textContent = myPlayer.name + (Network.mode ? ' (you)' : myPlayer.isAI ? ' 🤖' : '');
    document.getElementById('curr-lives').innerHTML = this._livesHTML(myPlayer.lives);
    this._renderHand(myPlayer, phase);

    // Deck count
    const deckEl = document.getElementById('deck-count');
    if (deckEl && GS.deck) deckEl.textContent = GS.deck.draw.length;

    // Buttons
    const inAction = [PHASE.ACTION, PHASE.COMBO_SELECT].includes(phase);
    document.getElementById('end-turn-btn').style.display = (isMyTurn && inAction) ? 'inline-flex' : 'none';
    document.getElementById('cancel-btn').style.display   = (isMyTurn && phase === PHASE.TARGETING) ? 'inline-flex' : 'none';

    // Glow the player zone from the start of your turn through all active phases
    const isActive = [PHASE.DRAW_PHASE, PHASE.ACTION, PHASE.COMBO_SELECT, PHASE.TARGETING].includes(phase);
    const cpz = document.getElementById('curr-player-zone');
    if (cpz) {
      cpz.classList.toggle('my-turn', isMyTurn && isActive);
      cpz.classList.toggle('danger', !myPlayer.isEliminated && myPlayer.lives === 1);
    }

    // Combat log
    this._renderLog();
  },

  _renderOpponents(myPlayer) {
    const zone = document.getElementById('opponents-zone');
    zone.innerHTML = '';
    const me = myPlayer || (Network.mode ? GS.players[Network.myPid] : GS.current);
    const isMyTurn = Network.mode ? Network.myPid === GS.turn : GS.current === me;

    GS.players.filter(p => p !== me).forEach(p => {
      const targeting = GS.phase === PHASE.TARGETING && isMyTurn;
      const sel = GS.selectedCard;
      let canTarget = false;
      if (targeting && sel && !p.isEliminated) {
        if (sel.type === CT.STEAL) {
          canTarget = p.hand.length > 0;
        } else if (p.isVanished && sel.type === CT.ULTIMATE_ATTACK) {
          canTarget = true;
        } else if (!p.isVanished) {
          canTarget = true;
        }
      }

      const el = document.createElement('div');
      el.className = [
        'opponent-zone',
        p === GS.current   ? 'current-turn' : '',
        p.isEliminated     ? 'eliminated'   : '',
        p.isVanished       ? 'vanished'     : '',
        (!p.isEliminated && p.lives === 1) ? 'danger' : '',
        canTarget          ? 'targetable'   : ''
      ].filter(Boolean).join(' ');
      el.dataset.pid = p.id;

      el.innerHTML = `
        <div class="opp-name">${p.name}${p.isAI ? ' 🤖' : ''}${p.isVanished ? ' 👻' : ''}</div>
        <div class="opp-lives">${this._livesHTML(p.lives)}</div>
        <div class="opp-cards">${p.hand.length} 🃏</div>
      `;

      if (canTarget) {
        el.addEventListener('click', () => {
          if (Network.mode === 'guest') Network.sendAction('SELECT_TARGET', { id: p.id });
          else Combat.targetSelected(p);
        });
      }
      zone.appendChild(el);
    });
  },

  _renderHand(p, phase) {
    const area = document.getElementById('hand-area');
    area.innerHTML = '';

    // Anti-peek: hide cards until the player taps "Show Hand" in local pass-and-play
    if (!Network.mode && !GS.handRevealed && !p.isAI) {
      const btn = document.createElement('button');
      btn.className = 'reveal-hand-btn';
      btn.textContent = '👁  Show Your Hand';
      btn.onclick = () => { GS.handRevealed = true; UI.render(); };
      area.appendChild(btn);
      return;
    }

    const isMyTurn = Network.mode ? Network.myPid === GS.turn : !p.isAI;
    const selectableTypes = new Set();

    if (isMyTurn && phase === PHASE.ACTION) {
      selectableTypes.add(CT.ATTACK);
      selectableTypes.add(CT.ULTIMATE_ATTACK);
      selectableTypes.add(CT.COMBO);
      if (!GS.vanishPlayed && !GS.actionDone) selectableTypes.add(CT.VANISH);
      if (!GS.actionDone) selectableTypes.add(CT.HEAL);
      if (!GS.actionDone) selectableTypes.add(CT.STEAL);
    }
    if (isMyTurn && phase === PHASE.COMBO_SELECT) {
      selectableTypes.add(CT.ATTACK);
      selectableTypes.add(CT.ULTIMATE_ATTACK);
    }

    p.hand.forEach(card => {
      const el = this._makeCard(card);
      const playable = isMyTurn && selectableTypes.has(card.type);
      if (playable) {
        el.classList.add('playable');
        el.onclick = () => {
          if (Network.mode === 'guest') Network.sendAction('PLAY_CARD', { uid: card.uid });
          else Combat.playCard(card);
        };
      }
      if (GS.selectedCard?.uid === card.uid) el.classList.add('selected');
      area.appendChild(el);
    });
  },

  _makeCard(card) {
    let el = this._cardCache.get(card.uid);
    if (!el) {
      el = document.createElement('div');
      el.dataset.uid = card.uid;
      el.style.setProperty('--cc', card.color);
      el.style.setProperty('--cg', card.glow);
      const face = card.icon
      ? `<div class="card-icon-face">${card.icon}</div>`
      : `<img src="${encodeURI(card.img)}" alt="${card.name}">`;
    el.innerHTML = `
        <div class="card-img-wrap">${face}</div>
        <div class="card-footer">
          <span class="card-name">${card.name}</span>
        </div>`;
      this._cardCache.set(card.uid, el);
    }
    el.className = `card rarity-${card.rarity}`;
    el.onclick = null;
    return el;
  },

  _renderDefensePrompt() {
    if (!GS.pendingAttack) return;   // called mid-animation after resolve — skip safely
    this._showOnly('game-screen');
    this._renderLog();

    const { target, card: atkCard, attacker } = GS.pendingAttack;

    // In online mode only show the interactive modal to the target's device
    const isMyDefense = !Network.mode || Network.myPid === GS.players.indexOf(target);
    this._renderOpponents(Network.mode ? GS.players[Network.myPid] : target);

    if (!isMyDefense) {
      document.getElementById('defense-modal').style.display = 'none';
      document.getElementById('phase-label').textContent =
        `Waiting for ${target.name} to defend…`;
      return;
    }

    document.getElementById('defense-modal').style.display = 'flex';

    const isUlt = atkCard.type === CT.ULTIMATE_ATTACK;
    document.getElementById('def-title').textContent    = `${attacker.name} attacks ${target.name}!`;
    document.getElementById('def-card-name').textContent = atkCard.name;
    document.getElementById('def-card-img').src          = encodeURI(atkCard.img);
    document.getElementById('def-card-img').style.borderColor = atkCard.color;
    document.getElementById('def-warning').textContent  = isUlt
      ? '⚡ ULTIMATE ATTACK — only Ultimate Defense can block!'
      : 'You can play Defense or take 1 damage.';

    const container = document.getElementById('def-cards');
    container.innerHTML = '';
    const defCards = target.hand.filter(c =>
      c.type === CT.DEFENSE || c.type === CT.ULTIMATE_DEFENSE
    );

    defCards.forEach(c => {
      const el = this._makeCard(c);
      el.classList.add('playable', 'defense-choice');
      if (isUlt && c.type === CT.DEFENSE) {
        el.classList.add('ineffective');
        el.title = 'Regular Defense cannot block Ultimate Attack!';
      }
      el.onclick = () => {
        if (Network.mode === 'guest') Network.sendAction('DEFEND', { uid: c.uid });
        else Combat.defenderRespond(c);
      };
      container.appendChild(el);
    });

    // Only update the text — click is handled by the static listener in index.html
    document.getElementById('take-dmg-btn').textContent =
      defCards.length === 0 ? '💥 Take Damage (no defense cards)' : '💥 Take Damage';
  },

  _renderGameOver() {
    this._showOnly('gameover-screen');
    const w = GS.winner;

    let streaks = {};
    try { streaks = JSON.parse(localStorage.getItem('ninja_streaks') || '{}'); } catch(e) {}
    if (w) {
      streaks[w.name] = (streaks[w.name] || 0) + 1;
      localStorage.setItem('ninja_streaks', JSON.stringify(streaks));
    }

    document.getElementById('winner-name').textContent = w ? w.name : 'Nobody';
    const streak = w ? (streaks[w.name] || 1) : 0;
    const streakEl = document.getElementById('win-streak');
    if (streakEl) {
      streakEl.textContent = streak > 1 ? `🔥 ${streak} win streak!` : '';
      streakEl.style.display = streak > 1 ? 'block' : 'none';
    }

    const list = document.getElementById('final-standings');
    list.innerHTML = GS.players
      .sort((a, b) => b.lives - a.lives)
      .map(p => {
        const s = streaks[p.name] || 0;
        return `<div class="standing">${p.isEliminated ? '☠' : '❤️'} ${p.name}${s > 1 ? ` <span class="streak-badge">${s}🔥</span>` : ''}</div>`;
      })
      .join('');
  },

  _renderLog() {
    const logEl = document.getElementById('log-entries');
    if (!logEl) return;
    logEl.innerHTML = GS.log.slice(0, 14).map(e =>
      `<div class="log-entry log-${e.type || 'normal'}">${e.msg}</div>`
    ).join('');
  },

  _livesHTML(lives) {
    return '❤️'.repeat(Math.max(0, lives)) + '🖤'.repeat(Math.max(0, 3 - lives));
  },

  updateTimer(secs) {
    const el = document.getElementById('timer-display');
    if (el) {
      el.textContent = secs;
      el.className = 'timer-display' + (secs <= 10 ? ' urgent' : '');
    }
  },

  flash(msg, type = 'info') {
    const el = document.getElementById('flash-msg');
    if (!el) return;
    el.textContent = msg;
    el.className = `flash-msg flash-${type} show`;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2800);
  },

  showCardEffect(card) {
    const fx = document.getElementById('play-fx');
    if (!fx) return;
    fx.style.setProperty('--fx-color', card.glow);
    fx.classList.remove('burst');
    void fx.offsetWidth;
    fx.classList.add('burst');
    setTimeout(() => fx.classList.remove('burst'), 600);
  },

  animateDamage(target, isUltimate = false) {
    const myP = Network.mode ? GS.players[Network.myPid] : GS.current;
    const zone = (target === myP)
      ? document.getElementById('curr-player-zone')
      : document.querySelector(`.opponent-zone[data-pid="${target.id}"]`);

    if (zone) {
      zone.classList.add(isUltimate ? 'shake-hard' : 'shake');
      setTimeout(() => zone.classList.remove('shake', 'shake-hard'), 500);
    }

    if (isUltimate) {
      const gs = document.getElementById('game-screen');
      if (gs) {
        gs.classList.add('screen-flash');
        setTimeout(() => gs.classList.remove('screen-flash'), 350);
      }
    }

    // Flash screen on all hits (subtle for normal, intense for ultimate)
    const gs = document.getElementById('game-screen');
    if (gs) {
      gs.classList.add(isUltimate ? 'screen-flash' : 'screen-flash-light');
      setTimeout(() => gs.classList.remove('screen-flash', 'screen-flash-light'), 350);
    }

    this._spawnPopup(isUltimate ? '💥 -1' : '💢 -1', isUltimate ? 'ultimate-pop' : 'dmg-pop');
    setTimeout(() => UI.render(), 520);
  },

  animateBlock(target, isUltimateDef = false) {
    const myP = Network.mode ? GS.players[Network.myPid] : GS.current;
    const zone = (target === myP)
      ? document.getElementById('curr-player-zone')
      : document.querySelector(`.opponent-zone[data-pid="${target.id}"]`);

    if (zone) {
      zone.classList.add('block-anim');
      setTimeout(() => zone.classList.remove('block-anim'), 500);
    }
    this._spawnPopup(isUltimateDef ? '🛡 BLOCKED!' : '🛡', 'block-pop');
    setTimeout(() => UI.render(), 520);
  },

  _spawnPopup(text, cls) {
    const el = document.createElement('div');
    el.className = `popup ${cls}`;
    el.textContent = text;
    const gs = document.getElementById('game-screen') || document.body;
    gs.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  },

  showYourTurn() {
    SFX.yourTurn();
    const el = document.createElement('div');
    el.className = 'your-turn-overlay';
    el.textContent = '⚔️ YOUR TURN ⚔️';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  },

  showCombo() {
    const el = document.createElement('div');
    el.className = 'your-turn-overlay combo-overlay';
    el.textContent = '⚡ COMBO ⚡';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }
};
