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
export interface SingleInstanceTaskSchedulerOptions<C> {
  /**
   * Defautl is `null`, which will not trigger any next run.
   */
  onSuccess?: null | OnSuccessNextTriggerOptions
  /**
   * Default is `null`, which will not trigger any next run.
   */
  onError?: null | OnErrorNextTriggerOptions
  /**
   * Default is `undefined`.
   */
  initialContext?: C
}

/**
 * A single instance task scheduler with flexible next run time.
 *
 * Stability: 1 - Experimental.
 */
export class SingleInstanceTaskScheduler<C = undefined, R = unknown> {
  readonly #task: Task<C, R>
  readonly #context: C
  #options: Required<Omit<SingleInstanceTaskSchedulerOptions<C>, 'initialContext'>>

  constructor (task: Task<C, R>)
  constructor (task: Task<C, R>, options: SingleInstanceTaskSchedulerOptions<C>)
  constructor (
    task: Task<C, R>,
    options?: SingleInstanceTaskSchedulerOptions<C>
  ) {
    this.#task = task
    this.#options = {
      onSuccess: options.onSuccess,
      onError: options.onError
    }
    this.#context = options.initialContext
  }
}
