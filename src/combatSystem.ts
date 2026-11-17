import {
  engine,
  Transform
} from '@dcl/sdk/ecs'
import { LaserProjectile, Obstacle, SentinelBot, MechPilot, MechStateEnum } from './components'
import { damageBot } from './aiBot'
import { playerMechEntity, exitMech } from './mechController'
import { ROBOT_CLASSES, RobotClassId } from '../server/src/types'

export function combatSystem(dt: number) {
  for (const [entity, laser] of engine.getEntitiesWith(LaserProjectile)) {
    const transform = Transform.getMutable(entity)

    // Advance laser position
    transform.position.x += laser.dirX * laser.speed * dt
    transform.position.z += laser.dirZ * laser.speed * dt

    const mutLaser = LaserProjectile.getMutable(entity)
    mutLaser.lifetime -= dt

    let removeLaser = mutLaser.lifetime <= 0

    // 1. Collision with Obstacles
    for (const [_, obs] of engine.getEntitiesWith(Obstacle)) {
      if (transform.position.x >= obs.minX && transform.position.x <= obs.maxX &&
          transform.position.z >= obs.minZ && transform.position.z <= obs.maxZ) {
        removeLaser = true
        break
      }
    }

    // 2. Collision with Any Sentinel Bot (from player lasers)
    if (!removeLaser && laser.shooterIsPlayer) {
      for (const [botEnt, bot] of engine.getEntitiesWith(SentinelBot)) {
        if (bot.isAlive) {
          const botPos = Transform.get(botEnt).position
          const dist = Math.hypot(transform.position.x - botPos.x, transform.position.z - botPos.z)
          if (dist < 2.2) {
            removeLaser = true
            const pilot = playerMechEntity ? MechPilot.getOrNull(playerMechEntity) : null
            const robotClass = ROBOT_CLASSES[(pilot?.classId as RobotClassId) ?? 'bastion']
            damageBot(botEnt, laser.damage)
            break
          }
        }
      }
    }

    // 3. Collision with Player Mech (from bot lasers)
    if (!removeLaser && !laser.shooterIsPlayer && playerMechEntity) {
      const pilot = MechPilot.getMutableOrNull(playerMechEntity)
      if (pilot && pilot.isPiloting && pilot.state !== MechStateEnum.FALLING) {
        const playerPos = Transform.get(playerMechEntity).position
        const dist = Math.hypot(transform.position.x - playerPos.x, transform.position.z - playerPos.z)
        if (dist < 1.8) {
          removeLaser = true
          pilot.shields = Math.max(0, pilot.shields - laser.damage)
          console.log(`Player mech hit! Shields remaining: ${pilot.shields}/${pilot.maxShields}`)

          if (pilot.shields <= 0) {
            pilot.deaths++
            console.log('Player Mech DESTROYED! Returning to Hangar.')
            exitMech()
          }
        }
      }
    }

    if (removeLaser) {
      engine.removeEntity(entity)
    }
  }
}
