// The bridge with a FAKE child process only: these tests never start the
// Vercel CLI or touch any database.

import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { childEnvironment, createProductionBridge, parseRunnerOutput, productionCommand, RUNNER_PATH } from './productionBridge'
import type { ChildProcessLike, SpawnProcess } from './productionBridge'
import { RESULT_PREFIX } from './runOperation'

class FakeChild extends EventEmitter implements ChildProcessLike {
  readonly written: string[] = []
  ended = false
  killed: string | undefined
  readonly stdout = new EventEmitter() as EventEmitter & { setEncoding(encoding: 'utf8'): void }
  readonly stdin = {
    write: (data: string) => this.written.push(data),
    end: () => {
      this.ended = true
    },
  }
  constructor() {
    super()
    this.stdout.setEncoding = () => {}
  }
  kill(signal?: NodeJS.Signals) {
    this.killed = signal ?? 'SIGTERM'
  }
  emitOutput(text: string) {
    this.stdout.emit('data', text)
  }
}

function fakeSpawn(behave: (child: FakeChild) => void) {
  const calls: { command: string; args: readonly string[]; env: Record<string, string | undefined> }[] = []
  const children: FakeChild[] = []
  const spawnProcess: SpawnProcess = (command, args, options) => {
    calls.push({ command, args, env: options.env })
    const child = new FakeChild()
    children.push(child)
    queueMicrotask(() => behave(child))
    return child
  }
  return { spawnProcess, calls, children }
}

const result = (body: unknown) => `${RESULT_PREFIX}${JSON.stringify(body)}\n`

describe('Production bridge', () => {
  it('runs `vercel env run -e production` with no credential in the command, and the operation on stdin', async () => {
    const fake = fakeSpawn((child) => {
      child.emitOutput('Retrieving project…\nLoaded env from .env.local\n')
      child.emitOutput(result({ ok: true, body: { status: 'ok' } }))
      child.emit('close', 0)
    })
    const run = createProductionBridge({
      spawnProcess: fake.spawnProcess,
      env: { PATH: '/usr/bin', HOME: '/home/op', DATABASE_URL: 'postgresql://x', PUBLISHING_DATABASE_URL: 'postgresql://dev', PGPASSWORD: 'pw', PUZZLES_READ_DATABASE_URL: 'postgresql://r' },
    })
    expect(await run({ operation: 'schedule' })).toEqual({ ok: true, body: { status: 'ok' } })

    const [call] = fake.calls
    expect(call.command).toBe('vercel')
    expect(call.args).toEqual(['env', 'run', '-e', 'production', '--non-interactive', '--', 'node', RUNNER_PATH])
    expect(call.args.join(' ')).not.toMatch(/postgres|DATABASE/)
    expect(Object.keys(call.env).sort()).toEqual(['HOME', 'PATH']) // database variables stripped; Vercel supplies the child's
    expect(fake.children[0].written).toEqual([JSON.stringify({ operation: 'schedule' })])
    expect(fake.children[0].ended).toBe(true)
  })

  it('starts one child per operation', async () => {
    const fake = fakeSpawn((child) => {
      child.emitOutput(result({ ok: true, body: { status: 'ok' } }))
      child.emit('close', 0)
    })
    const run = createProductionBridge({ spawnProcess: fake.spawnProcess, env: {} })
    await run({ operation: 'schedule' })
    await run({ operation: 'remove-preview', puzzleId: 'animals' })
    expect(fake.calls).toHaveLength(2)
  })

  it('reports an uncertain outcome when the child gives no result', async () => {
    const fake = fakeSpawn((child) => {
      child.emitOutput('Error: something the CLI printed\n')
      child.emit('close', 1)
    })
    const response = await createProductionBridge({ spawnProcess: fake.spawnProcess, env: {} })({ operation: 'schedule' })
    expect(response).toMatchObject({ ok: false, error: 'uncertain' })
    expect(JSON.stringify(response)).not.toContain('something the CLI printed')
  })

  it('kills a child that runs too long and reports an uncertain outcome', async () => {
    vi.useFakeTimers()
    try {
      const fake = fakeSpawn(() => {})
      const pending = createProductionBridge({ spawnProcess: fake.spawnProcess, env: {}, timeoutMs: 1000 })({ operation: 'schedule' })
      await vi.advanceTimersByTimeAsync(1001)
      expect(await pending).toMatchObject({ ok: false, error: 'uncertain' })
      expect(fake.children[0].killed).toBe('SIGKILL')
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports a missing Vercel CLI as not configured', async () => {
    const fake = fakeSpawn((child) => child.emit('error', new Error('spawn vercel ENOENT')))
    expect(await createProductionBridge({ spawnProcess: fake.spawnProcess, env: {} })({ operation: 'schedule' })).toMatchObject({
      ok: false,
      error: 'not-configured',
    })
    const throwing: SpawnProcess = () => {
      throw new Error('EACCES')
    }
    expect(await createProductionBridge({ spawnProcess: throwing, env: {} })({ operation: 'schedule' })).toMatchObject({
      ok: false,
      error: 'not-configured',
    })
  })

  it('parses only a well-formed result line', () => {
    expect(parseRunnerOutput('noise\n' + result({ ok: false, error: 'identity', message: 'm' }))).toEqual({ ok: false, error: 'identity', message: 'm' })
    expect(parseRunnerOutput(`${RESULT_PREFIX}{not json`)).toBeNull()
    expect(parseRunnerOutput(result({ hello: 'world' }))).toBeNull()
    expect(parseRunnerOutput('no result here')).toBeNull()
  })

  it('exposes the command and environment rules for review', () => {
    expect(productionCommand().args).toContain('production')
    expect(childEnvironment({ A: '1', DATABASE_URL_UNPOOLED: 'x', POSTGRES_URL: 'y', PGHOST: 'z' })).toEqual({ A: '1' })
  })
})
