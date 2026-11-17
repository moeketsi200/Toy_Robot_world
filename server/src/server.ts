import http from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { GameWorld } from './world'
import { ClientCommand, isClientCommand } from './types'
import { authenticateSignedSession, consumeSession, issueSessionToken, verifySessionToken } from './auth'
import { getOrCreateProfile, initializeProfileStore } from './profileStore'
import { createTournament, getCurrentTournament, initializeTournamentStore, registerTournamentEntrant, startTournament } from './tournamentStore'

const PORT = parseInt(process.env.PORT || '8080', 10)
const world = new GameWorld()
let wss: WebSocketServer

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Identity-Auth-Chain-0, X-Identity-Auth-Chain-1, X-Identity-Auth-Chain-2, X-Identity-Timestamp, X-Identity-Metadata')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'POST' && req.url === '/auth/session') {
    void (async () => {
      try {
        const wallet = await authenticateSignedSession(req)
        const profile = await getOrCreateProfile(wallet)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        const adminWallet = process.env.ADMIN_WALLET?.trim().toLowerCase()
        res.end(JSON.stringify({
          token: issueSessionToken(wallet),
          isAdmin: !!adminWallet && wallet.toLowerCase() === adminWallet,
          profile: { unlockedRobots: profile.unlockedRobots, totalKills: profile.totalKills, totalMatches: profile.totalMatches }
        }))
      } catch (error) {
        console.warn('[AUTH] Rejected session request:', error)
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Player authentication failed' }))
      }
    })()
    return
  }

  if (req.method === 'GET' && req.url === '/tournaments/current') {
    void getCurrentTournament().then((tournament) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ tournament }))
    }).catch((error) => sendError(res, error))
    return
  }

  if (req.method === 'POST' && req.url === '/tournaments') {
    void (async () => {
      try {
        const wallet = authenticatedWallet(req)
        if (!isAdminWallet(wallet)) return sendJson(res, 403, { error: 'Admin account required' })
        const body = await readJsonBody(req)
        const tournament = await createTournament({
          title: String(body.title ?? ''),
          startsAt: String(body.startsAt ?? ''),
          playerCap: Number(body.playerCap),
          createdBy: wallet
        })
        sendJson(res, 201, { tournament })
      } catch (error) { sendError(res, error) }
    })()
    return
  }

  const registerMatch = req.url?.match(/^\/tournaments\/([a-f0-9-]+)\/register$/i)
  if (req.method === 'POST' && registerMatch) {
    void (async () => {
      try {
        const wallet = authenticatedWallet(req)
        const body = await readJsonBody(req)
        const tournament = await registerTournamentEntrant(registerMatch[1], {
          wallet,
          name: String(body.name ?? 'Pilot').trim().slice(0, 24) || 'Pilot',
          registeredAt: new Date().toISOString()
        })
        sendJson(res, 200, { tournament })
      } catch (error) { sendError(res, error) }
    })()
    return
  }

  const startMatch = req.url?.match(/^\/tournaments\/([a-f0-9-]+)\/start$/i)
  if (req.method === 'POST' && startMatch) {
    void (async () => {
      try {
        const wallet = authenticatedWallet(req)
        if (!isAdminWallet(wallet)) return sendJson(res, 403, { error: 'Admin account required' })
        const tournament = await startTournament(startMatch[1])
        sendJson(res, 200, { tournament })
      } catch (error) { sendError(res, error) }
    })()
    return
  }

  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: 'OK',
      game: 'Toy Robot Worlds Arena',
      online: wss?.clients.size ?? 0,
      profileStorage: process.env.DATABASE_URL ? 'postgres' : 'memory-only'
    }))
  } else {
    res.writeHead(404)
    res.end()
  }
})

wss = new WebSocketServer({
  server,
  maxPayload: 4 * 1024,
  handleProtocols: (protocols) => protocols.has('toy-robot-worlds') ? 'toy-robot-worlds' : false
})

wss.on('connection', async (ws, request) => {
  const offeredProtocols = request.headers['sec-websocket-protocol']?.split(',').map((value) => value.trim()) ?? []
  const sessionToken = offeredProtocols.find((value) => value !== 'toy-robot-worlds')
  const identity = verifySessionToken(sessionToken)
  if (!identity || !consumeSession(identity)) {
    ws.close(1008, 'Authentication required')
    return
  }

  try {
    const profile = await getOrCreateProfile(identity.wallet)
    const robotId = `Pilot_${Math.random().toString(36).substring(2, 7)}`
    ws.send(JSON.stringify({
      type: 'WELCOME',
      robotId,
      profile: {
        unlockedRobots: profile.unlockedRobots,
        totalKills: profile.totalKills,
        totalMatches: profile.totalMatches
      }
    }))

    ws.on('message', (data) => {
      try {
        const parsed: unknown = JSON.parse(data.toString())
        if (!isClientCommand(parsed)) {
          ws.close(1008, 'Invalid packet')
          return
        }
        const msg: ClientCommand = parsed
        msg.robotId = robotId
        if (msg.type === 'PRESENCE') {
          if (msg.payload.active) {
            world.registerPlayer(robotId, msg.payload.name, profile.unlockedRobots)
            world.handleCommand({
              type: 'JOIN', robotId,
              payload: { name: msg.payload.name, classId: msg.payload.classId }
            })
          } else {
            world.removePlayer(robotId)
          }
        } else {
          world.handleCommand(msg)
        }
      } catch (error) {
        console.error('[SERVER] Malformed packet received:', error)
      }
    })

    ws.on('close', () => {
      world.removePlayer(robotId)
    })

    ws.on('error', (error) => {
      console.error(`[SERVER] Error on socket ${robotId}:`, error)
    })
  } catch (error) {
    console.error('[SERVER] Failed to open authenticated player session:', error)
    ws.close(1011, 'Could not load player profile')
  }
})

const TICK_INTERVAL = 50
setInterval(() => {
  const packet = JSON.stringify(world.update(TICK_INTERVAL / 1000))
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(packet)
  }
}, TICK_INTERVAL)

void Promise.all([initializeProfileStore(), initializeTournamentStore()]).then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Toy Robot Worlds listening on 0.0.0.0:${PORT} (20 Hz)`)
  })
}).catch((error) => {
  console.error('[SERVER] Failed to initialize profile storage:', error)
  process.exit(1)
})

function authenticatedWallet(req: http.IncomingMessage): string {
  const authorization = req.headers.authorization
  const token = typeof authorization === 'string' && authorization.startsWith('Bearer ') ? authorization.slice(7) : undefined
  const identity = verifySessionToken(token)
  if (!identity) throw Object.assign(new Error('Authentication required; reconnect to the game'), { statusCode: 401 })
  return identity.wallet.toLowerCase()
}

function isAdminWallet(wallet: string): boolean {
  return !!process.env.ADMIN_WALLET && wallet.toLowerCase() === process.env.ADMIN_WALLET.trim().toLowerCase()
}

function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString()
      if (body.length > 8 * 1024) reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }))
    })
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}') as Record<string, unknown>) }
      catch { reject(Object.assign(new Error('Invalid JSON body'), { statusCode: 400 })) }
    })
    req.on('error', reject)
  })
}

function sendJson(res: http.ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function sendError(res: http.ServerResponse, error: unknown): void {
  const statusCode = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 400
  sendJson(res, statusCode, { error: error instanceof Error ? error.message : 'Tournament request failed' })
}
