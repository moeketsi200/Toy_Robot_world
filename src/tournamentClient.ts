import { executeTask } from '@dcl/sdk/ecs'
import type { TournamentSnapshot } from '../server/src/types'
import { getSessionToken, isAdminSession } from './networkClient'
import { SERVER_HTTP_URL } from './serverConfig'

let currentTournament: TournamentSnapshot | null = null
let tournamentMessage = 'Connect online to view tournament events.'
let requestPending = false

export function getCurrentTournamentView(): TournamentSnapshot | null {
  return currentTournament
}

export function getTournamentMessage(): string {
  return tournamentMessage
}

export function isTournamentRequestPending(): boolean {
  return requestPending
}

export function refreshTournament(): void {
  if (requestPending) return
  requestPending = true
  executeTask(async () => {
    try {
      const response = await fetch(`${SERVER_HTTP_URL}/tournaments/current`)
      const body = await response.text()
      const data = parseResponse<{ tournament?: TournamentSnapshot | null; error?: string }>(body, response.status)
      if (!response.ok) throw new Error(data.error ?? `Tournament service returned HTTP ${response.status}.`)
      currentTournament = data.tournament ?? null
      tournamentMessage = currentTournament ? 'Event information is up to date.' : 'No tournament event has been announced.'
    } catch (error) {
      tournamentMessage = error instanceof Error ? error.message : 'Could not load tournament event.'
    } finally {
      requestPending = false
    }
  })
}

export function createTournament(title: string, startsAt: string, playerCap: number): void {
  void request('/tournaments', 'POST', { title, startsAt, playerCap }, 'Tournament event created.')
}

export function registerForTournament(): void {
  if (!currentTournament) return
  void request(`/tournaments/${currentTournament.id}/register`, 'POST', { name: 'Pilot' }, 'You are registered for the event.')
}

export function startTournament(): void {
  if (!currentTournament) return
  void request(`/tournaments/${currentTournament.id}/start`, 'POST', {}, 'Registration closed and bracket created.')
}

function request(path: string, method: string, body: unknown, successMessage: string): Promise<void> {
  if (requestPending) return Promise.resolve()
  if (!getSessionToken()) {
    tournamentMessage = 'Connect to Multiplayer first to authenticate with the server.'
    return Promise.resolve()
  }
  requestPending = true
  executeTask(async () => {
    try {
      const response = await fetch(`${SERVER_HTTP_URL}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getSessionToken()}` },
        body: JSON.stringify(body)
      })
      const bodyText = await response.text()
      const data = parseResponse<{ tournament?: TournamentSnapshot; error?: string }>(bodyText, response.status)
      if (!response.ok) throw new Error(data.error ?? `Tournament service returned HTTP ${response.status}.`)
      if (data.tournament) currentTournament = data.tournament
      tournamentMessage = successMessage
    } catch (error) {
      tournamentMessage = error instanceof Error ? error.message : 'Tournament request failed.'
    } finally {
      requestPending = false
    }
  })
  return Promise.resolve()
}

function parseResponse<T>(body: string, status: number): T {
  try {
    return JSON.parse(body) as T
  } catch {
    if (status === 404) throw new Error(`Render has no backend at ${SERVER_HTTP_URL}. Deploy the server or set the correct URL in src/serverConfig.ts.`)
    throw new Error(`The tournament server returned non-JSON text (HTTP ${status}). Check the Render deployment and service URL.`)
  }
}

export function playerIsTournamentAdmin(): boolean {
  return isAdminSession()
}
