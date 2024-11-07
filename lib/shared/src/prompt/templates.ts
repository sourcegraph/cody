import type { URI } from 'vscode-uri'

import type { RangeData } from '../common/range'
import type { ActiveTextEditorDiagnostic } from '../editor'
import { displayPath } from '../editor/displayPath'
import { PromptString, ps } from './prompt-string'

export function populateCodeContextTemplate(
    code: PromptString,
    fileUri: URI,
    repoName?: PromptString,
    type: 'chat' | 'edit' = 'chat'
): PromptString {
    const template =
        type === 'edit'
            ? ps`Codebase context from file {filePath}{inRepo}:\n{text}`
            : ps`Codebase context from file {filePath}{inRepo}:\n\`\`\`{languageID}{filePathToParse}\n{text}\`\`\``

    const filePath = PromptString.fromDisplayPath(fileUri)
    return template
        .replaceAll('{inRepo}', repoName ? ps` in repository ${repoName}` : ps``)
        .replaceAll('{filePath}', filePath)
        .replaceAll('{filePathToParse}', ps`:${filePath}`)
        .replaceAll('{languageID}', PromptString.fromMarkdownCodeBlockLanguageIDForFilename(fileUri))
        .replaceAll('{text}', code)
}

const DIAGNOSTICS_CONTEXT_TEMPLATE = ps`Use the following {type} from the code snippet in the file: {filePath}:
{prefix}: {message}
Code snippet:
{code}
`

export function populateCurrentEditorDiagnosticsTemplate(
    diagnostic: ActiveTextEditorDiagnostic,
    uri: URI
): PromptString {
    const { type, message, text } = PromptString.fromTextEditorDiagnostic(diagnostic, uri)

    return DIAGNOSTICS_CONTEXT_TEMPLATE.replaceAll('{type}', type)
        .replaceAll('{filePath}', PromptString.fromDisplayPath(uri))
        .replaceAll('{prefix}', type)
        .replaceAll('{message}', message)
        .replaceAll('{languageID}', PromptString.fromMarkdownCodeBlockLanguageIDForFilename(uri))
        .replaceAll('{code}', text)
}

const COMMAND_OUTPUT_TEMPLATE = 'Here is the output returned from the terminal.\n'

export function populateTerminalOutputContextTemplate(output: string): string {
    return COMMAND_OUTPUT_TEMPLATE + output
}

const SELECTED_CODE_CONTEXT_TEMPLATE = ps`My selected code from codebase file {filePath}:\n\`\`\`\n{code}\`\`\``

export function populateCurrentSelectedCodeContextTemplate(
    code: PromptString,
    fileUri: URI,
    range?: RangeData
): PromptString {
    return SELECTED_CODE_CONTEXT_TEMPLATE.replace('{code}', code).replaceAll(
        '{filePath}',
        PromptString.fromDisplayPathLineRange(fileUri, range)
    )
}

const DIRECTORY_FILE_LIST_TEMPLATE =
    'Here is a list of files from the directory contains {fileName} in my codebase: '
const ROOT_DIRECTORY_FILE_LIST_TEMPLATE = 'Here is a list of files from the root codebase directory: '

export function populateListOfFilesContextTemplate(fileList: string, fileUri?: URI): string {
    return (
        (fileUri
            ? DIRECTORY_FILE_LIST_TEMPLATE.replace('{fileName}', displayPath(fileUri))
            : ROOT_DIRECTORY_FILE_LIST_TEMPLATE) + fileList
    )
}

export function populateContextTemplateFromText(
    templateText: PromptString,
    content: PromptString,
    fileUri: URI,
    range?: RangeData
): PromptString {
    return templateText
        .replace('{displayPath}', PromptString.fromDisplayPathLineRange(fileUri, range))
        .concat(content)
}

const FILE_IMPORTS_TEMPLATE = ps`{fileName} has imported the following: `

export function populateImportListContextTemplate(importList: PromptString, fileUri: URI): PromptString {
    return FILE_IMPORTS_TEMPLATE.replace('{fileName}', PromptString.fromDisplayPath(fileUri)).concat(
        importList
    )
}

const CODE_GENERATION_CONTEXT_TEMPLATE = ps`Below is the code from file path {filePath}. Review the code outside the XML tags to detect the functionality, formats, style, patterns, and logics in use. Then, use what you detect and reuse methods/libraries to complete and enclose completed code only inside XML tags precisely without duplicating existing implementations. Here is the code:
{precedingText}<{outputTag}></{outputTag}>{followingText}
`

export function populateCodeGenerationContextTemplate(
    precedingText: PromptString,
    followingText: PromptString,
    fileUri: URI,
    tag: PromptString
): PromptString {
    return CODE_GENERATION_CONTEXT_TEMPLATE.replaceAll('{precedingText}', precedingText)
        .replaceAll('{followingText}', followingText)
        .replaceAll('{filePath}', PromptString.fromDisplayPath(fileUri))
        .replaceAll('{outputTag}', tag)
}
