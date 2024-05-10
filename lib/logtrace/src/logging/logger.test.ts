import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { SaveLogItemsSink, alert, debug, info, log, logger, panic, warn } from '.'
import { dateGenerator, idGenerator } from '../util'

interface TestContext {
    sink: SaveLogItemsSink
}

describe('logger', () => {
    it('works', () => {})
    beforeEach<TestContext>(context => {
        context.sink = reset()
    })
    afterAll(() => {
        idGenerator.setGenerator()
        dateGenerator.setDateFn()
    })
    it<TestContext>('logs basic messages', context => {
        log(debug`This is a message without data`)
        log(info`This is a message with message data ${3}`, { publicExcept: ['msg.0'] })
        log(warn`This is a message with only data`, { value: 3 }, { publicExcept: ['data.value'] })
        log(
            alert`This is a message with both ${'message'} data and data`,
            { value: 5 },
            { publicExcept: ['data.value', 'msg.0'] }
        )

        class User {
            constructor(public readonly name: string) {}
            toJSON() {
                return { jsonName: `json:${this.name}` }
            }
        }
        const user = new User('Bert')
        log(
            panic`This is a complex message ${user.name} ${3}`,
            {
                user, //handles toJSON objects
                array: [{ sheldon: 3 }, { cooper: 'hello' }, { bleh: [{ a: 6 }] }], // handles heterogenous arrays
            },
            { privateExcept: ['data.array', 'msg.0', 'data.user.jsonName', 'data.array.[].bleh.[].a'] }
        )
        expect(context.sink.savedInputs).toMatchSnapshot()
    })
    // it<TestContext>('logs messages to sinks according to log level', context => {
    //     const sink = new TestLogSink()
    //     logger.sinks.add(sink)
    //     logger.minMessageLogLevel = 'info'
    //     const data = {
    //         pub: pub('public'),
    //         priv: priv('private'),
    //         leak: leak('leak'),
    //     }
    //     alert(data)`Public {{pub}} and Private: {{priv}`
    //     warn(data)`Public {{pub}} and Private: {{priv}`
    //     info(data)`Public {{pub}} and Private: {{priv}`
    //     debug(data)`Public {{pub}} and Private: {{priv}}`
    //     expect(sink.items).toMatchSnapshot()
    //     expect(sink.items).toEqual(context.sink.items)
    // })
    // it<TestContext>('infers callsite information', context => {
    //     logger.callStackInference = true
    //     alert`this logs from the root function`
    //     function deepLogCall() {
    //         alert(null, { callsite: 2 })`This logs from within a function but is "invisible"`
    //     }
    //     deepLogCall()
    //     expect(context.sink.items).toMatchSnapshot()
    // })
    // it<TestContext>('can convert errors into object', context => {
    //     logger.callStackInference = true
    //     const err = new Error('Test error')
    //     alert({
    //         err: priv(jsonErr(err)),
    //     })`An error like <{{err.message}}> will automatically get converted into a JSON safe message`
    //     console.log(JSON.stringify(context.sink.items, null, 2))
    // })
    // it<TestContext>('prevents issues through typechecks', context => {
    //     //@ts-expect-error No overload matches this call.
    //     alert({ foo: 'bar' }) //this isn't allowed as you must specify pub(...) or priv(...)
    // })
    // test.todo('can safely leak sensitive information')
    // test.todo('can handle errors with nested causes')
    // test.todo('can tag tests')
    // test.todo('dedents messages')
})

function reset() {
    let seed = 0
    const ts = new Date(Date.UTC(2024, 4, 1))
    const prng = () => {
        seed = (seed * 1103515245 + 12345) % 2 ** 31
        return Math.floor(seed / 65536) % 32768
    }
    idGenerator.setGenerator(prng, 1337)
    dateGenerator.setDateFn(() => {
        return ts
    }, 0)
    const sink = new SaveLogItemsSink()
    logger.register('test', [sink], 'test')
    return sink
}
