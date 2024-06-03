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

export const shouldAskHumanSystem = `
Your job is to determine whether a particular programming task should be performed by AI or human.

Here are tasks that AI is generally good at:
- Writing boilerplate code for common frameworks like React
- Writing DevOps code/configuration for common tools like terraform and AWS CloudFormation
- Searching for code snippets that have keyword matches for a specific query
- Writing tests
- Writing documentation
- Summarizing changed code and adding it to the changelog
- Writing functions or classes that are likely well-represented on StackOverflow. For example, functions for common use cases of popular open-source frameworks, including but not limited to creating React components, HTTP handlers, command line argument parsers, string manipulations, and serialization of common data formats like JSON and XML.

Here are tasks that humans are generally good at:
- Thinking creatively about what should be built to solve a high-level user problem
- Writing novel data structures or algorithms
- Writing code that must integrate with an existing package in a private codebase
- Complex features that involve writing code that's unlikely to have an answer on StackOverflow

INPUT FORMAT:
<description>a description of the programming task</description>

RESPONSE_FORMAT:
<humanIsBetter>true or false</humanIsBetter>
<aiIsBetter>true or false</aiIsBetter>`.trimStart()

export function shouldAskHumanUser(description: string): MessageParam[] {
    return [
        {
            role: 'user',
            content: `<description>${description}</description>`,
        },
    ]
}

export const changelogSystem = `
Your job is to generate a patch to update a changelog file, given a description of changes that were made to a codebase.

When outputting a diff, use the following format that omits line numbers:
<diff>
@@ ... @@
 def main(args):
     # show a greeting
-    print("Hello!")
+    print("Goodbye!")
     return
</diff>

INPUT FORMAT:
<description>a description of the changes</description>
<changelog>existing contents of the changelog</changelog>

RESPONSE_FORMAT:
<diff>
the diff goes here
</diff>`.trimStart()

export function changelogUser(changelog: string, description: string): MessageParam[] {
    return [
        {
            role: 'user',
            content: `
<description>
${description}
</description>
<changelog>
${changelog}
</changelog>
`.trimStart(),
        },
    ]
}

export const changelogSystemNonPatch = `
Your job is to generate a changelog entry, given a description of changes that were made to a codebase.

INPUT FORMAT:
<description>a description of the changes</description>
<changelog>existing contents of the changelog</changelog>

RESPONSE_FORMAT:
<changelogEntry>text to add to the changelog</changelogEntry>`.trimStart()

export function changelogUserNonPatch(changelog: string, description: string): MessageParam[] {
    return [
        {
            role: 'user',
            content: `
<description>
${description}
</description>
<changelog>
${changelog}
</changelog>
`.trimStart(),
        },
    ]
}
