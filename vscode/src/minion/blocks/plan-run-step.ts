import type Anthropic from '@anthropic-ai/sdk'
import type { CancellationToken } from 'vscode'
import type { Step } from '../action'
import type { Environment } from '../environment'
import * as prompts from '../prompts'
import type { BlockResult, Memory } from '../statemachine'

import * as vscode from 'vscode'
import { extractXMLFromAnthropicResponse } from '../util'

function currentDate(): string {
    return new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    })
}

/**
 * Encapsulates the state needed to run a single step of the plan
 */
export async function runStep(
    cancelToken: CancellationToken,
    step: Step,
    env: Environment,
    memory: Memory,
    anthropic: Anthropic
): Promise<BlockResult> {
    switch (step.stepId) {
        case 'update-changelog': {
            return runUpdateChangelog(memory, anthropic)
        }
        default: {
            return { status: 'done', error: 'Not yet implemented' }
        }
    }
}

async function runUpdateChangelog(memory: Memory, anthropic: Anthropic): Promise<BlockResult> {
    // reverse search through the transcript
    let description: string | undefined = undefined
    for (const evt of memory.getEvents().toReversed()) {
        if (evt.type === 'restate') {
            description = evt.output
        }
    }
    if (!description) {
        return { status: 'done', error: 'Could not find description' }
    }

    const clFiles = await vscode.workspace.findFiles(
        '**/[Cc][Hh][Aa][Nn][Gg][Ee][Ll][Oo][Gg]*',
        '**/node_modules/**',
        10
    )
    if (clFiles.length === 0) {
        return { status: 'done', error: 'Could not find changelog file' }
    }

    clFiles.sort((a, b) => b.path.localeCompare(a.path))
    const changelogUri = clFiles[0]

    // read file contents as string
    const clStart = 0
    const clEnd = 1024
    const clContents = (await vscode.workspace.fs.readFile(changelogUri)).toString()
    const clChunk = clContents.substring(clStart, clEnd)

    const message = await anthropic.messages.create({
        model: 'claude-3-opus-20240229',
        max_tokens: 4096,
        system: prompts.changelogSystem,
        messages: prompts.changelogUser(clChunk, currentDate(), description),
    })

    const toRemove = extractXMLFromAnthropicResponse(message, 'linesToRemove')
    const toInsert = extractXMLFromAnthropicResponse(message, 'linesToInsert')

    const addedIdx = clChunk.indexOf(toRemove)
    if (addedIdx < 0) {
        return { status: 'done', error: 'Could not find added string' }
    }

    const newClChunk = clChunk.slice(0, addedIdx) + toInsert + clChunk.slice(addedIdx + toRemove.length)

    const newClContents = clContents.slice(0, clStart) + newClChunk + clContents.slice(clEnd)

    await vscode.workspace.fs.writeFile(changelogUri, Buffer.from(newClContents))

    const prevUri = vscode.Uri.from({
        scheme: 'git',
        path: changelogUri.path,
        query: JSON.stringify({ ref: '~', path: changelogUri.path }),
    })
    const curUri = vscode.Uri.from({
        scheme: changelogUri.scheme,
        path: changelogUri.path,
    })
    await vscode.commands.executeCommand('vscode.diff', prevUri, curUri, 'the diff')

    return { status: 'done' }
}
