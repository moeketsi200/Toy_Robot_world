import { engine, Entity, Transform, GltfContainer, MeshRenderer, Material } from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

interface ShieldRig {
  entity: Entity
  shields: number
  maxShields: number
  flashTimer: number
  scale: Vector3
}

interface DebrisParticle {
  entity: Entity
  vx: number
  vy: number
  vz: number
  lifetime: number
  gravity: number
}

const shieldRigs = new Map<Entity, ShieldRig>()
const particles: DebrisParticle[] = []

export function createShieldVisual(parent: Entity, shields: number, maxShields: number): void {
  removeShieldVisual(parent)
  const entity = engine.addEntity()
  const scale = Vector3.create(2.55, 2.8, 2.8)
  Transform.create(entity, {
    parent,
    position: Vector3.create(0, 0.45, 0),
    scale: shields > 0 ? scale : Vector3.create(0, 0, 0)
  })
  GltfContainer.create(entity, {
    src: 'assets/models/shield_dome.glb',
    visibleMeshesCollisionMask: 0,
    invisibleMeshesCollisionMask: 0
  })
  shieldRigs.set(parent, { entity, shields, maxShields, flashTimer: 0, scale })
}

export function removeShieldVisual(parent: Entity): void {
  const rig = shieldRigs.get(parent)
  if (!rig) return
  engine.removeEntity(rig.entity)
  shieldRigs.delete(parent)
}

export function syncShieldVisual(parent: Entity, shields: number, maxShields: number): void {
  const rig = shieldRigs.get(parent)
  if (!rig) return
  if (shields < rig.shields) rig.flashTimer = 0.2
  rig.shields = shields
  rig.maxShields = maxShields
}

export function spawnHullHit(position: Vector3): void {
  for (let i = 0; i < 5; i++) {
    spawnParticle(position, Color4.create(0.42, 0.018, 0.025, 1), 0.065, 3.2, 1.2, 9.8)
  }
  for (let i = 0; i < 4; i++) {
    spawnParticle(position, Color4.create(1.0, 0.28, 0.025, 1), 0.045, 5.5, 0.32, 2.0)
  }
}

export function damageEffectsSystem(dt: number): void {
  for (const rig of shieldRigs.values()) {
    rig.flashTimer = Math.max(0, rig.flashTimer - dt)
    const transform = Transform.getMutableOrNull(rig.entity)
    if (!transform) continue
    if (rig.shields <= 0 || rig.maxShields <= 0) {
      transform.scale = Vector3.create(0, 0, 0)
      continue
    }
    const pulse = rig.flashTimer > 0 ? 1 + 0.18 * (rig.flashTimer / 0.2) : 1
    transform.scale = Vector3.create(rig.scale.x * pulse, rig.scale.y * pulse, rig.scale.z * pulse)
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i]
    const transform = Transform.getMutableOrNull(particle.entity)
    if (!transform) {
      particles.splice(i, 1)
      continue
    }
    transform.position.x += particle.vx * dt
    transform.position.y += particle.vy * dt
    transform.position.z += particle.vz * dt
    particle.vy -= particle.gravity * dt
    particle.lifetime -= dt
    if (particle.lifetime <= 0 || transform.position.y < 0.05) {
      engine.removeEntity(particle.entity)
      particles.splice(i, 1)
    }
  }
}

function spawnParticle(position: Vector3, color: Color4, size: number, speed: number, lifetime: number, gravity: number): void {
  const entity = engine.addEntity()
  const direction = Vector3.create(Math.random() * 2 - 1, Math.random() * 1.5 + 0.25, Math.random() * 2 - 1)
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1
  Transform.create(entity, {
    position: Vector3.clone(position),
    scale: Vector3.create(size, size, size)
  })
  MeshRenderer.setSphere(entity)
  Material.setPbrMaterial(entity, {
    albedoColor: color,
    emissiveColor: color,
    roughness: 0.28
  })
  particles.push({
    entity,
    vx: (direction.x / length) * speed,
    vy: (direction.y / length) * speed,
    vz: (direction.z / length) * speed,
    lifetime,
    gravity
  })
}
