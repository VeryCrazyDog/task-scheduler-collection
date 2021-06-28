import test, { EitherMacro, ExecutionContext, TryResult } from 'ava'
import { delay } from 'native-promise-util'

import { SingleInstanceTaskScheduler } from '../single-instance'

async function tryUntil<A extends any[], C> (
  t: ExecutionContext<C>,
  macro: EitherMacro<A, C>,
  attempt: number,
  ...rest: A
): Promise<void> {
  let attempted = 0
  let tryResult: TryResult | undefined
  do {
    tryResult = await t.try(macro, ...rest)
    attempted++
    if (tryResult.passed) {
      tryResult.commit()
      break
    } else if (attempted < attempt) {
      tryResult.discard()
    }
  } while (attempted < attempt)
  // Commit the last attempt
  if (!tryResult?.passed) {
    tryResult.commit()
  }
}

test('should run one time task only once', async t => {
  await tryUntil(t, async tt => {
    let runCount = 0
    const scheduler = new SingleInstanceTaskScheduler(() => {
      runCount++
    })
    tt.is(runCount, 0)
    scheduler.schedule(0)
    tt.is(runCount, 0)
    await delay(100)
    tt.is(runCount, 1)
    await delay(100)
    tt.is(runCount, 1)
    scheduler.cancelNextRun()
  }, 3)
})

test('should produce correct delay when returning number in OnSuccessNextRunEvaluator', async t => {
  await tryUntil(t, async tt => {
    let runCount = 0
    const scheduler = new SingleInstanceTaskScheduler(async () => {
      await delay(1)
      runCount++
    }, {
      onSuccess: () => 100
    })
    tt.is(runCount, 0)
    scheduler.run().catch(() => {})
    tt.is(runCount, 0)
    await delay(50)
    tt.is(runCount, 1)
    await delay(100)
    tt.is(runCount, 2)
    await delay(100)
    tt.is(runCount, 3)
    scheduler.cancelNextRun()
  }, 3)
})

test('should attempt the specified number of times on error', async t => {
  await tryUntil(t, async tt => {
    let runCount = 0
    const scheduler = new SingleInstanceTaskScheduler(() => {
      runCount++
      throw new Error('Mock error')
    }, {
      onError: {
        delay: 100,
        attempt: 2
      }
    })
    tt.is(runCount, 0)
    scheduler.schedule(0)
    tt.is(runCount, 0)
    await delay(50)
    tt.is(runCount, 1)
    await delay(100)
    tt.is(runCount, 2)
    await delay(100)
    tt.is(runCount, 2)
    scheduler.cancelNextRun()
  }, 3)
})

test('should produce correct delay when returning number in OnErrorNextRunEvaluator', async t => {
  await tryUntil(t, async tt => {
    let runCount = 0
    const scheduler = new SingleInstanceTaskScheduler(async () => {
      await delay(1)
      runCount++
      throw new Error('Mock error')
    }, {
      onError: () => 100
    })
    tt.is(runCount, 0)
    scheduler.run().catch(() => {})
    tt.is(runCount, 0)
    await delay(50)
    tt.is(runCount, 1)
    await delay(100)
    tt.is(runCount, 2)
    await delay(100)
    tt.is(runCount, 3)
    scheduler.cancelNextRun()
  }, 3)
})

// test('should produce correct delay when returning Date in next run time evaluator', async t => {
//   let runCount = 0
//   const scheduler = new SingleInstanceTaskScheduler(async () => {
//     await delay(1)
//     runCount++
//   }, () => ({
//     startDelayOrTime: new Date(Date.now() + 100),
//     isRetry: false
//   }))
//   t.is(runCount, 0)
//   scheduler.run()
//   t.is(runCount, 0)
//   await delay(50)
//   t.is(runCount, 1)
//   await delay(100)
//   t.is(runCount, 2)
//   await delay(100)
//   t.is(runCount, 3)
//   scheduler.cancelNextRun()
// })

test('should return correct scheduled flag', async t => {
  await tryUntil(t, async tt => {
    const scheduler = new SingleInstanceTaskScheduler(async () => {
      await delay(50)
    }, {
      onSuccess: {
        type: 'RUN_END_TIME',
        delay: 100
      }
    })
    tt.is(scheduler.scheduled, false)

    scheduler.run().catch(() => {})
    tt.is(scheduler.scheduled, true)
    await delay(100)
    tt.is(scheduler.scheduled, true)

    scheduler.cancelNextRun()
    tt.is(scheduler.scheduled, false)
    await delay(100)
    tt.is(scheduler.scheduled, false)

    scheduler.schedule(0)
    tt.is(scheduler.scheduled, true)
    await delay(100)
    tt.is(scheduler.scheduled, true)

    scheduler.cancelNextRun()
    tt.is(scheduler.scheduled, false)
    await delay(100)
    tt.is(scheduler.scheduled, false)
  }, 3)
})

