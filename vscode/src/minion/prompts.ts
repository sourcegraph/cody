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

export const planSystem = `
Your job is to write an implementation plan given (1) a spec of the existing state and desired change and (2) a set of contextual files that seem relevant.

A few rules that you MUST ALWAYS OBEY:
1. Include a step in the plan to add or update tests.
1. Include a step at the end of the plan to run relevant tests and verify the fix.
1. Include a step at the end of the plan to update documentation
1. Include a step at the end of the plan to update the changelog.

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

export function taoSystem(commandDocs: string, window: number): string {
    const text = (
        `
SETTING: You are an autonomous programmer, and you're working directly in the command line with a special interface.

The special interface consists of a file editor that shows you ${window} lines of a file at a time.
In addition to typical bash commands, you can also use the following commands to help you navigate and edit files.

COMMANDS:
${commandDocs}

Please note that THE EDIT COMMAND REQUIRES PROPER INDENTATION.
If you'd like to add the line '        print(x)' you must fully write that out, with all those spaces before the code! Indentation is important and code that is not indented correctly will fail and require fixing before it can be run.

RESPONSE FORMAT:
Your shell prompt is formatted as follows:
(Open file: <path>) <cwd> $

You need to format your output using two fields; discussion and command.
Your output should always include _one_ discussion and _one_ command field EXACTLY as in the following example:
DISCUSSION
First I'll start by using ls to see what files are in the current directory. Then maybe we can look at some relevant files to see what they look like.
` +
        '```' +
        `
ls -a
` +
        '```' +
        `
You should only include a *SINGLE* command in the command section and then wait for a response from the shell before continuing with more discussion and commands. Everything you include in the DISCUSSION section will be saved for future reference.
If you'd like to issue two commands at once, PLEASE DO NOT DO THAT! Please instead first submit just the first command, and then after receiving a response you'll be able to issue the second command.
You're free to use any other bash commands you want (e.g. find, grep, cat, ls, cd) in addition to the special commands listed above.
However, the environment does NOT support interactive session commands (e.g. python, vim), so please do not invoke them.`
    ).trimStart()
    return text
}

export function taoUser(issue: string, openFile: string, workingDirectory: string): string {
    const text = (
        `
We're currently solving the following issue within our repository. Here's the issue text:
ISSUE:
${issue}

INSTRUCTIONS:
Now, you're going to solve this issue on your own. Your terminal session has started and you're in the repository's root directory. You can use any bash commands or the special interface to help you. Edit all the files you need to and run any checks or tests that you want.
Remember, YOU CAN ONLY ENTER ONE COMMAND AT A TIME. You should always wait for feedback after every command.
When you're satisfied with all of the changes you've made, you can submit your changes to the code base by simply running the submit command.
Note however that you cannot use any interactive session commands (e.g. python, vim) in this environment, but you can write scripts and run them. E.g. you can write a python script and then run it with ` +
        '`python <script_name>.py`' +
        `.

NOTE ABOUT THE EDIT COMMAND: Indentation really matters! When editing a file, make sure to insert appropriate indentation before each line!

IMPORTANT TIPS:
1. Always start by trying to replicate the bug that the issues discusses.
    If the issue includes code for reproducing the bug, we recommend that you re-implement that in your environment, and run it to make sure you can reproduce the bug.
    Then start trying to fix it.
    When you think you've fixed the bug, re-run the bug reproduction script to make sure that the bug has indeed been fixed.

    If the bug reproduction script does not print anything when it successfully runs, we recommend adding a print("Script completed successfully, no errors.") command at the end of the file,
    so that you can be sure that the script indeed ran fine all the way through.

2. If you run a command and it doesn't work, try running a different command. A command that did not work once will not work the second time unless you modify it!

3. If you open a file and need to get to an area around a specific line that is not in the first 100 lines, say line 583, don't just use the scroll_down command multiple times. Instead, use the goto 583 command. It's much quicker.

4. If the bug reproduction script requires inputting/reading a specific file, such as buggy-input.png, and you'd like to understand how to input that file, conduct a search in the existing repo code, to see whether someone else has already done that. Do this by running the command: find_file "buggy-input.png" If that doesn't work, use the linux 'find' command.

5. Always make sure to look at the currently open file and the current working directory (which appears right after the currently open file). The currently open file might be in a different directory than the working directory! Note that some commands, such as 'create', open files, so they might change the current  open file.

6. When editing files, it is easy to accidentally specify a wrong line number or to write code with incorrect indentation. Always check the code after you issue an edit to make sure that it reflects what you wanted to accomplish. If it didn't, issue another command to fix it.

7. It may be necessary to install the repository from source before you can run code. Please think about how to install the environment from the repository directory if you need to do so.


(Open file: ${openFile})
(Current directory: ${workingDirectory})
bash-$`
    ).trimStart()
    return text
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
