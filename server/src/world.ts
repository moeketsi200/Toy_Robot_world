import { RobotState, ClientCommand, GameEvent, WorldTickPacket, RobotClassId, ROBOT_CLASSES } from './types'

interface BoxCollider {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

interface PitCollider {
  centerX: number
  centerZ: number
  radius: number
}

export class GameWorld {
  private tickCount = 0
  public robots = new Map<string, RobotState>()
  private clientInputs = new Map<string, { moveDir: number; turnDir: number; turretYaw: number; turretPitch: number }>()
  private lastFireAt = new Map<string, number>()
  private unlockedRobots = new Map<string, Set<RobotClassId>>()
  private classLocked = new Set<string>()
  private pendingEvents: GameEvent[] = []

  // 4x4 Arena Obstacles (exact match with client)
  private obstacles: BoxCollider[] = [
    this.createBox(28, 32, 3.2, 1.2),
    this.createBox(36, 32, 3.2, 1.2),
    this.createBox(18, 20, 3.2, 1.2),
    this.createBox(24, 16, 1.2, 3.2),
    this.createBox(46, 20, 3.2, 1.2),
    this.createBox(40, 16, 1.2, 3.2),
    this.createBox(18, 44, 3.2, 1.2),
    this.createBox(24, 48, 1.2, 3.2),
    this.createBox(46, 44, 3.2, 1.2),
    this.createBox(40, 48, 1.2, 3.2),
    this.createBox(10, 32, 1.2, 3.5),
    this.createBox(54, 32, 1.2, 3.5),
    this.createBox(32, 52, 3.5, 1.2)
  ]

  // Bottomless Pits
  private pits: PitCollider[] = [
    { centerX: 24, centerZ: 26, radius: 2.8 },
    { centerX: 40, centerZ: 26, radius: 2.8 },
    { centerX: 24, centerZ: 38, radius: 2.8 },
    { centerX: 40, centerZ: 38, radius: 2.8 }
  ]

  constructor() {
    // Multiplayer matches are player-versus-player; local solo practice owns its AI bots.
  }

  private createBox(x: number, z: number, sx: number, sz: number): BoxCollider {
    return {
      minX: x - sx / 2,
      maxX: x + sx / 2,
      minZ: z - sz / 2,
      maxZ: z + sz / 2
    }
  }

  public registerPlayer(robotId: string, name: string, unlocked: RobotClassId[] = ['bastion']): RobotState {
    const allowed = new Set<RobotClassId>(['bastion', ...unlocked])
    this.unlockedRobots.set(robotId, allowed)
    const classId: RobotClassId = 'bastion'
    const robotClass = ROBOT_CLASSES[classId]
    const robot: RobotState = {
      id: robotId,
      classId,
      name: name || `Pilot_${robotId.slice(0, 4)}`,
      isBot: false,
      x: 32 + (Math.random() - 0.5) * 6,
      z: 14 + (Math.random() - 0.5) * 4,
      chassisYaw: 0,
      turretYaw: 0,
      turretPitch: 4.5,
      shields: robotClass.maxShields,
      maxShields: robotClass.maxShields,
      ammo: robotClass.maxAmmo,
      maxAmmo: robotClass.maxAmmo,
      state: 'NORMAL',
      stateTimer: 0,
      dashCooldown: 0,
      kills: 0,
      deaths: 0
    }
    this.robots.set(robotId, robot)
    this.clientInputs.set(robotId, { moveDir: 0, turnDir: 0, turretYaw: 0, turretPitch: 4.5 })
    console.log(`[WORLD] Registered new player: ${robot.name} (${robotId})`)
    return robot
  }

  public removePlayer(robotId: string) {
    this.robots.delete(robotId)
    this.clientInputs.delete(robotId)
    this.lastFireAt.delete(robotId)
    this.unlockedRobots.delete(robotId)
    this.classLocked.delete(robotId)
    console.log(`[WORLD] Player left: ${robotId}`)
  }

