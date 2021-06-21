import { strict as assert } from 'assert'

export type Task<C = unknown, R = unknown> = (context: C) => R | Promise<R>

export interface FixedIntervalRunOptions {
  type: 'RUN_START_TIME'
  /**
   * Number of milliseconds between two run start times.
   */
  interval: number
  onPastTime: 'EXECUTE_IMMEDIATELY' | 'NEXT_INTERVAL'
}
export interface OnCompleteRunOptions {
  type: 'RUN_END_TIME'
  /**
   * Number of milliseconds to wait for the next run to start, since the last run end time.
   */
  delay: number
}
export type OnSuccessNextRunOptions = FixedIntervalRunOptions | OnCompleteRunOptions
export interface SuccessRunMetadata {
  /**
   * Start time of this attempt.
   */
  startTime: Date
  /**
   * End time of this attempt.
   */
  endTime: Date
}
export type OnSuccessNextRunEvaluator<C = unknown, R = unknown> = (
  returnValue: R,
  meta: SuccessRunMetadata,
  context: C
) => number | Date | null

export interface OnErrorNextRunOptions {
  delay: number
  /**
   * Maximum number of attempt. Default is `Infinity`.
   */
  attempt?: number
}
export interface ErrorRunMetadata {
  /**
    * The attempt number of this attempt. `1` for first attempt. `2` for second retry attempt.
    */
  attemptNumber: number
  /**
     * Start time of this attempt.
     */
  startTime: Date
  /**
     * End time of this attempt.
     */
  endTime: Date
  /**
   * Start time of the first attempt.
   */
  firstAttemptStartTime: Date
  /**
    * End time of the first attempt.
    */
  firstAttemptEndTime: Date
}
export type OnErrorNextRunEvaluator<C = unknown> = (
  caughtValue: any,
  meta: ErrorRunMetadata,
  context: C
) => number | Date | null

export interface SingleInstanceTaskSchedulerOptions {
  /**
   * Defautl is `null`, which will not trigger any next run.
   */
  onSuccess?: null | OnSuccessNextRunOptions | OnSuccessNextRunEvaluator
  /**
   * Default is `null`, which will not trigger any next run.
   */
  onError?: null | OnErrorNextRunOptions | OnErrorNextRunEvaluator
}

type CParamsWithoutCtx<C, R> = [
  task: Task<C, R>,
  options?: SingleInstanceTaskSchedulerOptions
]
type CParamsWithCtx<C, R> = [
  task: Task<C, R>,
  options: SingleInstanceTaskSchedulerOptions | undefined,
  initialContext: C
]

/**
 * A single instance task scheduler with flexible next run time.
 *
 * Stability: 2 - Stable.
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
