import type { URI } from 'vscode-uri'

import {
    ProgrammingLanguage,
    languageFromFilename,
    markdownCodeBlockLanguageIDForFilename,
} from '../common/languages'
import type { ActiveTextEditorDiagnostic } from '../editor'
import { displayPath } from '../editor/displayPath'

const CODE_CONTEXT_TEMPLATE = `Use the following code snippet from file \`{filePath}\`:
\`\`\`{languageID}
{text}
\`\`\``

const CODE_CONTEXT_TEMPLATE_WITH_REPO = `Use the following code snippet from file \`{filePath}\` in repository \`{repoName}\`:
\`\`\`{languageID}
{text}
\`\`\``

const CODE_CONTEXT_TEMPLATE_EDIT = `Use the following code snippet from file: {filePath}:
{text}
`

export function populateCodeContextTemplate(
    code: string,
    fileUri: URI,
    repoName?: string,
    type: 'chat' | 'edit' = 'chat'
): string {
    const template =
        type === 'edit'
            ? CODE_CONTEXT_TEMPLATE_EDIT
            : repoName
              ? CODE_CONTEXT_TEMPLATE_WITH_REPO.replace('{repoName}', repoName)
              : CODE_CONTEXT_TEMPLATE

    return template
        .replace('{filePath}', displayPath(fileUri))
        .replace('{languageID}', markdownCodeBlockLanguageIDForFilename(fileUri))
        .replace('{text}', code)
}

const PRECISE_CONTEXT_TEMPLATE = `The symbol '{symbol}' is defined in the file {filePath} as:
\`\`\`{languageID}
{text}
\`\`\``

export function populatePreciseCodeContextTemplate(symbol: string, fileUri: URI, code: string): string {
    return PRECISE_CONTEXT_TEMPLATE.replace('{symbol}', symbol)
        .replace('{filePath}', displayPath(fileUri))
        .replace('{languageID}', markdownCodeBlockLanguageIDForFilename(fileUri))
        .replace('{text}', code)
}

const MARKDOWN_CONTEXT_TEMPLATE = 'Use the following text from file `{filePath}`:\n{text}'

const MARKDOWN_CONTEXT_TEMPLATE_WITH_REPO =
    'Use the following text from file `{filePath}` in repository `{repoName}`:\n{text}'

export function populateMarkdownContextTemplate(
    markdown: string,
    fileUri: URI,
    repoName?: string
): string {
    return (
        repoName
            ? MARKDOWN_CONTEXT_TEMPLATE_WITH_REPO.replace('{repoName}', repoName)
            : MARKDOWN_CONTEXT_TEMPLATE
    )
        .replace('{filePath}', displayPath(fileUri))
        .replace('{text}', markdown)
}

const CURRENT_EDITOR_CODE_TEMPLATE = 'I have the `{filePath}` file opened in my editor. '

const CURRENT_EDITOR_CODE_TEMPLATE_WITH_REPO =
    'I have the `{filePath}` file from the repository `{repoName}` opened in my editor. '

export function populateCurrentEditorContextTemplate(
    code: string,
    fileUri: URI,
    repoName?: string
): string {
    const context =
        languageFromFilename(fileUri) === ProgrammingLanguage.Markdown
            ? populateMarkdownContextTemplate(code, fileUri, repoName)
            : populateCodeContextTemplate(code, fileUri, repoName)
    return (
        (repoName
            ? CURRENT_EDITOR_CODE_TEMPLATE_WITH_REPO.replace('{repoName}', repoName)
            : CURRENT_EDITOR_CODE_TEMPLATE
        ).replaceAll('{filePath}', displayPath(fileUri)) + context
    )
}

const CURRENT_EDITOR_SELECTED_CODE_TEMPLATE =
    'Here is the selected {languageID} code from file path `{filePath}`: '

const CURRENT_EDITOR_SELECTED_CODE_TEMPLATE_WITH_REPO =
    'Here is the selected code from file `{filePath}` in the {repoName} repository, written in {languageID}: '

