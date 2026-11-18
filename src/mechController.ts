import {
  engine,
  Entity,
  Transform,
  GltfContainer,
  VirtualCamera,
  MainCamera,
  InputModifier,
  PointerLock,
  inputSystem,
  InputAction,
  PointerEventType,
  PrimaryPointerInfo,
  UiCanvasInformation,
  TouchScreenControls,
  MeshRenderer,
  Material
} from '@dcl/sdk/ecs'
import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import { isMobile } from '@dcl/sdk/platform'
import { MechPilot, MechStateEnum, Obstacle, PitHazard, LaserProjectile } from './components'
import { initNetworkClient, netSendInput, netSendAction, netSelectRobot, netJoinWar, netLeaveWar, disconnectNetworkClient, isMultiplayerConnected } from './networkClient'
import { ROBOT_CLASSES, RobotClassId } from '../server/src/types'
import { canUseRobotInMode, getGameMode, GameMode, setGameMode } from './gameMode'

export let playerMechEntity: Entity | null = null
export let mechCameraEntity: Entity | null = null
export let playerTurretEntity: Entity | null = null

let lastShotTime = 0
let fireRequested = false
let reloadRequested = false
let repairRequested = false
const SHOT_COOLDOWN = 0.35
const AIM_SENSITIVITY = 0.14
const MOBILE_AIM_SENSITIVITY = 0.08
const MOBILE_AIM_SMOOTHING = 0.38
const MIN_AIM_PITCH = -10
const MAX_AIM_PITCH = 55
const MUZZLE_FORWARD_DISTANCE = 2.75
const MUZZLE_HEIGHT = 2.7
let selectedClassId: RobotClassId = 'bastion'
let aimPitch = 4.5
let cameraAimYaw = 0
let lastAimPointer: { x: number; y: number } | undefined
let smoothedMobileAimX = 0
let smoothedMobileAimY = 0
let mobileAimSensitivity = 1
let avatarControlAnchor: Vector3 | undefined
let avatarMoveAxis = 0
let avatarTurnAxis = 0
let previousPointerLockState: boolean | undefined

/** Queue one weapon shot from the on-screen cockpit button. */
export function requestFire(): void {
  fireRequested = true
}

export function stopFire(): void {
  fireRequested = false
}

export function adjustMobileAimSensitivity(delta: number): void {
  mobileAimSensitivity = Math.max(0.5, Math.min(2, mobileAimSensitivity + delta))
}

export function getMobileAimSensitivity(): number {
  return mobileAimSensitivity
}

function updateNativeJoystickFromAvatar(): void {
  avatarMoveAxis = 0
  avatarTurnAxis = 0
  if (!isMobile() || !avatarControlAnchor || !playerMechEntity) return
  const avatar = Transform.getMutableOrNull(engine.PlayerEntity)
  if (!avatar) return
  const dx = avatar.position.x - avatarControlAnchor.x
  const dz = avatar.position.z - avatarControlAnchor.z
  const yaw = (MechPilot.getOrNull(playerMechEntity)?.chassisYaw ?? 0) * Math.PI / 180
  const forwardX = Math.sin(yaw)
  const forwardZ = Math.cos(yaw)
  const forward = dx * forwardX + dz * forwardZ
  const lateral = dx * forwardZ - dz * forwardX
  const deadZone = 0.0005
  if (Math.abs(forward) > deadZone) avatarMoveAxis = Math.sign(forward)
  if (Math.abs(lateral) > deadZone) avatarTurnAxis = Math.sign(lateral)
  // Keep avatar locomotion from carrying the player away from the mech camera.
  avatar.position = Vector3.clone(avatarControlAnchor)
}

export function requestReload(): void {
  reloadRequested = true
}

export function requestRepair(): void {
  repairRequested = true
}

export function getSelectedClassId(): RobotClassId {
  return selectedClassId
}

