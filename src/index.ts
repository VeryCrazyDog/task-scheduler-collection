interface Context<C> {
  userContext: C
}

interface RetryOptions {
  delay: number
  duration?: number
  attempt?: number
}

interface X1 {
  type: 'RUN_START_TIME' | 'RUN_END_TIME'
  onSuccessDelay: number
  onErrorRetry?: RetryOptions
}

interface X2 {
  type: 'ONE_TIME'
  onErrorRetry?: RetryOptions
}

type TaskResult<T> = {
  type: 'SUCCESS'
  returnValue: T
} | {
  type: 'ERROR'
  caughtValue: any
}
interface TaskMetadata {
  isRetry: boolean
  startTime: Date
  endTime: Date
}
type NextRunTimeEvaluator<T, C> = (result: TaskResult<T>, meta: TaskMetadata, context: C) => boolean

export interface SingleInstanceTaskSchedulerOptions<T, C> {
  nextRunTime?: X1 | X2 | NextRunTimeEvaluator<T, C>
}

export class SingleInstanceTaskScheduler<T, C> {
  #context: Context<C>

  constructor(
    task: (context: C) => T | Promise<T>,
    initialContext: C,
    options?: SingleInstanceTaskSchedulerOptions<T, C>
  ) {
    this.#context = {
      userContext: initialContext
    }
  }

  schedule() {
    
  }

  cancelSchedule () {

  }

  run() {

  }
}
