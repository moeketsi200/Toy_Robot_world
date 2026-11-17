import { engine } from '@dcl/sdk/ecs'
import { buildArena } from './arena'
import { initMech, mechControlSystem } from './mechController'
import { initSentinelBot, sentinelAiSystem } from './aiBot'
import { combatSystem } from './combatSystem'
import { setupUi } from './ui'
import { networkSystem } from './networkClient'

export function main() {
  console.log('Initializing Toy Robot Worlds: Arena Scene...')

  // 1. Build Arena environment (floor, walls, obstacles, pits, hangar terminal)
  buildArena()

  // 2. Initialize Player Mech and Virtual Camera rig
  initMech()

  // 3. Initialize AI Sentinel Bots (local fallback — always active)
  initSentinelBot()

  // 4. Register Game Systems
  engine.addSystem(mechControlSystem)
  engine.addSystem(sentinelAiSystem)
  engine.addSystem(combatSystem)

  // 5. Multiplayer networking runs only after the player selects that mode.
  engine.addSystem(networkSystem)

  // 6. Initialize Cockpit HUD
  setupUi()

  console.log('Toy Robot Worlds: Arena ready!')
}

