import { strict as assert } from 'assert'

export type Task<C = unknown, T = unknown> = (context: C) => T | Promise<T>

export interface FixedIntervalTriggerOptions {
  type: 'RUN_START_TIME'
  delay: number
  onPastTime: 'EXECUTE_IMMEDIATELY' | 'NEXT_INTERVAL'
}
export interface OnCompleteTriggerOptions {
  type: 'RUN_END_TIME'
  delay: number
}
export type OnSuccessNextTriggerOptions = FixedIntervalTriggerOptions | OnCompleteTriggerOptions
export interface OnErrorNextTriggerOptions {
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
  onSuccess?: null | OnSuccessNextTriggerOptions
  /**
   * Default is `null`, which will not trigger any next run.
   */
  onError?: null | OnErrorNextTriggerOptions
}

type CParamsWithoutContext<C, T> = [
  task: Task<C, T>,
  options?: SingleInstanceTaskSchedulerOptions
]
type CParamsWithContext<C, T> = [
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
  readonly #context: C
  #options: Required<SingleInstanceTaskSchedulerOptions>

  constructor (task: Task<C, R>, options?: SingleInstanceTaskSchedulerOptions)
  constructor (task: Task<C, R>, options: SingleInstanceTaskSchedulerOptions | undefined, initialContext: C)
  constructor (...values: undefined extends C ? CParamsWithoutContext<C, R> : CParamsWithContext<C, R>)
  constructor (
    task: Task<C, R>,
    options: SingleInstanceTaskSchedulerOptions = {},
    initialContext: C = undefined as unknown as C
  ) {
    this.#task = task
    this.#options = {
      onSuccess: options.onSuccess ?? null,
      onError: options.onError ?? null
    }
    this.#context = initialContext
  }
}

const x = new SingleInstanceTaskScheduler(() => {}, undefined, '')