/** Keep the aiming reticle fixed in the center of the view on every platform. */
export function getAimReticlePosition(): { left: number; top: number } {
  const canvas = UiCanvasInformation.getOrNull(engine.RootEntity)
  const canvasWidth = canvas?.width ?? 1920
  const canvasHeight = canvas?.height ?? 1080
  return { left: canvasWidth / 2, top: canvasHeight / 2 }
}

export function selectRobotClass(classId: RobotClassId): boolean {
  if (!canUseRobotInMode(classId) || (playerMechEntity && MechPilot.getOrNull(playerMechEntity)?.isPiloting)) return false
  selectedClassId = classId
  netSelectRobot(classId)
  return true
}

export function chooseGameMode(mode: GameMode): void {
  if (playerMechEntity && MechPilot.getOrNull(playerMechEntity)?.isPiloting) exitMech()
  setGameMode(mode)
  if (!canUseRobotInMode(selectedClassId)) selectedClassId = 'bastion'
  if (mode === 'solo') disconnectNetworkClient()
  else initNetworkClient()
}

export function isRobotSelectable(classId: RobotClassId): boolean {
  return canUseRobotInMode(classId)
}

export function initMech() {
  // Create player mech entity
  playerMechEntity = engine.addEntity()
  Transform.create(playerMechEntity, {
    position: Vector3.create(16, -100, 16), // Hidden underground initially
    scale: Vector3.create(1, 1, 1)
  })
  GltfContainer.create(playerMechEntity, {
    src: 'assets/models/mech_bastion_chassis.glb'
  })

  playerTurretEntity = engine.addEntity()
  Transform.create(playerTurretEntity, {
    position: Vector3.create(0, 0, 0),
    rotation: Quaternion.fromEulerDegrees(0, 180, 0),
    parent: playerMechEntity
  })
  GltfContainer.create(playerTurretEntity, {
    src: 'assets/models/mech_bastion_turret.glb'
  })

  MechPilot.create(playerMechEntity, {
    isPiloting: false,
    classId: 'bastion',
    chassisYaw: 0,
    turretYaw: 0,
    turretPitch: 4.5,
    shields: 6,
    maxShields: 6,
    ammo: 8,
    maxAmmo: 8,
    state: MechStateEnum.NORMAL,
    stateTimer: 0,
    dashCooldown: 0,
    kills: 0,
    deaths: 0
  })

  // The GLB faces local -Z while gameplay forward is +Z. Parent rotation below
  // turns the model to face gameplay-forward, so +Z here is behind the robot.
  mechCameraEntity = engine.addEntity()
  Transform.create(mechCameraEntity, {
    position: Vector3.create(0, 3.2, 6.5),
    rotation: Quaternion.fromEulerDegrees(14, 180, 0),
    parent: playerMechEntity
  })
  VirtualCamera.create(mechCameraEntity, {
    defaultTransition: {
      transitionMode: VirtualCamera.Transition.Time(0.5)
    }
  })
}

