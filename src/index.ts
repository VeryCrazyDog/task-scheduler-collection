import { strict as assert } from 'assert'

export type Task<C, T> = (context: C) => T | Promise<T>

export type TaskResult<T> = {
  type: 'SUCCESS'
  returnValue: T
} | {
  type: 'ERROR'
  caughtValue: any
}
export interface TaskMetadata {
  startTime: Date
  endTime: Date
}
export type NextRunTimeEvaluator<C, T> = (result: TaskResult<T>, meta: TaskMetadata, context: C) => number | Date | null

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
  #isRunning: boolean = false

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
    return this.#isRunning
  }

  schedule (): void {
    // TODO
  }

  cancelNextRun (): void {
    if (this.#nextRunTimer !== null) {
      clearTimeout(this.#nextRunTimer)
      this.#nextRunTimer = null
    }
  }

  run (): void {
    if (this.#isRunning) { return }
    this.#isRunning = true
    // In case of implementation error, we will just let it throw so that we can notice such error
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    ;(async () => {
      try {
        let taskResult: TaskResult<T>
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
        if (this.#nextRunTimeEvaluator != null) {
          const nextRunTime = this.#nextRunTimeEvaluator(taskResult, {
            startTime,
            endTime
          }, this.#context)
          if (nextRunTime != null) {
            let delay: number
            if (nextRunTime instanceof Date) {
              delay = nextRunTime.getTime() - Date.now()
            } else {
              delay = nextRunTime
            }
            assert.strictEqual(this.#nextRunTimer, null)
            // TODO
            this.#nextRunTimer = setTimeout(() => {}, delay)
          }
        }
      } finally {
        this.#isRunning = false
      }
    })()
  }

  async runWaitResult (): Promise<T> {
    // TODO
    return Promise.resolve() as any
  }
}
