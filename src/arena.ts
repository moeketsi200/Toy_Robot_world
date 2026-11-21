import {
  engine,
  Transform,
  GltfContainer,
  MeshRenderer,
  MeshCollider,
  ColliderLayer,
  Material,
  InputAction,
  pointerEventsSystem
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { Obstacle } from './components'
import { enterMech } from './mechController'
import { ARENA_COVER_OBSTACLES } from '../server/src/arenaObstacles'

export function buildArena() {
  // Continuous arena deck and collider fill the complete 64m parcel square.
  const floor = engine.addEntity()
  Transform.create(floor, {
    position: Vector3.create(32, 0, 32),
    scale: Vector3.create(64, 0.1, 64)
  })
  MeshRenderer.setBox(floor)
  MeshCollider.setBox(floor, ColliderLayer.CL_PHYSICS)
  Material.setPbrMaterial(floor, {
    albedoColor: Color4.create(0.035, 0.045, 0.06, 1),
    metallic: 0.55,
    roughness: 0.42,
    emissiveColor: Color4.create(0.002, 0.003, 0.005, 1)
  })

  // Keep the separate arrival hub and selection terminal at the parcel entry.
  const terminal = engine.addEntity()
  Transform.create(terminal, {
    position: Vector3.create(32, 1.35, 6.5),
    scale: Vector3.create(2.6, 2.2, 1.8)
  })
  MeshCollider.setBox(terminal)

  const entryHub = engine.addEntity()
  Transform.create(entryHub, {
    position: Vector3.create(32, 0.05, 7.5),
    scale: Vector3.create(1, 1, 1)
  })
  GltfContainer.create(entryHub, {
    src: 'assets/models/arena_entry.glb',
    visibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS,
    invisibleMeshesCollisionMask: 0
  })

  // Fit the full 42m x 34m arena outline exactly to the 64m parcel edges.
  const cyberArena = engine.addEntity()
  Transform.create(cyberArena, {
    position: Vector3.create(32, 0.05, 32),
    scale: Vector3.create(64 / 42, 64 / 42, 64 / 34)
  })
  GltfContainer.create(cyberArena, {
    src: 'assets/models/cyber_battle_zone.glb',
    visibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS,
    invisibleMeshesCollisionMask: 0
  })

  pointerEventsSystem.onPointerDown(
    {
      entity: terminal,
      opts: {
        button: InputAction.IA_PRIMARY,
        hoverText: '[E] Select Mech'
      }
    },
    () => enterMech()
  )

  // Register the perimeter barricades and the visible pillar/rock cover for movement and shots.
  registerObstacle(15.2, 48.8, 44.8, 46.2)
  registerObstacle(13.6, 15.1, 20, 44.7)
  registerObstacle(48.9, 50.4, 20, 44.7)

  for (const bounds of ARENA_COVER_OBSTACLES) {
    const coverObstacle = engine.addEntity()
    Obstacle.create(coverObstacle, { ...bounds })
  }
}

function fitArenaX(value: number): number {
  return 32 + (value - 32) * (64 / 42)
}

function fitArenaZ(value: number): number {
  return 32 + (value - 32) * (64 / 34)
}

function registerObstacle(minX: number, maxX: number, minZ: number, maxZ: number) {
  const obstacle = engine.addEntity()
  Obstacle.create(obstacle, {
    minX: fitArenaX(minX),
    maxX: fitArenaX(maxX),
    minZ: fitArenaZ(minZ),
    maxZ: fitArenaZ(maxZ)
  })
}
