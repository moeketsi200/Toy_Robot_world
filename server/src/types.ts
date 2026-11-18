/** Wire protocol shared by the Decentraland client and the Render server. */
export type RobotStateMode = 'NORMAL' | 'RELOADING' | 'REPAIRING' | 'FALLING' | 'DESTROYED'

export type RobotAction = 'fire' | 'reload' | 'repair' | 'dash'
export type RobotClassId = 'bastion' | 'spectre' | 'goliath' | 'viper' | 'bulwark' | 'arc'

export type TournamentStatus = 'registration' | 'live' | 'completed'

export interface TournamentEntrant {
  wallet: string
  name: string
  registeredAt: string
}

export interface TournamentMatch {
  id: string
  round: number
  player1: TournamentEntrant | null
  player2: TournamentEntrant | null
  winner: TournamentEntrant | null
  status: 'pending' | 'bye' | 'ready' | 'complete'
}

export interface TournamentSnapshot {
  id: string
  title: string
  startsAt: string
  playerCap: number
  status: TournamentStatus
  createdBy: string
  entrants: TournamentEntrant[]
  bracket: TournamentMatch[][]
  createdAt: string
}

export interface RobotClassConfig {
  id: RobotClassId
  name: string
  role: string
  maxShields: number
  maxAmmo: number
  damage: number
  fireInterval: number
  reloadTime: number
  repairTime: number
  moveSpeed: number
  turnSpeed: number
  dashDistance: number
  dashCooldown: number
  range: number
  shotStyle: 'single' | 'burst' | 'charged' | 'scatter' | 'chain'
}

export const ROBOT_CLASSES: Record<RobotClassId, RobotClassConfig> = {
  bastion: { id: 'bastion', name: 'Bastion', role: 'Tank · steady laser', maxShields: 6, maxAmmo: 8, damage: 1, fireInterval: 0.55, reloadTime: 3, repairTime: 5, moveSpeed: 4.5, turnSpeed: 65, dashDistance: 6, dashCooldown: 7, range: 20, shotStyle: 'single' },
  spectre: { id: 'spectre', name: 'Spectre', role: 'Scout · 3-shot burst', maxShields: 3, maxAmmo: 9, damage: 0.5, fireInterval: 0.95, reloadTime: 2, repairTime: 3, moveSpeed: 8.5, turnSpeed: 120, dashDistance: 12, dashCooldown: 4, range: 40, shotStyle: 'burst' },
  goliath: { id: 'goliath', name: 'Goliath', role: 'Heavy · charged cannon', maxShields: 5, maxAmmo: 4, damage: 2, fireInterval: 1.25, reloadTime: 4, repairTime: 4, moveSpeed: 6, turnSpeed: 85, dashDistance: 8, dashCooldown: 5.5, range: 28, shotStyle: 'charged' },
  viper: { id: 'viper', name: 'Viper', role: 'Skirmisher · rapid shots', maxShields: 4, maxAmmo: 12, damage: 0.5, fireInterval: 0.22, reloadTime: 1.5, repairTime: 4, moveSpeed: 8, turnSpeed: 115, dashDistance: 11, dashCooldown: 4.5, range: 25, shotStyle: 'single' },
  bulwark: { id: 'bulwark', name: 'Bulwark', role: 'Defender · scatter blast', maxShields: 7, maxAmmo: 4, damage: 2, fireInterval: 0.85, reloadTime: 2.5, repairTime: 5.5, moveSpeed: 4, turnSpeed: 60, dashDistance: 5, dashCooldown: 7.5, range: 16, shotStyle: 'scatter' },
  arc: { id: 'arc', name: 'Arc', role: 'Support · chain shot', maxShields: 4, maxAmmo: 5, damage: 1, fireInterval: 0.75, reloadTime: 3, repairTime: 4, moveSpeed: 6.5, turnSpeed: 90, dashDistance: 8, dashCooldown: 5.5, range: 25, shotStyle: 'chain' }
}

export interface RobotState {
  id: string
  classId: RobotClassId
  name: string
  isBot: boolean
  x: number
  z: number
  chassisYaw: number
  turretYaw: number
  turretPitch?: number
  shields: number
  maxShields: number
  ammo: number
  maxAmmo: number
  state: RobotStateMode
  stateTimer: number
  dashCooldown: number
  kills: number
  deaths: number
}

export interface WelcomePacket {
  type: 'WELCOME'
  robotId: string
  profile: PlayerProfileSummary
}

export interface PlayerProfileSummary {
  unlockedRobots: RobotClassId[]
  totalKills: number
  totalMatches: number
}

export interface JoinCommand {
  type: 'JOIN'
  robotId: string
  payload: { name: string; classId?: RobotClassId }
}

export interface InputCommand {
  type: 'INPUT'
  robotId: string
  payload: {
    moveDir: number
    turnDir: number
    turretYaw: number
    turretPitch?: number
  }
}

export interface ActionCommand {
  type: 'ACTION'
  robotId: string
  payload: { action: RobotAction }
}

export interface LeaveCommand {
  type: 'LEAVE'
  robotId: string
}

export interface PresenceCommand {
  type: 'PRESENCE'
  robotId: string
  payload: { active: boolean; name: string; classId: RobotClassId }
}

export type ClientCommand = JoinCommand | InputCommand | ActionCommand | LeaveCommand | PresenceCommand

export interface GameEvent {
  type: 'LASER_FIRED' | 'DAMAGE_TAKEN' | 'ROBOT_DESTROYED' | 'PIT_FALL'
  shooterId?: string
  targetId?: string
  from?: [number, number, number]
  to?: [number, number, number]
  damage?: number
}

export interface WorldTickPacket {
  type: 'WORLD_TICK'
  tick: number
  timestamp: number
  robots: RobotState[]
  events: GameEvent[]
}

export type ServerPacket = WelcomePacket | WorldTickPacket

/** Runtime check at the untrusted WebSocket boundary. */
export function isClientCommand(value: unknown): value is ClientCommand {
  if (!value || typeof value !== 'object') return false
  const command = value as Record<string, unknown>
  if (typeof command.robotId !== 'string') return false

  if (command.type === 'LEAVE') return true
  if (command.type !== 'JOIN' && command.type !== 'INPUT' && command.type !== 'ACTION' && command.type !== 'PRESENCE') return false
  if (!command.payload || typeof command.payload !== 'object') return false

  const payload = command.payload as Record<string, unknown>
  if (command.type === 'JOIN') return typeof payload.name === 'string' && (payload.classId === undefined || (typeof payload.classId === 'string' && payload.classId in ROBOT_CLASSES))
  if (command.type === 'PRESENCE') return typeof payload.active === 'boolean' && typeof payload.name === 'string' && typeof payload.classId === 'string' && payload.classId in ROBOT_CLASSES
  if (command.type === 'ACTION') {
    return payload.action === 'fire' || payload.action === 'reload' || payload.action === 'repair' || payload.action === 'dash'
  }
  return typeof payload.moveDir === 'number' && typeof payload.turnDir === 'number' &&
    typeof payload.turretYaw === 'number' &&
    (payload.turretPitch === undefined || (typeof payload.turretPitch === 'number' && Number.isFinite(payload.turretPitch)))
}
