import { RobotClassId } from '../server/src/types'

export type GameMode = 'solo' | 'multiplayer' | 'tournament'

let activeMode: GameMode = 'solo'
let unlockedRobots = new Set<RobotClassId>(['bastion'])

export function getGameMode(): GameMode {
  return activeMode
}

export function setGameMode(mode: GameMode): void {
  activeMode = mode
}

export function setUnlockedRobots(robotIds: RobotClassId[]): void {
  unlockedRobots = new Set(['bastion', ...robotIds])
}

/** Until a profile service exists, only the public starter robot is earned. */
export function canUseRobotInMode(classId: RobotClassId): boolean {
  return activeMode === 'solo' || unlockedRobots.has(classId)
}

export function modeLabel(mode = activeMode): string {
  if (mode === 'solo') return 'SOLO PRACTICE'
  if (mode === 'multiplayer') return 'CASUAL MULTIPLAYER'
  return 'TOURNAMENT EVENT'
}