export function populateCurrentEditorSelectedContextTemplate(
    code: string,
    fileUri: URI,
    repoName?: string
): string {
    const context =
        languageFromFilename(fileUri) === ProgrammingLanguage.Markdown
            ? populateMarkdownContextTemplate(code, fileUri, repoName)
            : populateCodeContextTemplate(code, fileUri, repoName)
    return (
        (repoName
            ? CURRENT_EDITOR_SELECTED_CODE_TEMPLATE_WITH_REPO.replace('{repoName}', repoName)
            : CURRENT_EDITOR_SELECTED_CODE_TEMPLATE
        )
            .replace('{languageID}', markdownCodeBlockLanguageIDForFilename(fileUri))
            .replaceAll('{filePath}', displayPath(fileUri)) + context
    )
}

const DIAGNOSTICS_CONTEXT_TEMPLATE = `Use the following {type} from the code snippet in the file: {filePath}:
{prefix}: {message}
Code snippet:
{code}
`

export function populateCurrentEditorDiagnosticsTemplate(
    { message, type, text }: ActiveTextEditorDiagnostic,
    fileUri: URI
): string {
    return DIAGNOSTICS_CONTEXT_TEMPLATE.replace('{type}', type)
        .replace('{filePath}', displayPath(fileUri))
        .replace('{prefix}', type)
        .replace('{message}', message)
        .replace('{languageID}', markdownCodeBlockLanguageIDForFilename(fileUri))
        .replace('{code}', text)
}

const COMMAND_OUTPUT_TEMPLATE = 'Here is the output returned from the terminal.\n'

export function populateTerminalOutputContextTemplate(output: string): string {
    return COMMAND_OUTPUT_TEMPLATE + output
}

const SELECTED_CODE_CONTEXT_TEMPLATE = `"My selected {languageName} code from file \`{filePath}\`:
<selected>
{code}
</selected>`

const SELECTED_CODE_CONTEXT_TEMPLATE_WITH_REPO = `"My selected {languageName} code from file \`{filePath}\` in \`{repoName}\` repository:
<selected>
{code}
</selected>`

export function populateCurrentSelectedCodeContextTemplate(
    code: string,
    fileUri: URI,
    repoName?: string
): string {
    return (
        repoName
            ? SELECTED_CODE_CONTEXT_TEMPLATE_WITH_REPO.replace('{repoName}', repoName)
            : SELECTED_CODE_CONTEXT_TEMPLATE
    )
        .replace('{code}', code)
        .replaceAll('{filePath}', displayPath(fileUri))
        .replace('{languageName}', languageFromFilename(fileUri))
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
    templateText: string,
    content: string,
    fileUri: URI
): string {
    return templateText.replace('{fileName}', displayPath(fileUri)) + content
}

const FILE_IMPORTS_TEMPLATE = '{fileName} has imported the folowing: '

export function populateImportListContextTemplate(importList: string, fileUri: URI): string {
    return FILE_IMPORTS_TEMPLATE.replace('{fileName}', displayPath(fileUri)) + importList
}

const CODE_GENERATION_CONTEXT_TEMPLATE = `Below is the code from file path {filePath}. Review the code outside the XML tags to detect the functionality, formats, style, patterns, and logics in use. Then, use what you detect and reuse methods/libraries to complete and enclose completed code only inside XML tags precisely without duplicating existing implementations. Here is the code:
{precedingText}<{outputTag}></{outputTag}>{followingText}
`

export function populateCodeGenerationContextTemplate(
    precedingText: string,
    followingText: string,
    fileUri: URI,
    tag: string
): string {
    return CODE_GENERATION_CONTEXT_TEMPLATE.replace('{precedingText}', precedingText)
        .replace('{followingText}', followingText)
        .replace('{filePath}', displayPath(fileUri))
        .replace('{outputTag}', tag)
}
