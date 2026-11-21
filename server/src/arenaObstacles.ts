interface ObstacleBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

function modelCoverBox(modelX: number, modelY: number, width: number, depth: number): ObstacleBounds {
  const centerX = 32 - modelX * (64 / 42)
  const centerZ = 32 - modelY * (64 / 34)
  return {
    minX: centerX - (width * 64 / 42) / 2,
    maxX: centerX + (width * 64 / 42) / 2,
    minZ: centerZ - (depth * 64 / 34) / 2,
    maxZ: centerZ + (depth * 64 / 34) / 2
  }
}

const COVER_SCALE = 0.65

/** World-space collision boxes matching the cover meshes in create_cyber_battle_zone.py. */
export const ARENA_COVER_OBSTACLES: ObstacleBounds[] = [
  modelCoverBox(-8, -5.5, 2.6 * COVER_SCALE, 2.6 * COVER_SCALE),
  modelCoverBox(8, -5.5, 2.6 * COVER_SCALE, 2.6 * COVER_SCALE),
  modelCoverBox(-8, 5.5, 2.6 * COVER_SCALE, 2.6 * COVER_SCALE),
  modelCoverBox(8, 5.5, 2.6 * COVER_SCALE, 2.6 * COVER_SCALE),
  modelCoverBox(-3.7, -8, 3.6 * COVER_SCALE, 2.8 * COVER_SCALE),
  modelCoverBox(3.7, -8, 3.6 * COVER_SCALE, 2.8 * COVER_SCALE),
  modelCoverBox(-3.7, 8, 3.6 * COVER_SCALE, 2.8 * COVER_SCALE),
  modelCoverBox(3.7, 8, 3.6 * COVER_SCALE, 2.8 * COVER_SCALE)
]
