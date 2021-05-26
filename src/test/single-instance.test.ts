import test from 'ava'
import { delay } from 'native-promise-util'

import { SingleInstanceTaskScheduler, _buildEvaluator } from '../single-instance'

test('should run one time task only once', async t => {
  let runCount = 0
  const scheduler = new SingleInstanceTaskScheduler(() => {
    runCount++
  })
  t.is(runCount, 0)
  scheduler.schedule(0)
  t.is(runCount, 0)
  await delay(100)
  t.is(runCount, 1)
  await delay(100)
  t.is(runCount, 1)
  scheduler.cancelNextRun()
})

test('should produce correct delay when returning number in next run time evaluator', async t => {
  let runCount = 0
  const scheduler = new SingleInstanceTaskScheduler(async () => {
    await delay(1)
    runCount++
  }, () => ({
    startDelayOrTime: 100,
    isRetry: false
  }))
  t.is(runCount, 0)
  scheduler.run()
  t.is(runCount, 0)
  await delay(50)
  t.is(runCount, 1)
  await delay(100)
  t.is(runCount, 2)
  await delay(100)
  t.is(runCount, 3)
  scheduler.cancelNextRun()
})

test('should produce correct delay when returning Date in next run time evaluator', async t => {
  let runCount = 0
  const scheduler = new SingleInstanceTaskScheduler(async () => {
    await delay(1)
    runCount++
  }, () => ({
    startDelayOrTime: new Date(Date.now() + 100),
    isRetry: false
  }))
  t.is(runCount, 0)
  scheduler.run()
  t.is(runCount, 0)
  await delay(50)
  t.is(runCount, 1)
  await delay(100)
  t.is(runCount, 2)
  await delay(100)
  t.is(runCount, 3)
  scheduler.cancelNextRun()
})

test('should return correct scheduled flag', async t => {
  const scheduler = new SingleInstanceTaskScheduler(async () => {
    await delay(50)
  }, () => ({
    startDelayOrTime: 100,
    isRetry: false
  }))
  t.is(scheduler.scheduled, false)

  scheduler.run()
  t.is(scheduler.scheduled, true)
  await delay(100)
  t.is(scheduler.scheduled, true)

  scheduler.cancelNextRun()
  t.is(scheduler.scheduled, false)
  await delay(100)
  t.is(scheduler.scheduled, false)

  scheduler.schedule(0)
  t.is(scheduler.scheduled, true)
  await delay(100)
  t.is(scheduler.scheduled, true)

  scheduler.cancelNextRun()
  t.is(scheduler.scheduled, false)
  await delay(100)
  t.is(scheduler.scheduled, false)
})

test('can cancel next run when task is not running', async t => {
  let runCount = 0
  const scheduler = new SingleInstanceTaskScheduler(() => {
    runCount++
  }, () => ({
    startDelayOrTime: 100,
    isRetry: false
  }))
  t.is(runCount, 0)
  scheduler.schedule(0)
  t.is(runCount, 0)
  await delay(50)
  t.is(runCount, 1)
  await delay(100)
  t.is(runCount, 2)
  t.false(scheduler.running)
  scheduler.cancelNextRun()
  await delay(100)
  t.is(runCount, 2)
  await delay(100)
  t.is(runCount, 2)
})

test('can cancel next run when task is running', async t => {
  let runCount = 0
  const scheduler = new SingleInstanceTaskScheduler(async () => {
    await delay(100)
    runCount++
  }, () => ({
    startDelayOrTime: 0,
    isRetry: false
  }))
  scheduler.schedule(0)
  t.is(runCount, 0)
  await delay(150)
  t.is(runCount, 1)
  t.true(scheduler.running)
  scheduler.cancelNextRun()
  await delay(100)
  t.is(runCount, 2)
  await delay(100)
  t.is(runCount, 2)
})

test('should pass correct arguments to nextRunTimeEvaluator', async t => {
  const context = {
    runCount: 0
  }
  let evaluatorArgs: any[] = []
  const scheduler = new SingleInstanceTaskScheduler(ctx => {
    ctx.runCount++
    return ctx.runCount
  }, (...args) => {
    evaluatorArgs = args
    return {
      startDelayOrTime: 100,
      isRetry: true
    }
  }, context)
  scheduler.schedule(0)
  t.deepEqual(evaluatorArgs, [])
  await delay(50)
  const firstAttemptStartTime = evaluatorArgs?.[1]?.firstAttemptStartTime
  const firstAttemptEndTime = evaluatorArgs?.[1]?.firstAttemptEndTime
  t.deepEqual(evaluatorArgs, [{
    type: 'SUCCESS',
    returnValue: 1
  }, {
    firstAttemptStartTime: firstAttemptStartTime,
    firstAttemptEndTime: firstAttemptEndTime,
    attemptNumber: 1,
    startTime: firstAttemptStartTime,
    endTime: firstAttemptEndTime
  }, {
    runCount: 1
  }])
  await delay(100)
  const executionTime = evaluatorArgs?.[1]?.endTime - evaluatorArgs?.[1]?.startTime
  t.is(typeof executionTime, 'number')
  t.true(executionTime < 100)
  t.deepEqual(evaluatorArgs[0], {
    type: 'SUCCESS',
    returnValue: 2
  })
  t.like(evaluatorArgs[1], {
    firstAttemptStartTime: firstAttemptStartTime,
    firstAttemptEndTime: firstAttemptEndTime,
    attemptNumber: 2
  })
  t.deepEqual(evaluatorArgs[2], {
    runCount: 2
  })
  scheduler.cancelNextRun()
})

