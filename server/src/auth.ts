import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { IncomingMessage } from 'http'
import { Authenticator, AuthChain } from '@dcl/crypto'

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000
const tokenSecret = process.env.AUTH_TOKEN_SECRET || randomBytes(32).toString('hex')

export interface SessionIdentity {
  wallet: string
  expiresAt: number
  sessionId: string
}

const consumedSessionIds = new Map<string, number>()

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name]
  return Array.isArray(value) ? value[0] : value
}

export async function authenticateSignedSession(req: IncomingMessage): Promise<string> {
  const timestampHeader = header(req, 'x-identity-timestamp')
  const metadata = header(req, 'x-identity-metadata')
  if (!timestampHeader || !metadata) throw new Error('Missing Decentraland signed request headers')

  const timestamp = Number(timestampHeader)
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 2 * 60 * 1000) {
    throw new Error('Signed request timestamp is invalid or expired')
  }

  // SignedFetch sends the auth chain in numbered headers. Allow additional links so
  // delegated/scoped identities are not rejected just because they have >3 links.
  const authChain: AuthChain = []
  for (let index = 0; ; index++) {
    const value = header(req, `x-identity-auth-chain-${index}`)
    if (!value) break
    let link: unknown
    try {
      link = JSON.parse(value)
    } catch {
      throw new Error(`Invalid Decentraland auth chain link ${index}`)
    }
    if (!link || typeof link !== 'object' || !('type' in link) || !('payload' in link)) {
      throw new Error(`Malformed Decentraland auth chain link ${index}`)
    }
    authChain.push(link as AuthChain[number])
  }

  if (authChain.length < 2) throw new Error('Incomplete Decentraland auth chain')

  const signedRequest = authChain[authChain.length - 1]
  // SignedFetch canonicalizes the method and path to lowercase, but metadata is
  // signed byte-for-byte. Lowercasing the whole payload mutates JSON keys/values.
  const expectedPayload = `post:/auth/session:${timestampHeader}:${metadata}`
  if (typeof signedRequest.payload !== 'string' || signedRequest.payload !== expectedPayload) {
    throw new Error('Signed request does not match this endpoint')
  }

  const wallet = Authenticator.ownerAddress(authChain).toLowerCase()
  // A SignedFetch chain terminates at the signed request payload, not at the
  // wallet address. Validate the chain against that final payload.
  const validation = await Authenticator.validateSignature(expectedPayload, authChain, undefined, Date.now())
  if (!validation.ok) throw new Error(validation.message ?? 'Decentraland identity signature is invalid')
  return wallet
}

export function issueSessionToken(wallet: string): string {
  const identity: SessionIdentity = { wallet, expiresAt: Date.now() + TOKEN_TTL_MS, sessionId: randomBytes(16).toString('hex') }
  const payload = Buffer.from(JSON.stringify(identity)).toString('base64url')
  const signature = createHmac('sha256', tokenSecret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

export function verifySessionToken(token: string | undefined): SessionIdentity | null {
  if (!token) return null
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) return null
  const expected = createHmac('sha256', tokenSecret).update(payload).digest()
  let actual: Buffer
  try {
    actual = Buffer.from(signature, 'base64url')
  } catch {
    return null
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null

  try {
    const identity = JSON.parse(Buffer.from(payload, 'base64url').toString()) as SessionIdentity
    if (!/^0x[0-9a-f]{40}$/.test(identity.wallet) || !identity.sessionId || identity.expiresAt <= Date.now()) return null
    return identity
  } catch {
    return null
  }
}

export function consumeSession(identity: SessionIdentity): boolean {
  const now = Date.now()
  for (const [sessionId, expiresAt] of consumedSessionIds) {
    if (expiresAt <= now) consumedSessionIds.delete(sessionId)
  }
  if (consumedSessionIds.has(identity.sessionId)) return false
  consumedSessionIds.set(identity.sessionId, identity.expiresAt)
  return true
}
