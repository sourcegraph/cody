/// <reference types="@types/bun" />
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { setTimeout } from 'node:timers/promises'
import { type LogEntry, type Noxide, load } from '..'

describe('noxide lib', () => {
    let nox: Noxide
    beforeEach(() => {
        nox = load()!
    })

    it('can be loaded', () => {
        expect(nox.log).toBeDefined()
        expect(nox.test).toBeDefined()
        expect(nox.log.init).toBeDefined()
    })

    it('can log', async () => {
        const logFn = mock((entry: LogEntry) => {
            // console.debug(entry)
        })
        nox.log.init(logFn)
        nox.test.log()
        // wait until next tick
        await setTimeout(0)
        expect(logFn).toHaveBeenCalledTimes(5)
    })
})
