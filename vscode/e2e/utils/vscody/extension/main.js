const vscode = require('vscode')
const { window } = require('vscode')
const { execSync } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

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
function activate(context) {
    console.log('🧪 VSCody Test Utils Activated 🧪')
    const disposable = vscode.commands.registerCommand('vscody.eval', async commandArgs => {
        const [fn, ...fnArgs] = commandArgs

        const res = await Function(`return ${fn}`)().apply(fnContext, fnArgs)
        await flushEventStack()
        return res
    })

    context.subscriptions.push(disposable)
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