export function enterMech() {
  if (!playerMechEntity || !mechCameraEntity) return
  if (getGameMode() === 'multiplayer' && !isMultiplayerConnected()) return

  const pilot = MechPilot.getMutable(playerMechEntity)
  fireRequested = false
  reloadRequested = false
  repairRequested = false
  lastAimPointer = undefined
  smoothedMobileAimX = 0
  smoothedMobileAimY = 0
  const avatarTransform = Transform.getOrNull(engine.PlayerEntity)
  avatarControlAnchor = avatarTransform ? Vector3.clone(avatarTransform.position) : undefined
  avatarMoveAxis = 0
  avatarTurnAxis = 0
  aimPitch = 4.5
  cameraAimYaw = 0
  const robotClass = ROBOT_CLASSES[selectedClassId]
  pilot.isPiloting = true
  pilot.classId = selectedClassId
  pilot.shields = robotClass.maxShields
  pilot.maxShields = robotClass.maxShields
  pilot.ammo = robotClass.maxAmmo
  pilot.maxAmmo = robotClass.maxAmmo
  pilot.state = MechStateEnum.NORMAL
  pilot.stateTimer = 0
  pilot.dashCooldown = 0
  pilot.chassisYaw = 0
  pilot.turretYaw = 0
  pilot.turretPitch = aimPitch
  updateTurretVisual(pilot.turretYaw, pilot.chassisYaw, pilot.turretPitch)
  Transform.getMutable(mechCameraEntity).rotation = Quaternion.fromEulerDegrees(aimPitch, 180, 0)
  if (isMobile()) {
    TouchScreenControls.showJoystick()
    TouchScreenControls.showCrosshair()
  }

  // Spawn mech at arena start position
  Transform.getMutable(playerMechEntity).position = Vector3.create(32, 0.1, 14)
  Transform.getMutable(playerMechEntity).rotation = Quaternion.fromEulerDegrees(0, 180, 0)

  // Activate virtual camera
  MainCamera.createOrReplace(engine.CameraEntity, {
    virtualCameraEntity: mechCameraEntity
  })
  if (!isMobile()) {
    previousPointerLockState = PointerLock.getOrNull(engine.CameraEntity)?.isPointerLocked ?? false
    PointerLock.createOrReplace(engine.CameraEntity, { isPointerLocked: true })
  }

  // Lock default avatar locomotion
  if (!isMobile()) {
    InputModifier.createOrReplace(engine.PlayerEntity, {
      mode: {
        $case: 'standard',
        standard: { disableAll: true }
      }
    })
  }

  if (getGameMode() === 'multiplayer') netJoinWar(selectedClassId)

  console.log(`Player boarded ${robotClass.name} Combat Mech!`)
}

export function exitMech() {
  if (!playerMechEntity) return

  const pilot = MechPilot.getMutable(playerMechEntity)
  fireRequested = false
  reloadRequested = false
  repairRequested = false
  lastAimPointer = undefined
  avatarControlAnchor = undefined
  avatarMoveAxis = 0
  avatarTurnAxis = 0
  pilot.isPiloting = false
  pilot.state = MechStateEnum.NORMAL

  if (getGameMode() === 'multiplayer') netLeaveWar()

  // Move mech underground
  Transform.getMutable(playerMechEntity).position = Vector3.create(16, -100, 16)

  // Restore camera & player locomotion
  MainCamera.deleteFrom(engine.CameraEntity)
  if (previousPointerLockState !== undefined && PointerLock.has(engine.CameraEntity)) {
    PointerLock.getMutable(engine.CameraEntity).isPointerLocked = previousPointerLockState
    previousPointerLockState = undefined
  }
  InputModifier.deleteFrom(engine.PlayerEntity)
  console.log('Player exited mech, returned to Hangar.')
}