test('should not run multiple tasks concurrently', async t => {
  let runCount = 0
  let isRunning = false
  const scheduler = new SingleInstanceTaskScheduler(async () => {
    t.false(isRunning)
    isRunning = true
    await delay(200)
    runCount++
    isRunning = false
  }, () => ({
    startDelayOrTime: 0,
    isRetry: false
  }))
  t.is(runCount, 0)
  scheduler.schedule(0)
  t.is(runCount, 0)
  await delay(50)
  // 50ms passed
  t.is(runCount, 0)
  await delay(100)
  // 150ms passed
  t.is(runCount, 0)
  await delay(100)
  // 50ms + 200ms passed
  t.is(runCount, 1)
  await delay(100)
  // 150ms + 200ms passed
  t.is(runCount, 1)
  await delay(100)
  // 50ms + 200ms x 2 passed
  t.is(runCount, 2)
  await delay(100)
  // 150ms + 200ms x 2 passed
  t.is(runCount, 2)
  await delay(100)
  // 50ms + 200ms x 3 passed
  t.is(runCount, 3)
  scheduler.cancelNextRun()
})

test('can change next run time options', async t => {
  let runCount = 0
  const scheduler = new SingleInstanceTaskScheduler(async () => {
    await delay(1)
    runCount++
  }, () => ({
    startDelayOrTime: 100,
    isRetry: false
  }))
  t.is(runCount, 0)
  scheduler.run()
  t.is(runCount, 0)
  await delay(50)
  t.is(runCount, 1)
  await delay(100)
  t.is(runCount, 2)
  t.false(scheduler.running)
  scheduler.setNextRunTimeOptions(() => ({
    startDelayOrTime: 200,
    isRetry: false
  }))
  await delay(100)
  t.is(runCount, 3)
  await delay(100)
  t.is(runCount, 3)
  await delay(100)
  t.is(runCount, 4)
  scheduler.cancelNextRun()
})

// -----------------------------------------------------------------------------

test('should return correct next run start time for fixed interval task', async t => {
  const options = {
    onSuccess: {
      type: 'RUN_START_TIME',
      delay: 1000
    }
  } as const
  const evaluator = _buildEvaluator<undefined, undefined>(options)
  const startTime = new Date(Date.now() - 500)
  const endTime = new Date()
  const nextRunRequest = evaluator({
    type: 'SUCCESS',
    returnValue: undefined
  }, {
    firstAttemptStartTime: startTime,
    firstAttemptEndTime: endTime,
    attemptNumber: 1,
    startTime,
    endTime
  }, undefined)
  const nextRunStartTime = nextRunRequest?.startDelayOrTime
  if (!(nextRunStartTime instanceof Date)) { t.fail('nextRunStartTime is not an instance of Date'); return }
  t.deepEqual(nextRunStartTime, new Date(startTime.getTime() + options.onSuccess.delay))
})

test('should return correct next run start time for on completion interval task', async t => {
  const options = {
    onSuccess: {
      type: 'RUN_END_TIME',
      delay: 1000
    }
  } as const
  const evaluator = _buildEvaluator<undefined, undefined>(options)
  const startTime = new Date(Date.now() - 500)
  const endTime = new Date()
  const nextRunRequest = evaluator({
    type: 'SUCCESS',
    returnValue: undefined
  }, {
    firstAttemptStartTime: startTime,
    firstAttemptEndTime: endTime,
    attemptNumber: 1,
    startTime,
    endTime
  }, undefined)
  const nextRunStartTime = nextRunRequest?.startDelayOrTime
  if (typeof nextRunStartTime !== 'number') { t.is(typeof nextRunStartTime, 'number'); return }
  t.true(nextRunStartTime >= 950 && nextRunStartTime <= 1050, nextRunStartTime.toString())
})

test('should return correct next run start time for on error retry', async t => {
  const options = {
    onSuccess: {
      type: 'RUN_START_TIME',
      delay: 2000
    },
    onError: {
      delay: 1000
    }
  } as const
  const evaluator = _buildEvaluator<undefined, undefined>(options)
  const startTime = new Date(Date.now() - 500)
  const endTime = new Date()
  const nextRunRequest = evaluator({
    type: 'ERROR',
    caughtValue: new Error('Mock error')
  }, {
    firstAttemptStartTime: startTime,
    firstAttemptEndTime: endTime,
    attemptNumber: 1,
    startTime,
    endTime
  }, undefined)
  const nextRunStartTime = nextRunRequest?.startDelayOrTime
  if (typeof nextRunStartTime !== 'number') { t.is(typeof nextRunStartTime, 'number'); return }
  t.true(nextRunStartTime >= 950 && nextRunStartTime <= 1050, nextRunStartTime.toString())
})

test('should return null on reaching maximum attempt', async t => {
  const options = {
    onSuccess: {
      type: 'RUN_START_TIME',
      delay: 2000
    },
    onError: {
      delay: 1000,
      attempt: 3
    }
  } as const
  const evaluator = _buildEvaluator<undefined, undefined>(options)
  const startTime = new Date(Date.now() - 500)
  const endTime = new Date()
  const executionResult = {
    type: 'ERROR',
    caughtValue: new Error('Mock error')
  } as const
  const defaultExecutionMetadata = {
    firstAttemptStartTime: startTime,
    firstAttemptEndTime: endTime,
    attemptNumber: 0,
    isRetry: false,
    startTime,
    endTime
  }
  let nextRunRequest = evaluator(executionResult, {
    ...defaultExecutionMetadata,
    attemptNumber: 2
  }, undefined)
  t.not(nextRunRequest, null)
  nextRunRequest = evaluator(executionResult, {
    ...defaultExecutionMetadata,
    attemptNumber: 3
  }, undefined)
  t.is(nextRunRequest, null)
  nextRunRequest = evaluator(executionResult, {
    ...defaultExecutionMetadata,
    attemptNumber: 4
  }, undefined)
  t.is(nextRunRequest, null)
})
