'use strict';
/* Network layer — WebSocket comms for online multiplayer.
   Host: runs all game logic, broadcasts state to guests after each render.
   Guest: sends player actions, applies received state snapshots. */

const Network = {
  mode: null,     // null | 'host' | 'guest'
  ws: null,
  myPid: -1,      // this device's player index in GS.players
  roomCode: null,

  onRoomCreated: null,  // fn(roomCode, pid)
  onJoinOk: null,       // fn(pid, roomCode)
  onPlayerList: null,   // fn(players[])
  onGameStart: null,    // fn(configs)
  onError: null,        // fn(msg)
  onDisconnect: null,   // fn()

  /* ── connection ────────────────────────────────────── */
  connect(url, cb) {
    const wsUrl = url.replace(/^http/, 'ws').replace(/\/$/, '');
    try { this.ws = new WebSocket(wsUrl); } catch { cb('Invalid URL'); return; }
    this.ws.onopen    = () => cb(null);
    this.ws.onerror   = () => cb('Cannot connect to server');
    this.ws.onclose   = () => { if (this.onDisconnect) this.onDisconnect(); };
    this.ws.onmessage = e  => { try { this._handle(JSON.parse(e.data)); } catch {} };
  },

  /* ── room management ───────────────────────────────── */
  createRoom(name, playerCount) {
    this.mode = 'host';
    this._send({ type: 'CREATE_ROOM', name, playerCount });
  },
  joinRoom(roomCode, name) {
    this.mode = 'guest';
    this._send({ type: 'JOIN_ROOM', roomCode: roomCode.toUpperCase().trim(), name });
  },
  startGame(configs) {
    this._send({ type: 'START_GAME', configs });
  },

  /* ── host: sync state after every render ───────────── */
  broadcastState() {
    if (this.mode !== 'host' || !this.ws) return;
    this._send({ type: 'STATE', gs: this._serialize() });
  },

  /* ── guest: send action to host ────────────────────── */
  sendAction(action, data = {}) {
    if (this.mode !== 'guest') return;
    this._send({ type: 'ACTION', action, data });
  },

  /* ── internal ──────────────────────────────────────── */
  _send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify(obj));
  },

  _handle(msg) {
    switch (msg.type) {
      case 'ROOM_CREATED':
        this.myPid = msg.pid; this.roomCode = msg.roomCode;
        if (this.onRoomCreated) this.onRoomCreated(msg.roomCode, msg.pid);
        break;
      case 'JOIN_OK':
        this.myPid = msg.pid; this.roomCode = msg.roomCode;
        if (this.onJoinOk) this.onJoinOk(msg.pid, msg.roomCode);
        break;
      case 'PLAYER_LIST':
        if (this.onPlayerList) this.onPlayerList(msg.players);
        break;
      case 'START_GAME':
        if (this.onGameStart) this.onGameStart(msg.configs);
        break;
      case 'STATE':
        if (this.mode === 'guest') this._applyState(msg.gs);
        break;
      case 'TIMER':
        if (this.mode === 'guest') { GS.timerSecs = msg.secs; UI.updateTimer(msg.secs); }
        break;
      case 'ACTION':
        if (this.mode === 'host') this._execAction(msg.pid, msg.action, msg.data);
        break;
      case 'ERR':
        if (this.onError) this.onError(msg.msg);
        break;
      case 'HOST_LEFT':
      case 'PLAYER_LEFT':
        if (this.onDisconnect) this.onDisconnect();
        break;
    }
  },

  _execAction(pid, action, data) {
    const player = GS.players[pid];
    if (!player || player.isEliminated) return;
    if (action === 'PLAY_CARD') {
      const card = player.hand.find(c => c.uid === data.uid);
      if (card) Combat.playCard(card);
    } else if (action === 'SELECT_TARGET') {
      const target = GS.players.find(p => p.id === data.id);
      if (target) Combat.targetSelected(target);
    } else if (action === 'DEFEND') {
      const defCard = data.uid != null ? player.hand.find(c => c.uid === data.uid) : null;
      Combat.defenderRespond(defCard);
    } else if (action === 'END_TURN') {
      TM.endTurn();
    } else if (action === 'CANCEL') {
      Combat.cancelTarget();
    }
  },

  _applyState(d) {
    // Remember old lives to trigger shake animations
    const prevLives = {};
    if (GS.players) GS.players.forEach(p => { prevLives[p.id] = p.lives; });

    GS.phase        = d.phase;
    GS.round        = d.round;
    GS.turn         = d.turn;
    GS.timerSecs    = d.timerSecs;
    GS.log          = d.log;
    GS.comboLeft    = d.comboLeft;
    GS.vanishPlayed = d.vanishPlayed;
    GS.actionDone   = d.actionDone;

    GS.players = d.players.map(pd => {
      const p     = new Player(pd.id, pd.name, pd.isAI);
      p.lives        = pd.lives;
      p.isEliminated = pd.isEliminated;
      p.isVanished   = pd.isVanished;
      p.hand         = pd.hand.map(cd => new Card(cd.typeId, cd.uid));
      return p;
    });

    GS.deck = { draw: { length: d.deckDrawCount }, putDiscard() {}, drawN() { return []; } };

    GS.selectedCard = null;
    if (d.selectedCardUid) {
      outer: for (const p of GS.players)
        for (const c of p.hand)
          if (c.uid === d.selectedCardUid) { GS.selectedCard = c; break outer; }
    }

    GS.pendingAttack = null;
    if (d.pendingAttack) {
      const pa = d.pendingAttack;
      GS.pendingAttack = {
        attacker:  GS.players[pa.aIdx],
        target:    GS.players[pa.tIdx],
        card:      new Card(pa.card.typeId, pa.card.uid),
        comboLeft: pa.comboLeft
      };
    }

    // Shake zones where lives dropped
    GS.players.forEach(p => {
      if (prevLives[p.id] !== undefined && prevLives[p.id] > p.lives) {
        const myP = GS.players[Network.myPid];
        const zone = (p === myP)
          ? document.getElementById('curr-player-zone')
          : document.querySelector(`.opponent-zone[data-pid="${p.id}"]`);
        if (zone) { zone.classList.add('shake'); setTimeout(() => zone.classList.remove('shake'), 500); }
      }
    });

    UI._origRender();
  },

  _serialize() {
    const pa = GS.pendingAttack;
    return {
      phase: GS.phase, round: GS.round, turn: GS.turn, timerSecs: GS.timerSecs,
      log: GS.log.slice(0, 20), comboLeft: GS.comboLeft,
      vanishPlayed: GS.vanishPlayed, actionDone: GS.actionDone,
      deckDrawCount: GS.deck ? GS.deck.draw.length : 0,
      selectedCardUid: GS.selectedCard ? GS.selectedCard.uid : null,
      pendingAttack: pa ? {
        aIdx: GS.players.indexOf(pa.attacker),
        tIdx: GS.players.indexOf(pa.target),
        card: this._sc(pa.card),
        comboLeft: pa.comboLeft
      } : null,
      players: GS.players.map(p => ({
        id: p.id, name: p.name, isAI: p.isAI,
        lives: p.lives, isEliminated: p.isEliminated, isVanished: p.isVanished,
        hand: p.hand.map(c => this._sc(c))
      }))
    };
  },

  _sc(c) {
    return { uid: c.uid, typeId: c.id, name: c.name, type: c.type,
             color: c.color, glow: c.glow, img: c.img, rarity: c.rarity };
  }
};

/* ── Patch UI.render to auto-broadcast state after every host render ── */
{
  const origRender = UI.render.bind(UI);
  UI._origRender   = origRender;
  UI.render = function() {
    origRender();
    Network.broadcastState();
  };
}

/* ── Patch UI.updateTimer to sync countdown to guest devices ── */
{
  const origTimer = UI.updateTimer.bind(UI);
  UI.updateTimer = function(secs) {
    origTimer(secs);
    if (Network.mode === 'host' && Network.ws)
      Network._send({ type: 'TIMER', secs });
  };
}
