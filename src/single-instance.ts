import { strict as assert } from 'assert'

type Task<C, T> = (context: C) => T | Promise<T>

interface NextRunMetadata {
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

type ExecutionResult<T> = {
  type: 'SUCCESS'
  returnValue: T
} | {
  type: 'ERROR'
  caughtValue: any
}
interface ExecutionMetadata {
  firstAttemptStartTime: Date
  firstAttemptEndTime: Date
  attemptNumber: number
  isRetry: boolean
  /**
   * Start time of this attempt
   */
  startTime: Date
  /**
   * End time of this attempt
   */
  endTime: Date
}
interface NextRunRequest {
  startTime: number | Date
  isRetry: boolean
}
type NextRunTimeEvaluator<C, T> = (
  result: ExecutionResult<T>,
  meta: ExecutionMetadata,
  context: C
) => NextRunRequest | null

export interface SingleInstanceTaskSchedulerOptions<C, T> {
  /**
   * A function that return the next run time of the task. This function will be called
   * after a task ended to evaluate the next run time. The returned value can be a delay
   * in milliseconds, or an absolute date time, or `null` which indicate no next run.
   */
  nextRunTimeEvaluator?: NextRunTimeEvaluator<C, T>
}

// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
export class SingleInstanceTaskScheduler<C = {}, T = void> {
  readonly #task: Task<C, T>
  readonly #context: Context<C>
  readonly #nextRunTimeEvaluator: null | NextRunTimeEvaluator<C, T>
  #nextRunTimer: NodeJS.Timeout | null = null
  #taskRunningPromise: Promise<T> | null = null

  constructor (
    task: Task<C, T>,
    initialContext: C,
    options?: SingleInstanceTaskSchedulerOptions<C, T>
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
    this.#nextRunTimeEvaluator = options?.nextRunTimeEvaluator ?? null
  }

  get scheduled (): boolean {
    return (this.#nextRunTimer !== null)
  }

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

  cancelNextRun (): void {
    if (this.#nextRunTimer !== null) {
      clearTimeout(this.#nextRunTimer)
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
        assert.strictEqual(this.#nextRunTimer, null)
        this.schedule(nextRunTime.startTime)
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

  run (): void {
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

  async runWaitResult (): Promise<T> {
    this.run()
    if (this.#taskRunningPromise === null) { assert.fail('taskRunningPromise should not be null') }
    return await this.#taskRunningPromise
  }
}

// -------------------------------------------------------------------------------------------------

interface OneTimeEvaluateOptions {
  type: 'ONE_TIME'
}
interface IntervalEvaluateOptions {
  type: 'RUN_START_TIME' | 'RUN_END_TIME'
  delay: number
}
interface OnErrorEvaluateOptions {
  delay: number
  attempt?: number
}
interface BuildEvaluatorOptions {
  onSuccess: OneTimeEvaluateOptions | IntervalEvaluateOptions
  onError?: OnErrorEvaluateOptions
}

export function buildEvaluator<C, T> (
  options: BuildEvaluatorOptions
): NextRunTimeEvaluator<C, T> {
  return (result, meta): NextRunRequest | null => {
    let request: NextRunRequest | null
    if (result.type === 'SUCCESS') {
      const onSuccess = options.onSuccess
      if (onSuccess.type === 'ONE_TIME') {
        request = null
      } else if (onSuccess.type === 'RUN_START_TIME') {
        request = {
          startTime: meta.startTime.getTime() + onSuccess.delay,
          isRetry: false
        }
      } else if (onSuccess.type === 'RUN_END_TIME') {
        request = {
          startTime: meta.endTime.getTime() + onSuccess.delay,
          isRetry: false
        }
      } else {
        assert.fail('Not implemented onSuccess.type')
      }
    } else if (result.type === 'ERROR') {
      if (options.onError === undefined) {
        request = null
      } else {
        request = {
          startTime: meta.endTime.getTime() + options.onError.delay,
          isRetry: true
        }
      }
    } else {
      assert.fail('Not implemented onError.type')
    }
    return request
  }
}
