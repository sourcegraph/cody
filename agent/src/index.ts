import { setIDE } from '@sourcegraph/cody-shared/src/ide'

import { Agent } from './agent'

process.stderr.write('Starting Cody Agent...\n')
setIDE({})

const agent = new Agent()

console.log = console.error

process.stdin.pipe(agent.messageDecoder)
agent.messageEncoder.pipe(process.stdout)
