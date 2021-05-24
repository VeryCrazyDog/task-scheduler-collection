interface Context<C> {
  userContext: C
}

type TaskResult<T> = {
  type: 'SUCCESS'
  returnValue: T
} | {
  type: 'ERROR'
  caughtValue: any
}
interface TaskMetadata {
  startTime: Date
  endTime: Date
}
type NextRunTimeEvaluator<C, T> = (result: TaskResult<T>, meta: TaskMetadata, context: C) => number | Date | null

export interface SingleInstanceTaskSchedulerOptions<C, T> {
  /**
   * A function that return the next run time of the task. This function will be called
   * after a task ended to evaluate the next run time. The returned value can be a delay
   * in milliseconds, or an absolute date time, or `null` which indicate no next run.
   */
  nextRunTimeEvaluator?: NextRunTimeEvaluator<C, T>
}

export class SingleInstanceTaskScheduler<C = {}, T = void> {
  #context: Context<C>

  constructor(
    task: (context: C) => T | Promise<T>,
    initialContext: C,
    options?: SingleInstanceTaskSchedulerOptions<C, T>
  ) {
    this.#context = {
      userContext: initialContext
    }
  }

  get scheduled(): boolean {
    // TODO
    return false
  }

  schedule() {
    // TODO
  }

  cancelSchedule () {
    // TODO
  }

  run() {
    // TODO
  }
}
