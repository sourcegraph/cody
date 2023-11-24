import { Command, Option } from 'commander'

import { Agent } from '../agent'

export const jsonrpcCommand = new Command('jsonrpc')
    .description(
        'Interact with the Agent using JSON-RPC via stdout/stdin. ' +
            'This is the subcommand that is used by Cody clients like the JetBrains and Neovim plugins.'
    )
    .addOption(
        new Option(
            '--testing-directory <path>',
            'Path to the directory where network traffic is recorded or replayed from. This option should only be used in testing environments.'
        ).env('TESTING_DIRECTORY')
    )
    .action(() => {
        process.stderr.write('Starting Cody Agent...\n')

        const agent = new Agent()

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
    })
