import { AgentMessageHandler } from './AgentMessageHandler'

process.stderr.write('Starting Cody Agent...\n')

const agent = new AgentMessageHandler()

console.log = console.error

// Force the agent process to exit when stdin/stdout close as an attempt to
// prevent zombie agent processes. We experienced this problem when we
// forcefully exit the IntelliJ process during local `./gradlew :runIde`
// workflows. We manually confirmed that this logic makes the agent exit even
// when we forcefully quit IntelliJ
// https://github.com/sourcegraph/cody/pull/1439#discussion_r1365610354
process.stdout.on('close', () => process.exit(1))
process.stdin.on('close', () => process.exit(1))

process.stdin.pipe(agent.messageDecoder)
agent.messageEncoder.pipe(process.stdout)
