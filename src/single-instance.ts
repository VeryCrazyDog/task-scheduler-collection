import { strict as assert } from 'assert'

export type Task<C = undefined, T = undefined> = (context: C) => T | Promise<T>

interface NextRunData {
  startTime: Date
  timer: NodeJS.Timeout
  attemptNumber: number
}

interface FirstAttemptMetadata {
  startTime: Date
  endTime: Date
}

export type ExecutionResult<T = undefined> = {
  type: 'SUCCESS'
  returnValue: T
} | {
  type: 'ERROR'
  caughtValue: any
}
export interface ExecutionMetadata {
  /**
   * Start time of the first attempt.
   */
  firstAttemptStartTime: Date
  /**
   * End time of the first attempt.
   */
  firstAttemptEndTime: Date
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
}
export interface NextRunRequest {
  startDelayOrTime: number | Date
  /**
   * Whether the next run is a retry attempt
   */
  isRetry: boolean
}
export type NextRunTimeEvaluator<C = undefined, T = undefined> = (
  result: ExecutionResult<T>,
  meta: ExecutionMetadata,
  context: C
) => NextRunRequest | null

export interface Options<C = undefined, T = undefined> {
  /**
   * Options for next run time, or a function that return the next run time of the task.
   * Default is `null`.
   */
  nextRunTime?: NextRunTimeOptions | NextRunTimeEvaluator<C, T>
}

/**
 * A single instance task scheduler with flexible next run time.
 *
 * Stability: 1 - Experimental.
 */
export class SingleInstanceTaskScheduler<C = undefined, T = undefined> {
  readonly #task: Task<C, T>
  readonly #context: C
  #nextRunTimeEvaluator: null | NextRunTimeEvaluator<C, T> = null
  /**
   * `null` indicates there is no next run, `undefined` indicate next run information
   * is going to be set after the current running task end.
   */
  #nextRunData: NextRunData | null | undefined = null
  #taskRunningPromise: Promise<T> | null = null
  #firstAttempt: FirstAttemptMetadata | null = null

  constructor (
    task: Task<C, T>,
    initialContext: C,
    options?: Options<C, T>
  ) {
    this.#task = task
    this.#context = initialContext
    this.setNextRunTimeOptions(options?.nextRunTime ?? null)
  }

