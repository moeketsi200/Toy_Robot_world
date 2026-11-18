import { Schemas, engine } from '@dcl/sdk/ecs'

export const MechStateEnum = {
  NORMAL: 0,
  RELOADING: 1,
  REPAIRING: 2,
  DASHING: 3,
  FALLING: 4,
  DESTROYED: 5
} as const

export const MechPilot = engine.defineComponent('mech-pilot', {
  isPiloting: Schemas.Boolean,
  classId: Schemas.String,
  chassisYaw: Schemas.Number,
  turretYaw: Schemas.Number,
  turretPitch: Schemas.Number,
  shields: Schemas.Number,
  maxShields: Schemas.Number,
  ammo: Schemas.Number,
  maxAmmo: Schemas.Number,
  state: Schemas.Number,
  stateTimer: Schemas.Number,
  dashCooldown: Schemas.Number,
  kills: Schemas.Number,
  deaths: Schemas.Number
})

export const SentinelBot = engine.defineComponent('sentinel-bot', {
  id: Schemas.String,
  patrolIndex: Schemas.Number,
  shields: Schemas.Number,
  maxShields: Schemas.Number,
  shootCooldown: Schemas.Number,
  isAlive: Schemas.Boolean,
  respawnTimer: Schemas.Number
})

export const LaserProjectile = engine.defineComponent('laser-projectile', {
  lifetime: Schemas.Number,
  damage: Schemas.Number,
  shooterIsPlayer: Schemas.Boolean,
  dirX: Schemas.Number,
  dirY: Schemas.Number,
  dirZ: Schemas.Number,
  speed: Schemas.Number
})

export const PitHazard = engine.defineComponent('pit-hazard', {
  centerX: Schemas.Number,
  centerZ: Schemas.Number,
  radius: Schemas.Number
})

export const Obstacle = engine.defineComponent('obstacle', {
  minX: Schemas.Number,
  maxX: Schemas.Number,
  minZ: Schemas.Number,
  maxZ: Schemas.Number
})