  public handleCommand(cmd: ClientCommand) {
    const robot = this.robots.get(cmd.robotId)
    if (!robot) return

    if (cmd.type === 'JOIN') {
      robot.name = cmd.payload.name.slice(0, 24) || robot.name
      const desiredClass = cmd.payload.classId ?? 'bastion'
      if (!this.classLocked.has(robot.id)) {
        if (this.unlockedRobots.get(robot.id)?.has(desiredClass)) this.setRobotClass(robot, desiredClass)
      }
    } else if (cmd.type === 'INPUT') {
      if (cmd.payload.moveDir !== 0 || cmd.payload.turnDir !== 0) this.classLocked.add(robot.id)
      const inputs = this.clientInputs.get(cmd.robotId)
      if (inputs) {
        inputs.moveDir = Math.max(-1, Math.min(1, cmd.payload.moveDir))
        inputs.turnDir = Math.max(-1, Math.min(1, cmd.payload.turnDir))
        inputs.turretYaw = ((cmd.payload.turretYaw % 360) + 360) % 360
        inputs.turretPitch = Math.max(-10, Math.min(55, cmd.payload.turretPitch ?? 0))
      }
    } else if (cmd.type === 'ACTION') {
      this.classLocked.add(robot.id)
      this.executeAction(robot, cmd.payload.action)
    }
  }

  private setRobotClass(robot: RobotState, classId: RobotClassId) {
    const robotClass = ROBOT_CLASSES[classId]
    robot.classId = classId
    robot.maxShields = robotClass.maxShields
    robot.shields = robotClass.maxShields
    robot.maxAmmo = robotClass.maxAmmo
    robot.ammo = robotClass.maxAmmo
  }

  private executeAction(robot: RobotState, action: string) {
    const robotClass = ROBOT_CLASSES[robot.classId]
    if (action === 'fire' && robot.state === 'NORMAL') {
      const shotCost = robotClass.shotStyle === 'burst' ? 3 : 1
      const now = Date.now()
      const lastShot = this.lastFireAt.get(robot.id) ?? 0
      if (robot.ammo >= shotCost && now - lastShot >= robotClass.fireInterval * 1000) {
        robot.ammo -= shotCost
        this.lastFireAt.set(robot.id, now)
        if (robotClass.shotStyle === 'burst' || robotClass.shotStyle === 'scatter') {
          this.processLaserFire(robot, -2)
          this.processLaserFire(robot, 0)
          this.processLaserFire(robot, 2)
        } else {
          this.processLaserFire(robot)
        }

        // Auto reload if out of ammo
        if (robot.ammo === 0) {
          robot.state = 'RELOADING'
          robot.stateTimer = robotClass.reloadTime
        }
      }
    } else if (action === 'reload' && robot.state === 'NORMAL' && robot.ammo < robot.maxAmmo) {
      robot.state = 'RELOADING'
      robot.stateTimer = robotClass.reloadTime
    } else if (action === 'repair' && robot.state === 'NORMAL' && robot.shields < robot.maxShields) {
      robot.state = 'REPAIRING'
      robot.stateTimer = robotClass.repairTime
    } else if (action === 'dash' && robot.state === 'NORMAL' && robot.dashCooldown <= 0) {
      robot.dashCooldown = robotClass.dashCooldown
      const rad = (robot.chassisYaw * Math.PI) / 180
      this.tryMove(robot, Math.sin(rad) * robotClass.dashDistance, Math.cos(rad) * robotClass.dashDistance)
    }
  }