  /**
   * Whether a next run is scheduled.
   */
  get scheduled (): boolean {
    return (this.#nextRunData !== null)
  }

  // Maybe we can consider to return `Date | null | Promise<Date | null>`?
  /**
   * The next run time of the task. `null` indicates that there will be no next run.
   * `undefined` indicates that the next run time is going to be known after the current
   * task end.
   */
  get nextRunTime (): Date | null | undefined {
    let result: Date | null | undefined
    if (this.#nextRunData == null) {
      result = this.#nextRunData
    } else {
      result = this.#nextRunData.startTime
    }
    return result
  }

  /**
   * Whether the task is currently running.
   */
  get running (): boolean {
    return this.#taskRunningPromise !== null
  }

  /**
   * Set options for next run time, or a function that return the next run time of the task.
   * The change will be effective after next run.
   *
   * If a function is provided, it will be called after a task ended to evaluate the
   * next run time. The returned value can be a delay in milliseconds, or an absolute
   * date time `Date` object, or `null` which indicate no next run. Default is `null`.
   */
  setNextRunTimeOptions (value: NextRunTimeOptions | NextRunTimeEvaluator<C, T> | null): void {
    if (typeof value === 'function' || value === null) {
      this.#nextRunTimeEvaluator = value
    } else {
      this.#nextRunTimeEvaluator = buildEvaluator(value)
    }
  }

  /**
   * Schedule the task to run after a given milliseconds or absolute date time. If
   * the task is already scheduled, it will be re-scheduled.
   * @param startDelayOrTime Start time of the next run. A delay in milliseconds, or an absolute
   *   date time.
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
      timer: setTimeout(this.run.bind(this), delay),
      attemptNumber: prevAttemptNumber ?? 1
    }
  }

  /**
   * Cancel the next scheduled run. Running task will not be affected.
   */
  cancelNextRun (): void {
    if (this.#nextRunData != null) {
      clearTimeout(this.#nextRunData.timer)
    }
    this.#nextRunData = null
  }

  private scheduleWithResult (taskResult: ExecutionResult<T>, startTime: Date, endTime: Date): void {
    if (this.#nextRunTimeEvaluator == null) {
      this.#nextRunData = null
    } else {
      const thisRunAttemptNumber = this.#nextRunData?.attemptNumber ?? 1
      const nextRunRequest = this.#nextRunTimeEvaluator(taskResult, {
        firstAttemptStartTime: this.#firstAttempt?.startTime ?? startTime,
        firstAttemptEndTime: this.#firstAttempt?.endTime ?? endTime,
        attemptNumber: thisRunAttemptNumber,
        startTime,
        endTime
      }, this.#context)
      if (nextRunRequest === null) {
        this.#nextRunData = null
      } else if (this.#nextRunData !== null) {
        // Next run was not cancelled, so we schedule the next run
        this.schedule(nextRunRequest.startDelayOrTime)
        if (this.#nextRunData === undefined) { assert.fail('nextRunData should not be undefined') }
        // Update first attempt metadata and next run attempt number
        if (nextRunRequest.isRetry) {
          if (thisRunAttemptNumber === 1) {
            this.#firstAttempt = {
              startTime,
              endTime
            }
          }
          this.#nextRunData.attemptNumber = thisRunAttemptNumber + 1
        } else {
          this.#firstAttempt = null
          this.#nextRunData.attemptNumber = 1
        }
      }
    }
  }

  /**
   * Run the scheduled task immediately without waiting for the task returned value. Next
   * run will be scheduled if configured.
   */
  run (): void {
    if (this.#nextRunData === null) {
      this.#nextRunData = undefined
    }
    if (this.#taskRunningPromise !== null) { return }
    // In case of implementation error, we will just let it throw so that we can notice such error
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.#taskRunningPromise = (async () => {
      try {
        let taskResult: ExecutionResult<T>
        const startTime = new Date()
        try {
          taskResult = {
            type: 'SUCCESS',
            returnValue: await this.#task(this.#context)
          }
        } catch (error) {
          taskResult = {
            type: 'ERROR',
            caughtValue: error
          }
        }
        const endTime = new Date()
        this.scheduleWithResult(taskResult, startTime, endTime)
        if (taskResult.type === 'ERROR') {
          throw taskResult.caughtValue
        }
        return taskResult.returnValue
      } finally {
        this.#taskRunningPromise = null
      }
    })()
  }

  /**
   * Run the scheduled task immediately and return a promise which will be fulfilled
   * with the task returned value. Next run will be scheduled if configured.
   */
  async runReturnResult (): Promise<T> {
    this.run()
    if (this.#taskRunningPromise === null) { assert.fail('taskRunningPromise should not be null') }
    return await this.#taskRunningPromise
  }
}

// -----------------------------------------------------------------------------

export interface OneTimeEvaluateOptions {
  type: 'ONE_TIME'
}
export interface IntervalEvaluateOptions {
  type: 'RUN_START_TIME' | 'RUN_END_TIME'
  delay: number
}
export interface OnErrorEvaluateOptions {
  delay: number
  /**
   * Default is `Infinity`.
   */
  attempt?: number
}
export interface NextRunTimeOptions {
  onSuccess: OneTimeEvaluateOptions | IntervalEvaluateOptions
  /**
   * Default is `undefined`, which will not perform retry.
   */
  onError?: OnErrorEvaluateOptions
}

export function buildEvaluator<C, T> (
  options: NextRunTimeOptions
): NextRunTimeEvaluator<C, T> {
  return (result, meta): NextRunRequest | null => {
    let request: NextRunRequest | null
    if (result.type === 'SUCCESS') {
      const onSuccess = options.onSuccess
      if (onSuccess.type === 'ONE_TIME') {
        request = null
      } else if (onSuccess.type === 'RUN_START_TIME') {
        request = {
          startDelayOrTime: new Date(meta.startTime.getTime() + onSuccess.delay),
          isRetry: false
        }
      } else if (onSuccess.type === 'RUN_END_TIME') {
        request = {
          startDelayOrTime: onSuccess.delay,
          isRetry: false
        }
      } else {
        assert.fail('Not implemented onSuccess.type')
      }
    } else if (result.type === 'ERROR') {
      if (
        options.onError === undefined ||
        (options.onError.attempt !== undefined && meta.attemptNumber >= options.onError.attempt)
      ) {
        request = null
      } else {
        request = {
          startDelayOrTime: options.onError.delay,
          isRetry: true
        }
      }
    } else {
      assert.fail('Not implemented onError.type')
    }
    return request
  }
}
