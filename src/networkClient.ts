/**
 * networkClient.ts
 * Lightweight WebSocket client for Toy Robot Worlds.
 * - Connects to the Render-hosted authoritative game server.
 * - Falls back gracefully (offline / AI-only mode) if the server is unreachable.
 * - Sends INPUT packets at ~20 Hz.
 * - Receives WORLD_TICK packets and updates remote robot entity positions.
 */

import { engine, Transform, GltfContainer, MeshRenderer, Material, Entity, executeTask, TextShape, Billboard } from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import { GameEvent, RobotState, WelcomePacket, WorldTickPacket, RobotClassId } from '../server/src/types'
import { getSelectedClassId, playerMechEntity } from './mechController'
import { MechPilot, MechStateEnum } from './components'
import { getGameMode, setUnlockedRobots } from './gameMode'
import { signedFetch } from '~system/SignedFetch'
import { SERVER_HTTP_URL, SERVER_WS_URL } from './serverConfig'
import { hasSeparateTurret, robotModelPath } from './robotModels'

// ─── Configuration ───────────────────────────────────────────────────────────

/** How many seconds between INPUT packet sends (~20 Hz) */
const INPUT_SEND_INTERVAL = 0.05

// ─── State ───────────────────────────────────────────────────────────────────

let ws: WebSocket | null = null
let myRobotId: string = ''
let isConnected = false
let isConnecting = false
let sessionToken = ''
let adminSession = false
let isInWar = false
let connectionMessage = 'Not connected to the multiplayer server.'

/** Our pending input state to be flushed each send interval */
let pendingMoveDir: number = 0
let pendingTurnDir: number = 0
let pendingTurretYaw: number = 0
let pendingTurretPitch: number = 4.5

let inputSendTimer = 0

/** Map of remote robot entity IDs (string) → DCL entity */
const remoteRobotEntities = new Map<string, Entity>()
const remoteTurretEntities = new Map<string, Entity>()
const remoteRobotLabels = new Map<string, Entity>()
const remoteRobotClasses = new Map<string, RobotClassId>()
const shotEffects: Array<{ entity: Entity; remaining: number }> = []

// ─── Public API ──────────────────────────────────────────────────────────────

/** Call once from index.ts main() — attempts to connect. Scene works without it. */
export function initNetworkClient(): void {
  if (ws || isConnected || isConnecting) return
  isConnecting = true
  connectionMessage = 'Connecting to the multiplayer server…'
  const authUrl = `${SERVER_HTTP_URL}/auth/session`
  executeTask(async () => {
    try {
      const response = await signedFetch({
        url: authUrl,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
      })
      if (!response.ok) {
        throw new Error(response.status === 404
          ? `Render has no server at ${SERVER_HTTP_URL}. Deploy the backend or update src/serverConfig.ts to its public URL.`
          : `Server authentication failed (HTTP ${response.status}).`)
      }
      const session = JSON.parse(response.body) as { token: string; isAdmin?: boolean }
      sessionToken = session.token
      adminSession = session.isAdmin === true
      connectionMessage = 'Authenticated. Opening the multiplayer connection…'
      tryConnect(session.token)
    } catch (error) {
      isConnecting = false
      connectionMessage = error instanceof Error ? error.message : 'Could not authenticate with the multiplayer server.'
      console.log('[Net] Could not authenticate with multiplayer server:', error)
    }
  })
}

/** Update pending input (called every frame from mechControlSystem) */
export function netSendInput(moveDir: number, turnDir: number, turretYaw: number, turretPitch: number): void {
  pendingMoveDir = moveDir
  pendingTurnDir = turnDir
  pendingTurretYaw = turretYaw
  pendingTurretPitch = turretPitch
}

/** Send a one-shot action packet immediately */
export function netSendAction(action: 'fire' | 'reload' | 'repair' | 'dash'): void {
  if (getGameMode() === 'solo' || !isConnected || !ws || !myRobotId) return
  ws.send(JSON.stringify({
    type: 'ACTION',
    robotId: myRobotId,
    payload: { action }
  }))
}

export function netSelectRobot(classId: string): void {
  if (getGameMode() === 'solo') return
  if (!isConnected || !ws || !myRobotId) return
  ws.send(JSON.stringify({ type: 'JOIN', robotId: myRobotId, payload: { name: 'Player', classId } }))
}

