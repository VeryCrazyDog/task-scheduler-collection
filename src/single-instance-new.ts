import { strict as assert } from 'assert'

// TypeScript typing
export type Task<C = unknown, R = unknown> = (context: C) => R | Promise<R>

export interface FixedIntervalRunOptions {
  type: 'FIXED_INTERVAL'
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

export interface SingleInstanceTaskSchedulerOptions<C, R> {
  /**
   * Defautl is `null`, which will not trigger any next run.
   */
  onSuccess?: null | OnSuccessNextRunOptions | OnSuccessNextRunEvaluator<C, R>
  /**
   * Default is `null`, which will not trigger any next run.
   */
  onError?: null | OnErrorNextRunOptions | OnErrorNextRunEvaluator<C>
}

type CParamsWithoutCtx<C, R> = [
  task: Task<C, R>,
  options?: SingleInstanceTaskSchedulerOptions<C, R>
]
type CParamsWithCtx<C, R> = [
  task: Task<C, R>,
  options: SingleInstanceTaskSchedulerOptions<C, R> | undefined,
  initialContext: C
]

interface NextRunData {
  startTime: Date
  timer: NodeJS.Timeout | null
  attemptNumber: number
}

type ExecutionResult<R = unknown> = {
  success: true
  returnValue: R
} | {
  success: false
  caughtValue: any
}

// Public classes
/**
 * A task scheduler which have at most 1 running task at any time.
 *
 * Stability: 2 - Stable.
 */
export class SingleInstanceTaskScheduler<C = undefined, R = unknown> {
  readonly #task: Task<C, R>
  readonly #options: Required<SingleInstanceTaskSchedulerOptions<C, R>>
  readonly #context: C
  #nextRunData: null | NextRunData = null
  #taskRunningPromise: Promise<R> | null = null

  constructor (task: Task<C, R>, options?: SingleInstanceTaskSchedulerOptions<C, R>)
  constructor (task: Task<C, R>, options: SingleInstanceTaskSchedulerOptions<C, R> | undefined, initialContext: C)
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

  get successNextRunOptions (): null | OnSuccessNextRunOptions | OnSuccessNextRunEvaluator<C, R> {
    return this.#options.onSuccess
  }

  set successNextRunOptions (value: null | OnSuccessNextRunOptions | OnSuccessNextRunEvaluator<C, R>) {
    this.#options.onSuccess = value
  }

  get errorNextRunOptions (): null | OnErrorNextRunOptions | OnErrorNextRunEvaluator<C> {
    return this.#options.onError
  }

  set errorNextRunOptions (value: null | OnErrorNextRunOptions | OnErrorNextRunEvaluator<C>) {
    this.#options.onError = value
  }

  /**
   * Whether a next run is scheduled.
   */
  get scheduled (): boolean {
    return (this.#nextRunData !== null)
  }

  /**
   * The next run time of the task. `null` indicates that there will be no next run.
   */
  get nextRunTime (): null | Date {
    return this.#nextRunData?.startTime ?? null
  }

  /**
   * Whether the task is currently running.
   */
  get running (): boolean {
    return this.#taskRunningPromise !== null
  }

  /**
   * Schedule the task to run after a given milliseconds or absolute date time. If
   * the task is already scheduled, it will be re-scheduled with attempt number retaining
   * the previous value.
   *
   * @param startDelayOrTime Start time of the next run. A delay in milliseconds, or
   * an absolute date time.
   */
  schedule (startDelayOrTime: number | Date): void {
    const prevAttemptNumber = this.#nextRunData?.attemptNumber
    let startTime: Date
    let delay: number
    if (startDelayOrTime instanceof Date) {
      startTime = startDelayOrTime
      delay = startDelayOrTime.getTime() - Date.now()
    } else {
      delay = startDelayOrTime
      startTime = new Date(Date.now() + startDelayOrTime)
    }
    this.cancelNextRun()
    this.#nextRunData = {
      startTime,
      timer: setTimeout(this.#runTask.bind(this), delay),
      attemptNumber: prevAttemptNumber ?? 1
    }
  }

  /**
   * Cancel the next scheduled run. Task already running will not be cancelled.
   */
  cancelNextRun (): void {
    if (this.#nextRunData?.timer != null) {
      clearTimeout(this.#nextRunData.timer)
    }
    this.#nextRunData = null
  }

  #scheduleWithResult (taskResult: ExecutionResult<R>, startTime: Date, endTime: Date): void {
    if (this.#nextRunData === null) { assert.fail('#nextRunData should not be null') }
    let nextRun: number | Date | null
    if (taskResult.success) {
      const options = this.#options.onSuccess
      if (options === null) {
        nextRun = null
      } else if (typeof options === 'function') {
        nextRun = options(taskResult.returnValue, { startTime, endTime }, this.#context)
      } else {
        if (options.type === 'FIXED_INTERVAL') {
          if (options.onPastTime !== 'NEXT_INTERVAL') {
            nextRun = new Date(this.#nextRunData.startTime.getTime() + options.interval)
          } else {
            // TODO
          }
        } else {
          // TODO
        }
      }
    } else {
      // TODO
    }
  }

  #runTask (): void {
    if (this.#taskRunningPromise !== null) { return }
    this.#taskRunningPromise = (async () => {
      try {
        let taskResult: ExecutionResult<R>
        const startTime = new Date()
        try {
          taskResult = {
            success: true,
            returnValue: await this.#task(this.#context)
          }
        } catch (error) {
          taskResult = {
            success: false,
            caughtValue: error
          }
        }
        const endTime = new Date()
        this.#scheduleWithResult(taskResult, startTime, endTime)
        if (!taskResult.success) {
          throw taskResult.caughtValue
        }
        return taskResult.returnValue
      } finally {
        this.#taskRunningPromise = null
      }
    })()
    // Avoid unhandled rejection
    this.#taskRunningPromise.catch(() => {})
  }

  /**
   * Run task immediately without waiting for the task returned value. Previous attempt number
   * is retained. If configured, next run will be scheduled after run completed.
   */
  // We intented to return Promise from non-async function
  // eslint-disable-next-line @typescript-eslint/promise-function-async
  run (): Promise<R> {
    const prevAttemptNumber = this.#nextRunData?.attemptNumber
    this.cancelNextRun()
    this.#nextRunData = {
      startTime: new Date(),
      timer: null,
      attemptNumber: prevAttemptNumber ?? 1
    }
    this.#runTask()
    if (this.#taskRunningPromise === null) { assert.fail('taskRunningPromise should not be null') }
    return this.#taskRunningPromise
  }
}
