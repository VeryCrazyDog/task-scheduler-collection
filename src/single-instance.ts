// TypeScript typing
export type Task<C = unknown, R = unknown> = (context: C) => R | Promise<R>

export interface FixedIntervalRunOptions {
  type: 'FIXED_INTERVAL'
  /**
   * Number of milliseconds between two run start times.
   */
  interval: number
  /**
   * Handling way when this run finished at a time which missed the next run start
   * time. Default is `RUN_IMMEDIATELY`. Notice that if multiple next run start times
   * are missed, the next run will only run once. In other words, only 1 maximum pending
   * run can exist.
   */
  onPastTime?: 'RUN_IMMEDIATELY' | 'NEXT_RUN_TIME'
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
  firstAttempt?: {
    startTime: Date
    endTime: Date
  }
}

// Private classes
class AssertionError extends Error {
  constructor (message?: string) {
    super(message)
    this.name = 'AssertionError'
  }
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
    let startTime = startDelayOrTime
    if (typeof startTime === 'number') {
      startTime = new Date(Date.now() + startTime)
    }
    this.cancelNextRun()
    this.#nextRunData = {
      startTime,
      timer: setTimeout(this.#runTask.bind(this), startTime.getDate() - Date.now()),
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

  #scheduleWithSuccessResult (taskReturnValue: R, startTime: Date, endTime: Date): void {
    // Determine next run time
    let nextRun: number | Date | null
    if (this.#nextRunData === null) {
      // `cancalNextRun()` is called while task is running
      nextRun = null
    } else {
      const thisRunData = this.#nextRunData
      const options = this.#options.onSuccess
      if (options === null) {
        nextRun = null
      } else if (typeof options === 'function') {
        nextRun = options(taskReturnValue, { startTime, endTime }, this.#context)
      } else if (options.type === 'FIXED_INTERVAL') {
        const onPastTime = options.onPastTime ?? 'RUN_IMMEDIATELY'
        if (onPastTime === 'RUN_IMMEDIATELY') {
          nextRun = new Date(thisRunData.startTime.getTime() + options.interval)
        } else if (onPastTime === 'NEXT_RUN_TIME') {
          if (options.interval <= 1) {
            nextRun = new Date()
          } else {
            const thisTimeSlot = thisRunData.startTime.getTime()
            const interval = options.interval
            const now = Date.now()
            const diff = now - thisTimeSlot
            const increment = (((diff - (diff % interval)) / interval) + 1) * interval
            const newTimestampMs = thisTimeSlot + increment
            if (!(newTimestampMs > now)) { throw new AssertionError('Expect newTimestampMs is greater than now') }
            nextRun = new Date(newTimestampMs)
          }
        } else {
          throw new AssertionError('Not implemented case')
        }
      } else if (options.type === 'RUN_END_TIME') {
        nextRun = new Date(endTime.getTime() + options.delay)
      } else {
        throw new AssertionError('Not implemented case')
      }
    }
    // Use next run time to set next run data
    if (nextRun === null) {
      this.#nextRunData = null
    } else {
      if (typeof nextRun === 'number') {
        nextRun = new Date(Date.now() + nextRun)
      }
      this.#nextRunData = {
        startTime: nextRun,
        timer: setTimeout(this.#runTask.bind(this), nextRun.getTime() - Date.now()),
        attemptNumber: 1
      }
    }
  }

  #scheduleWithErrorResult (caughtValue: any, startTime: Date, endTime: Date): void {
    const thisRunData = this.#nextRunData
    if (thisRunData === null) { throw new AssertionError('Expect thisRunData is not null') }
    if ((thisRunData.attemptNumber === 1) !== (thisRunData.firstAttempt === undefined)) {
      throw new AssertionError('Expect firstAttempt is defined when attemptNumber is larger than 1')
    }
    const options = this.#options.onError
    // Determine next run time
    let nextRun: number | Date | null
    if (options === null) {
      nextRun = null
    } else if (typeof options === 'function') {
      nextRun = options(caughtValue, {
        attemptNumber: thisRunData.attemptNumber,
        startTime,
        endTime,
        firstAttemptStartTime: thisRunData.firstAttempt?.startTime ?? startTime,
        firstAttemptEndTime: thisRunData.firstAttempt?.endTime ?? endTime
      }, this.#context)
    } else if (thisRunData.attemptNumber >= (options.attempt ?? Infinity)) {
      nextRun = null
    } else {
      nextRun = new Date(endTime.getTime() + options.delay)
    }
    // Use next run time to set next run data
    if (nextRun === null) {
      this.#nextRunData = null
    } else {
      if (typeof nextRun === 'number') {
        nextRun = new Date(Date.now() + nextRun)
      }
      this.#nextRunData = {
        startTime: nextRun,
        timer: setTimeout(this.#runTask.bind(this), nextRun.getTime() - Date.now()),
        attemptNumber: thisRunData.attemptNumber + 1
      }
      if (thisRunData.attemptNumber === 1) {
        this.#nextRunData.firstAttempt = {
          startTime,
          endTime
        }
      }
    }
  }

  #runTask (): void {
    type ExecutionResult = {
      success: true
      returnValue: R
    } | {
      success: false
      caughtValue: any
    }

    if (this.#taskRunningPromise !== null) { return }
    let isFinallyExecuted = false
    this.#taskRunningPromise = (async () => {
      try {
        let taskResult: ExecutionResult
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
        if (!taskResult.success) {
          this.#scheduleWithErrorResult(taskResult.caughtValue, startTime, endTime)
          throw taskResult.caughtValue
        } else {
          this.#scheduleWithSuccessResult(taskResult.returnValue, startTime, endTime)
        }
        return taskResult.returnValue
      } finally {
        this.#taskRunningPromise = null
        isFinallyExecuted = true
      }
    })()
    // Avoid unhandled rejection
    this.#taskRunningPromise.catch(error => {
      if (error instanceof AssertionError) {
        throw error
      }
    })
    // In case the task returns immediately in the current iteration of the Node.js event loop
    if (isFinallyExecuted) {
      this.#taskRunningPromise = null
    }
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
    if (this.#taskRunningPromise === null) { throw new AssertionError('Expect #taskRunningPromise is not null') }
    return this.#taskRunningPromise
  }
}
