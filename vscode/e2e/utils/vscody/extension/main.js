const vscode = require('vscode')
const { window } = require('vscode')
const { execSync } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const { WebSocketServer } = require('ws')
const { createBirpc } = require('birpc')
const { connect } = require('node:http2')
const Flatted = require('flatted')

const fnContext = {
    vscode,
    window,
    execSync,
    path,
    fs,
    require,
    utils: {
        substitutePathVars,
    },
}

const serverFunctions = {
    async command(command, args, opts = {}) {
        const resPromise = flushEventStack()
            .then(_ => vscode.commands.executeCommand(command, ...args))
            .finally(flushEventStack)
        if (opts.skipAwait) {
            void resPromise
            return undefined
        }
        await resPromise
        // We can't return this value as it could be anything, including things that are impossible to serialize
        return void 0
    },
    async eval(fn, args, opts = {}) {
        const compiledFn = Function(`return ${fn}`)()
        const resPromise = flushEventStack()
            .then(_ => compiledFn.apply(fnContext, args))
            .finally(flushEventStack)
        if (opts.skipAwait) {
            void resPromise
            return undefined
        }
        const res = await resPromise
        return res
    },
}

async function activate(context) {
    const statusBarIndicator = vscode.window.createStatusBarItem(
        'status',
        vscode.StatusBarAlignment.Right,
        100
    )
    statusBarIndicator.tooltip = 'Cody Test Utils'
    statusBarIndicator.text = '$(beaker) Waiting'
    statusBarIndicator.show()

    context.subscriptions.push(statusBarIndicator)

    try {
        const port = Number.parseInt(process.env.CODY_TESTUTILS_WEBSCOKET_PORT)

        const wss = new WebSocketServer({ port, host: '127.0.0.1' })

        context.subscriptions.push(
            new vscode.Disposable(() => {
                for (const client of wss.clients) {
                    client.terminate()
                }
                wss.close()
            })
        )

        let connections = 0
        wss.on('connection', ws => {
            connections++
            statusBarIndicator.text = '$(beaker) Connected'

            const rpc = createBirpc(serverFunctions, {
                post: data => ws.send(data),
                on: fn => ws.on('message', fn),
                serialize: v => Flatted.stringify(v),
                deserialize: v => Flatted.parse(v),
            })
            ws.on('close', ev => {
                connections = connections - 1
                if (ev === 1006) {
                    statusBarIndicator.text = '$(beaker) Error'
                } else {
                    if (connections === 0) {
                        statusBarIndicator.text = '$(beaker) Waiting'
                    }
                }
            })
        })
    } catch {
        statusBarIndicator.text = '$(beaker) Error'
    }
}

function deactivate() {}

function flushEventStack() {
    // this is a sleep timer for 0 seconds, which sounds dumb The reason it's
    // useful is because it puts a function on the BOTTOM of the javascript
    // **Event Loop**. This makes VSCode events like pop-ups and other events
    // happen in a more sequential/timely order. That's also why we can't use
    // Promise.resolve(undefined) as it would only be at the bottom of the
    // microtask queue.
    return new Promise(r => setTimeout(r, 0))
}

function cleanUpErrorStack(errorStack) {
    console.debug('errorStack is:', errorStack)
    return errorStack
        .replace(/at executeMacro \(.+\/macro-commander\/extension\.js:\d+:\d+\)/g, '')
        .replace(/at \S+\/macro-commander\/extension\.js:\d+:\d+/g, '')
        .replace(
            /at process\.processTicksAndRejections \(node:internal\/process\/task_queues:\d+:\d+\)/,
            ''
        )
        .replace(/at async n._executeContributedCommand \(.+\/extensionHostProcess.js:\d+:\d+\)/, '')
}

/**
 * @arg {string} path
 * @arg {vscode.TextDocument | undefined} relativeDocument
 * @returns {string}
 */
function substitutePathVars(path, relativeDocument) {
    path = path.replace(/\$\{workspaceFolder(?::(.+?))?\}/g, (m, p1) => {
        let wsf = (vscode.workspace.workspaceFolders ?? []).find(wsf => !p1 || wsf.name === p1)
        if (!wsf && /\d+/.test(p1)) {
            wsf = vscode.workspace.workspaceFolders?.[Number.parseInt(p1)]
        }
        return wsf?.uri.fsPath ?? 'Unknown'
    })

    const activeDocument = relativeDocument ?? vscode.window.activeTextEditor?.document
    if (activeDocument) {
        path = path.replace(/\$\{documentWorkspace}/g, m => {
            return activeDocument.uri.fsPath
        })
    }
    //TODO: we can support more complex substitutions akin to https://github.com/rioj7/html-related-links/blob/master/extension.js
    return path
}

module.exports = {
    activate,
    deactivate,
}
