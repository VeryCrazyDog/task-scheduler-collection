import { strict as assert } from 'assert'

export type Task<C, T> = (context: C) => T | Promise<T>

export type ExecutionResult<T> = {
  type: 'SUCCESS'
  returnValue: T
} | {
  type: 'ERROR'
  caughtValue: any
}
export interface ExecutionMetadata {
  startTime: Date
  endTime: Date
}
export type NextRunTimeEvaluator<C, T> = (
  result: ExecutionResult<T>,
  meta: ExecutionMetadata,
  context: C
) => number | Date | null

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
  readonly #context: C
  readonly #nextRunTimeEvaluator: null | NextRunTimeEvaluator<C, T>
  #nextRunTimer: NodeJS.Timeout | null = null
  #taskRunningPromise: Promise<T> | null = null

  constructor (
    task: Task<C, T>,
    initialContext: C,
    options?: SingleInstanceTaskSchedulerOptions<C, T>
  ) {
    this.#task = task
    this.#context = initialContext
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

  private scheduleWithResult (taskResult: ExecutionResult<T>, meta: ExecutionMetadata): void {
    if (this.#nextRunTimeEvaluator == null) {
      this.#nextRunTimer = null
    } else {
      const nextRunTime = this.#nextRunTimeEvaluator(taskResult, meta, this.#context)
      if (nextRunTime == null) {
        this.#nextRunTimer = null
      } else {
        assert.strictEqual(this.#nextRunTimer, null)
        this.schedule(nextRunTime)
      }
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
            returnValue: await this.#task(this.#context)
          }
        } catch (error) {
          taskResult = {
            type: 'ERROR',
            caughtValue: error
          }
        }
        const endTime = new Date()
        this.scheduleWithResult(taskResult, {
          startTime,
          endTime
        })
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
