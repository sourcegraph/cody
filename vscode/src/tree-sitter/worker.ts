const { parentPort } = require('node:worker_threads')

if (!parentPort) {
    throw new Error('parentPort is not available. This file should only be run in a worker thread.')
}

parentPort.on('message', message => {
    console.log('worker', message)
    parentPort.postMessage('Hello back from worker!')
})
