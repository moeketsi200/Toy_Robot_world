import {
  engine,
  Entity,
  Transform,
  MeshRenderer,
  MeshCollider,
  Material,
  InputAction,
  pointerEventsSystem
} from '@dcl/sdk/ecs'
import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'
import { Obstacle, PitHazard } from './components'
import { enterMech } from './mechController'

export function buildArena() {
  // 1. 64m x 64m Tournament Cyber-Arena Floor (4x4 Parcels)
  const floor = engine.addEntity()
  Transform.create(floor, {
    position: Vector3.create(32, 0, 32),
    scale: Vector3.create(64, 0.1, 64)
  })
  MeshRenderer.setBox(floor)
  MeshCollider.setBox(floor)
  Material.setPbrMaterial(floor, {
    albedoColor: Color4.create(0.07, 0.08, 0.11, 1),
    metallic: 0.85,
    roughness: 0.25,
    emissiveColor: Color4.create(0.01, 0.03, 0.05, 1)
  })

  // Perimeter Walls (64m boundary)
  createPerimeterWall(32, 1.2, 0.5, 64, 2.4, 0.5)  // South
  createPerimeterWall(32, 1.2, 63.5, 64, 2.4, 0.5) // North
  createPerimeterWall(0.5, 1.2, 32, 0.5, 2.4, 64)  // West
  createPerimeterWall(63.5, 1.2, 32, 0.5, 2.4, 64) // East

  // 2. Sky Hangar & Boarding Bay (South edge)
  const hangarPad = engine.addEntity()
  Transform.create(hangarPad, {
    position: Vector3.create(32, 0.12, 7),
    scale: Vector3.create(20, 0.24, 8)
  })
  MeshRenderer.setBox(hangarPad)
  MeshCollider.setBox(hangarPad)
  Material.setPbrMaterial(hangarPad, {
    albedoColor: Color4.create(0.12, 0.16, 0.22, 1),
    emissiveColor: Color4.create(0.02, 0.08, 0.14, 1)
  })

  // Boarding Terminal
  const terminal = engine.addEntity()
  Transform.create(terminal, {
    position: Vector3.create(32, 1.0, 9),
    scale: Vector3.create(1.6, 1.8, 0.9)
  })
  MeshRenderer.setBox(terminal)
  MeshCollider.setBox(terminal)
  Material.setPbrMaterial(terminal, {
    albedoColor: Color4.create(0.1, 0.12, 0.15, 1),
    emissiveColor: Color4.create(0.0, 0.75, 1.0, 1)
  })

  // Hologram Screen
  const holoScreen = engine.addEntity()
  Transform.create(holoScreen, {
    parent: terminal,
    position: Vector3.create(0, 0.6, 0),
    scale: Vector3.create(1.2, 0.6, 0.05),
    rotation: Quaternion.fromEulerDegrees(-15, 0, 0)
  })
  MeshRenderer.setBox(holoScreen)
  Material.setPbrMaterial(holoScreen, {
    albedoColor: Color4.create(0.0, 0.85, 1.0, 0.9),
    emissiveColor: Color4.create(0.0, 0.9, 1.0, 1)
  })

  pointerEventsSystem.onPointerDown(
    {
      entity: terminal,
      opts: {
        button: InputAction.IA_PRIMARY,
        hoverText: '[E] Board Bastion Combat Mech'
      }
    },
    () => {
      enterMech()
    }
  )

  // 3. Mech-Sized Tactical Blast Barriers (Sized to fit and hide 1 robot)
  // Height: 2.5m (covers robot cockpit), Width: 3.2m (just wide enough to conceal mech)
  // Center Battlefield Cover
  createObstacle(28, 32, 3.2, 2.5, 1.2)
  createObstacle(36, 32, 3.2, 2.5, 1.2)

  // Southwest Tactical Cover
  createObstacle(18, 20, 3.2, 2.5, 1.2)
  createObstacle(24, 16, 1.2, 2.5, 3.2)

  // Southeast Tactical Cover
  createObstacle(46, 20, 3.2, 2.5, 1.2)
  createObstacle(40, 16, 1.2, 2.5, 3.2)

  // Northwest Tactical Cover
  createObstacle(18, 44, 3.2, 2.5, 1.2)
  createObstacle(24, 48, 1.2, 2.5, 3.2)

  // Northeast Tactical Cover
  createObstacle(46, 44, 3.2, 2.5, 1.2)
  createObstacle(40, 48, 1.2, 2.5, 3.2)

  // Flank & High-Ground Barriers
  createObstacle(10, 32, 1.2, 2.5, 3.5)
  createObstacle(54, 32, 1.2, 2.5, 3.5)
  createObstacle(32, 52, 3.5, 2.5, 1.2)

  // 4. Four Bottomless Pits (Hazard Traps)
  createPit(24, 26, 2.8)
  createPit(40, 26, 2.8)
  createPit(24, 38, 2.8)
  createPit(40, 38, 2.8)

  // 5. Corner Supply Pads
  createSupplyPad(8, 56, Color4.create(0.0, 0.8, 1.0, 1), 'REPAIR STATION')
  createSupplyPad(56, 56, Color4.create(1.0, 0.7, 0.0, 1), 'AMMO STATION')
}

