const { SingleInstanceTaskScheduler } = require('../dist')

let apiCallCount = 0
const startTime = Date.now()

async function fakeApiCall () {
  console.log(`${Date.now() - startTime}ms: Calling API`)
  await new Promise(resolve => {
    setTimeout(() => {
      apiCallCount++
      resolve(JSON.stringify({ result: 'SUCCESS' }))
    }, (apiCallCount + 1) * 400)
  })
  console.log(`${Date.now() - startTime}ms: API returned result`)
}

const scheduler = new SingleInstanceTaskScheduler(fakeApiCall, {}, {
  nextRunTime: {
    onSuccess: {
      type: 'RUN_START_TIME',
      delay: 1000
    }
  }
})
scheduler.run()
setTimeout(() => {
  console.log(`${Date.now() - startTime}ms: Cancelling next run`)
  scheduler.cancelNextRun()
}, 5 * 1000)

// Sample output:
// ---------------------------
// 0ms: Calling API
// 421ms: API returned result
// 1005ms: Calling API
// 1807ms: API returned result
// 2007ms: Calling API
// 3209ms: API returned result
// 3228ms: Calling API
// 4850ms: API returned result
// 4851ms: Calling API
// 5010ms: Cancelling next run
// 6855ms: API returned result
