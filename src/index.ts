import { engine } from '@dcl/sdk/ecs'
import { buildArena } from './arena'
import { initMech, mechControlSystem } from './mechController'
import { sentinelAiSystem } from './aiBot'
import { combatSystem } from './combatSystem'
import { setupUi } from './ui'
import { networkSystem } from './networkClient'

export function main() {
  console.log('Initializing Toy Robot Worlds: Arena Scene...')

  // 1. Build arena environment and Blender-made entrance hub
  buildArena()

  // 2. Initialize Player Mech and Virtual Camera rig
  initMech()

  // 3. Register Game Systems. Solo AI opponents spawn only while piloting in Solo.
  engine.addSystem(mechControlSystem)
  engine.addSystem(sentinelAiSystem)
  engine.addSystem(combatSystem)

  // 5. Multiplayer networking runs only after the player selects that mode.
  engine.addSystem(networkSystem)

  // 6. Initialize Cockpit HUD
  setupUi()

  console.log('Toy Robot Worlds: Arena ready!')
}

