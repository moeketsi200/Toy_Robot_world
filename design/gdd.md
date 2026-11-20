# Toy Robot Worlds — working design

## Owner's direction

The owner chose an **arcade-style robot combat feel**, using Battle Zone as a reference for controls. They chose this control feel over literal plane-like flight; the robots stay grounded.

## Play and current controls

Players pilot a selected mech in an arena, drive and turn, aim its weapon, fire, and use a boost. They can reload and repair shields between attacks. The project currently includes solo, multiplayer, and tournament modes.

Current code bindings (implementation, not additional owner decisions):

- **Desktop:** W/S drive, A/D turn, mouse aim, hold left mouse to fire repeatedly, Space to boost once per press, E to reload, F to repair, and 1 to exit.
- **Mobile:** joystick to drive, drag to aim, tap to fire one shot, jump button to boost, and the other on-screen actions for reload, repair, and exit.

The updated bindings are implemented in scene code. Their feel still needs an in-world check on desktop and mobile.

## Reference

See [references.md](references.md) for Battle Zone sources and the scope of the comparison.