export function mechControlSystem(dt: number) {
  if (!playerMechEntity) return
  const pilot = MechPilot.getMutableOrNull(playerMechEntity)
  if (!pilot || !pilot.isPiloting) return

  const transform = Transform.getMutable(playerMechEntity)
  updateNativeJoystickFromAvatar()
  const robotClass = ROBOT_CLASSES[pilot.classId as RobotClassId] ?? ROBOT_CLASSES.bastion
  const serverAuthoritative = getGameMode() === 'multiplayer' && isMultiplayerConnected()

  // 1. Handle Cooldown Timers
  if (pilot.dashCooldown > 0) pilot.dashCooldown = Math.max(0, pilot.dashCooldown - dt)

  if (pilot.state === MechStateEnum.RELOADING && !serverAuthoritative) {
    pilot.stateTimer -= dt
    if (pilot.stateTimer <= 0) {
      pilot.ammo = pilot.maxAmmo
      pilot.state = MechStateEnum.NORMAL
    }
  } else if (pilot.state === MechStateEnum.REPAIRING && !serverAuthoritative) {
    pilot.stateTimer -= dt
    if (pilot.stateTimer <= 0) {
      pilot.shields = pilot.maxShields
      pilot.state = MechStateEnum.NORMAL
    }
  } else if (pilot.state === MechStateEnum.FALLING) {
    // Falling down pit animation
    if (!serverAuthoritative) {
      transform.position.y -= dt * 9.8
      transform.rotation = Quaternion.multiply(
        transform.rotation,
        Quaternion.fromEulerDegrees(dt * 180, dt * 240, 0)
      )
      pilot.stateTimer -= dt
    }
    if (!serverAuthoritative && pilot.stateTimer <= 0) {
      pilot.deaths++
      exitMech()
      return
    }
    return // Skip normal movement while falling
  }

  // 2. Keyboard & Touch Inputs
  const isImmobilized = pilot.state === MechStateEnum.REPAIRING || pilot.state === MechStateEnum.FALLING
  let networkMoveDir = 0
  let networkTurnDir = 0

  if (!isImmobilized) {
    // Chassis Turn (A / D)
    const turnSpeed = robotClass.turnSpeed
    const leftPressed = inputSystem.isPressed(InputAction.IA_LEFT)
    const rightPressed = inputSystem.isPressed(InputAction.IA_RIGHT)
    const keyboardTurn = (leftPressed ? -1 : 0) + (rightPressed ? 1 : 0)
    const turnAxis = isMobile() ? avatarTurnAxis : keyboardTurn
    if (turnAxis < 0) {
      pilot.chassisYaw -= turnSpeed * dt
    }
    if (turnAxis > 0) {
      pilot.chassisYaw += turnSpeed * dt
    }
    networkTurnDir = Math.max(-1, Math.min(1, turnAxis))

    // Chassis Forward / Backward (W / S)
    const moveSpeed = robotClass.moveSpeed
    let moveDelta = 0
    const forwardPressed = inputSystem.isPressed(InputAction.IA_FORWARD)
    const backwardPressed = inputSystem.isPressed(InputAction.IA_BACKWARD)
    const keyboardMove = (forwardPressed ? 1 : 0) + (backwardPressed ? -1 : 0)
    const moveAxis = isMobile() ? avatarMoveAxis : keyboardMove
    if (moveAxis > 0) {
      moveDelta += moveSpeed * dt * moveAxis
    }
    if (moveAxis < 0) {
      moveDelta += moveSpeed * 0.6 * dt * moveAxis // Reverse is 60% speed
    }
    networkMoveDir = Math.max(-1, Math.min(1, moveAxis))

    // Spacebar Thruster Dash
    if (inputSystem.isPressed(InputAction.IA_JUMP) && pilot.dashCooldown <= 0) {
      moveDelta += robotClass.dashDistance
      pilot.dashCooldown = robotClass.dashCooldown
      netSendAction('dash')
    }

    // Compute prospective movement
    const rad = (pilot.chassisYaw * Math.PI) / 180
    const forwardX = Math.sin(rad)
    const forwardZ = Math.cos(rad)

    const nextX = transform.position.x + forwardX * moveDelta
    const nextZ = transform.position.z + forwardZ * moveDelta

    // Boundary check (keep inside 64x64 arena)
    const clampedX = Math.max(2.5, Math.min(61.5, nextX))
    const clampedZ = Math.max(2.5, Math.min(61.5, nextZ))

    // Obstacle collision check
    let obstructed = false
    for (const [_, obs] of engine.getEntitiesWith(Obstacle)) {
      if (clampedX >= obs.minX - 1.2 && clampedX <= obs.maxX + 1.2 &&
          clampedZ >= obs.minZ - 1.2 && clampedZ <= obs.maxZ + 1.2) {
        obstructed = true
        break
      }
    }

    // Predict local movement immediately in multiplayer too. Server snapshots
    // reconcile this position in networkClient instead of moving the camera in
    // discrete 20 Hz steps.
    if (!obstructed) {
      transform.position.x = clampedX
      transform.position.z = clampedZ
    }

    // Apply rotation
    transform.rotation = Quaternion.fromEulerDegrees(0, pilot.chassisYaw + 180, 0)

    // Check Bottomless Pits
    for (const [_, pit] of serverAuthoritative ? [] : engine.getEntitiesWith(PitHazard)) {
      const dist = Math.hypot(transform.position.x - pit.centerX, transform.position.z - pit.centerZ)
      if (dist < pit.radius * 0.85) {
        pilot.state = MechStateEnum.FALLING
        pilot.stateTimer = 2.0
        console.log('Mech fell into Bottomless Pit!')
        return
      }
    }
  }

  updateAimAndBarrel(pilot, transform.position)

  updateTurretVisual(pilot.turretYaw, pilot.chassisYaw, pilot.turretPitch)

  netSendInput(networkMoveDir, networkTurnDir, pilot.turretYaw, pilot.turretPitch)

  // 3. Combat Action Inputs
  // Decentraland's fixed keyboard actions map E to IA_PRIMARY and F to IA_SECONDARY.
  if (inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)) repairRequested = true
  if (inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)) reloadRequested = true
  if (reloadRequested && pilot.state === MechStateEnum.NORMAL && pilot.ammo < pilot.maxAmmo) {
    netSendAction('reload')
    if (!serverAuthoritative) {
      pilot.state = MechStateEnum.RELOADING
      pilot.stateTimer = robotClass.reloadTime
    }
  }
  if (repairRequested && pilot.state === MechStateEnum.NORMAL && pilot.shields < pilot.maxShields) {
    netSendAction('repair')
    if (!serverAuthoritative) {
      pilot.state = MechStateEnum.REPAIRING
      pilot.stateTimer = robotClass.repairTime
    }
  }
  reloadRequested = false
  repairRequested = false

  // Exit Mech [1]
  if (inputSystem.isPressed(InputAction.IA_ACTION_3)) {
    exitMech()
    return
  }

  // Fire Lasers [LMB / Pointer]
  lastShotTime += dt
  if (inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN)) {
    // Mobile firing is controlled by the HUD button; desktop uses pointer fire.
    if (!isMobile()) fireRequested = true
  }
  if (pilot.state !== MechStateEnum.NORMAL) fireRequested = false
  const fireInput = fireRequested
  if (fireInput && pilot.state === MechStateEnum.NORMAL && lastShotTime >= robotClass.fireInterval) {
    if (serverAuthoritative) {
      netSendAction('fire')
      lastShotTime = 0
      if (!isMobile()) fireRequested = false
    } else if (pilot.ammo > 0) {
      const shotCost = robotClass.shotStyle === 'burst' ? 3 : 1
      if (pilot.ammo < shotCost) {
        pilot.state = MechStateEnum.RELOADING
        pilot.stateTimer = robotClass.reloadTime
        return
      }
      pilot.ammo -= shotCost
      lastShotTime = 0
      if (!isMobile()) fireRequested = false
      netSendAction('fire')
      firePlayerLasers(transform.position, pilot.turretYaw, robotClass.shotStyle, robotClass.damage)

      // Automatic Reload when last shot is fired
      if (pilot.ammo === 0) {
        pilot.state = MechStateEnum.RELOADING
        pilot.stateTimer = robotClass.reloadTime
        console.log('Last shot fired! Auto-reloading weapons (3.0s waiting time)...')
      }
    } else {
      // If clicking with 0 ammo, trigger reload automatically
      pilot.state = MechStateEnum.RELOADING
      pilot.stateTimer = robotClass.reloadTime
      console.log('Ammo empty! Auto-reloading weapons (3.0s waiting time)...')
    }
  }
}