test('can cancel next run when task is not running', async t => {
  await tryUntil(t, async tt => {
    let runCount = 0
    const scheduler = new SingleInstanceTaskScheduler(() => {
      runCount++
    }, {
      onSuccess: {
        type: 'RUN_END_TIME',
        delay: 100
      }
    })
    tt.is(runCount, 0)
    scheduler.schedule(0)
    tt.is(runCount, 0)
    await delay(50)
    tt.is(runCount, 1)
    await delay(100)
    tt.is(runCount, 2)
    tt.false(scheduler.running)
    scheduler.cancelNextRun()
    await delay(100)
    tt.is(runCount, 2)
    await delay(100)
    tt.is(runCount, 2)
  }, 3)
})

test('can cancel next run when task is running', async t => {
  await tryUntil(t, async tt => {
    let runCount = 0
    const scheduler = new SingleInstanceTaskScheduler(async () => {
      await delay(100)
      runCount++
    }, {
      onSuccess: {
        type: 'RUN_END_TIME',
        delay: 0
      }
    })
    scheduler.schedule(0)
    tt.is(runCount, 0)
    await delay(150)
    tt.is(runCount, 1)
    tt.true(scheduler.running)
    scheduler.cancelNextRun()
    await delay(100)
    tt.is(runCount, 2)
    await delay(100)
    tt.is(runCount, 2)
  }, 3)
})

// test('should pass correct arguments to nextRunTimeEvaluator', async t => {
//   const context = {
//     runCount: 0
//   }
//   let evaluatorArgs: any[] = []
//   const scheduler = new SingleInstanceTaskScheduler(ctx => {
//     ctx.runCount++
//     return ctx.runCount
//   }, (...args) => {
//     evaluatorArgs = args
//     return {
//       startDelayOrTime: 100,
//       isRetry: true
//     }
//   }, context)
//   scheduler.schedule(0)
//   t.deepEqual(evaluatorArgs, [])
//   await delay(50)
//   const firstAttemptStartTime = evaluatorArgs?.[1]?.firstAttemptStartTime
//   const firstAttemptEndTime = evaluatorArgs?.[1]?.firstAttemptEndTime
//   t.deepEqual(evaluatorArgs, [{
//     type: 'SUCCESS',
//     returnValue: 1
//   }, {
//     firstAttemptStartTime: firstAttemptStartTime,
//     firstAttemptEndTime: firstAttemptEndTime,
//     attemptNumber: 1,
//     startTime: firstAttemptStartTime,
//     endTime: firstAttemptEndTime
//   }, {
//     runCount: 1
//   }])
//   await delay(100)
//   const executionTime = evaluatorArgs?.[1]?.endTime - evaluatorArgs?.[1]?.startTime
//   t.is(typeof executionTime, 'number')
//   t.true(executionTime < 100)
//   t.deepEqual(evaluatorArgs[0], {
//     type: 'SUCCESS',
//     returnValue: 2
//   })
//   t.like(evaluatorArgs[1], {
//     firstAttemptStartTime: firstAttemptStartTime,
//     firstAttemptEndTime: firstAttemptEndTime,
//     attemptNumber: 2
//   })
//   t.deepEqual(evaluatorArgs[2], {
//     runCount: 2
//   })
//   scheduler.cancelNextRun()
// })

test('should not run multiple tasks concurrently', async t => {
  await tryUntil(t, async tt => {
    let runCount = 0
    let isRunning = false
    const scheduler = new SingleInstanceTaskScheduler(async () => {
      tt.false(isRunning)
      isRunning = true
      await delay(200)
      runCount++
      isRunning = false
    }, {
      onSuccess: {
        type: 'RUN_END_TIME',
        delay: 0
      }
    })
    tt.is(runCount, 0)
    scheduler.schedule(0)
    tt.is(runCount, 0)
    await delay(50)
    // 50ms passed
    tt.is(runCount, 0)
    await delay(100)
    // 150ms passed
    tt.is(runCount, 0)
    await delay(100)
    // 50ms + 200ms passed
    tt.is(runCount, 1)
    await delay(100)
    // 150ms + 200ms passed
    tt.is(runCount, 1)
    await delay(100)
    // 50ms + 200ms x 2 passed
    tt.is(runCount, 2)
    await delay(100)
    // 150ms + 200ms x 2 passed
    tt.is(runCount, 2)
    await delay(100)
    // 50ms + 200ms x 3 passed
    tt.is(runCount, 3)
    scheduler.cancelNextRun()
  }, 3)
})

// test('can change next run time options', async t => {
//   let runCount = 0
//   const scheduler = new SingleInstanceTaskScheduler(async () => {
//     await delay(1)
//     runCount++
//   }, () => ({
//     startDelayOrTime: 100,
//     isRetry: false
//   }))
//   t.is(runCount, 0)
//   scheduler.run()
//   t.is(runCount, 0)
//   await delay(50)
//   t.is(runCount, 1)
//   await delay(100)
//   t.is(runCount, 2)
//   t.false(scheduler.running)
//   scheduler.setNextRunTimeOptions(() => ({
//     startDelayOrTime: 200,
//     isRetry: false
//   }))
//   await delay(100)
//   t.is(runCount, 3)
//   await delay(100)
//   t.is(runCount, 3)
//   await delay(100)
//   t.is(runCount, 4)
//   scheduler.cancelNextRun()
// })
