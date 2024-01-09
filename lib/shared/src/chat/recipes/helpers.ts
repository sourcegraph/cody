import path from 'path'

import { type CodebaseContext } from '../../codebase-context'
import { getContextMessageWithResponse, type ContextMessage } from '../../codebase-context/messages'
import { NUM_CODE_RESULTS, NUM_TEXT_RESULTS } from '../../prompt/constants'
import { populateCodeContextTemplate } from '../../prompt/templates'

export const MARKDOWN_FORMAT_PROMPT = 'Enclose code snippets with three backticks like so: ```.'

const EXTENSION_TO_LANGUAGE: { [key: string]: string } = {
    py: 'Python',
    rb: 'Ruby',
    md: 'Markdown',
    php: 'PHP',
    js: 'Javascript',
    ts: 'Typescript',
    jsx: 'JSX',
    tsx: 'TSX',
    go: 'Go',
    java: 'Java',
    c: 'C',
    cpp: 'C++',
    cs: 'C#',
    css: 'CSS',
    html: 'HTML',
    json: 'JSON',
    rs: 'Rust',
}

export const commandRegex = {
    chat: new RegExp(/^(?!.*\/n(ew)?\s|.*\/f(ix)?\s)/i), // For now, if the input does not start with /n or /f, it is a chat
    edit: new RegExp(/^\/e(dit)?\s/i),
    touch: new RegExp(/^\/t(ouch)?\s/i),
    touchNeedFileName: new RegExp(/^\/t(ouch)?\s(?!.*test(s)?\s)/i), // Has /touch or /t but no test or tests in the string
    noTest: new RegExp(/^(?!.*test)/i),
    search: new RegExp(/^\/s(earch)?\s/i),
    test: new RegExp(/^\/n(ew)?\s|test(s)?\s/, 'i'),
}

export function getNormalizedLanguageName(extension: string): string {
    return extension ? EXTENSION_TO_LANGUAGE[extension] ?? extension.charAt(0).toUpperCase() + extension.slice(1) : ''
}

export async function getContextMessagesFromSelection(
    selectedText: string,
    precedingText: string,
    followingText: string,
    { fileName, repoName, revision }: { fileName: string; repoName?: string; revision?: string },
    codebaseContext: CodebaseContext
): Promise<ContextMessage[]> {
    const selectedTextContext = await codebaseContext.getContextMessages(selectedText, {
        numCodeResults: 4,
        numTextResults: 0,
    })

    return selectedTextContext.concat(
        [precedingText, followingText]
            .filter(text => text.trim().length > 0)
            .flatMap(text =>
                getContextMessageWithResponse(populateCodeContextTemplate(text, fileName, repoName), {
                    fileName,
                    repoName,
                    revision,
                })
            )
    )
}

export function getFileExtension(fileName: string): string {
    return path.extname(fileName).slice(1).toLowerCase()
}

export const numResults = {
    numCodeResults: NUM_CODE_RESULTS,
    numTextResults: NUM_TEXT_RESULTS,
}

export function isSingleWord(str: string): boolean {
    return str.trim().split(/\s+/).length === 1
}