function normalizeYaw(yaw: number): number {
  return ((yaw % 360) + 540) % 360 - 180
}

function updateTurretVisual(turretYaw: number, chassisYaw: number, turretPitch: number): void {
  if (!playerTurretEntity || !Transform.has(playerTurretEntity)) return
  Transform.getMutable(playerTurretEntity).rotation = Quaternion.fromEulerDegrees(
    turretPitch,
    normalizeYaw(turretYaw - chassisYaw),
    0
  )
}

function updateAimAndBarrel(pilot: { turretYaw: number; turretPitch: number; chassisYaw: number; classId: string }, mechPosition: Vector3): void {
  const pointer = PrimaryPointerInfo.getOrNull(engine.RootEntity)
  let deltaX = 0
  let deltaY = 0

  if (isMobile()) {
    // Derive touch drag from position samples. Only the right half is an aim
    // zone, leaving the left side for movement controls and avoiding HUD taps.
    const position = pointer?.screenCoordinates
    const canvasWidth = UiCanvasInformation.getOrNull(engine.RootEntity)?.width ?? 1920
    if (position && position.x >= canvasWidth * 0.5) {
      if (lastAimPointer) {
        deltaX = position.x - lastAimPointer.x
        deltaY = position.y - lastAimPointer.y
      }
      lastAimPointer = { x: position.x, y: position.y }
      smoothedMobileAimX += (deltaX - smoothedMobileAimX) * MOBILE_AIM_SMOOTHING
      smoothedMobileAimY += (deltaY - smoothedMobileAimY) * MOBILE_AIM_SMOOTHING
      deltaX = smoothedMobileAimX
      deltaY = smoothedMobileAimY
    } else {
      lastAimPointer = undefined
      smoothedMobileAimX = 0
      smoothedMobileAimY = 0
    }
  } else {
    // The desktop cursor is locked while piloting, so screenDelta gives smooth
    // mouse-look without moving the centered reticle toward a screen edge.
    const movement = pointer?.screenDelta
    if (movement) {
      deltaX = movement.x
      deltaY = movement.y
    }
  }

  // Bound a single-frame spike while preserving quick swipes.
  deltaX = Math.max(-120, Math.min(120, deltaX))
  deltaY = Math.max(-120, Math.min(120, deltaY))
  // SDK touch coordinates run opposite the intended camera yaw on mobile.
  // Keep desktop mouse-look behavior unchanged.
  const aimDirection = isMobile() ? -1 : 1
  const sensitivity = isMobile() ? MOBILE_AIM_SENSITIVITY * mobileAimSensitivity : AIM_SENSITIVITY
  cameraAimYaw = normalizeYaw(cameraAimYaw + deltaX * sensitivity * aimDirection)
  aimPitch = Math.max(MIN_AIM_PITCH, Math.min(MAX_AIM_PITCH, aimPitch + deltaY * sensitivity))

  // Aim the camera ray at a distant point, then converge the gun from its muzzle
  // toward that point. This compensates for the third-person camera sitting behind
  // and above the robot, so the centered reticle and barrel agree.
  const cameraYawRad = (cameraAimYaw * Math.PI) / 180
  const cameraPitchRad = (aimPitch * Math.PI) / 180
  const chassisRad = (pilot.chassisYaw * Math.PI) / 180
  const cameraX = mechPosition.x - Math.sin(chassisRad) * 6.5
  const cameraY = mechPosition.y + 3.2
  const cameraZ = mechPosition.z - Math.cos(chassisRad) * 6.5
  const rayX = Math.sin(cameraYawRad) * Math.cos(cameraPitchRad)
  const rayY = -Math.sin(cameraPitchRad)
  const rayZ = Math.cos(cameraYawRad) * Math.cos(cameraPitchRad)
  const weaponRange = ROBOT_CLASSES[pilot.classId as RobotClassId]?.range ?? ROBOT_CLASSES.bastion.range
  const aimDistance = weaponRange + 6.5
  const targetX = cameraX + rayX * aimDistance
  const targetY = cameraY + rayY * aimDistance
  const targetZ = cameraZ + rayZ * aimDistance
  const barrelX = targetX - mechPosition.x
  const barrelY = targetY - (mechPosition.y + MUZZLE_HEIGHT)
  const barrelZ = targetZ - mechPosition.z
  pilot.turretYaw = normalizeYaw((Math.atan2(barrelX, barrelZ) * 180) / Math.PI)
  pilot.turretPitch = Math.max(MIN_AIM_PITCH, Math.min(MAX_AIM_PITCH,
    (Math.atan2(-barrelY, Math.hypot(barrelX, barrelZ)) * 180) / Math.PI))

  if (mechCameraEntity && Transform.has(mechCameraEntity)) {
    const camera = Transform.getMutable(mechCameraEntity)
    camera.rotation = Quaternion.fromEulerDegrees(aimPitch, normalizeYaw(cameraAimYaw - pilot.chassisYaw + 180), 0)
  }
}

