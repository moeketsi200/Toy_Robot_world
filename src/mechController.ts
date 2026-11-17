import {
  engine,
  Entity,
  Transform,
  GltfContainer,
  VirtualCamera,
  MainCamera,
  InputModifier,
  inputSystem,
  InputAction,
  MeshRenderer,
  Material
} from '@dcl/sdk/ecs'
import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import { MechPilot, MechStateEnum, Obstacle, PitHazard, LaserProjectile } from './components'
import { initNetworkClient, netSendInput, netSendAction, netSelectRobot, netJoinWar, netLeaveWar, disconnectNetworkClient, isMultiplayerConnected } from './networkClient'
import { ROBOT_CLASSES, RobotClassId } from '../server/src/types'
import { canUseRobotInMode, getGameMode, GameMode, setGameMode } from './gameMode'

export let playerMechEntity: Entity | null = null
export let mechCameraEntity: Entity | null = null

let lastShotTime = 0
const SHOT_COOLDOWN = 0.35
let selectedClassId: RobotClassId = 'bastion'

export function getSelectedClassId(): RobotClassId {
  return selectedClassId
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
    src: 'assets/models/mech_bastion.glb'
  })

  MechPilot.create(playerMechEntity, {
    isPiloting: false,
    classId: 'bastion',
    chassisYaw: 0,
    turretYaw: 0,
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

  // Create VirtualCamera attached behind the mech
  mechCameraEntity = engine.addEntity()
  Transform.create(mechCameraEntity, {
    position: Vector3.create(0, 3.2, -6.5),
    rotation: Quaternion.fromEulerDegrees(14, 0, 0),
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

  // Spawn mech at arena start position
  Transform.getMutable(playerMechEntity).position = Vector3.create(32, 0.1, 14)
  Transform.getMutable(playerMechEntity).rotation = Quaternion.fromEulerDegrees(0, 0, 0)

  // Activate virtual camera
  MainCamera.createOrReplace(engine.CameraEntity, {
    virtualCameraEntity: mechCameraEntity
  })

  // Lock default avatar locomotion
  InputModifier.createOrReplace(engine.PlayerEntity, {
    mode: {
      $case: 'standard',
      standard: {
        disableAll: true
      }
    }
  })

  if (getGameMode() === 'multiplayer') netJoinWar(selectedClassId)

  console.log(`Player boarded ${robotClass.name} Combat Mech!`)
}

export function exitMech() {
  if (!playerMechEntity) return

  const pilot = MechPilot.getMutable(playerMechEntity)
  pilot.isPiloting = false
  pilot.state = MechStateEnum.NORMAL

  if (getGameMode() === 'multiplayer') netLeaveWar()

  // Move mech underground
  Transform.getMutable(playerMechEntity).position = Vector3.create(16, -100, 16)

  // Restore camera & player locomotion
  MainCamera.deleteFrom(engine.CameraEntity)
  InputModifier.deleteFrom(engine.PlayerEntity)
  console.log('Player exited mech, returned to Hangar.')
}

export function mechControlSystem(dt: number) {
  if (!playerMechEntity) return
  const pilot = MechPilot.getMutableOrNull(playerMechEntity)
  if (!pilot || !pilot.isPiloting) return

  const transform = Transform.getMutable(playerMechEntity)
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
    if (inputSystem.isPressed(InputAction.IA_LEFT)) {
      pilot.chassisYaw -= turnSpeed * dt
      networkTurnDir -= 1
    }
    if (inputSystem.isPressed(InputAction.IA_RIGHT)) {
      pilot.chassisYaw += turnSpeed * dt
      networkTurnDir += 1
    }

    // Chassis Forward / Backward (W / S)
    const moveSpeed = robotClass.moveSpeed
    let moveDelta = 0
    if (inputSystem.isPressed(InputAction.IA_FORWARD)) {
      moveDelta += moveSpeed * dt
      networkMoveDir += 1
    }
    if (inputSystem.isPressed(InputAction.IA_BACKWARD)) {
      moveDelta -= moveSpeed * 0.6 * dt // Reversing is 60% speed
      networkMoveDir -= 1
    }

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

    if (!obstructed && !serverAuthoritative) {
      transform.position.x = clampedX
      transform.position.z = clampedZ
    }

    // Apply rotation
    if (!serverAuthoritative) transform.rotation = Quaternion.fromEulerDegrees(0, pilot.chassisYaw, 0)

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

  netSendInput(networkMoveDir, networkTurnDir, pilot.turretYaw || pilot.chassisYaw)

  // 3. Combat Action Inputs
  // Reload [E]
  if (inputSystem.isPressed(InputAction.IA_PRIMARY) && pilot.state === MechStateEnum.NORMAL && pilot.ammo < pilot.maxAmmo) {
    netSendAction('reload')
    if (!serverAuthoritative) {
      pilot.state = MechStateEnum.RELOADING
      pilot.stateTimer = robotClass.reloadTime
      console.log(`Reloading ammo (${robotClass.reloadTime}s)...`)
    }
  }

  // Repair [F]
  if (inputSystem.isPressed(InputAction.IA_SECONDARY) && pilot.state === MechStateEnum.NORMAL && pilot.shields < pilot.maxShields) {
    netSendAction('repair')
    if (!serverAuthoritative) {
      pilot.state = MechStateEnum.REPAIRING
      pilot.stateTimer = robotClass.repairTime
      console.log(`Repairing shields (${robotClass.repairTime}s immobilized)...`)
    }
  }

  // Exit Mech [1]
  if (inputSystem.isPressed(InputAction.IA_ACTION_3)) {
    exitMech()
    return
  }

  // Fire Lasers [LMB / Pointer]
  lastShotTime += dt
  if (inputSystem.isPressed(InputAction.IA_POINTER) && pilot.state === MechStateEnum.NORMAL && lastShotTime >= robotClass.fireInterval) {
    if (serverAuthoritative) {
      netSendAction('fire')
      lastShotTime = 0
    } else if (pilot.ammo > 0) {
      const shotCost = robotClass.shotStyle === 'burst' ? 3 : 1
      if (pilot.ammo < shotCost) {
        pilot.state = MechStateEnum.RELOADING
        pilot.stateTimer = robotClass.reloadTime
        return
      }
      pilot.ammo -= shotCost
      lastShotTime = 0
      netSendAction('fire')
      firePlayerLasers(transform.position, pilot.chassisYaw, robotClass.shotStyle, robotClass.damage)

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

function firePlayerLasers(origin: Vector3, yawDeg: number, style: string, damage: number) {
  const rad = (yawDeg * Math.PI) / 180
  const dirX = Math.sin(rad)
  const dirZ = Math.cos(rad)

  if (style === 'burst' || style === 'scatter') {
    for (let i = -1; i <= 1; i++) {
      const yawOffset = i * (style === 'scatter' ? 8 : 2)
      const shotRad = ((yawDeg + yawOffset) * Math.PI) / 180
      const pelletDamage = style === 'scatter' ? damage / 3 : damage
      spawnLaserBeam(origin.x, origin.y + 1.25, origin.z, Math.sin(shotRad), Math.cos(shotRad), true, pelletDamage)
    }
  } else {
    const width = style === 'charged' ? 0.08 : 0.6
    spawnLaserBeam(origin.x, origin.y + 1.25, origin.z, dirX, dirZ, true, damage)
  }
}

export function spawnLaserBeam(x: number, y: number, z: number, dirX: number, dirZ: number, isPlayer: boolean, damage = 1) {
  const beam = engine.addEntity()
  Transform.create(beam, {
    position: Vector3.create(x, y, z),
    scale: Vector3.create(0.12, 0.12, 1.8),
    rotation: Quaternion.fromEulerDegrees(0, (Math.atan2(dirX, dirZ) * 180) / Math.PI, 0)
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
    dirZ: dirZ,
    speed: 46.0
  })
}
