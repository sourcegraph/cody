import { Agent } from './agent'

process.stderr.write('Starting Cody Agent...\n')

const agent = new Agent()

console.log = console.error

process.stdout.on('close', () => process.exit(1))
process.stdin.on('close', () => process.exit(1))

process.stdin.pipe(agent.messageDecoder)
agent.messageEncoder.pipe(process.stdout)
