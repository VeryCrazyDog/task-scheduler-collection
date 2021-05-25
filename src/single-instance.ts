import { strict as assert } from 'assert'

export type Task<C = {}, T = undefined> = (context: C) => T | Promise<T>

export interface NextRunMetadata {
  attemptNumber: number
  isRetry: boolean
  firstAttempt: null | {
    startTime: Date
    endTime: Date
  }
}

interface Context<C> {
  nextRunMetadata: NextRunMetadata
  userContext: C
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
  isRetry: boolean
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
  startTime: number | Date
  isRetry: boolean
}
export type NextRunTimeEvaluator<C = {}, T = undefined> = (
  result: ExecutionResult<T>,
  meta: ExecutionMetadata,
  context: C
) => NextRunRequest | null

export interface Options<C = {}, T = undefined> {
  /**
   * Options for next run time, or a function that return the next run time of the task.
   *
   * If a function is provided, it will be called after a task ended to evaluate the
   * next run time. The returned value can be a delay in milliseconds, or an absolute
   * date time `Date` object, or `null` which indicate no next run. Default is `null`.
   */
  nextRunTime?: NextRunTimeOptions | NextRunTimeEvaluator<C, T>
}

/**
 * A single instance task scheduler with flexible next run time.
 *
 * Stability: 1 - Experimental.
 */
// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
export class SingleInstanceTaskScheduler<C = {}, T = void> {
  readonly #task: Task<C, T>
  readonly #context: Context<C>
  readonly #nextRunTimeEvaluator: null | NextRunTimeEvaluator<C, T>
  /**
   * `true` to indicate the timer will be set after task end
   */
  #nextRunTimer: NodeJS.Timeout | true | null = null
  #taskRunningPromise: Promise<T> | null = null

  constructor (
    task: Task<C, T>,
    initialContext: C,
    options?: Options<C, T>
  ) {
    this.#task = task
    this.#context = {
      nextRunMetadata: {
        attemptNumber: 1,
        isRetry: false,
        firstAttempt: null
      },
      userContext: initialContext
    }
    const nextRunTime = options?.nextRunTime ?? null
    if (typeof nextRunTime === 'function' || nextRunTime === null) {
      this.#nextRunTimeEvaluator = nextRunTime
    } else {
      this.#nextRunTimeEvaluator = buildEvaluator(nextRunTime)
    }
  }

  /**
   * Whether a next run is scheduled.
   */
  get scheduled (): boolean {
    return (this.#nextRunTimer !== null)
  }

  /**
   * Whether the task is currently running.
   */
  get running (): boolean {
    return this.#taskRunningPromise !== null
  }

  /**
   * Schedule the task to run after a given milliseconds or absolute date time. If
   * the task is already scheduled, it will be re-scheduled.
   * @param startTime Start time of the next run. A delay in milliseconds, or an absolute
   *   date time.
   */
  schedule (startTime: number | Date): void {
    let delay: number
    if (startTime instanceof Date) {
      delay = startTime.getTime() - Date.now()
    } else {
      delay = startTime
    }
    this.cancelNextRun()
    this.#nextRunTimer = setTimeout(this.run.bind(this), delay)
  }

  /**
   * Cancel the next scheduled run. Running task will not be affected.
   */
  cancelNextRun (): void {
    if (this.#nextRunTimer !== null) {
      if (this.#nextRunTimer !== true) {
        clearTimeout(this.#nextRunTimer)
      }
      this.#nextRunTimer = null
    }
  }

  private scheduleWithResult (taskResult: ExecutionResult<T>, startTime: Date, endTime: Date): void {
    let isNextRunRetry = false
    if (this.#nextRunTimeEvaluator == null) {
      this.#nextRunTimer = null
    } else {
      const meta = this.#context.nextRunMetadata
      const nextRunTime = this.#nextRunTimeEvaluator(taskResult, {
        firstAttemptStartTime: meta.firstAttempt?.startTime ?? startTime,
        firstAttemptEndTime: meta.firstAttempt?.endTime ?? endTime,
        attemptNumber: meta.attemptNumber,
        isRetry: meta.isRetry,
        startTime,
        endTime
      }, this.#context.userContext)
      if (nextRunTime == null) {
        this.#nextRunTimer = null
      } else {
        if (this.#nextRunTimer !== null) {
          this.schedule(nextRunTime.startTime)
        }
        isNextRunRetry = nextRunTime.isRetry
      }
    }
    const meta = this.#context.nextRunMetadata
    meta.isRetry = isNextRunRetry
    if (meta.isRetry) {
      if (meta.attemptNumber === 1) {
        meta.firstAttempt = {
          startTime,
          endTime
        }
      }
      meta.attemptNumber++
    } else {
      meta.attemptNumber = 1
      meta.firstAttempt = null
    }
  }

  /**
   * Run the scheduled task immediately without waiting for the task returned value. Next
   * run will be scheduled if configured.
   */
  run (): void {
    if (this.#nextRunTimer === null) {
      this.#nextRunTimer = true
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
            returnValue: await this.#task(this.#context.userContext)
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
          startTime: (meta.startTime.getTime() + onSuccess.delay) - Date.now(),
          isRetry: false
        }
      } else if (onSuccess.type === 'RUN_END_TIME') {
        request = {
          startTime: (meta.endTime.getTime() + onSuccess.delay) - Date.now(),
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
          startTime: (meta.endTime.getTime() + options.onError.delay) - Date.now(),
          isRetry: true
        }
      }
    } else {
      assert.fail('Not implemented onError.type')
    }
    return request
  }
}
