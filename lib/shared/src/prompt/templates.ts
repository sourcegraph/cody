import path from 'path'

import { getFileExtension, getNormalizedLanguageName } from '../chat/recipes/helpers'
import { ActiveTextEditorDiagnostic } from '../editor'

const CODE_CONTEXT_TEMPLATE = `Use following code snippet from file \`{filePath}\`:
\`\`\`{language}
{text}
\`\`\``

const CODE_CONTEXT_TEMPLATE_WITH_REPO = `Use following code snippet from file \`{filePath}\` in repository \`{repoName}\`:
\`\`\`{language}
{text}
\`\`\``

export function populateCodeContextTemplate(code: string, filePath: string, repoName?: string): string {
    return (repoName ? CODE_CONTEXT_TEMPLATE_WITH_REPO.replace('{repoName}', repoName) : CODE_CONTEXT_TEMPLATE)
        .replace('{filePath}', filePath)
        .replace('{language}', getExtension(filePath))
        .replace('{text}', code)
}

const MARKDOWN_CONTEXT_TEMPLATE = 'Use the following text from file `{filePath}`:\n{text}'

const MARKDOWN_CONTEXT_TEMPLATE_WITH_REPO =
    'Use the following text from file `{filePath}` in repository `{repoName}`:\n{text}'

export function populateMarkdownContextTemplate(markdown: string, filePath: string, repoName?: string): string {
    return (repoName ? MARKDOWN_CONTEXT_TEMPLATE_WITH_REPO.replace('{repoName}', repoName) : MARKDOWN_CONTEXT_TEMPLATE)
        .replace('{filePath}', filePath)
        .replace('{text}', markdown)
}

const CURRENT_EDITOR_CODE_TEMPLATE = 'I have the `{filePath}` file opened in my editor. '

const CURRENT_EDITOR_CODE_TEMPLATE_WITH_REPO =
    'I have the `{filePath}` file from the repository `{repoName}` opened in my editor. '

export function populateCurrentEditorContextTemplate(code: string, filePath: string, repoName?: string): string {
    const context = isMarkdownFile(filePath)
        ? populateMarkdownContextTemplate(code, filePath, repoName)
        : populateCodeContextTemplate(code, filePath, repoName)
    return (
        (repoName
            ? CURRENT_EDITOR_CODE_TEMPLATE_WITH_REPO.replace('{repoName}', repoName)
            : CURRENT_EDITOR_CODE_TEMPLATE
        ).replace(/{filePath}/g, filePath) + context
    )
}

const CURRENT_EDITOR_SELECTED_CODE_TEMPLATE =
    'Here is the selected code from file `{filePath}`, written in {language}: '

const CURRENT_EDITOR_SELECTED_CODE_TEMPLATE_WITH_REPO =
    'Here is the selected code from file `{filePath}` in the {repoName} repository, written in {language}: '

export function populateCurrentEditorSelectedContextTemplate(
    code: string,
    filePath: string,
    repoName?: string
): string {
    const extension = getFileExtension(filePath)
    const languageName = getNormalizedLanguageName(extension)
    const context = isMarkdownFile(filePath)
        ? populateMarkdownContextTemplate(code, filePath, repoName)
        : populateCodeContextTemplate(code, filePath, repoName)
    return (
        (repoName
            ? CURRENT_EDITOR_SELECTED_CODE_TEMPLATE_WITH_REPO.replace('{repoName}', repoName)
            : CURRENT_EDITOR_SELECTED_CODE_TEMPLATE
        )
            .replace('{language}', languageName)
            .replace(/{filePath}/g, filePath) + context
    )
}

const DIAGNOSTICS_CONTEXT_TEMPLATE = `Use the following {type} from the code snippet in the file \`{filePath}\`
{prefix}: {message}
Code snippet:
\`\`\`{language}
{code}
\`\`\``

export function populateCurrentEditorDiagnosticsTemplate(
    { message, type, text }: ActiveTextEditorDiagnostic,
    filePath: string
): string {
    const language = getExtension(filePath)
    return DIAGNOSTICS_CONTEXT_TEMPLATE.replace('{type}', type)
        .replace('{filePath}', filePath)
        .replace('{prefix}', type)
        .replace('{message}', message)
        .replace('{language}', language)
        .replace('{code}', text)
}

const COMMAND_OUTPUT_TEMPLATE = 'Here is the output returned from the terminal.\n'

export function populateTerminalOutputContextTemplate(output: string): string {
    return COMMAND_OUTPUT_TEMPLATE + output
}

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown'])

export function isMarkdownFile(filePath: string): boolean {
    return MARKDOWN_EXTENSIONS.has(getExtension(filePath))
}

function getExtension(filePath: string): string {
    return path.extname(filePath).slice(1)
}

const SELECTED_CODE_CONTEXT_TEMPLATE = `"Here is my selected code from a {languageName} file \`{filePath}\`:
\`\`\`{extension}
{text}
\`\`\``

const SELECTED_CODE_CONTEXT_TEMPLATE_WITH_REPO = `"Here is my selected code from a {languageName} file \`{filePath}\` in repository \`{repoName}\`:
\`\`\`{extension}
{text}
\`\`\``

export function populateCurrentSelectedCodeContextTemplate(code: string, filePath: string, repoName?: string): string {
    const extension = getFileExtension(filePath)
    const languageName = getNormalizedLanguageName(extension)
    return (
        repoName
            ? SELECTED_CODE_CONTEXT_TEMPLATE_WITH_REPO.replace('{repoName}', repoName)
            : SELECTED_CODE_CONTEXT_TEMPLATE
    )
        .replace('{text', code)
        .replace('{extension}', extension)
        .replace(/{filePath}/g, filePath)
        .replace('{languageName}', languageName)
}
