import test from 'ava'

import { SingleInstanceTaskScheduler } from '../single-instance'

test('should run task immediately', async t => {
  let runCount = 0
  const scheduler = new SingleInstanceTaskScheduler(() => {
    runCount++
  }, {})
  await scheduler.runWaitResult()
  t.is(runCount, 1)
  await scheduler.runWaitResult()
  t.is(runCount, 2)
  await scheduler.runWaitResult()
  t.is(runCount, 3)
})
