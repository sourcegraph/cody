import { describe, it } from 'vitest'

import { AgentTextDocument } from '@sourcegraph/cody-agent/src/AgentTextDocument'

import { run } from './command'

describe('complete', () => {
    it('completes code from stdin', async () => {
        const content = "function helloworld() {\n const msg = 'Hello World!'\n return @@\n}\n"
        const caret = content.indexOf('@@')
        const document = new AgentTextDocument({ filePath: 'sample.js', content })
        const position = document.positionAt(caret)
        console.log({ position })
        const stdin = {
            content: content.replace('@@', ''),
            uri: document.uri.toString(),
            position,
            identifier: 'msg',
        }
        const response = await run({}, { cwd: '', stdin: JSON.stringify(stdin), client: {} as any }, { debug: false })
        console.log(JSON.stringify(response, null, 2))
    })
})
