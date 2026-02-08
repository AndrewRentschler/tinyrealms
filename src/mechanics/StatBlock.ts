/**
 * Stat formulas shared between client and server.
 * Pure functions for calculating combat values.
 */

export interface Stats {
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  level: number;
  xp: number;
}

export function defaultStats(): Stats {
  return {
    hp: 100,
    maxHp: 100,
    atk: 10,
    def: 5,
    spd: 5,
    level: 1,
    xp: 0,
  };
}

/** XP required to reach the next level */
export function xpToNextLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}

/** Calculate effective attack including weapon bonus */
export function effectiveAtk(baseAtk: number, weaponAtk: number = 0): number {
  return baseAtk + weaponAtk;
}

/** Calculate effective defense including armor bonus */
export function effectiveDef(baseDef: number, armorDef: number = 0): number {
  return baseDef + armorDef;
}

/** Calculate damage dealt */
export function calculateDamage(
  attackerAtk: number,
  defenderDef: number,
  variance: number = 0.2
): number {
  const base = Math.max(1, attackerAtk - defenderDef / 2);
  const varianceFactor = 1 + (Math.random() * 2 - 1) * variance;
  return Math.max(1, Math.floor(base * varianceFactor));
}

/** Check if entity can level up, and return new stats if so */
export function checkLevelUp(stats: Stats): Stats | null {
  const needed = xpToNextLevel(stats.level);
  if (stats.xp >= needed) {
    return {
      ...stats,
      level: stats.level + 1,
      xp: stats.xp - needed,
      maxHp: stats.maxHp + 10,
      hp: stats.maxHp + 10, // Full heal on level up
      atk: stats.atk + 2,
      def: stats.def + 1,
      spd: stats.spd + 1,
    };
  }
  return null;
}
