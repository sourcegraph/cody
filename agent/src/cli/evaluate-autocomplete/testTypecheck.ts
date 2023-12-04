import { exec } from 'child_process'
import * as fspromises from 'fs/promises'
import * as os from 'os'
import path from 'path'

import * as vscode from 'vscode'

import { TextDocumentWithUri } from '../../../../vscode/src/jsonrpc/TextDocumentWithUri'
import { AgentTextDocument } from '../../AgentTextDocument'
import { AutocompleteItem } from '../../protocol-alias'

import { EvaluateAutocompleteOptions } from './evaluate-autocomplete'
import { Timer } from './Timer'
import { AutocompleteParameters } from './triggerAutocomplete'

async function runCommand(command: string | undefined, cwd: string): Promise<boolean> {
    return new Promise<boolean>(resolve => {
        if (!command) {
            resolve(true)
            return
        }
        console.log(`> ${command}`)
        const cmd = exec(command, { cwd })
        cmd.stdout?.pipe(process.stderr)
        cmd.stderr?.pipe(process.stderr)
        cmd.on('error', () => resolve(false))
        cmd.on('exit', code => resolve(code === 0))
    })
}

// Same as runCommand but rejects the promise instead of returning false
// Does nothing when command is undefined
async function runVoidCommand(command: string | undefined, cwd: string): Promise<void> {
    const ok = await runCommand(command, cwd)
    if (!ok) {
        throw new Error(`Command failed: ${command}`)
    }
}

export async function testCleanup(options: EvaluateAutocompleteOptions): Promise<void> {
    if (options.worktree) {
        await runVoidCommand(`git worktree remove ${options.worktree}`, options.workspace)
    }
}

export async function testInstall(options: EvaluateAutocompleteOptions): Promise<void> {
    if (!options.runTestCommand) {
        return
    }
    if (options.worktree) {
        throw new Error(`options.worktree=${options.worktree} is already defined, expected it to be undefined`)
    }
    options.worktree = await fspromises.mkdtemp(path.join(os.tmpdir(), 'evaluate-autocomplete-'))
    await runVoidCommand('git diff --exit-code', options.workspace)

    // Create a git worktree so that we can run parallel evaluations. Without
    // worktrees, we risk having separate fixtures making modifications to the
    // same worktree causing the results to be inaccurate.
    await runVoidCommand(`git worktree add ${options.worktree}`, options.workspace)
    await runVoidCommand(options.installCommand, options.worktree)
    await runVoidCommand(options.testCommand, options.worktree)
}

export async function testTypecheck(
    parameters: AutocompleteParameters,
    item: AutocompleteItem
): Promise<boolean | undefined> {
    const { options, document } = parameters
    const { worktree } = options
    if (!worktree) {
        return undefined
    }
    const absolutePath = path.join(worktree, document.params.filepath)
    const { testCommand, runTestCommand } = options
    if (!testCommand || !runTestCommand) {
        return undefined
    }
    const start = new vscode.Position(item.range.start.line, item.range.start.character)
    const end = new vscode.Position(item.range.end.line, item.range.end.character)
    const modifiedDocument = new AgentTextDocument(
        TextDocumentWithUri.from(document.uri, { content: parameters.modifiedContent })
    )
    const newText = [
        modifiedDocument.getText(new vscode.Range(new vscode.Position(0, 0), start)),
        item.insertText,
        modifiedDocument.getText(new vscode.Range(end, new vscode.Position(document.textDocument.lineCount, 0))),
    ].join('')

    try {
        // Assert that the codebase has no diffs to ensure that we're evaluating a clean worktree
        await runVoidCommand('git diff --exit-code', worktree)
        await fspromises.writeFile(absolutePath, newText)
        const timer = new Timer()
        const result = await runCommand(testCommand, worktree)
        console.error(`Completion '${item.insertText}': ${result ? 'typecheck_ok' : 'typecheck_error'} (${timer})`)
        return result
    } finally {
        await fspromises.writeFile(absolutePath, document.text)
    }
}
