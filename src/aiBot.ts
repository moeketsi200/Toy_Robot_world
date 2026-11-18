import {
  engine,
  Entity,
  Transform,
  GltfContainer,
  TextShape,
  Billboard
} from '@dcl/sdk/ecs'
import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import { SentinelBot, MechPilot, MechStateEnum } from './components'
import { playerMechEntity, spawnLaserBeam } from './mechController'
import { getGameMode } from './gameMode'

interface BotConfig {
  id: string
  startPos: Vector3
  waypoints: Vector3[]
}

const BOTS_CONFIG: BotConfig[] = [
  {
    id: 'Sentinel-Alpha (Citadel)',
    startPos: Vector3.create(32, 0.1, 40),
    waypoints: [
      Vector3.create(22, 0.1, 24),
      Vector3.create(42, 0.1, 24),
      Vector3.create(42, 0.1, 44),
      Vector3.create(22, 0.1, 44)
    ]
  },
  {
    id: 'Sentinel-Bravo (West Flank)',
    startPos: Vector3.create(16, 0.1, 30),
    waypoints: [
      Vector3.create(12, 0.1, 18),
      Vector3.create(22, 0.1, 18),
      Vector3.create(22, 0.1, 48),
      Vector3.create(12, 0.1, 48)
    ]
  },
  {
    id: 'Sentinel-Charlie (East Flank)',
    startPos: Vector3.create(48, 0.1, 30),
    waypoints: [
      Vector3.create(42, 0.1, 18),
      Vector3.create(52, 0.1, 18),
      Vector3.create(52, 0.1, 48),
      Vector3.create(42, 0.1, 48)
    ]
  }
]

const botLabelMap = new Map<Entity, Entity>()
const botTurretMap = new Map<Entity, Entity>()
const botEntities = new Set<Entity>()
const BOT_MUZZLE_FORWARD = 2.75
const BOT_MUZZLE_HEIGHT = 2.7

export function initSentinelBot() {
  if (botEntities.size > 0) return

  for (const config of BOTS_CONFIG) {
    const botEnt = engine.addEntity()
    Transform.create(botEnt, {
      position: Vector3.clone(config.startPos),
      scale: Vector3.create(1, 1, 1)
    })
    GltfContainer.create(botEnt, {
      src: 'assets/models/mech_bastion_chassis.glb'
    })

    const turretEnt = engine.addEntity()
    Transform.create(turretEnt, {
      position: Vector3.create(0, 0, 0),
      rotation: Quaternion.fromEulerDegrees(0, 180, 0),
      parent: botEnt
    })
    GltfContainer.create(turretEnt, {
      src: 'assets/models/mech_bastion_turret.glb'
    })

    SentinelBot.create(botEnt, {
      id: config.id,
      patrolIndex: 0,
      shields: 5,
      maxShields: 5,
      shootCooldown: 2.5 + Math.random() * 1.5,
      isAlive: true,
      respawnTimer: 0
    })

    // Overhead 3D status billboard
    const labelEnt = engine.addEntity()
    Transform.create(labelEnt, {
      position: Vector3.create(0, 3.2, 0),
      parent: botEnt
    })
    Billboard.create(labelEnt)
    TextShape.create(labelEnt, {
      text: `${config.id}\n[SHIELDS: ■■■■■]`,
      fontSize: 2.8,
      textColor: Color4.create(1.0, 0.25, 0.25, 1)
    })

    botLabelMap.set(botEnt, labelEnt)
    botTurretMap.set(botEnt, turretEnt)
    botEntities.add(botEnt)
  }
}

