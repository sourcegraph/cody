import fs from 'node:fs'
import { bench, describe } from 'vitest'
import {
    getWordOccurrences,
    // getWordOccurrencesTokenizeAfterCount,
    // getWordOccurrencesWithCache,
} from './bestJaccardMatch'

// This benchmarked some performance improvements to the `getWordOccurrences` function. Although the alternatives don't exist anymore I left the framework here in case there's future botltenecks that need a similar optimization round.
describe.skip('sort', async () => {
    const largeFile = await fs.promises.readFile(
        'recordings/symf_3564355686/recording.har.yaml',
        'utf-8'
    )
    const smallFile = await fs.promises.readFile('CHANGELOG.md', 'utf-8')

    bench('getWordOccurrences', () => {
        getWordOccurrences(smallFile)
        getWordOccurrences(largeFile)
    })

    // bench('getWordOccurrencesTokenizeAfterCount', () => {
    //     getWordOccurrencesTokenizeAfterCount(smallFile)
    //     getWordOccurrencesTokenizeAfterCount(largeFile)
    // })

    // bench('getWordOccurrencesWithCache', () => {
    //     getWordOccurrencesWithCache(smallFile)
    //     getWordOccurrencesWithCache(largeFile)
    // })
})
