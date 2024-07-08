#!/usr/bin/env node

import type { Command } from 'commander'
import { registerLocalCertificates } from './certs'

console.log = console.error

// IMPORTANT: use require(...) instead of `import` so that we can redirect
// console.log to console.error before evaluating the import. When using
// `import`, we may import modules that accidentally log error messages to
// process.stdout, which breaks the `jsonrpc` command, which uses stdout/stdin
// to communicate with the agent client`jsonrpc` command, which uses
// stdout/stdin to communicate with the agent client.
const rootCommand: Command = require('./cli/command-root').rootCommand

process.on('uncaughtException', e => {
    // By default, an uncaught exception will take down the entire process.
    // Instead of taking down the process, we just report it to stderr and move
    // on.  In almost all cases, an uncaught exception is an innocent error that
    // does not have to take down the process. For example, if a telemetry
    // request fails, then it's totally fine to just report it here with a stack
    // trace so we can look into it and fix it.
    console.error('Uncaught exception:', e)
})

registerLocalCertificates()

const args = process.argv.slice(2)

rootCommand.parseAsync(args, { from: 'user' }).catch(error => {
    console.error('Error:', error)
    process.exit(1)
})