function firePlayerLasers(origin: Vector3, yawDeg: number, style: string, damage: number) {
  const rad = (yawDeg * Math.PI) / 180
  const pitchRad = (playerMechEntity ? MechPilot.getOrNull(playerMechEntity)?.turretPitch ?? 0 : 0) * Math.PI / 180
  const horizontalScale = Math.cos(pitchRad)
  const dirX = Math.sin(rad) * horizontalScale
  const dirY = -Math.sin(pitchRad)
  const dirZ = Math.cos(rad) * horizontalScale
  const muzzleX = origin.x + dirX * MUZZLE_FORWARD_DISTANCE
  const muzzleZ = origin.z + dirZ * MUZZLE_FORWARD_DISTANCE
  const muzzleY = origin.y + MUZZLE_HEIGHT + dirY * MUZZLE_FORWARD_DISTANCE

  if (style === 'burst' || style === 'scatter') {
    for (let i = -1; i <= 1; i++) {
      const yawOffset = i * (style === 'scatter' ? 8 : 2)
      const shotRad = ((yawDeg + yawOffset) * Math.PI) / 180
      const pelletDamage = style === 'scatter' ? damage / 3 : damage
      spawnLaserBeam(muzzleX, muzzleY, muzzleZ, Math.sin(shotRad) * horizontalScale, dirY, Math.cos(shotRad) * horizontalScale, true, pelletDamage)
    }
  } else {
    spawnLaserBeam(muzzleX, muzzleY, muzzleZ, dirX, dirY, dirZ, true, damage)
  }
}

export function spawnLaserBeam(x: number, y: number, z: number, dirX: number, dirY: number, dirZ: number, isPlayer: boolean, damage = 1) {
  const beam = engine.addEntity()
  Transform.create(beam, {
    position: Vector3.create(x, y, z),
    scale: Vector3.create(0.12, 0.12, 1.8),
    rotation: Quaternion.fromEulerDegrees(
      (Math.atan2(-dirY, Math.hypot(dirX, dirZ)) * 180) / Math.PI,
      (Math.atan2(dirX, dirZ) * 180) / Math.PI,
      0
    )
  })
  MeshRenderer.setCylinder(beam)
  Material.setPbrMaterial(beam, {
    albedoColor: isPlayer ? Color4.create(0.0, 0.9, 1.0, 1) : Color4.create(1.0, 0.1, 0.1, 1),
    emissiveColor: isPlayer ? Color4.create(0.0, 0.9, 1.0, 1) : Color4.create(1.0, 0.2, 0.2, 1)
  })

  LaserProjectile.create(beam, {
    lifetime: 1.5,
    damage,
    shooterIsPlayer: isPlayer,
    dirX: dirX,
    dirY: dirY,
    dirZ: dirZ,
    speed: 46.0
  })
}
