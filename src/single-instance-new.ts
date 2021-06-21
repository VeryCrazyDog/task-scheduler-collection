import { strict as assert } from 'assert'

export type Task<C = unknown, T = unknown> = (context: C) => T | Promise<T>

export interface FixedIntervalRunOptions {
  type: 'RUN_START_TIME'
  delay: number
  onPastTime: 'EXECUTE_IMMEDIATELY' | 'NEXT_INTERVAL'
}
export interface OnCompleteRunOptions {
  type: 'RUN_END_TIME'
  delay: number
}
export type OnSuccessNextRunOptions = FixedIntervalRunOptions | OnCompleteRunOptions
export interface OnErrorNextRunOptions {
  delay: number
  /**
   * Maximum number of attempt. Default is `Infinity`.
   */
  attempt?: number
}
export interface SingleInstanceTaskSchedulerOptions {
  /**
   * Defautl is `null`, which will not trigger any next run.
   */
  onSuccess?: null | OnSuccessNextRunOptions
  /**
   * Default is `null`, which will not trigger any next run.
   */
  onError?: null | OnErrorNextRunOptions
}

type CParamsWithoutCtx<C, T> = [
  task: Task<C, T>,
  options?: SingleInstanceTaskSchedulerOptions
]
type CParamsWithCtx<C, T> = [
  task: Task<C, T>,
  options: SingleInstanceTaskSchedulerOptions | undefined,
  initialContext: C
]

/**
 * A single instance task scheduler with flexible next run time.
 *
 * Stability: 1 - Experimental.
 */
export class SingleInstanceTaskScheduler<C = undefined, R = unknown> {
  readonly #task: Task<C, R>
  readonly #options: Required<SingleInstanceTaskSchedulerOptions>
  readonly #context: C

  constructor (task: Task<C, R>, options?: SingleInstanceTaskSchedulerOptions)
  constructor (task: Task<C, R>, options: SingleInstanceTaskSchedulerOptions | undefined, initialContext: C)
  // Reference https://stackoverflow.com/a/52477831/1131246
  constructor (...values: undefined extends C ? CParamsWithoutCtx<C, R> : CParamsWithCtx<C, R>) {
    this.#task = values[0]
    const options = values[1] ?? {}
    this.#options = {
      onSuccess: options.onSuccess ?? null,
      onError: options.onError ?? null
    }
    this.#context = values[2] as C
  }
}
