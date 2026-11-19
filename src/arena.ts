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
import { Obstacle, PitHazard } from './components'
import { enterMech } from './mechController'

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

  // Interactive collider over the modeled Blender mech-selection console.
  const hangarPad = engine.addEntity()
  Transform.create(hangarPad, {
    position: Vector3.create(32, 0.12, fitArenaZ(24.5)),
    scale: Vector3.create(30.5, 0.24, 16.9)
  })
  MeshRenderer.setBox(hangarPad)
  MeshCollider.setBox(hangarPad)
  Material.setPbrMaterial(hangarPad, {
    albedoColor: Color4.create(0.12, 0.16, 0.22, 1),
    emissiveColor: Color4.create(0.02, 0.08, 0.14, 1)
  })

  // Clickable terminal collider. Its visible console is part of arena_entry.glb.
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
        hoverText: '[E] Board Selected Combat Mech'
      }
    },
    () => {
      enterMech()
    }
  )

  // Match robot collision checks to the model's side and front barricades.
  registerObstacle(15.2, 48.8, 44.8, 46.2)
  registerObstacle(13.6, 15.1, 20, 44.7)
  registerObstacle(48.9, 50.4, 20, 44.7)
  // Rear stage wall, leaving the central deployment entrance open.
  registerObstacle(12.5, 28, 16.8, 18.1)
  registerObstacle(36, 51.5, 16.8, 18.1)

  // Keep the four combat hazards clear of the entrance and boarding bay.
  createPit(fitArenaX(23), fitArenaZ(34), 5.27)
  createPit(fitArenaX(41), fitArenaZ(34), 5.27)
  createPit(fitArenaX(23), fitArenaZ(41), 5.27)
  createPit(fitArenaX(41), fitArenaZ(41), 5.27)

  // Support stations inside the arena barricades.
  createSupplyPad(fitArenaX(19.5), fitArenaZ(28.3), Color4.create(0.0, 0.8, 1.0, 1), 'REPAIR STATION')
  createSupplyPad(fitArenaX(44.5), fitArenaZ(28.3), Color4.create(1.0, 0.7, 0.0, 1), 'AMMO STATION')
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

function createPit(x: number, z: number, radius: number) {
  const pit = engine.addEntity()
  Transform.create(pit, {
    position: Vector3.create(x, 0.22, z),
    scale: Vector3.create(radius * 2, 0.05, radius * 2)
  })
  MeshRenderer.setBox(pit)
  Material.setPbrMaterial(pit, {
    albedoColor: Color4.create(0.01, 0.01, 0.02, 1),
    emissiveColor: Color4.create(0.9, 0.1, 0.0, 1)
  })

  const warningRim = engine.addEntity()
  Transform.create(warningRim, {
    position: Vector3.create(x, 0.25, z),
    scale: Vector3.create(radius * 2.2, 0.02, radius * 2.2)
  })
  MeshRenderer.setBox(warningRim)
  Material.setPbrMaterial(warningRim, {
    albedoColor: Color4.create(1.0, 0.6, 0.0, 1),
    emissiveColor: Color4.create(0.5, 0.25, 0.0, 1)
  })

  PitHazard.create(pit, {
    centerX: x,
    centerZ: z,
    radius: radius
  })
}

function createSupplyPad(x: number, z: number, glowColor: Color4, name: string) {
  const pad = engine.addEntity()
  Transform.create(pad, {
    position: Vector3.create(x, 0.22, z),
    scale: Vector3.create(5, 0.06, 5)
  })
  MeshRenderer.setBox(pad)
  Material.setPbrMaterial(pad, {
    albedoColor: Color4.create(0.1, 0.12, 0.15, 1),
    emissiveColor: glowColor
  })
}