export function netJoinWar(classId: RobotClassId): void {
  if (!isConnected || !ws || !myRobotId || getGameMode() !== 'multiplayer') return
  isInWar = true
  ws.send(JSON.stringify({
    type: 'PRESENCE', robotId: myRobotId,
    payload: { active: true, name: 'Player', classId }
  }))
}

export function netLeaveWar(): void {
  if (isConnected && ws && myRobotId && isInWar) {
    ws.send(JSON.stringify({ type: 'PRESENCE', robotId: myRobotId, payload: { active: false, name: 'Player', classId: 'bastion' } }))
  }
  isInWar = false
  clearRemoteRobots()
}

export function disconnectNetworkClient(): void {
  netLeaveWar()
  const activeSocket = ws
  ws = null
  isConnected = false
  isConnecting = false
  myRobotId = ''
  sessionToken = ''
  if (activeSocket) activeSocket.close()
}

/** ECS system — call engine.addSystem(networkSystem) in index.ts */
export function networkSystem(dt: number): void {
  updateShotEffects(dt)
  if (getGameMode() === 'solo' || !isConnected) return

  inputSendTimer += dt
  if (inputSendTimer >= INPUT_SEND_INTERVAL) {
    inputSendTimer = 0
    if (ws && myRobotId) {
      ws.send(JSON.stringify({
        type: 'INPUT',
        robotId: myRobotId,
        payload: {
          moveDir: pendingMoveDir,
          turnDir: pendingTurnDir,
          turretYaw: pendingTurretYaw,
          turretPitch: pendingTurretPitch
        }
      }))
    }
  }
}

/** Returns true if the multiplayer server is connected */
export function isMultiplayerConnected(): boolean {
  return isConnected
}

/** Returns our assigned robot ID from the server */
export function getMyRobotId(): string {
  return myRobotId
}

export function getSessionToken(): string {
  return sessionToken
}

export function isAdminSession(): boolean {
  return adminSession
}

export function isNetworkConnecting(): boolean {
  return isConnecting
}