  private processLaserFire(shooter: RobotState, offsetDegrees = 0) {
    const shooterClass = ROBOT_CLASSES[shooter.classId]
    const rad = ((shooter.turretYaw + offsetDegrees) * Math.PI) / 180
    const pitchRad = ((shooter.turretPitch ?? 0) * Math.PI) / 180
    const horizontalScale = Math.cos(pitchRad)
    const dirX = Math.sin(rad) * horizontalScale
    const dirY = -Math.sin(pitchRad)
    const dirZ = Math.cos(rad) * horizontalScale

    const muzzleForward = 2.75
    const rayDistance = shooterClass.range - muzzleForward
    const originX = shooter.x + dirX * muzzleForward
    const originZ = shooter.z + dirZ * muzzleForward
    const originY = 2.8 + dirY * muzzleForward
    const origin: [number, number, number] = [originX, originY, originZ]
    let impactX = originX + dirX * rayDistance
    let impactY = originY + dirY * rayDistance
    let impactZ = originZ + dirZ * rayDistance
    let hitTarget: RobotState | null = null

    // Raycast check: Step forward along ray in 0.5m increments
    for (let d = 0; d <= rayDistance; d += 0.5) {
      const cx = originX + dirX * d
      const cy = originY + dirY * d
      const cz = originZ + dirZ * d

      if (cy <= 0.2) {
        impactX = cx
        impactY = Math.max(0, cy)
        impactZ = cz
        break
      }

      // Check Obstacles
      let blocked = false
      for (const obs of this.obstacles) {
        if (cy <= 5.5 && cx >= obs.minX && cx <= obs.maxX && cz >= obs.minZ && cz <= obs.maxZ) {
          impactX = cx
          impactY = cy
          impactZ = cz
          blocked = true
          break
        }
      }
      if (blocked) break

      // Check Enemy Robots
      for (const [id, target] of this.robots) {
        if (id === shooter.id || target.state === 'FALLING' || target.state === 'DESTROYED') continue
        const dist = Math.hypot(cx - target.x, cy - 2.8, cz - target.z)
        const falloff = shooterClass.shotStyle === 'scatter'
          ? Math.max(0.35, 1 - (d + muzzleForward) / shooterClass.range)
          : 1
        if (dist < (shooterClass.shotStyle === 'scatter' ? 2.5 : 1.8)) {
          impactX = cx
          impactY = cy
          impactZ = cz
          hitTarget = target
          const damage = (shooterClass.shotStyle === 'burst' ? 0.5 : shooterClass.shotStyle === 'scatter' ? shooterClass.damage / 3 : shooterClass.damage) * falloff
          target.shields = Math.max(0, target.shields - damage)
          this.pendingEvents.push({ type: 'DAMAGE_TAKEN', shooterId: shooter.id, targetId: target.id, damage })
          if (target.shields === 0) {
            target.state = 'DESTROYED'
            target.stateTimer = 5
            target.deaths++
            shooter.kills++
            this.pendingEvents.push({ type: 'ROBOT_DESTROYED', targetId: target.id, shooterId: shooter.id })
          }
          if (shooterClass.shotStyle === 'chain') {
            for (const [otherId, other] of this.robots) {
              if (otherId !== target.id && otherId !== shooter.id && other.state !== 'DESTROYED' && other.state !== 'FALLING' && Math.hypot(other.x - target.x, other.z - target.z) <= 4) {
                other.shields = Math.max(0, other.shields - shooterClass.damage * 0.5)
                this.pendingEvents.push({ type: 'DAMAGE_TAKEN', shooterId: shooter.id, targetId: other.id, damage: shooterClass.damage * 0.5 })
                if (other.shields === 0) {
                  other.state = 'DESTROYED'
                  other.stateTimer = 5
                  other.deaths++
                  shooter.kills++
                  this.pendingEvents.push({ type: 'ROBOT_DESTROYED', targetId: other.id, shooterId: shooter.id })
                }
                break
              }
            }
          }
          break
        }
      }
      if (hitTarget) break
    }

    const event: GameEvent = {
      type: 'LASER_FIRED',
      shooterId: shooter.id,
      from: origin,
      to: [impactX, impactY, impactZ],
      targetId: hitTarget?.id,
      damage: hitTarget ? shooterClass.damage : 0
    }
    this.pendingEvents.push(event)

    void hitTarget
  }

