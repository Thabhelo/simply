import { describe, expect, it, vi } from 'vitest'
import type { Response } from 'express'
import { createRequireAuth, type AuthedRequest } from './auth.js'

function mockRes() {
  const res = {} as Response & { statusCode?: number; body?: unknown }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  }) as unknown as Response['status']
  res.json = vi.fn((payload: unknown) => {
    res.body = payload
    return res
  }) as unknown as Response['json']
  return res
}

function reqWith(authorization?: string) {
  return {
    header: (name: string) => (name.toLowerCase() === 'authorization' ? authorization : undefined),
  } as unknown as AuthedRequest
}

describe('createRequireAuth', () => {
  it('passes through without checking a token when auth is disabled (dev open mode)', async () => {
    const verifyIdToken = vi.fn()
    const mw = createRequireAuth({ enabled: false, verifyIdToken })
    const next = vi.fn()
    const res = mockRes()

    await mw(reqWith(undefined), res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(verifyIdToken).not.toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('rejects a request with no Authorization header (401)', async () => {
    const mw = createRequireAuth({ enabled: true, verifyIdToken: vi.fn() })
    const next = vi.fn()
    const res = mockRes()

    await mw(reqWith(undefined), res, next)

    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects a malformed Authorization header (401)', async () => {
    const mw = createRequireAuth({ enabled: true, verifyIdToken: vi.fn() })
    const next = vi.fn()
    const res = mockRes()

    await mw(reqWith('Token abc'), res, next)

    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('attaches uid/email and calls next for a valid Bearer token', async () => {
    const verifyIdToken = vi.fn(async () => ({ uid: 'user-123', email: 'a@b.com' }))
    const mw = createRequireAuth({ enabled: true, verifyIdToken })
    const next = vi.fn()
    const res = mockRes()
    const req = reqWith('Bearer good-token')

    await mw(req, res, next)

    expect(verifyIdToken).toHaveBeenCalledWith('good-token')
    expect(req.uid).toBe('user-123')
    expect(req.email).toBe('a@b.com')
    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('rejects when verification throws (invalid/expired) (401)', async () => {
    const verifyIdToken = vi.fn(async () => {
      throw new Error('expired')
    })
    const mw = createRequireAuth({ enabled: true, verifyIdToken })
    const next = vi.fn()
    const res = mockRes()

    await mw(reqWith('Bearer bad-token'), res, next)

    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })
})
