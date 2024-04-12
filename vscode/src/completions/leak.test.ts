import fs from 'node:fs'
import path from 'node:path'
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

import { SupportedLanguage } from '../tree-sitter/grammars'
import { updateParseTreeCache } from '../tree-sitter/parse-tree-cache'
import { getParser } from '../tree-sitter/parser'
import { document, initTreeSitterParser } from './test-helpers'
import { sleep } from './utils'

describe('TreeSitter Memory Leak', () => {
    const byteToMb = (byte: number) => byte / 1024 / 1024
    const formatMemoryUsage = (data: number) => `${Math.round(byteToMb(data) * 100) / 100} MB`
    function debug(memoryData: NodeJS.MemoryUsage) {
        console.log({
            rss: `${formatMemoryUsage(
                memoryData.rss
            )} -> Resident Set Size - total memory allocated for the process execution`,
            heapTotal: `${formatMemoryUsage(memoryData.heapTotal)} -> total size of the allocated heap`,
            heapUsed: `${formatMemoryUsage(
                memoryData.heapUsed
            )} -> actual memory used during the execution`,
            external: `${formatMemoryUsage(memoryData.external)} -> V8 external memory`,
            arrayBuffers: `${formatMemoryUsage(memoryData.arrayBuffers)} -> arrayBuffer`,
        })
    }

    it('does not leak memory', { timeout: 100000 }, async () => {
        // Expose GC settings
        // https://stackoverflow.com/a/75007985
        setFlagsFromString('--expose_gc')
        const gc = runInNewContext('gc')

        const doc = document(fs.readFileSync(path.join(__dirname, 'leak.test.ts')).toString())

        await initTreeSitterParser()
        const parser = getParser(SupportedLanguage.typescript)

        const initialMemoryData = process.memoryUsage()
        debug(initialMemoryData)

        for (let i = 0; i < 10_000; i++) {
            updateParseTreeCache(doc, parser!)
        }

        // Give the GC time to do its thing
        await sleep(1000)
        gc()
        await sleep(1000)

        const currentMemoryData = process.memoryUsage()
        debug(currentMemoryData)

        expect(byteToMb(currentMemoryData.external - initialMemoryData.external)).toBeLessThan(100)
    })
})
