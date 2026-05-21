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
      case PHASE.DISCARD:        this._renderDiscard(); break;
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

    // Turn order strip
    this._renderTurnOrder();

    // Opponents
    this._renderOpponents(myPlayer);

    // My player info + hand
    document.getElementById('curr-name').textContent = (myPlayer.avatar || '🥷') + ' ' + myPlayer.name + (Network.mode ? ' (you)' : myPlayer.isAI ? ' 🤖' : '');
    document.getElementById('curr-lives').innerHTML = this._livesHTML(myPlayer.lives);
    this._renderHand(myPlayer, phase);

    // Deck count
    const deckEl = document.getElementById('deck-count');
    if (deckEl && GS.deck) deckEl.textContent = GS.deck.draw.length;

    // Buttons
    const inAction = [PHASE.ACTION, PHASE.COMBO_SELECT].includes(phase);
    document.getElementById('end-turn-btn').style.display = (isMyTurn && inAction) ? 'inline-flex' : 'none';
    document.getElementById('cancel-btn').style.display   = (isMyTurn && phase === PHASE.TARGETING) ? 'inline-flex' : 'none';

    // Alliance button
    const ab = document.getElementById('alliance-btn');
    if (ab) {
      const canAlliance = isMyTurn && phase === PHASE.ACTION && !GS.alliancesUsed.has(myPlayer.id) && !GS.actionDone && GS.alive.filter(p=>p!==myPlayer).length > 0;
      ab.style.display = (canAlliance || GS.allianceMode) ? 'inline-flex' : 'none';
      ab.textContent = GS.allianceMode ? '✖ CANCEL' : '🤝 ALLIANCE';
    }

    // Momentum badge on curr-player-zone
    const cpz = document.getElementById('curr-player-zone');
    const streak = GS.momentumHits[myPlayer.id] || 0;
    let badge = cpz?.querySelector('.momentum-badge');
    if (streak >= 1) {
      if (!badge) { badge = document.createElement('div'); badge.className = 'momentum-badge'; cpz.appendChild(badge); }
      badge.textContent = `🔥 ${streak} hit streak`;
    } else if (badge) badge.remove();

    // Glow the player zone from the start of your turn through all active phases
    const isActive = [PHASE.DRAW_PHASE, PHASE.ACTION, PHASE.COMBO_SELECT, PHASE.TARGETING].includes(phase);
    if (cpz) {
      cpz.classList.toggle('my-turn', isMyTurn && isActive);
      cpz.classList.toggle('danger', !myPlayer.isEliminated && myPlayer.lives === 1);
    }

    // Low-health screen vignette
    const gs = document.getElementById('game-screen');
    if (gs) gs.classList.toggle('danger-vignette', !myPlayer.isEliminated && myPlayer.lives === 1);

    // Combat log
    this._renderLog();
  },

  _renderTurnOrder() {
    const el = document.getElementById('turn-order-strip');
    if (!el) return;
    const alive = GS.players.filter(p => !p.isEliminated);
    if (alive.length < 2) { el.innerHTML = ''; return; }
    const si = alive.indexOf(GS.current);
    const ordered = [...alive.slice(si), ...alive.slice(0, si)];
    el.innerHTML = ordered.map((p, i) => `
      <div class="to-item${i === 0 ? ' to-now' : i === 1 ? ' to-next' : ''}">
        <span class="to-av">${p.avatar || '🥷'}</span>
        ${i === 0 ? '<span class="to-lbl">NOW</span>' : i === 1 ? '<span class="to-lbl">NEXT</span>' : ''}
      </div>${i < ordered.length - 1 ? '<span class="to-arrow">›</span>' : ''}
    `).join('');
  },

  _renderDiscard() {
    this._showOnly('game-screen');
    const p = GS.current;
    const excess = p.hand.length - 7;
    const needed = excess - GS.toDiscard.size;
    document.getElementById('turn-indicator').textContent = `${p.avatar || '🥷'} ${p.name}`;
    document.getElementById('phase-label').textContent = needed > 0
      ? `Hand limit — discard ${needed} more card${needed !== 1 ? 's' : ''}`
      : '✅ Ready — confirm discard';
    document.getElementById('timer-display').style.display = 'none';
    document.getElementById('deck-count').textContent = GS.deck?.draw.length || 0;
    this._renderTurnOrder();
    this._renderOpponents(p);
    document.getElementById('curr-name').textContent = `${p.avatar || '🥷'} ${p.name}`;
    document.getElementById('curr-lives').innerHTML = this._livesHTML(p.lives);
    const area = document.getElementById('hand-area');
    area.innerHTML = '';
    p.hand.forEach(card => {
      const el = this._makeCard(card);
      el.classList.add('playable');
      if (GS.toDiscard.has(card.uid)) el.classList.add('discard-marked');
      el.onclick = () => {
        if (GS.toDiscard.has(card.uid)) GS.toDiscard.delete(card.uid);
        else if (GS.toDiscard.size < excess) GS.toDiscard.add(card.uid);
        UI.render();
      };
      area.appendChild(el);
    });
    const endBtn = document.getElementById('end-turn-btn');
    endBtn.style.display = GS.toDiscard.size >= excess ? 'inline-flex' : 'none';
    endBtn.textContent = `DISCARD ${GS.toDiscard.size}`;
    document.getElementById('cancel-btn').style.display = 'none';
    this._renderLog();
  },

  _renderOpponents(myPlayer) {
    const zone = document.getElementById('opponents-zone');
    zone.innerHTML = '';
    const me = myPlayer || (Network.mode ? GS.players[Network.myPid] : GS.current);
    const isMyTurn = Network.mode ? Network.myPid === GS.turn : GS.current === me;

    const bountyTarget = getBountyTarget();

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
      const isAllianceTarget = GS.allianceMode && !p.isEliminated && p !== GS.current;

      const el = document.createElement('div');
      const allianceKey = [me.id, p.id].sort((a,b)=>a-b).join('-');
      const isAllied = GS.alliances.has(allianceKey);
      el.className = [
        'opponent-zone',
        p === GS.current   ? 'current-turn' : '',
        p.isEliminated     ? 'eliminated'   : '',
        p.isVanished       ? 'vanished'     : '',
        (!p.isEliminated && p.lives === 1) ? 'danger' : '',
        canTarget          ? 'targetable'   : '',
        isAllianceTarget   ? 'alliance-target' : '',
        isAllied           ? 'allied'       : ''
      ].filter(Boolean).join(' ');
      el.dataset.pid = p.id;

      const isTheirTurn = p === GS.current;
      const isBounty = bountyTarget === p;
      const cardBacks = Array.from({ length: p.hand.length }, (_, i) =>
        `<div class="card-back${isTheirTurn ? ' cb-active' : ''}" style="--cb-i:${i}"></div>`
      ).join('');
      const thinkingDots = isTheirTurn && p.isAI
        ? '<div class="ai-thinking"><span></span><span></span><span></span></div>' : '';
      const playingLabel = isTheirTurn && !p.isAI
        ? '<div class="opp-playing">Playing…</div>' : '';
      const bountyBadge = isBounty ? '<div class="bounty-badge">🎯 BOUNTY</div>' : '';
      const allianceBadge = isAllied ? '<div class="alliance-badge">🤝</div>' : '';
      const pStreak = GS.momentumHits[p.id] || 0;
      const momentumBadge = pStreak >= 1 ? `<div class="opp-momentum">🔥${pStreak}</div>` : '';

      el.innerHTML = `
        ${bountyBadge}
        <div class="opp-top">
          <span class="opp-avatar">${p.avatar || '🥷'}</span>
          <span class="opp-name">${p.name}${p.isAI ? ' 🤖' : ''}${p.isVanished ? ' 👻' : ''}</span>
          ${allianceBadge}${momentumBadge}
        </div>
        <div class="opp-lives">${this._livesHTML(p.lives)}</div>
        <div class="opp-hand">${cardBacks}</div>
        ${thinkingDots}${playingLabel}
      `;

      if (canTarget) {
        el.addEventListener('click', () => {
          if (Network.mode === 'guest') Network.sendAction('SELECT_TARGET', { id: p.id });
          else Combat.targetSelected(p);
        });
      }
      if (isAllianceTarget) {
        el.addEventListener('click', () => {
          const key = [GS.current.id, p.id].sort((a,b)=>a-b).join('-');
          GS.alliances.add(key);
          GS.alliancesUsed.add(GS.current.id);
          GS.allianceMode = false;
          GS.actionDone = true;
          GS.addLog(`🤝 ${GS.current.name} & ${p.name} formed an alliance this round!`, 'block');
          UI.flash(`Alliance formed with ${p.name}!`, 'info');
          UI.render();
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

    const n = p.hand.length;
    p.hand.forEach((card, idx) => {
      const el = this._makeCard(card);

      // Fan layout vars
      const mid  = (n - 1) / 2;
      const norm = idx - mid;
      const spread = Math.min(6, 22 / Math.max(1, n - 1));
      const dip    = Math.abs(norm) * Math.min(5, 14 / Math.max(1, n - 1));
      el.classList.add('in-hand');
      el.style.setProperty('--fan-angle', `${norm * spread}deg`);
      el.style.setProperty('--fan-dip',   `${dip}px`);

      const playable = isMyTurn && selectableTypes.has(card.type);
      if (playable) {
        el.classList.add('playable');
        el.onclick = () => {
          if (Network.mode === 'guest') Network.sendAction('PLAY_CARD', { uid: card.uid });
          else Combat.playCard(card);
        };
      }
      if (GS.selectedCard?.uid === card.uid) el.classList.add('selected');
      if (card._newlyDrawn) {
        el.classList.add('deal-in');
        el.style.setProperty('--deal-delay', `${idx * 80}ms`);
        setTimeout(() => { el.classList.remove('deal-in'); delete card._newlyDrawn; }, 700 + idx * 80);
      }
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
      const tipText = card.desc ? card.desc.replace(/\n/g,'<br>') : '';
      el.innerHTML = `
        <div class="card-img-wrap">${face}</div>
        <div class="card-footer"><span class="card-name">${card.name}</span></div>
        <div class="card-tooltip"><strong>${card.name}</strong><span class="tip-type">${card.type.replace(/_/g,' ')}</span>${tipText ? '<p>' + tipText + '</p>' : ''}</div>`;
      el.addEventListener('mouseenter', () => {
        if (el.classList.contains('playable')) SFX.cardHover();
      });
      el.addEventListener('mousemove', e => {
        if (!el.classList.contains('playable')) return;
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        el.style.setProperty('--tilt-x', `${-y * 20}deg`);
        el.style.setProperty('--tilt-y', `${x * 20}deg`);
        el.classList.add('tilted');
      });
      el.addEventListener('mouseleave', () => {
        el.classList.remove('tilted');
      });
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

  showUltimateAttackAura() {
    const gs = document.getElementById('game-screen');
    if (!gs) return;
    // 3 expanding shockwave rings
    for (let i = 0; i < 3; i++) {
      const ring = document.createElement('div');
      ring.className = 'ult-atk-ring';
      ring.style.setProperty('--ring-delay', `${i * 110}ms`);
      gs.appendChild(ring);
      setTimeout(() => ring.remove(), 950 + i * 110);
    }
    // Center energy burst
    const burst = document.createElement('div');
    burst.className = 'ult-atk-burst';
    gs.appendChild(burst);
    setTimeout(() => burst.remove(), 750);
    // Screen flash
    gs.classList.add('ult-atk-flash');
    setTimeout(() => gs.classList.remove('ult-atk-flash'), 500);
  },

  showUltimateDefenseAura() {
    const gs = document.getElementById('game-screen');
    if (!gs) return;
    // 3 rings contracting inward (shield forming)
    for (let i = 0; i < 3; i++) {
      const ring = document.createElement('div');
      ring.className = 'ult-def-ring';
      ring.style.setProperty('--ring-delay', `${i * 100}ms`);
      ring.style.setProperty('--ring-start-scale', `${5 - i * 1.2}`);
      gs.appendChild(ring);
      setTimeout(() => ring.remove(), 1100 + i * 100);
    }
    // Shield core dome
    const core = document.createElement('div');
    core.className = 'ult-def-core';
    gs.appendChild(core);
    setTimeout(() => core.remove(), 1000);
    // Screen flash
    gs.classList.add('ult-def-flash');
    setTimeout(() => gs.classList.remove('ult-def-flash'), 600);
  },

  showStolenCard(stolen, fromPlayer) {
    const el = document.createElement('div');
    el.className = 'stolen-overlay';
    const face = stolen.icon
      ? `<div class="card-icon-face" style="font-size:2.5rem;height:70px">${stolen.icon}</div>`
      : `<img src="${encodeURI(stolen.img)}" style="width:64px;border-radius:6px;object-fit:cover">`;
    el.innerHTML = `<div class="stolen-header">🫳 Stolen from ${fromPlayer.name}!</div><div class="stolen-preview" style="--cc:${stolen.color}">${face}</div><div class="stolen-name">${stolen.name}</div>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  },

  showElimination(player) {
    const el = document.createElement('div');
    el.className = 'elim-overlay';
    el.innerHTML = `<div class="elim-skull">☠</div><div class="elim-pname">${player.avatar || '🥷'} ${player.name}</div><div class="elim-label">ELIMINATED</div>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  },

  showComboHit(n) {
    const existing = document.querySelector('.combo-hit-overlay');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = 'combo-hit-overlay';
    el.textContent = `HIT ${n}!`;
    (document.getElementById('game-screen') || document.body).appendChild(el);
    setTimeout(() => el.remove(), 750);
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
  },

  showRoundBanner(n) {
    const el = document.createElement('div');
    el.className = 'round-banner';
    el.innerHTML = `<span class="round-banner-num">⚔️ ROUND ${n} ⚔️</span>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1900);
  },

  showVictoryConfetti() {
    const COLORS = ['#ff3366','#ffcc00','#9933ff','#00ffcc','#ff6600','#0099ff','#ffffff','#ff99cc'];
    for (let i = 0; i < 70; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-piece';
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const w = 6 + Math.random() * 7;
      const h = 8 + Math.random() * 9;
      p.style.cssText = `left:${Math.random()*100}%;top:${-5 - Math.random()*10}%;background:${color};width:${w}px;height:${h}px;--cf-dur:${1.2+Math.random()*1.3}s;--cf-delay:${Math.random()*0.7}s;--cf-rot:${Math.random()*360}deg;`;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 3200);
    }
  }
};
