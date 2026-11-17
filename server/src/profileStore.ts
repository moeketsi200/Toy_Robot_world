import { Pool } from 'pg'
import { RobotClassId } from './types'

export interface PlayerProfile {
  wallet: string
  unlockedRobots: RobotClassId[]
  totalKills: number
  totalMatches: number
}

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined })
  : null

const memoryProfiles = new Map<string, PlayerProfile>()

export async function initializeProfileStore(): Promise<void> {
  if (!pool) {
    console.warn('[PROFILE] DATABASE_URL is missing; profiles are memory-only and will not persist.')
    return
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_profiles (
      wallet TEXT PRIMARY KEY,
      unlocked_robots TEXT[] NOT NULL DEFAULT ARRAY['bastion']::TEXT[],
      total_kills INTEGER NOT NULL DEFAULT 0,
      total_matches INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

export async function getOrCreateProfile(walletAddress: string): Promise<PlayerProfile> {
  const wallet = walletAddress.toLowerCase()
  if (!pool) {
    let profile = memoryProfiles.get(wallet)
    if (!profile) {
      profile = { wallet, unlockedRobots: ['bastion'], totalKills: 0, totalMatches: 0 }
      memoryProfiles.set(wallet, profile)
    }
    return profile
  }

  const result = await pool.query(
    `INSERT INTO player_profiles (wallet) VALUES ($1)
     ON CONFLICT (wallet) DO UPDATE SET updated_at = NOW()
     RETURNING wallet, unlocked_robots, total_kills, total_matches`,
    [wallet]
  )
  const row = result.rows[0]
  return {
    wallet: row.wallet,
    unlockedRobots: row.unlocked_robots as RobotClassId[],
    totalKills: row.total_kills,
    totalMatches: row.total_matches
  }
}

export async function recordPlayerMatch(walletAddress: string, kills: number): Promise<void> {
  const wallet = walletAddress.toLowerCase()
  if (!pool) {
    const profile = await getOrCreateProfile(wallet)
    profile.totalKills += Math.max(0, Math.floor(kills))
    profile.totalMatches++
    return
  }

  await pool.query(
    `INSERT INTO player_profiles (wallet, total_kills, total_matches)
     VALUES ($1, $2, 1)
     ON CONFLICT (wallet) DO UPDATE SET
       total_kills = player_profiles.total_kills + $2,
       total_matches = player_profiles.total_matches + 1,
       updated_at = NOW()`,
    [wallet, Math.max(0, Math.floor(kills))]
  )
}
