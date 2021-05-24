import test from 'ava'

import { SingleInstanceTaskScheduler } from '../index'

test('should run task immediately', async t => {
  let runCount = 0
  const scheduler = new SingleInstanceTaskScheduler(() => {
    runCount++
  }, {})
  scheduler.runWaitResult().catch(() => t.fail())
  t.is(runCount, 1)
  scheduler.runWaitResult().catch(() => t.fail())
  t.is(runCount, 2)
  scheduler.runWaitResult().catch(() => t.fail())
  t.is(runCount, 3)
})