export function getNetworkMessage(): string {
  return connectionMessage
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function tryConnect(token: string): void {
  console.log('[Net] Connecting to', SERVER_WS_URL)
  try {
    ws = new WebSocket(SERVER_WS_URL, ['toy-robot-worlds', token])
  } catch {
    isConnecting = false
    connectionMessage = `Could not open the multiplayer WebSocket at ${SERVER_WS_URL}. Check the Render URL.`
    console.log('[Net] WebSocket unavailable — offline/AI mode')
    return
  }

  ws.onopen = () => {
    isConnecting = false
    connectionMessage = 'Connected. Choose a robot, then join the war.'
    console.log('[Net] Connected to server')
  }

  ws.onmessage = (event: MessageEvent) => {
    try {
      const packet = JSON.parse(event.data as string)
      handlePacket(packet)
    } catch {
      // ignore malformed packets
    }
  }

  ws.onerror = () => {
    console.log('[Net] Connection error — running in AI-only mode')
    isConnected = false
    isConnecting = false
    isInWar = false
    ws = null
    connectionMessage = `Multiplayer WebSocket failed at ${SERVER_WS_URL}. Check that the Render backend is deployed.`
  }

  ws.onclose = () => {
    console.log('[Net] Disconnected — running in AI-only mode')
    isConnected = false
    isConnecting = false
    isInWar = false
    ws = null
    if (!isConnected) connectionMessage = `Multiplayer server connection closed at ${SERVER_WS_URL}.`
    // Retry connection after 15 seconds
    // (In DCL we can't use setTimeout easily, so we set a flag and retry via system)
  }
}

function handlePacket(packet: { type: string } & Record<string, unknown>): void {
  if (packet.type === 'WELCOME') {
    const welcome = packet as unknown as WelcomePacket
    myRobotId = welcome.robotId
    isConnected = true
    setUnlockedRobots(welcome.profile.unlockedRobots)
    console.log('[Net] Joined as robot', myRobotId)

    return
  }

  if (packet.type === 'WORLD_TICK') {
    const tick = packet as unknown as WorldTickPacket
    reconcileWorld(tick.robots)
    processEvents(tick.events)
  }
}

function reconcileWorld(robots: RobotState[]): void {
  if (getGameMode() === 'multiplayer' && !isInWar) {
    clearRemoteRobots()
    return
  }
  const seenIds = new Set<string>()

  for (const robot of robots) {
  // Skip snapshots for our own robot outside the war; the local hangar mech
  // should not be pulled toward the server spawn position.
    if (robot.id === myRobotId) {
      if (isInWar) reconcileLocalRobot(robot)
      continue
    }

    seenIds.add(robot.id)

    if (!remoteRobotEntities.has(robot.id)) {
      spawnRemoteRobot(robot)
    } else {
      updateRemoteRobot(robot)
    }
  }

  // Remove robots that left the game
  for (const [id, ent] of remoteRobotEntities) {
    if (!seenIds.has(id)) {
      engine.removeEntity(ent)
      remoteRobotEntities.delete(id)
      remoteRobotClasses.delete(id)
      const label = remoteRobotLabels.get(id)
      if (label !== undefined) engine.removeEntity(label)
      remoteRobotLabels.delete(id)
      const turret = remoteTurretEntities.get(id)
      if (turret !== undefined) engine.removeEntity(turret)
      remoteTurretEntities.delete(id)
      console.log('[Net] Robot left:', id)
    }
  }
}

function clearRemoteRobots(): void {
  for (const entity of remoteRobotEntities.values()) engine.removeEntity(entity)
  for (const entity of remoteTurretEntities.values()) engine.removeEntity(entity)
  for (const entity of remoteRobotLabels.values()) engine.removeEntity(entity)
  remoteRobotEntities.clear()
  remoteTurretEntities.clear()
  remoteRobotClasses.clear()
  remoteRobotLabels.clear()
}

function reconcileLocalRobot(robot: RobotState): void {
  if (!playerMechEntity) return
  const pilot = MechPilot.getMutableOrNull(playerMechEntity)
  if (!pilot || !pilot.isPiloting) return

  const transform = Transform.getMutable(playerMechEntity)
  // Small server drift corrections are eased in; large errors (respawn or a
  // collision divergence) snap so the client does not spend seconds catching up.
  const dx = robot.x - transform.position.x
  const dz = robot.z - transform.position.z
  const error = Math.hypot(dx, dz)
  const smoothing = error > 1.5 ? 1 : 0.12
  transform.position.x += dx * smoothing
  transform.position.z += dz * smoothing
  transform.position.y = robot.state === 'DESTROYED' ? -100 : 0.1
  transform.rotation = Quaternion.fromEulerDegrees(0, robot.chassisYaw + 180, 0)
  pilot.classId = robot.classId
  pilot.chassisYaw = robot.chassisYaw
  pilot.turretYaw = robot.turretYaw
  pilot.turretPitch = robot.turretPitch ?? 0
  pilot.shields = robot.shields
  pilot.maxShields = robot.maxShields
  pilot.ammo = robot.ammo
  pilot.maxAmmo = robot.maxAmmo
  pilot.stateTimer = robot.stateTimer
  pilot.dashCooldown = robot.dashCooldown
  pilot.kills = robot.kills
  pilot.deaths = robot.deaths
  pilot.state = robot.state === 'RELOADING' ? MechStateEnum.RELOADING
    : robot.state === 'REPAIRING' ? MechStateEnum.REPAIRING
      : robot.state === 'FALLING' ? MechStateEnum.FALLING
        : robot.state === 'DESTROYED' ? MechStateEnum.DESTROYED
          : MechStateEnum.NORMAL
}

function spawnRemoteRobot(robot: RobotState): void {
  const ent = engine.addEntity()
  Transform.create(ent, {
    position: Vector3.create(robot.x, 0.2, robot.z),
    rotation: Quaternion.fromEulerDegrees(0, robot.chassisYaw + 180, 0),
    scale: Vector3.create(1, 1, 1)
  })

  GltfContainer.create(ent, { src: robotModelPath(robot.classId) })

  const turret = engine.addEntity()
  Transform.create(turret, {
    position: Vector3.create(0, hasSeparateTurret(robot.classId) ? 0 : -100, 0),
    rotation: Quaternion.fromEulerDegrees(robot.turretPitch ?? 0, remoteTurretYaw(robot), 0),
    parent: ent
  })
  if (hasSeparateTurret(robot.classId)) {
    GltfContainer.create(turret, { src: 'assets/models/mech_bastion_turret.glb' })
  }

  const label = engine.addEntity()
  Transform.create(label, {
    position: Vector3.create(0, 3.2, 0),
    parent: ent
  })
  Billboard.create(label)
  TextShape.create(label, {
    text: remoteShieldText(robot),
    fontSize: 2.8,
    textColor: Color4.create(1, 0.35, 0.35, 1)
  })

  remoteRobotEntities.set(robot.id, ent)
  remoteTurretEntities.set(robot.id, turret)
  remoteRobotClasses.set(robot.id, robot.classId)
  remoteRobotLabels.set(robot.id, label)
  console.log('[Net] Robot joined:', robot.id, robot.isBot ? '(bot)' : '(player)')
}

function updateRemoteRobot(robot: RobotState): void {
  const ent = remoteRobotEntities.get(robot.id)!
  if (remoteRobotClasses.get(robot.id) !== robot.classId) {
    GltfContainer.getMutable(ent).src = robotModelPath(robot.classId)
    const turret = remoteTurretEntities.get(robot.id)
    if (turret !== undefined) {
      if (hasSeparateTurret(robot.classId)) {
        GltfContainer.createOrReplace(turret, { src: 'assets/models/mech_bastion_turret.glb' })
        Transform.getMutable(turret).position = Vector3.create(0, 0, 0)
      } else {
        GltfContainer.deleteFrom(turret)
        Transform.getMutable(turret).position = Vector3.create(0, -100, 0)
      }
    }
    remoteRobotClasses.set(robot.id, robot.classId)
  }
  const t = Transform.getMutable(ent)

  // Simple lerp toward server position for smooth rendering
  const lerpFactor = 0.25
  t.position.x += (robot.x - t.position.x) * lerpFactor
  t.position.z += (robot.z - t.position.z) * lerpFactor

  if (robot.state === 'DESTROYED') {
    t.position.y = -100 // Hide destroyed robots underground
  } else {
    t.position.y = 0.2
  }

  t.rotation = Quaternion.fromEulerDegrees(0, robot.chassisYaw, 0)

  const turret = remoteTurretEntities.get(robot.id)
  if (turret !== undefined) {
    Transform.getMutable(turret).rotation = Quaternion.fromEulerDegrees(robot.turretPitch ?? 0, remoteTurretYaw(robot), 0)
  }

  const label = remoteRobotLabels.get(robot.id)
  if (label !== undefined) {
    const text = TextShape.getMutableOrNull(label)
    if (text) text.text = remoteShieldText(robot)
  }
}

function remoteTurretYaw(robot: RobotState): number {
  const relativeYaw = robot.turretYaw - robot.chassisYaw
  return ((relativeYaw % 360) + 360) % 360
}

function processEvents(events: GameEvent[]): void {
  for (const ev of events) {
    if (ev.type === 'LASER_FIRED' && ev.from && ev.to) {
      spawnNetworkShot(ev.from, ev.to, ev.shooterId === myRobotId)
    }
    if (ev.type === 'DAMAGE_TAKEN' && ev.targetId === myRobotId) {
      console.log('[Net] We took', ev.damage, 'damage from', ev.shooterId)
      // HUD damage flash is handled by ui.tsx reading MechPilot component
    }
    if (ev.type === 'ROBOT_DESTROYED') {
      console.log('[Net] Robot destroyed:', ev.targetId, 'by', ev.shooterId)
    }
  }
}

function remoteShieldText(robot: RobotState): string {
  const pips = Array.from({ length: robot.maxShields }, (_, index) => index < robot.shields ? '■' : '□').join('')
  return `${robot.name}\nSHIELDS ${pips}`
}

function spawnNetworkShot(from: [number, number, number], to: [number, number, number], isPlayerShot: boolean): void {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const dz = to[2] - from[2]
  const length = Math.hypot(dx, dy, dz)
  if (length < 0.1) return

  const beam = engine.addEntity()
  Transform.create(beam, {
    position: Vector3.create((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2),
    scale: Vector3.create(0.1, 0.1, length),
    rotation: Quaternion.fromEulerDegrees(
      (Math.atan2(-dy, Math.hypot(dx, dz)) * 180) / Math.PI,
      (Math.atan2(dx, dz) * 180) / Math.PI,
      0
    )
  })
  MeshRenderer.setCylinder(beam)
  Material.setPbrMaterial(beam, {
    albedoColor: isPlayerShot ? Color4.create(0, 0.9, 1, 1) : Color4.create(1, 0.12, 0.12, 1),
    emissiveColor: isPlayerShot ? Color4.create(0, 0.9, 1, 1) : Color4.create(1, 0.12, 0.12, 1)
  })
  shotEffects.push({ entity: beam, remaining: 0.12 })
}

function updateShotEffects(dt: number): void {
  for (let index = shotEffects.length - 1; index >= 0; index--) {
    const effect = shotEffects[index]
    effect.remaining -= dt
    if (effect.remaining <= 0) {
      engine.removeEntity(effect.entity)
      shotEffects.splice(index, 1)
    }
  }
}
