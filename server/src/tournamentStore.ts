import { randomUUID } from 'crypto'
import { Pool } from 'pg'
import { TournamentEntrant, TournamentMatch, TournamentSnapshot, TournamentStatus } from './types'

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined })
  : null
const memoryTournaments = new Map<string, TournamentSnapshot>()

export async function initializeTournamentStore(): Promise<void> {
  if (!pool) {
    console.warn('[TOURNAMENT] DATABASE_URL is missing; tournament events will be memory-only.')
    return
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      starts_at TIMESTAMPTZ NOT NULL,
      player_cap INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_by TEXT NOT NULL,
      entrants JSONB NOT NULL DEFAULT '[]'::JSONB,
      bracket JSONB NOT NULL DEFAULT '[]'::JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

function fromRow(row: Record<string, unknown>): TournamentSnapshot {
  return {
    id: String(row.id),
    title: String(row.title),
    startsAt: new Date(row.starts_at as string | Date).toISOString(),
    playerCap: Number(row.player_cap),
    status: row.status as TournamentStatus,
    createdBy: String(row.created_by),
    entrants: row.entrants as TournamentEntrant[],
    bracket: row.bracket as TournamentMatch[][],
    createdAt: new Date(row.created_at as string | Date).toISOString()
  }
}

export async function getCurrentTournament(): Promise<TournamentSnapshot | null> {
  if (!pool) {
    return [...memoryTournaments.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  }
  const result = await pool.query('SELECT * FROM tournaments ORDER BY created_at DESC LIMIT 1')
  return result.rows[0] ? fromRow(result.rows[0]) : null
}

export async function createTournament(input: { title: string; startsAt: string; playerCap: number; createdBy: string }): Promise<TournamentSnapshot> {
  const title = input.title.trim().slice(0, 48)
  const startsAt = new Date(input.startsAt)
  if (!title) throw new Error('Event name is required')
  if (!Number.isFinite(startsAt.getTime()) || startsAt.getTime() <= Date.now()) throw new Error('Start time must be in the future')
  if (![4, 8, 16].includes(input.playerCap)) throw new Error('Player cap must be 4, 8, or 16')

  const current = await getCurrentTournament()
  if (current && (current.status === 'registration' || current.status === 'live')) throw new Error('Finish the current event before creating another')

  const event: TournamentSnapshot = {
    id: randomUUID(),
    title,
    startsAt: startsAt.toISOString(),
    playerCap: input.playerCap,
    status: 'registration',
    createdBy: input.createdBy.toLowerCase(),
    entrants: [],
    bracket: [],
    createdAt: new Date().toISOString()
  }
  if (!pool) memoryTournaments.set(event.id, event)
  else await pool.query(
    `INSERT INTO tournaments (id, title, starts_at, player_cap, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [event.id, event.title, event.startsAt, event.playerCap, event.status, event.createdBy]
  )
  return event
}

export async function registerTournamentEntrant(id: string, entrant: TournamentEntrant): Promise<TournamentSnapshot> {
  const event = await getTournament(id)
  if (!event) throw new Error('Tournament not found')
  if (event.status !== 'registration') throw new Error('Registration is closed')
  if (Date.now() >= Date.parse(event.startsAt)) throw new Error('Registration deadline has passed')
  const wallet = entrant.wallet.toLowerCase()
  if (event.entrants.some((entry) => entry.wallet === wallet)) return event
  if (event.entrants.length >= event.playerCap) throw new Error('This tournament is full')
  event.entrants.push({ ...entrant, wallet })
  return saveTournament(event)
}

export async function startTournament(id: string): Promise<TournamentSnapshot> {
  const event = await getTournament(id)
  if (!event) throw new Error('Tournament not found')
  if (event.status !== 'registration') throw new Error('Tournament has already started')
  if (event.entrants.length < 2) throw new Error('At least two players must register')
  const entrants = [...event.entrants].sort(() => Math.random() - 0.5)
  const matches: TournamentMatch[] = []
  for (let i = 0; i < entrants.length; i += 2) {
    const player1 = entrants[i]
    const player2 = entrants[i + 1] ?? null
    matches.push({
      id: randomUUID(), round: 1, player1, player2,
      winner: player2 ? null : player1,
      status: player2 ? 'ready' : 'bye'
    })
  }
  event.bracket = [matches]
  event.status = 'live'
  return saveTournament(event)
}

async function getTournament(id: string): Promise<TournamentSnapshot | null> {
  if (!pool) return memoryTournaments.get(id) ?? null
  const result = await pool.query('SELECT * FROM tournaments WHERE id = $1', [id])
  return result.rows[0] ? fromRow(result.rows[0]) : null
}

async function saveTournament(event: TournamentSnapshot): Promise<TournamentSnapshot> {
  if (!pool) {
    memoryTournaments.set(event.id, event)
    return event
  }
  const result = await pool.query(
    `UPDATE tournaments SET status = $2, entrants = $3::JSONB, bracket = $4::JSONB
     WHERE id = $1 RETURNING *`,
    [event.id, event.status, JSON.stringify(event.entrants), JSON.stringify(event.bracket)]
  )
  return fromRow(result.rows[0])
}
