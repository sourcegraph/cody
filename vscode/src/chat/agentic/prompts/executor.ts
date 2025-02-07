import { PromptString, ps } from '@sourcegraph/cody-shared'

const tools_format = {
    edit_file: {
        description: 'Edit a file. DO NOT enclose replacement text in quotes or markdown backticks.',
        file: 'path/to/file.name',
        regex: 'The regular expression used for selecting the area to edit.',
        replacement: 'The text to replace the matched pattern.',
        replaceAll: 'true OR empty - If the replacement should be applied to all matches',
    },
    create_file: {
        description: 'Create a new file.',
        file: 'path/to/file.name',
        content: 'The content to write to the new file',
    },
    run_bash: {
        description: 'Execute a bash command.',
        command:
            "The terminal command to execute. For destructive commands, leave the command empty and set the 'note' tags to 'danger'",
        note: 'danger OR empty',
    },
    code_search: {
        description:
            'Search for code in the codebase. Do not reflect on the quality of the returned search results in your response.',
        query: 'The keyword search query to find the relevant code.',
    },
    next_step: {
        description:
            'Proceed to the next step. If no further steps are needed, respond with "done". If you need to use tools for the next step or complete your current step and ready to move on to the next step, respond with "next". If you need to skip the current a step, respond with "skip". If you need help or need clarifications on the current task, respond with "help", which would stop the task and allow you to speak to the users - this does not work after the initial step.',
        step: 'next', // enum: ['done', 'next', 'skip', 'help']
    },
}

const response_format = {
    steps: [
        {
            code_search: {
                file: 'file:src/index.html Hollo World',
            },
        },
        {
            edit_file: {
                file: 'src/index.html',
                regex: 'Hollo World',
                replacement: 'Hello World',
            },
        },
        {
            edit_file: {
                file: 'CHANGELOG.md',
                regex: '## [Unreleased]',
                replacement: '## [Unreleased]\n\n- Fixed typo in homepage title',
            },
        },
        {
            edit_file: {
                file: 'CHANGELOG.md',
                regex: '## Fixed',
                replacement: '## Fixes',
                replaceAll: true,
            },
        },
        {
            run_bash: {
                command: "git add . && git commit -m 'fix: Typo in the homepage title'",
                note: '',
            },
        },
        {
            edit_file: {
                file: 'path/to/file.ts',
                regex: 'function isFile[^{]*{[^}]*}',
                replacement: `function isFile(name: string): string {
    return name.split('/').pop() || name
}`,
            },
        },
        {
            edit_file: {
                file: 'path/to/getFileName.ts',
                regex: 'export function getFileName.*?}',
                replacement: `export function getFileName(filePath: string): string {
    return filePath.split('/').pop() || filePath
}`,
            },
        },
        {
            create_file: {
                file: 'path/to/getFileName.test.ts',
                content: `// TODO: write tests for getFileName
                test('should include file path', () => {
                    expect(getFileName('')).toBe()
                })`,
            },
        },
        {
            edit_file: {
                file: 'path/to/getFileName.test.ts',
                regex: 'expect\\(getFileName(.*.+toBe\\(\\))',
                replacement: `expect(getFileName('path/to/file.ts')).toBe('file.ts')`,
            },
        },
        {
            next_step: {
                step: 'next',
            },
        },
    ],
}

export const ORCHESTRATOR_PROMPT = ps`Your task is to complete the listed step(s) enclosed in <task> using relevant tools. Before calling a tool, do some analysis within \<thinking>\</thinking> tags. First, think about which of the provided tools is the relevant tool to answer the user's request. Second, go through each of the required parameters of the relevant tool and determine if the user has directly provided or given enough information to infer a value. When deciding if the parameter can be inferred, carefully consider all the context to see if it supports a specific value. If all of the required parameters are present or can be reasonably inferred, close the thinking tag and proceed with the tool call. BUT, if one of the values for a required parameter is missing, DO NOT invoke the function (not even with fillers for the missing params) and instead, ask the user to provide the missing parameters. DO NOT ask for more information on optional parameters if it is not provided.

<task>
{{TASK_PLACEHOLDER}}
GUIDELINES: Try to identify the goal of the current step and review all shared context to determine how to complete the current step.
If you can resolve the current step using provided context, proceed to the next step instead. Else, try to gather the required information and resources using provided tools to complete the task. For example, use the edit_file tool to export all the necessary symbols when needed.
</task>

You have access to a set of functions you can use to answer <user_input>. This includes access to a sandboxed computing environment. They give you the ability to inspect files or interact with external resources when invoking the below functions:

<tools>
${PromptString.unsafe_fromUserQuery(JSON.stringify(tools_format, null, 2))}
</tools>

String and scalar parameters should be specified as is, while lists and objects should use JSON format. Note that
spaces for string values are not stripped. The output is not expected to be valid XML and is parsed with regular
expressions.

You can invoke one or more functions by writing a "<function_calls>" block like the following example as part of your response enclosed:
<example_output>
<think>
Explain your understanding of the task and which variations would be valuable. Then confirm if you can complete the task with the information provided. If not, what tools should you use to gather the missing information?
</think>
<function_calls>${PromptString.unsafe_fromUserQuery(JSON.stringify(response_format, null, 2))}</function_calls>
</example_output>

All your communication with a user is done via text message.
Only call tools when you have enough information to accurately call them.`

export const WORKER_PROMPT = ps`Complete the task using the instructions listed inside <task> along with the shared context.

## TASK
<task>
{{TASK_PLACEHOLDER}}
</task>

## OUTPUT FORMAT
<response>
    <think>
    Analyze the task and create a comprehensive plan to address their needs. Before providing your final response, wrap your analysis and thought process in here.
    </think>
Your content here, maintaining the specified style and fully addressing requirements.
</response>`
