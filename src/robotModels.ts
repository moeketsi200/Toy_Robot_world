import { RobotClassId } from '../server/src/types'

export const SELECTABLE_ROBOT_CLASSES: RobotClassId[] = ['bastion', 'spectre', 'goliath']

export function robotModelPath(classId: RobotClassId): string {
  switch (classId) {
    case 'spectre': return 'assets/models/mech_spectre.glb'
    case 'goliath': return 'assets/models/mech_goliath.glb'
    default: return 'assets/models/mech_bastion_chassis.glb'
  }
}

export function hasSeparateTurret(classId: RobotClassId): boolean {
  return classId !== 'spectre' && classId !== 'goliath'
}
