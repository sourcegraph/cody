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
