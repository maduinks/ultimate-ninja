// Card instance
class Card {
  constructor(typeId, uid) {
    Object.assign(this, CARDS[typeId]);
    this.uid = uid;
  }
}

// Shared draw/discard deck
class Deck {
  constructor(playerCount) {
    this.draw = [];
    this.discard = [];
    this._build(playerCount);
    this._shuffle(this.draw);
  }

  _build(playerCount) {
    let uid = 0;
    for (const [type, data] of Object.entries(CARDS)) {
      if (data.deluxeOnly && !GS.deluxe) continue;
      let count = data.count;
      if (type === CT.VANISH && playerCount === 2) count = 0;
      for (let i = 0; i < count; i++) this.draw.push(new Card(type, uid++));
    }
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  drawCard() {
    if (this.draw.length === 0) {
      if (this.discard.length === 0) return null;
      this.draw = [...this.discard];
      this.discard = [];
      this._shuffle(this.draw);
    }
    return this.draw.pop();
  }

  drawN(n) {
    const cards = [];
    for (let i = 0; i < n; i++) {
      const c = this.drawCard();
      if (c) cards.push(c);
    }
    return cards;
  }

  putDiscard(cards) {
    const arr = Array.isArray(cards) ? cards : [cards];
    this.discard.push(...arr);
  }
}

// Player
class Player {
  constructor(id, name, isAI, avatar) {
    this.id = id;
    this.name = name;
    this.isAI = isAI;
    this.avatar = avatar || '🥷';
    this.lives = 3;
    this.hand = [];
    this.isVanished = false;
    this.isEliminated = false;
  }

  get alive() { return !this.isEliminated; }

  takeDamage() {
    this.lives = Math.max(0, this.lives - 1);
    if (this.lives === 0) this.isEliminated = true;
    return this.isEliminated;
  }

  addCards(cards) {
    this.hand.push(...(Array.isArray(cards) ? cards : [cards]));
  }

  removeCard(uid) {
    const i = this.hand.findIndex(c => c.uid === uid);
    if (i === -1) return null;
    return this.hand.splice(i, 1)[0];
  }

  drawToFill(deck, max = 5) {
    const needed = Math.max(0, max - this.hand.length);
    if (needed === 0) return [];
    const drawn = deck.drawN(needed);
    drawn.forEach(c => { c._newlyDrawn = true; });
    this.addCards(drawn);
    return drawn;
  }

  hasType(type) { return this.hand.some(c => c.type === type); }
  cardsByType(type) { return this.hand.filter(c => c.type === type); }

  canDefend(attackType) {
    if (attackType === CT.ULTIMATE_ATTACK) return this.hasType(CT.ULTIMATE_DEFENSE);
    return this.hasType(CT.DEFENSE) || this.hasType(CT.ULTIMATE_DEFENSE);
  }
}

// Global game state
const GS = {
  phase: PHASE.SETUP,
  players: [],
  deck: null,
  turn: 0,
  round: 1,
  timerSecs: 30,
  log: [],
  selectedCard: null,
  pendingAttack: null,
  comboLeft: 0,
  vanishPlayed: false,
  actionDone: false,
  deluxe: false,
  handRevealed: false,
  kills: {},
  momentumHits: {},
  hitThisTurn: false,
  extraDrawNext: new Set(),
  toDiscard: new Set(),
  alliances: new Set(),
  alliancesUsed: new Set(),
  allianceMode: false,

  get current() { return this.players[this.turn]; },
  get alive() { return this.players.filter(p => p.alive); },
  get winner() {
    const a = this.alive;
    return a.length === 1 ? a[0] : null;
  },

  addLog(msg, type = '') {
    this.log.unshift({ msg, type });
    if (this.log.length > 25) this.log.pop();
  }
};

function getBountyTarget() {
  const entries = Object.entries(GS.kills).filter(([id]) => !GS.players[+id]?.isEliminated);
  if (!entries.length) return null;
  const max = Math.max(...entries.map(([,k]) => k));
  if (max === 0) return null;
  const pid = entries.find(([,k]) => k === max)?.[0];
  return pid !== undefined ? GS.players[+pid] : null;
}

let _lastConfigs = null;
let _lastDeluxe = false;

function initGame(configs, deluxe = false) {
  _lastConfigs = configs;
  _lastDeluxe = deluxe;
  GS.deluxe = deluxe;
  if (typeof UI !== 'undefined') UI.clearCardCache();
  GS.players = configs.map((cfg, i) => new Player(i, cfg.name, cfg.isAI, cfg.avatar));
  GS.deck = new Deck(configs.length);
  GS.turn = 0;
  GS.round = 1;
  GS.log = [];
  GS.selectedCard = null;
  GS.pendingAttack = null;
  GS.comboLeft = 0;
  GS.vanishPlayed = false;
  GS.actionDone = false;
  GS.handRevealed = false;
  GS.kills = {};
  GS.momentumHits = {};
  GS.hitThisTurn = false;
  GS.extraDrawNext = new Set();
  GS.toDiscard = new Set();
  GS.alliances = new Set();
  GS.alliancesUsed = new Set();
  GS.allianceMode = false;

  GS.players.forEach(p => p.drawToFill(GS.deck, 5));
  GS.addLog('Game started! Good luck, ninjas.', 'turn');

  const _online = typeof Network !== 'undefined' && Network.mode;
  if (!GS.current.isAI && !_online) {
    GS.phase = PHASE.PASS_SCREEN;
  } else {
    GS.phase = PHASE.DRAW_PHASE;
  }
  UI.render();
  if (GS.current.isAI || (_online && Network.mode === 'host')) {
    setTimeout(() => TM.startTurn(), _online ? 900 : 400);
  }
}
