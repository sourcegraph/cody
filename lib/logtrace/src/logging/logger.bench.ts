// import { bench, describe } from 'vitest'

// import { alert, logger } from '.'

// describe('loggerV2', () => {
//     bench(
//         'callStackInference enabled',
//         () => {
//             alert`err`
//         },
//         {
//             setup: () => {
//                 logger.sinks.clear()
//                 logger.callStackInference = true
//             },
//         }
//     )

//     bench(
//         'callStackInference disabled',
//         () => {
//             alert`err`
//         },
//         {
//             setup: () => {
//                 logger.sinks.clear()
//                 logger.callStackInference = false
//             },
//         }
//     )
//     // bench('cassStackInference disabled', () => {})
// })
