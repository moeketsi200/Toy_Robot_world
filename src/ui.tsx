import { engine, Transform } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import ReactEcs, { Button, Input, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { isMobile } from '@dcl/sdk/platform'
import { MechPilot, MechStateEnum } from './components'
import { playerMechEntity, enterMech, exitMech, requestFire, stopFire, requestReload, requestRepair, selectRobotClass, getSelectedClassId, chooseGameMode, isRobotSelectable, getAimReticlePosition, adjustMobileAimSensitivity, getMobileAimSensitivity, adjustDesktopAimSensitivity, getDesktopAimSensitivity, toggleMobileAimInvertY, isMobileAimInverted } from './mechController'
import { ROBOT_CLASSES, RobotClassId } from '../server/src/types'
import { GameMode, getGameMode, modeLabel } from './gameMode'
import { getNetworkMessage, initNetworkClient, isMultiplayerConnected, isNetworkConnecting } from './networkClient'
import { createTournament, getCurrentTournamentView, getTournamentMessage, playerIsTournamentAdmin, refreshTournament, registerForTournament, startTournament } from './tournamentClient'

let tournamentTitle = 'Robot Rumble'
let tournamentStartsAt = ''
let tournamentPlayerCap = 8

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent)
}

const uiComponent = () => {
  const pilot = playerMechEntity ? MechPilot.getOrNull(playerMechEntity) : null
  const isPiloting = pilot?.isPiloting ?? false
  const aimReticle = getAimReticlePosition()

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        positionType: 'absolute',
        pointerFilter: 'none'
      }}
    >
      {/* 1. Top Header Banner */}
      <UiEntity
        uiTransform={{
          width: 520,
          height: 50,
          positionType: 'absolute',
          position: { top: 12, left: '50%' },
          margin: { left: -260 },
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column'
        }}
        uiBackground={{ color: Color4.create(0.05, 0.08, 0.12, 0.85) }}
      >
        <Label
          value="TOY ROBOT WORLDS: ARENA"
          fontSize={18}
          color={Color4.create(0.0, 0.9, 1.0, 1)}
          uiTransform={{ height: 24 }}
        />
        <Label
          value={
            isPiloting
              ? `PILOTING: ${ROBOT_CLASSES[(pilot?.classId as RobotClassId) ?? 'bastion'].name.toUpperCase()} | KILLS: ${pilot?.kills ?? 0} | DEATHS: ${pilot?.deaths ?? 0}`
              : `${modeLabel()} | SELECT A ROBOT BELOW`
          }
          fontSize={13}
          color={Color4.create(0.8, 0.85, 0.9, 1)}
          uiTransform={{ height: 18 }}
        />
      </UiEntity>

      {/* 2. Cockpit Crosshair (Only when piloting) */}
      {isPiloting && (
        <UiEntity
          uiTransform={{
            width: 32,
            height: 32,
            positionType: 'absolute',
            position: { top: aimReticle.top, left: aimReticle.left },
            margin: { top: -16, left: -16 },
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Label
            value="⨁"
            fontSize={28}
            color={Color4.create(0.0, 1.0, 0.8, 0.8)}
          />
        </UiEntity>
      )}

      {/* 3. Bottom-Left Chassis Diagnostics (When Piloting) */}
      {isPiloting && (
        <UiEntity
          uiTransform={{
            width: isMobile() ? 230 : 300,
            height: isMobile() ? 118 : 140,
            positionType: 'absolute',
            position: isMobile() ? { top: 74, left: 12 } : { bottom: 20, left: 20 },
            flexDirection: 'column',
            padding: 12,
            justifyContent: 'space-between'
          }}
          uiBackground={{ color: Color4.create(0.06, 0.09, 0.14, 0.9) }}
        >
          <Label
          value={`CHASSIS: ${ROBOT_CLASSES[(pilot?.classId as RobotClassId) ?? 'bastion'].name.toUpperCase()} — ${ROBOT_CLASSES[(pilot?.classId as RobotClassId) ?? 'bastion'].role}`}
            fontSize={15}
            color={Color4.create(0.0, 0.9, 1.0, 1)}
            uiTransform={{ height: 20 }}
          />

          {/* Shields Bar */}
          <Label
            value={`SHIELDS: ${renderShieldPips(pilot?.shields ?? 0, pilot?.maxShields ?? 6)} (${pilot?.shields ?? 0}/${pilot?.maxShields ?? 6})`}
            fontSize={14}
            color={
              (pilot?.shields ?? 0) <= 2
                ? Color4.create(1.0, 0.2, 0.2, 1)
                : Color4.create(0.0, 0.85, 1.0, 1)
            }
            uiTransform={{ height: 22 }}
          />

          {/* State Indicator with Live Cooldown Timer */}
          <Label
            value={renderStatusText(pilot?.state ?? 0, pilot?.stateTimer ?? 0)}
            fontSize={13}
            color={getStatusColor(pilot?.state ?? 0)}
            uiTransform={{ height: 20 }}
          />

          {/* Dash Cooldown */}
          <Label
            value={`THRUSTER DASH: ${(pilot?.dashCooldown ?? 0) > 0 ? (pilot?.dashCooldown ?? 0).toFixed(1) + 's' : 'READY [SPACE]'}`}
            fontSize={12}
            color={Color4.create(0.9, 0.7, 0.1, 1)}
            uiTransform={{ height: 18 }}
          />
        </UiEntity>
      )}

      {/* 4. Bottom-Right Weapons & Actions (When Piloting) */}
      {isPiloting && (
        <UiEntity
          uiTransform={{
            width: isMobile() ? 320 : 340,
            height: isMobile() ? 246 : 214,
            positionType: 'absolute',
            position: { bottom: isMobile() ? 14 : 20, right: isMobile() ? 12 : 20 },
            flexDirection: 'column',
            padding: 12,
            justifyContent: 'space-between'
          }}
          uiBackground={{ color: Color4.create(0.06, 0.09, 0.14, 0.9) }}
        >
          <Label
            value={`AMMO CAPACITOR: ${renderAmmoPips(pilot?.ammo ?? 0, pilot?.maxAmmo ?? 8)} (${pilot?.ammo ?? 0}/${pilot?.maxAmmo ?? 8})`}
            fontSize={14}
            color={
              (pilot?.ammo ?? 0) === 0
                ? Color4.create(1.0, 0.2, 0.2, 1)
                : Color4.create(0.2, 0.9, 0.4, 1)
            }
            uiTransform={{ height: 22 }}
          />

          <Label
            value={`[LMB] Fire ${ROBOT_CLASSES[(pilot?.classId as RobotClassId) ?? 'bastion'].shotStyle} weapon (${ROBOT_CLASSES[(pilot?.classId as RobotClassId) ?? 'bastion'].damage} damage)`}
            fontSize={12}
            color={Color4.create(0.8, 0.85, 0.9, 1)}
            uiTransform={{ height: 16 }}
          />
          <Label
            value={`[F] Reload Ammo (${ROBOT_CLASSES[(pilot?.classId as RobotClassId) ?? 'bastion'].reloadTime.toFixed(1)}s)`}
            fontSize={12}
            color={Color4.create(0.8, 0.85, 0.9, 1)}
            uiTransform={{ height: 16 }}
          />
          <Label
            value="[E] Repair Shields (immobilized while repairing)"
            fontSize={12}
            color={Color4.create(0.8, 0.85, 0.9, 1)}
            uiTransform={{ height: 16 }}
          />
          <Label
            value={getGameMode() === 'solo'
              ? '[W/S] Drive | [A/D] Turn | [1] Exit Mech'
              : isMobile()
              ? 'DCL joystick: drive/steer | drag upper-right: aim'
              : 'Mouse look: aim | W/S drive | A/D turn | LMB fire | F reload | E repair'}
            fontSize={12}
            color={Color4.create(0.9, 0.7, 0.2, 1)}
            uiTransform={{ height: 16 }}
          />
          {isMobile() && (
            <UiEntity uiTransform={{ width: '100%', height: 98, flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between' }}>
              <UiEntity uiTransform={{ width: '100%', height: 44, flexDirection: 'row', justifyContent: 'center' }}>
                <Button value="FIRE" variant="primary" fontSize={13} uiTransform={{ width: 104, height: 42, margin: 2 }} onMouseDown={requestFire} onMouseUp={stopFire} onMouseLeave={stopFire} />
                <Button value="RELOAD" variant="secondary" fontSize={10} uiTransform={{ width: 84, height: 38, margin: 2 }} onMouseDown={requestReload} />
                <Button value="REPAIR" variant="secondary" fontSize={10} uiTransform={{ width: 84, height: 38, margin: 2 }} onMouseDown={requestRepair} />
              </UiEntity>
              <UiEntity uiTransform={{ width: '100%', height: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                <Button value="AIM −" variant="secondary" fontSize={10} uiTransform={{ width: 76, height: 26, margin: 2 }} onMouseDown={() => adjustMobileAimSensitivity(-0.25)} />
                <Label value={`AIM ${getMobileAimSensitivity().toFixed(2)}x`} fontSize={10} color={Color4.create(0.8, 0.85, 0.9, 1)} uiTransform={{ width: 84, height: 20 }} />
                <Button value="AIM +" variant="secondary" fontSize={10} uiTransform={{ width: 76, height: 26, margin: 2 }} onMouseDown={() => adjustMobileAimSensitivity(0.25)} />
              </UiEntity>
              <Button value={`VERTICAL AIM: ${isMobileAimInverted() ? 'INVERTED' : 'NORMAL'}`} variant="secondary" fontSize={9} uiTransform={{ width: 190, height: 24, margin: 2 }} onMouseDown={toggleMobileAimInvertY} />
            </UiEntity>
          )}
          {!isMobile() && (
            <UiEntity uiTransform={{ width: '100%', height: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <Button value="AIM −" variant="secondary" fontSize={10} uiTransform={{ width: 78, height: 26, margin: 2 }} onMouseDown={() => adjustDesktopAimSensitivity(-0.25)} />
              <Label value={`MOUSE AIM ${getDesktopAimSensitivity().toFixed(2)}x`} fontSize={10} color={Color4.create(0.8, 0.85, 0.9, 1)} uiTransform={{ width: 140, height: 20 }} />
              <Button value="AIM +" variant="secondary" fontSize={10} uiTransform={{ width: 78, height: 26, margin: 2 }} onMouseDown={() => adjustDesktopAimSensitivity(0.25)} />
            </UiEntity>
          )}
        </UiEntity>
      )}



      {/* 5. Non-piloting quick start button for testing */}
      {!isPiloting && (
        <UiEntity
          uiTransform={{
            width: 430,
            height: 370,
            positionType: 'absolute',
            position: { bottom: 16, left: '50%' },
            margin: { left: -215 },
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 10,
            pointerFilter: 'block'
          }}
          uiBackground={{ color: Color4.create(0.04, 0.07, 0.11, 0.94) }}
        >
          <Label value="CHOOSE GAME MODE" fontSize={15} color={Color4.create(0, 0.9, 1, 1)} uiTransform={{ height: 23 }} />
          <UiEntity uiTransform={{ width: '100%', height: 42, flexDirection: 'row', justifyContent: 'center' }}>
            {(['solo', 'multiplayer', 'tournament'] as GameMode[]).map((mode) => (
              <Button
                key={mode}
                value={modeLabel(mode)}
                variant={getGameMode() === mode ? 'primary' : 'secondary'}
                fontSize={9}
                uiTransform={{ width: 130, height: 34, margin: 2 }}
                onMouseDown={() => chooseGameMode(mode)}
              />
            ))}
          </UiEntity>
          <Label
            value={getGameMode() === 'solo'
              ? 'Practice vs bots · all robots unlocked for testing'
              : getGameMode() === 'multiplayer'
                ? `CASUAL MULTIPLAYER · ${getNetworkMessage()}`
                : `Scheduled tournament event · ${isMultiplayerConnected() ? 'SERVER CONNECTED' : 'CONNECTING TO SERVER'}`}
            fontSize={10}
            color={Color4.create(0.8, 0.85, 0.9, 1)}
            uiTransform={{ height: 20 }}
          />
          <Label value="CHOOSE YOUR ROBOT" fontSize={15} color={Color4.create(0, 0.9, 1, 1)} uiTransform={{ height: 23 }} />
          <UiEntity uiTransform={{ width: '100%', height: 194, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
            {(Object.keys(ROBOT_CLASSES) as RobotClassId[]).map((id) => {
              const robot = ROBOT_CLASSES[id]
              const unlocked = isRobotSelectable(id)
              const selected = getSelectedClassId() === id
              return (
                <Button
                  key={id}
                  value={`${selected ? 'SELECTED' : unlocked ? 'SELECT' : getGameMode() === 'solo' ? 'SELECT' : 'LOCKED'}\n${robot.name} · ${robot.maxShields} SH · ${robot.maxAmmo} ammo`}
                  variant={selected ? 'primary' : 'secondary'}
                  fontSize={10}
                  uiTransform={{ width: 130, height: 56, margin: 3 }}
                  onMouseDown={() => { if (unlocked) selectRobotClass(id) }}
                />
              )
            })}
          </UiEntity>
          <Label value={getGameMode() === 'solo' ? 'Solo practice does not earn tournament unlocks.' : 'Tournament achievements unlock robots permanently when profile saves are available.'} fontSize={10} color={Color4.create(0.8, 0.85, 0.9, 1)} uiTransform={{ height: 18 }} />
          {getGameMode() === 'tournament' ? (
            <TournamentPanel />
          ) : (
            <Button
              variant={getGameMode() === 'multiplayer' && !isMultiplayerConnected() ? 'secondary' : 'primary'}
              fontSize={13}
              uiTransform={{ width: 300, height: 42 }}
              value={getGameMode() === 'solo'
                ? `PRACTICE AS ${ROBOT_CLASSES[getSelectedClassId()].name.toUpperCase()}`
                : isMultiplayerConnected()
                  ? `JOIN THE WAR AS ${ROBOT_CLASSES[getSelectedClassId()].name.toUpperCase()}`
                  : isNetworkConnecting() ? 'CONNECTING TO WAR SERVER…' : 'RETRY SERVER CONNECTION'}
              onMouseDown={() => {
                if (getGameMode() === 'multiplayer' && !isMultiplayerConnected()) initNetworkClient()
                else enterMech()
              }}
            />
          )}
        </UiEntity>
      )}
    </UiEntity>
  )
}

function TournamentPanel() {
  const event = getCurrentTournamentView()
  return (
    <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}>
      <Label value={event ? event.title.toUpperCase() : 'TOURNAMENT EVENTS'} fontSize={12} color={Color4.create(1, 0.7, 0.2, 1)} uiTransform={{ height: 20 }} />
      <Label value={event ? `${event.status.toUpperCase()} · ${event.entrants.length}/${event.playerCap} pilots · starts ${new Date(event.startsAt).toLocaleString()}` : 'No event announced'} fontSize={9} color={Color4.create(0.8, 0.85, 0.9, 1)} uiTransform={{ height: 30 }} />
      <Label value={getTournamentMessage()} fontSize={9} color={Color4.create(0.2, 0.9, 0.6, 1)} uiTransform={{ height: 24 }} />
      <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', justifyContent: 'center' }}>
        <Button value="REFRESH" variant="secondary" fontSize={9} uiTransform={{ width: 90, height: 28, margin: 2 }} onMouseDown={() => refreshTournament()} />
        {event?.status === 'registration' && <Button value="REGISTER" variant="primary" fontSize={9} uiTransform={{ width: 90, height: 28, margin: 2 }} onMouseDown={() => registerForTournament()} />}
        {playerIsTournamentAdmin() && event?.status === 'registration' && <Button value="START EVENT" variant="primary" fontSize={9} uiTransform={{ width: 100, height: 28, margin: 2 }} onMouseDown={() => startTournament()} />}
      </UiEntity>
      {event?.bracket.map((round, index) => (
        <Label key={`round-${index}`} value={`ROUND ${index + 1}: ${round.map((match) => `${match.player1?.name ?? 'TBD'} vs ${match.player2?.name ?? (match.status === 'bye' ? 'BYE' : 'TBD')}`).join(' | ')}`} fontSize={8} color={Color4.create(0.9, 0.9, 1, 1)} uiTransform={{ height: 25 }} />
      ))}
      {(!event || event.status === 'completed') && playerIsTournamentAdmin() && (
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}>
          <Label value="ADMIN · CREATE EVENT" fontSize={9} color={Color4.create(1, 0.7, 0.2, 1)} uiTransform={{ height: 20 }} />
          <Input value={tournamentTitle} placeholder="Event name" onChange={(value) => { tournamentTitle = value }} uiTransform={{ width: 280, height: 30, margin: 2 }} />
          <Input value={tournamentStartsAt} placeholder="Start time (ISO 8601, UTC)" onChange={(value) => { tournamentStartsAt = value }} uiTransform={{ width: 280, height: 30, margin: 2 }} />
          <UiEntity uiTransform={{ width: 260, height: 30, flexDirection: 'row', justifyContent: 'center' }}>
            {[4, 8, 16].map((cap) => <Button key={`cap-${cap}`} value={`${cap} PILOTS`} variant={cap === tournamentPlayerCap ? 'primary' : 'secondary'} fontSize={8} uiTransform={{ width: 80, height: 26, margin: 2 }} onMouseDown={() => { tournamentPlayerCap = cap }} />)}
          </UiEntity>
          <Button value="CREATE TOURNAMENT" variant="primary" fontSize={10} uiTransform={{ width: 220, height: 30, margin: 2 }} onMouseDown={() => createTournament(tournamentTitle, tournamentStartsAt, tournamentPlayerCap)} />
        </UiEntity>
      )}
      {event?.status === 'live' && <Label value="Bracket pairings are ready. Match rooms and verified results are not connected yet." fontSize={8} color={Color4.create(1, 0.65, 0.25, 1)} uiTransform={{ height: 30 }} />}
    </UiEntity>
  )
}

function renderShieldPips(current: number, max: number): string {
  let str = ''
  for (let i = 0; i < max; i++) {
    str += i < current ? '■' : '□'
  }
  return str
}

function renderAmmoPips(current: number, max: number): string {
  let str = ''
  for (let i = 0; i < max; i++) {
    str += i < current ? '|' : '.'
  }
  return str
}

function renderStatusText(state: number, timer: number): string {
  switch (state) {
    case MechStateEnum.RELOADING:
      return `STATUS: RELOADING WEAPONS (${Math.max(0, timer).toFixed(1)}s)...`
    case MechStateEnum.REPAIRING:
      return `STATUS: REPAIRING SHIELDS (${Math.max(0, timer).toFixed(1)}s)...`
    case MechStateEnum.FALLING:
      return 'STATUS: CRITICAL PIT FALL DETECTED!'
    case MechStateEnum.NORMAL:
    default:
      return 'STATUS: ONLINE (COMBAT READY)'
  }
}

function getStatusColor(state: number): Color4 {
  switch (state) {
    case MechStateEnum.RELOADING:
      return Color4.create(0.2, 0.6, 1.0, 1)
    case MechStateEnum.REPAIRING:
      return Color4.create(1.0, 0.65, 0.0, 1)
    case MechStateEnum.FALLING:
      return Color4.create(1.0, 0.1, 0.1, 1)
    case MechStateEnum.NORMAL:
    default:
      return Color4.create(0.1, 0.9, 0.3, 1)
  }
}