export function sentinelAiSystem(dt: number) {
  if (getGameMode() !== 'solo') {
    removeSentinelBots()
    return
  }

  // Get player position
  let playerPos: Vector3 | null = null
  let playerIsTargetable = false

  if (playerMechEntity) {
    const pilot = MechPilot.getOrNull(playerMechEntity)
    if (pilot && pilot.isPiloting && pilot.state !== MechStateEnum.FALLING) {
      playerPos = Transform.get(playerMechEntity).position
      playerIsTargetable = true
    }
  }

  // Keep bots out of the mode menu and spawn them only during active Solo play.
  if (!playerIsTargetable) {
    removeSentinelBots()
    return
  }
  if (botEntities.size === 0) initSentinelBot()

  let index = 0
  for (const [botEnt, bot] of engine.getEntitiesWith(SentinelBot)) {
    const config = BOTS_CONFIG[index % BOTS_CONFIG.length]
    index++

    const botTransform = Transform.getMutable(botEnt)
    const mutBot = SentinelBot.getMutable(botEnt)

    // Respawn logic
    if (!mutBot.isAlive) {
      mutBot.respawnTimer -= dt
      if (mutBot.respawnTimer <= 0) {
        mutBot.isAlive = true
        mutBot.shields = mutBot.maxShields
        botTransform.position = Vector3.clone(config.startPos)
        updateBotLabel(botEnt, mutBot.id, mutBot.shields, mutBot.maxShields)
        console.log(`${mutBot.id} respawned into the war zone!`)
      }
      continue
    }

    // Combat Targeting
    let distanceToPlayer = 999
    if (playerPos) {
      distanceToPlayer = Math.hypot(botTransform.position.x - playerPos.x, botTransform.position.z - playerPos.z)
    }

    if (playerIsTargetable && playerPos && distanceToPlayer <= 32) {
      // Face player
      const dx = playerPos.x - botTransform.position.x
      const dz = playerPos.z - botTransform.position.z
      const angleRad = Math.atan2(dx, dz)
      botTransform.rotation = Quaternion.fromEulerDegrees(0, (angleRad * 180) / Math.PI + 180, 0)
      aimBotTurret(botEnt)

      // Shoot countdown
      mutBot.shootCooldown -= dt
      if (mutBot.shootCooldown <= 0) {
        mutBot.shootCooldown = 3.0 + Math.random() * 0.8
        const dirX = Math.sin(angleRad)
        const dirZ = Math.cos(angleRad)
        spawnLaserBeam(
          botTransform.position.x + dirX * BOT_MUZZLE_FORWARD,
          botTransform.position.y + BOT_MUZZLE_HEIGHT,
          botTransform.position.z + dirZ * BOT_MUZZLE_FORWARD,
          dirX,
          0,
          dirZ,
          false
        )
      }
    } else {
      // Patrol waypoints
      const targetWp = config.waypoints[mutBot.patrolIndex % config.waypoints.length]
      const dx = targetWp.x - botTransform.position.x
      const dz = targetWp.z - botTransform.position.z
      const distToWp = Math.hypot(dx, dz)

      if (distToWp < 1.5) {
        mutBot.patrolIndex = (mutBot.patrolIndex + 1) % config.waypoints.length
      } else {
        const angleRad = Math.atan2(dx, dz)
        botTransform.rotation = Quaternion.fromEulerDegrees(0, (angleRad * 180) / Math.PI + 180, 0)
        aimBotTurret(botEnt)

        const patrolSpeed = 4.2
        botTransform.position.x += Math.sin(angleRad) * patrolSpeed * dt
        botTransform.position.z += Math.cos(angleRad) * patrolSpeed * dt
      }
    }
  }
}

function removeSentinelBots(): void {
  for (const botEnt of botEntities) {
    const labelEnt = botLabelMap.get(botEnt)
    if (labelEnt !== undefined) engine.removeEntity(labelEnt)
    const turretEnt = botTurretMap.get(botEnt)
    if (turretEnt !== undefined) engine.removeEntity(turretEnt)
    engine.removeEntity(botEnt)
    botLabelMap.delete(botEnt)
    botTurretMap.delete(botEnt)
  }
  botEntities.clear()
}

function aimBotTurret(botEnt: Entity): void {
  const turret = botTurretMap.get(botEnt)
  if (turret === undefined) return
  Transform.getMutable(turret).rotation = Quaternion.fromEulerDegrees(0, 0, 0)
}

export function damageBot(botEnt: Entity, damage: number) {
  const bot = SentinelBot.getMutableOrNull(botEnt)
  if (!bot || !bot.isAlive) return

  bot.shields = Math.max(0, bot.shields - damage)
  updateBotLabel(botEnt, bot.id, bot.shields, bot.maxShields)

  if (bot.shields <= 0) {
    bot.isAlive = false
    bot.respawnTimer = 6.0
    // Move underwater/underground while waiting to respawn
    Transform.getMutable(botEnt).position.y = -100

    if (playerMechEntity) {
      const pilot = MechPilot.getMutableOrNull(playerMechEntity)
      if (pilot) pilot.kills++
    }
    console.log(`${bot.id} DESTROYED! Respawning in 6s...`)
  }
}

function updateBotLabel(botEnt: Entity, botId: string, current: number, max: number) {
  const labelEnt = botLabelMap.get(botEnt)
  if (!labelEnt) return
  const label = TextShape.getMutableOrNull(labelEnt)
  if (!label) return

  let pips = ''
  for (let i = 0; i < max; i++) {
    pips += i < current ? '■' : '□'
  }
  label.text = `${botId}\n[SHIELDS: ${pips}]`
}
