export interface LevelConfig {
  id: number;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  survivors: number;
  counts: readonly [number, number, number];
  briefing: readonly string[];
  parTime: number;
  unlocked: boolean;
  currentStrength: number;
  debrisCount: number;
  fogDensity: number;
  rainMultiplier: number;
}

export const LEVELS: readonly LevelConfig[] = [
  { id: 1, title: 'THE FIRST CALL', difficulty: 'Easy', survivors: 3, counts: [3, 0, 0],
    briefing: ['Heavy rain has flooded the village.', 'A family is stranded on a nearby house.', 'Reach them before conditions worsen.'],
    parTime: 240, unlocked: true, currentStrength: 0.12, debrisCount: 3, fogDensity: 0.014, rainMultiplier: 1 },
  { id: 2, title: 'RISING WATER', difficulty: 'Medium', survivors: 6, counts: [2, 1, 3],
    briefing: ['6 people are still stranded.', 'Your boat can carry only three.', 'Bring everyone home.'],
    parTime: 420, unlocked: true, currentStrength: 0.3, debrisCount: 7, fogDensity: 0.017, rainMultiplier: 1.1 },
  { id: 3, title: 'AGAINST THE CURRENT', difficulty: 'Hard', survivors: 9, counts: [3, 3, 3],
    briefing: ['The current is growing stronger.', '9 people are waiting across the village.', 'Keep your boat steady. Leave nobody behind.'],
    parTime: 600, unlocked: true, currentStrength: 0.5, debrisCount: 11, fogDensity: 0.022, rainMultiplier: 1.35 },
];

export class LevelManager {
  current = LEVELS[0];
  select(id: number) {
    const level = LEVELS.find(level => level.id === id && level.unlocked);
    if (!level) throw new Error(`Level ${id} is unavailable`);
    this.current = level;
    return level;
  }
  get next() { return LEVELS.find(level => level.id === this.current.id + 1 && level.unlocked); }
}

export function missionRating(time: number, integrity: number, parTime: number) {
  return 1 + Number(integrity >= 65) + Number(time <= parTime && integrity >= 85);
}
