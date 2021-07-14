import test, { EitherMacro, ExecutionContext, TryResult } from 'ava'
import { delay } from 'native-promise-util'

import { SingleInstanceTaskScheduler } from '../single-instance'

// Private functions
function buildDeferred (): {
  promise: Promise<void>
  resolve: () => void
} {
  let resolveFn: () => void
  const promise = new Promise<void>(resolve => {
    resolveFn = resolve
  })
  return {
    promise,
    resolve: resolveFn!
  }
}

async function tryUntilSuccess<A extends any[], C> (
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

// Test cases
test('should run one time task only once', async t => {
  await tryUntilSuccess(t, async tt => {
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

test('should produce correct delay with fixed interval', async t => {
  await tryUntilSuccess(t, async tt => {
    let runCount = 0
    const scheduler = new SingleInstanceTaskScheduler(async () => {
      await delay(100)
      runCount++
    }, {
      onSuccess: {
        type: 'FIXED_INTERVAL',
        interval: 200
      }
    })
    tt.false(scheduler.running)
    tt.is(runCount, 0)
    scheduler.run().catch(() => {})
    tt.true(scheduler.running)
    tt.is(runCount, 0)
    await delay(50) // 50
    tt.true(scheduler.running)
    tt.is(runCount, 0)
    await delay(100) // 150
    tt.false(scheduler.running)
    tt.is(runCount, 1)
    await delay(100) // 250
    tt.true(scheduler.running)
    tt.is(runCount, 1)
    await delay(100) // 350
    tt.false(scheduler.running)
    tt.is(runCount, 2)
    scheduler.cancelNextRun()
  }, 3)
})

test('should run immediately with fixed interval when task run too long', async t => {
  await tryUntilSuccess(t, async tt => {
    let runCount = 0
    const scheduler = new SingleInstanceTaskScheduler(async () => {
      await delay(200)
      runCount++
    }, {
      onSuccess: {
        type: 'FIXED_INTERVAL',
        interval: 100
      }
    })
    tt.false(scheduler.running)
    tt.is(runCount, 0)
    scheduler.run().catch(() => {})
    tt.true(scheduler.running)
    tt.is(runCount, 0)
    await delay(50) // 50
    tt.true(scheduler.running)
    tt.is(runCount, 0)
    await delay(100) // 150
    tt.true(scheduler.running)
    tt.is(runCount, 0)
    await delay(100) // 250
    tt.true(scheduler.running)
    tt.is(runCount, 1)
    await delay(100) // 350
    tt.true(scheduler.running)
    tt.is(runCount, 1)
    await delay(100) // 450
    tt.true(scheduler.running)
    tt.is(runCount, 2)
    scheduler.cancelNextRun()
  }, 3)
})

test('should run at next run time with fixed interval when task run too long', async t => {
  await tryUntilSuccess(t, async tt => {
    let runCount = 0
    const scheduler = new SingleInstanceTaskScheduler(async () => {
      await delay(300)
      runCount++
    }, {
      onSuccess: {
        type: 'FIXED_INTERVAL',
        interval: 200,
        onPastTime: 'NEXT_RUN_TIME'
      }
    })
    tt.false(scheduler.running)
    tt.is(runCount, 0)
    scheduler.run().catch(() => {})
    tt.true(scheduler.running)
    tt.is(runCount, 0)
    await delay(50) // 50
    tt.true(scheduler.running)
    tt.is(runCount, 0)
    await delay(200) // 250
    tt.true(scheduler.running)
    tt.is(runCount, 0)
    await delay(100) // 350
    tt.false(scheduler.running)
    tt.is(runCount, 1)
    await delay(100) // 450
    tt.true(scheduler.running)
    tt.is(runCount, 1)
    await delay(200) // 650
    tt.true(scheduler.running)
    tt.is(runCount, 1)
    await delay(100) // 750
    tt.false(scheduler.running)
    tt.is(runCount, 2)
    scheduler.cancelNextRun()
  }, 3)
})

test('should produce correct delay with run end time', async t => {
  await tryUntilSuccess(t, async tt => {
    let runCount = 0
    const scheduler = new SingleInstanceTaskScheduler(async () => {
      await delay(100)
      runCount++
    }, {
      onSuccess: {
        type: 'RUN_END_TIME',
        delay: 200
      }
    })
    tt.false(scheduler.running)
    tt.is(runCount, 0)
    scheduler.run().catch(() => {})
    tt.true(scheduler.running)
    tt.is(runCount, 0)
    await delay(50) // 50
    tt.true(scheduler.running)
    tt.is(runCount, 0)
    await delay(100) // 150
    tt.false(scheduler.running)
    tt.is(runCount, 1)
    await delay(100) // 250
    tt.false(scheduler.running)
    tt.is(runCount, 1)
    await delay(100) // 350
    tt.true(scheduler.running)
    tt.is(runCount, 1)
    await delay(100) // 450
    tt.false(scheduler.running)
    tt.is(runCount, 2)
    scheduler.cancelNextRun()
  }, 3)
})

test('should pass correct arguments to OnSuccessNextRunEvaluator', async t => {
  const rtv = {}
  const ctx = {}
  const scheduler = new SingleInstanceTaskScheduler(async () => {
    await delay(100)
    return rtv
  }, {
    onSuccess: (returnValue, meta, context) => {
      t.is(returnValue, rtv)
      t.true(meta.endTime.getTime() - meta.startTime.getTime() >= 100)
      t.is(context, ctx)
      return null
    }
  }, ctx)
  await scheduler.run()
  scheduler.cancelNextRun()
})

test('should produce correct delay when returning number in OnSuccessNextRunEvaluator', async t => {
  await tryUntilSuccess(t, async tt => {
    let runCount = 0
    const scheduler = new SingleInstanceTaskScheduler(async () => {
      await delay(100)
      runCount++
    }, {
      onSuccess: () => 200
    })
    tt.false(scheduler.running)
    tt.is(runCount, 0)
    scheduler.run().catch(() => {})
    tt.true(scheduler.running)
    tt.is(runCount, 0)
    await delay(50) // 50
    tt.true(scheduler.running)
    tt.is(runCount, 0)
    await delay(100) // 150
    tt.false(scheduler.running)
    tt.is(runCount, 1)
    await delay(100) // 250
    tt.false(scheduler.running)
    tt.is(runCount, 1)
    await delay(100) // 350
    tt.true(scheduler.running)
    tt.is(runCount, 1)
    await delay(100) // 450
    tt.false(scheduler.running)
    tt.is(runCount, 2)
    scheduler.cancelNextRun()
  }, 3)
})

test('should produce correct delay when returning Date in OnSuccessNextRunEvaluator', async t => {
  await tryUntilSuccess(t, async tt => {
    let runCount = 0
    const scheduler = new SingleInstanceTaskScheduler(async () => {
      await delay(1)
      runCount++
    }, {
      onSuccess: () => new Date(Date.now() + 100)
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
  await tryUntilSuccess(t, async tt => {
    let runCount = 0
    const scheduler = new SingleInstanceTaskScheduler(() => {
      runCount++
      throw new Error('Mock error')
    }, {
      onError: {
        delay: 100,
        attempt: 3
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
    tt.is(runCount, 3)
    await delay(100)
    tt.is(runCount, 3)
    await delay(100)
    scheduler.cancelNextRun()
  }, 3)
})

test('should pass correct arguments to OnErrorNextRunEvaluator', async t => {
  const err = new Error('Mock error')
  const ctx = {}
  let nextRunEvaluatorRunCount = 0
  let firstAttemptStartTimestamp: number | null
  let firstAttemptEndTimestamp: number | null
  const deferred = buildDeferred()
  const scheduler = new SingleInstanceTaskScheduler(async () => {
    await delay(100)
    throw err
  }, {
    onError: (caughtValue, meta, context) => {
      nextRunEvaluatorRunCount++
      t.is(caughtValue, err)
      t.is(meta.attemptNumber, nextRunEvaluatorRunCount)
      t.true(meta.endTime.getTime() - meta.startTime.getTime() >= 100)
      if (nextRunEvaluatorRunCount === 1) {
        firstAttemptStartTimestamp = meta.firstAttemptStartTime.getTime()
        firstAttemptEndTimestamp = meta.firstAttemptEndTime.getTime()
        t.is(meta.startTime.getTime(), firstAttemptStartTimestamp)
        t.is(meta.endTime.getTime(), firstAttemptEndTimestamp)
      } else {
        t.not(meta.startTime.getTime(), firstAttemptStartTimestamp)
        t.not(meta.endTime.getTime(), firstAttemptEndTimestamp)
      }
      t.is(context, ctx)
      if (nextRunEvaluatorRunCount === 3) {
        deferred.resolve()
      }
      return 0
    }
  }, ctx)
  scheduler.run().catch(() => {})
  await deferred.promise
  t.is(nextRunEvaluatorRunCount, 3)
  scheduler.cancelNextRun()
})

test('should produce correct delay when returning number in OnErrorNextRunEvaluator', async t => {
  await tryUntilSuccess(t, async tt => {
    let runCount = 0
    const scheduler = new SingleInstanceTaskScheduler(async () => {
      await delay(1)
      runCount++
      throw new Error('Mock error')
    }, {
      onError: () => new Date(Date.now() + 100)
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

test('should produce correct delay when returning Date in OnErrorNextRunEvaluator', async t => {
  await tryUntilSuccess(t, async tt => {
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

test('should reset metadata argument passed to OnErrorNextRunEvaluator after a success run', async t => {
  let taskRunCount = 0
  let nextRunEvaluatorRunCount = 0
  let firstAttemptStartTimestamp: number | null
  let firstAttemptEndTimestamp: number | null
  const deferred = buildDeferred()
  const scheduler = new SingleInstanceTaskScheduler(async () => {
    await delay(100)
    taskRunCount++
    if (taskRunCount !== 3) {
      throw new Error('Mock error')
    }
  }, {
    onSuccess: () => {
      t.is(taskRunCount, 3)
      t.is(nextRunEvaluatorRunCount, 2)
      firstAttemptStartTimestamp = null
      firstAttemptEndTimestamp = null
      return 0
    },
    onError: (_caughtValue, meta) => {
      nextRunEvaluatorRunCount++
      if (nextRunEvaluatorRunCount < 3) {
        t.is(meta.attemptNumber, nextRunEvaluatorRunCount)
        if (nextRunEvaluatorRunCount === 1) {
          firstAttemptStartTimestamp = meta.firstAttemptStartTime.getTime()
          firstAttemptEndTimestamp = meta.firstAttemptEndTime.getTime()
          t.is(meta.startTime.getTime(), firstAttemptStartTimestamp)
          t.is(meta.endTime.getTime(), firstAttemptEndTimestamp)
        } else {
          t.not(meta.startTime.getTime(), firstAttemptStartTimestamp)
          t.not(meta.endTime.getTime(), firstAttemptEndTimestamp)
        }
      } else {
        t.is(meta.attemptNumber, nextRunEvaluatorRunCount - 2)
        if (nextRunEvaluatorRunCount === 3) {
          t.not(meta.firstAttemptStartTime.getTime(), firstAttemptStartTimestamp)
          t.not(meta.firstAttemptEndTime.getTime(), firstAttemptEndTimestamp)
          firstAttemptStartTimestamp = meta.firstAttemptStartTime.getTime()
          firstAttemptEndTimestamp = meta.firstAttemptEndTime.getTime()
          t.is(meta.startTime.getTime(), firstAttemptStartTimestamp)
          t.is(meta.endTime.getTime(), firstAttemptEndTimestamp)
        } else {
          t.not(meta.startTime.getTime(), firstAttemptStartTimestamp)
          t.not(meta.endTime.getTime(), firstAttemptEndTimestamp)
        }
      }
      if (nextRunEvaluatorRunCount === 5) {
        deferred.resolve()
      }
      return 0
    }
  })
  scheduler.run().catch(() => {})
  await deferred.promise
  t.is(nextRunEvaluatorRunCount, 5)
  scheduler.cancelNextRun()
})

test('should return correct scheduled flag', async t => {
  await tryUntilSuccess(t, async tt => {
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
  await tryUntilSuccess(t, async tt => {
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

test('can cancel next run when task is running and will return succes', async t => {
  await tryUntilSuccess(t, async tt => {
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

test('can cancel next run when task is running and will return error', async t => {
  await tryUntilSuccess(t, async tt => {
    let runCount = 0
    const scheduler = new SingleInstanceTaskScheduler(async () => {
      await delay(100)
      runCount++
      throw new Error('Mock error')
    }, {
      onError: {
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

test('should not run multiple tasks concurrently', async t => {
  await tryUntilSuccess(t, async tt => {
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