function createPerimeterWall(x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  const wall = engine.addEntity()
  Transform.create(wall, {
    position: Vector3.create(x, y, z),
    scale: Vector3.create(sx, sy, sz)
  })
  MeshRenderer.setBox(wall)
  MeshCollider.setBox(wall)
  Material.setPbrMaterial(wall, {
    albedoColor: Color4.create(0.09, 0.12, 0.18, 1),
    emissiveColor: Color4.create(0.0, 0.4, 0.8, 1),
    metallic: 0.9,
    roughness: 0.2
  })
}

function createObstacle(x: number, z: number, sx: number, sy: number, sz: number) {
  const barrier = engine.addEntity()
  Transform.create(barrier, {
    position: Vector3.create(x, sy / 2, z),
    scale: Vector3.create(sx, sy, sz)
  })
  MeshRenderer.setBox(barrier)
  MeshCollider.setBox(barrier)
  Material.setPbrMaterial(barrier, {
    albedoColor: Color4.create(0.14, 0.16, 0.2, 1),
    metallic: 0.85,
    roughness: 0.25,
    emissiveColor: Color4.create(0.02, 0.03, 0.05, 1)
  })

  // Tactical hazard trim cap on top of the barrier
  const trim = engine.addEntity()
  Transform.create(trim, {
    parent: barrier,
    position: Vector3.create(0, 0.5, 0),
    scale: Vector3.create(1.02, 0.08, 1.02)
  })
  MeshRenderer.setBox(trim)
  Material.setPbrMaterial(trim, {
    albedoColor: Color4.create(0.9, 0.65, 0.1, 1),
    emissiveColor: Color4.create(0.4, 0.25, 0.05, 1)
  })

  Obstacle.create(barrier, {
    minX: x - sx / 2,
    maxX: x + sx / 2,
    minZ: z - sz / 2,
    maxZ: z + sz / 2
  })
}

function createPit(x: number, z: number, radius: number) {
  const pit = engine.addEntity()
  Transform.create(pit, {
    position: Vector3.create(x, 0.02, z),
    scale: Vector3.create(radius * 2, 0.05, radius * 2)
  })
  MeshRenderer.setBox(pit)
  Material.setPbrMaterial(pit, {
    albedoColor: Color4.create(0.01, 0.01, 0.02, 1),
    emissiveColor: Color4.create(0.9, 0.1, 0.0, 1)
  })

  const warningRim = engine.addEntity()
  Transform.create(warningRim, {
    position: Vector3.create(x, 0.03, z),
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
    position: Vector3.create(x, 0.04, z),
    scale: Vector3.create(5, 0.06, 5)
  })
  MeshRenderer.setBox(pad)
  Material.setPbrMaterial(pad, {
    albedoColor: Color4.create(0.1, 0.12, 0.15, 1),
    emissiveColor: glowColor
  })
}
