// Card type constants
const CT = {
  ATTACK: 'attack',
  DEFENSE: 'defense',
  VANISH: 'vanish',
  COMBO: 'combo',
  ULTIMATE_DEFENSE: 'ultimate_defense',
  ULTIMATE_ATTACK: 'ultimate_attack',
  HEAL: 'heal',
  STEAL: 'steal'
};

// Game phase constants
const PHASE = {
  SETUP: 'setup',
  PASS_SCREEN: 'pass_screen',
  DEFENSE_PASS: 'defense_pass',
  DRAW_PHASE: 'draw_phase',
  ACTION: 'action',
  TARGETING: 'targeting',
  COMBO_SELECT: 'combo_select',
  DEFENSE_PROMPT: 'defense_prompt',
  GAME_OVER: 'game_over'
};

// Card definitions (counts total to 72)
const CARDS = {
  attack: {
    id: 'attack', name: 'Attack', type: CT.ATTACK, count: 38, damage: 1,
    desc: 'Deals 1 damage.\nBlocked by Defense or\nUltimate Defense.',
    rarity: 'common', color: '#ff3366', glow: 'rgba(255,51,102,0.9)',
    img: 'attack.png'
  },
  defense: {
    id: 'defense', name: 'Defense', type: CT.DEFENSE, count: 18,
    desc: 'Blocks regular attacks.\nCannot block Ultimate Attack.',
    rarity: 'common', color: '#00ffcc', glow: 'rgba(0,255,204,0.9)',
    img: 'defense.png'
  },
  vanish: {
    id: 'vanish', name: 'Vanish', type: CT.VANISH, count: 5,
    desc: 'Play at start of turn.\nUntargetable this round.\nUltimate Attacks bypass.',
    rarity: 'uncommon', color: '#9933ff', glow: 'rgba(153,51,255,0.9)',
    img: 'vanish.png'
  },
  combo: {
    id: 'combo', name: 'Combo', type: CT.COMBO, count: 5,
    desc: 'Attack twice this turn.\nMix regular & ultimate.\nSame or different targets.',
    rarity: 'uncommon', color: '#ffcc00', glow: 'rgba(255,204,0,0.9)',
    img: 'combo.png'
  },
  ultimate_defense: {
    id: 'ultimate_defense', name: 'Ultimate Defense', type: CT.ULTIMATE_DEFENSE, count: 3,
    desc: 'Blocks ANY attack,\nincluding Ultimate Attacks.',
    rarity: 'rare', color: '#0099ff', glow: 'rgba(0,153,255,0.9)',
    img: 'ultimate defense.png'
  },
  ultimate_attack: {
    id: 'ultimate_attack', name: 'Ultimate Attack', type: CT.ULTIMATE_ATTACK, count: 3,
    desc: 'Bypasses Defense & Vanish.\nOnly Ultimate Defense blocks.',
    rarity: 'rare', color: '#ff6600', glow: 'rgba(255,102,0,0.9)',
    img: 'ultimate attack.png'
  },
  heal: {
    id: 'heal', name: 'Heal', type: CT.HEAL, count: 4, deluxeOnly: true,
    desc: 'Restore 1 lost life.\nCannot exceed 3 lives.',
    rarity: 'uncommon', color: '#00cc66', glow: 'rgba(0,204,102,0.9)',
    img: null, icon: '💚'
  },
  steal: {
    id: 'steal', name: 'Steal', type: CT.STEAL, count: 4, deluxeOnly: true,
    desc: 'Take a random card from\nany opponent\'s hand.',
    rarity: 'uncommon', color: '#cc44ff', glow: 'rgba(204,68,255,0.9)',
    img: null, icon: '🫳'
  }
};
