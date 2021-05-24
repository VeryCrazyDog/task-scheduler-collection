import test from 'ava'
import { delay } from 'native-promise-util'

import { buildEvaluator, SingleInstanceTaskScheduler } from '../single-instance'

test('should run one time task only once', async t => {
  let runCount = 0
  const scheduler = new SingleInstanceTaskScheduler(() => {
    runCount++
  }, {})
  t.is(runCount, 0)
  scheduler.schedule(0)
  t.is(runCount, 0)
  await delay(100)
  t.is(runCount, 1)
  await delay(100)
  t.is(runCount, 1)
})

test('should not run parallel task', async t => {
  let runCount = 0
  const scheduler = new SingleInstanceTaskScheduler(async () => {
    await delay(200)
    runCount++
  }, {}, {
    nextRunTimeEvaluator: () => ({
      startTime: 0,
      isRetry: false
    })
  })
  t.is(runCount, 0)
  scheduler.schedule(0)
  t.is(runCount, 0)
  await delay(50)
  t.is(runCount, 0)
  await delay(100)
  t.is(runCount, 0)
  await delay(100)
  t.is(runCount, 1)
  await delay(100)
  t.is(runCount, 1)
  await delay(100)
  t.is(runCount, 2)
  await delay(100)
  t.is(runCount, 2)
  await delay(100)
  t.is(runCount, 3)
})

test('should run fixed interval task at correct interval', async t => {
  let runCount = 0
  const scheduler = new SingleInstanceTaskScheduler(async () => {
    await delay(200)
    runCount++
  }, {}, {
    nextRunTimeEvaluator: buildEvaluator({
      onSuccess: {
        type: 'RUN_START_TIME',
        delay: 100
      }
    })
  })
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
  t.is(runCount, 1)
  await delay(100)
  // 50ms + 200ms x 3 passed
  t.is(runCount, 1)
})
