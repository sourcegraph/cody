import type { MessageParam } from '@anthropic-ai/sdk/resources'
import type { AnnotatedContext } from './action'

// TODO(beyang): incorporate file tree info
export const generateQueriesSystem = `
Your job is to accept a user request in the following format:
<issueDescription></issueDescription>

Think about a set of keyword search queries you would perform to find relevant files for the issue. The queries can contain more than one keyword and should be space-delimited. Return a response in the following format:
<thoughtProcess></thoughtProcess>
<searchQueries>
query1
query2
...
queryN
</searchQueries>`.trimStart()

export function generateQueriesUser(issueDescription: string): MessageParam[] {
    const text = `
<issueDescription>${issueDescription}</issueDescription>`.trimStart()
    return [
        {
            role: 'user',
            content: text,
        },
    ]
}

export const isRelevantSnippetSystem = `
Your job is to determine if a source file is relevant to read or modify to implement a described issue. Most source files proposed WILL be relevant. You should accept a user request in the following format:
<issue>the description of the issue</issue>
<file name="filename">source file contents</file>

Format your response in the following format:
<reasoning>
Explain why or why not the file is relevant to the issue, breaking down your thought process and referencing specific symbols in the source file. Most files will not be relevant to the specified issue.
</reasoning>
<shouldModify>true or false</shouldModify>`.trimStart()

export function isRelevantSnippetUser(
    taskDescription: string,
    filename: string,
    blob: string
): MessageParam[] {
    const text = `
<issue>${taskDescription}</issue>
<file name="${filename}">${blob}</file>`.trimStart()
    return [
        {
            role: 'user',
            content: text,
        },
    ]
}

export const planSystem = `
Your job is to write an implementation plan given (1) a spec of the existing state and desired change and (2) a set of contextual files that seem relevant. The steps in your plan should reference specific files and symbols.

A few rules that you MUST ALWAYS OBEY:
1. Include a step in the plan to add or update tests.
1. Include a step at the end of the plan to run relevant tests and verify the fix.

The user will provide a request in the following format:
<spec>
A high-level description of the existing state and desired state
</spec>
<context>
<file name="filename1">source file 1 contents</file>
<file name="filename2">source file 2 contents</file>
...
<file name="filenamen">source file n contents</file>
</context>

Format your repsonse like this:
<plan>
<step><description>Description of the 1st step</description><title>one-sentence summary of step</title></step>
<step><description>Description of the 2nd step</description><title>one-sentence summary of step</title></step>
...
<step><description>Description of the nth step</description><title>one-sentence summary of step</title></step>
</plan>
`.trimStart()

export function planUser(spec: string, context: AnnotatedContext[]): MessageParam[] {
    const text = `
<spec>
${spec}
</spec>
<context>
${context
    .map(snippet => {
        const uri = snippet.source.uri.toString()
        const range = snippet.source.range
        return `
<file name="${uri}#L${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}}">
${snippet.text}
</file>`.trimStart()
    })
    .join('\n')}
</context>`.trimStart()

    return [
        {
            role: 'user',
            content: text,
        },
    ]
}

export const changelogSystem = `
Your job is to propose an edit to a changelog file. You'll be given the following information:
- changelog: the portion of the changelog to modify
- currentDate: the current date
- changeDescription: a description of the new change to be incorporated into the changelog

Generate a patch to update the section you've chosen to modify. Your output should be in the following format:
<linesToRemove>
the lines that should be replaced, including distinctive lines preceeding and following
</linesToRemove>
<linesToInsert>
the lines that should be substituted in place of the removed lines
</linesToInsert>

IMPORTANT RULES:
- Do NOT generate any hyperlinks. Do not reference an issue or pull request numbers.
`.trim()

export function changelogUser(
    changelog: string,
    currentDate: string,
    description: string
): MessageParam[] {
    return [
        {
            role: 'user',
            content: `
<changelog>
${changelog}
</changelog>
<currentDate>${currentDate}</currentDate>
<changeDescription>
${description}
</changeDescription>
`.trim(),
        },
    ]
}
