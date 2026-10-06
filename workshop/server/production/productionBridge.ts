// Parent side of a Production operation: the dev Workshop server starts ONE
// short-lived child per operation and never holds a Production credential
// itself.
//
//   vercel env run -e production --non-interactive -- node runner.mjs
//
// The Vercel CLI injects the Production environment into that child only.
// The operation goes in on stdin (never argv); the child's stdout is read
// for the single RESULT_PREFIX line and everything else — CLI progress,
// stderr — is discarded unread, never logged or returned. A timeout kills
// the child. The spawn function is injectable so tests never start Vercel.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { ProductionOperation } from './productionOperations'
import { RESULT_PREFIX } from './runOperation'
import type { RunnerResponse } from './runOperation'

export const RUNNER_PATH = fileURLToPath(new URL('./runner.mjs', import.meta.url))
export const DEFAULT_TIMEOUT_MS = 120_000

export interface ChildProcessLike {
  stdin: { write(data: string): unknown; end(): unknown } | null
  stdout: { setEncoding?(encoding: 'utf8'): unknown; on(event: 'data', listener: (chunk: string | Buffer) => void): unknown } | null
  on(event: 'error', listener: (error: Error) => void): unknown
  on(event: 'close', listener: (code: number | null) => void): unknown
  kill(signal?: NodeJS.Signals): unknown
}

export type SpawnProcess = (
  command: string,
  args: readonly string[],
  options: { cwd: string; env: Record<string, string | undefined> },
) => ChildProcessLike

export interface ProductionBridgeOptions {
  spawnProcess?: SpawnProcess
  timeoutMs?: number
  cwd?: string
  env?: Record<string, string | undefined>
}

export type RunProductionOperation = (operation: ProductionOperation) => Promise<RunnerResponse>

/** The exact command for one operation: the Vercel CLI wrapping the runner. No credential appears in it. */
export function productionCommand(): { command: string; args: string[] } {
  return { command: 'vercel', args: ['env', 'run', '-e', 'production', '--non-interactive', '--', 'node', RUNNER_PATH] }
}

/** The parent's environment minus any database variable, so only Vercel supplies the child's. */
export function childEnvironment(env: Record<string, string | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !/DATABASE|POSTGRES|^PG/i.test(name)))
}

const defaultSpawn: SpawnProcess = (command, args, options) =>
  spawn(command, args, { cwd: options.cwd, env: options.env as NodeJS.ProcessEnv, stdio: ['pipe', 'pipe', 'ignore'] })

const isRunnerResponse = (value: unknown): value is RunnerResponse => {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (record.ok === true) return typeof record.body === 'object' && record.body !== null
  return record.ok === false && typeof record.error === 'string' && typeof record.message === 'string'
}

/** Pulls the single result line out of the child's stdout; null if absent or malformed. */
export function parseRunnerOutput(stdout: string): RunnerResponse | null {
  const line = stdout
    .split('\n')
    .reverse()
    .find((candidate) => candidate.startsWith(RESULT_PREFIX))
  if (!line) return null
  try {
    const value: unknown = JSON.parse(line.slice(RESULT_PREFIX.length))
    return isRunnerResponse(value) ? value : null
  } catch {
    return null
  }
}

export function createProductionBridge(options: ProductionBridgeOptions = {}): RunProductionOperation {
  const spawnProcess = options.spawnProcess ?? defaultSpawn
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const cwd = options.cwd ?? process.cwd()

  return (operation) =>
    new Promise<RunnerResponse>((resolve) => {
      let settled = false
      let stdout = ''
      let timer: ReturnType<typeof setTimeout> | undefined
      const finish = (response: RunnerResponse) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(response)
      }

      const { command, args } = productionCommand()
      let child: ChildProcessLike
      try {
        child = spawnProcess(command, args, { cwd, env: childEnvironment(options.env ?? process.env) })
      } catch {
        finish({ ok: false, error: 'not-configured', message: 'The Vercel CLI could not be started. Nothing was read or changed.' })
        return
      }

      timer = setTimeout(() => {
        child.kill('SIGKILL')
        finish({
          ok: false,
          error: 'uncertain',
          message: 'The Production operation timed out. It may or may not have completed; refresh the Production Schedule.',
        })
      }, timeoutMs)

      child.on('error', () =>
        finish({ ok: false, error: 'not-configured', message: 'The Vercel CLI could not be started. Nothing was read or changed.' }),
      )
      child.stdout?.setEncoding?.('utf8')
      child.stdout?.on('data', (chunk) => {
        stdout += String(chunk)
      })
      child.on('close', () => {
        finish(
          parseRunnerOutput(stdout) ?? {
            ok: false,
            error: 'uncertain',
            message: 'The Production operation returned no result. It may or may not have completed; refresh the Production Schedule.',
          },
        )
      })

      child.stdin?.write(JSON.stringify(operation))
      child.stdin?.end()
    })
}
