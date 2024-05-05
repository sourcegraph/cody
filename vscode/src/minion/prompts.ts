import type { MessageParam } from '@anthropic-ai/sdk/resources'

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
Your job is to determine if a source file should be modified to implement a described issue. You should accept a user request in the following format:
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