  // 20Hz Tick Loop
  public update(dt: number): WorldTickPacket {
    this.tickCount++

    for (const [id, robot] of this.robots) {
      // Cooldowns
      if (robot.dashCooldown > 0) robot.dashCooldown = Math.max(0, robot.dashCooldown - dt)
      const robotClass = ROBOT_CLASSES[robot.classId]

      // State Timers
      if (robot.state === 'RELOADING') {
        robot.stateTimer -= dt
        if (robot.stateTimer <= 0) {
          robot.ammo = robot.maxAmmo
          robot.state = 'NORMAL'
        }
      } else if (robot.state === 'REPAIRING') {
        robot.stateTimer -= dt
        if (robot.stateTimer <= 0) {
          robot.shields = robot.maxShields
          robot.state = 'NORMAL'
        }
      } else if (robot.state === 'FALLING') {
        robot.stateTimer -= dt
        if (robot.stateTimer <= 0) {
          robot.deaths++
          robot.state = 'NORMAL'
          robot.shields = robot.maxShields
          robot.x = 32
          robot.z = 14
        }
        continue
      } else if (robot.state === 'DESTROYED') {
        robot.stateTimer -= dt
        if (robot.stateTimer <= 0) {
          robot.state = 'NORMAL'
          robot.shields = robot.maxShields
          robot.ammo = robot.maxAmmo
          robot.x = 32
          robot.z = 14
        }
        continue
      }

      // Movement handling
      if (!robot.isBot && robot.state !== 'REPAIRING') {
        const input = this.clientInputs.get(id)
        if (input) {
          // Turn
          robot.chassisYaw += input.turnDir * robotClass.turnSpeed * dt
          robot.chassisYaw = ((robot.chassisYaw % 360) + 360) % 360
          robot.turretYaw = input.turretYaw
          robot.turretPitch = input.turretPitch

          // Move
          if (input.moveDir !== 0) {
            const speed = input.moveDir > 0 ? robotClass.moveSpeed : robotClass.moveSpeed * 0.6
            const rad = (robot.chassisYaw * Math.PI) / 180
            this.tryMove(robot, Math.sin(rad) * speed * dt, Math.cos(rad) * speed * dt)
          }
        }
      } else {
        // AI Sentinel Bot Tick
        this.updateBot(robot, dt)
      }

      // Check Bottomless Pits
      for (const pit of this.pits) {
        const dist = Math.hypot(robot.x - pit.centerX, robot.z - pit.centerZ)
        if (dist < pit.radius * 0.85) {
          robot.state = 'FALLING'
          robot.stateTimer = 2.0
          this.pendingEvents.push({ type: 'PIT_FALL', targetId: robot.id })
          break
        }
      }
    }

    const packet: WorldTickPacket = {
      type: 'WORLD_TICK',
      tick: this.tickCount,
      timestamp: Date.now(),
      robots: Array.from(this.robots.values()),
      events: [...this.pendingEvents]
    }

    this.pendingEvents = [] // Reset tick events
    return packet
  }

  private tryMove(robot: RobotState, dx: number, dz: number) {
    const nextX = Math.max(2.5, Math.min(61.5, robot.x + dx))
    const nextZ = Math.max(2.5, Math.min(61.5, robot.z + dz))

    // Obstacle collision
    for (const obs of this.obstacles) {
      if (nextX >= obs.minX - 1.2 && nextX <= obs.maxX + 1.2 &&
          nextZ >= obs.minZ - 1.2 && nextZ <= obs.maxZ + 1.2) {
        return // Blocked
      }
    }

    robot.x = nextX
    robot.z = nextZ
  }

  private spawnBot(id: string, x: number, z: number) {
    const bot: RobotState = {
      id: id,
      classId: 'bastion',
      name: id,
      isBot: true,
      x: x,
      z: z,
      chassisYaw: 180,
      turretYaw: 180,
      turretPitch: 0,
      shields: 5,
      maxShields: 5,
      ammo: 999,
      maxAmmo: 999,
      state: 'NORMAL',
      stateTimer: 0,
      dashCooldown: 0,
      kills: 0,
      deaths: 0
    }
    this.robots.set(id, bot)
  }

  private updateBot(bot: RobotState, dt: number) {
    // Patrol around citadel
    const rad = (bot.chassisYaw * Math.PI) / 180
    this.tryMove(bot, Math.sin(rad) * 3.5 * dt, Math.cos(rad) * 3.5 * dt)

    // Random turn when near borders
    if (bot.x <= 15 || bot.x >= 48 || bot.z <= 20 || bot.z >= 50) {
      bot.chassisYaw += 90
    }
  }
}
