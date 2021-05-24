const { SingleInstanceTaskScheduler, buildEvaluator } = require('../dist')

async function fakeApiCall () {
  console.log('Calling API')
  const startTime = Date.now()
  const apiResult = await new Promise(resolve => {
    setTimeout(resolve, Math.random() * 1000, JSON.stringify({ result: 'SUCCESS' }))
  })
  console.log(`API took ${Date.now() - startTime}ms and returned:`, apiResult)
}

const scheduler = new SingleInstanceTaskScheduler(fakeApiCall, {}, {
  nextRunTimeEvaluator: buildEvaluator({
    onSuccess: {
      type: 'RUN_START_TIME',
      delay: 500
    }
  })
})
scheduler.run()
setTimeout(() => {
  console.log('Cancelling next run')
  scheduler.cancelNextRun()
}, 3 * 1000)
