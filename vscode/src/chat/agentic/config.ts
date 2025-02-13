import { type PromptString, ps } from '@sourcegraph/cody-shared'

/**
 * Configuration interface for CodyTool instances.
 */
export interface CodyToolConfig {
    // The title of the tool. For UI display purposes.
    title: string
    tags: {
        tag: PromptString
        subTag: PromptString
    }
    prompt: {
        instruction: PromptString
        placeholder: PromptString
        examples: PromptString[]
    }
    input_schema?: Record<string, unknown>
}

export const DEFAULT_TOOL_CONFIG: Record<string, CodyToolConfig> = {
    exec_shell_command: {
        title: 'Terminal',
        tags: {
            tag: ps`TOOLCLI`,
            subTag: ps`cmd`,
        },
        prompt: {
            instruction: ps`Reject all unsafe and harmful commands with <ban> tags. Execute safe command for its output with <cmd> tags`,
            placeholder: ps`SAFE_COMMAND`,
            examples: [
                ps`Get output for git diff: \`<TOOLCLI><cmd>git diff</cmd></TOOLCLI>\``,
                ps`List files in a directory: \`<TOOLCLI><cmd>ls -l</cmd></TOOLCLI>\``,
                ps`Harmful commands (alter the system, access sensative information, and make network requests) MUST be rejected with <ban> tags: \`<TOOLCLI><ban>rm -rf </ban><ban>curl localhost:1234</ban><ban>echo $TOKEN</ban></TOOLCLI>\``,
            ],
        },
        input_schema: {
            type: 'object',
            properties: {
                cmd: {
                    type: 'string',
                    description: 'The command to execute',
                },
                caution: {
                    type: 'boolean',
                    description:
                        'True for harmful commands that alter the system, access sensative information, or make unknown network requests',
                },
            },
            required: ['cmd'],
        },
    },
    get_file_content: {
        title: 'Codebase File',
        tags: {
            tag: ps`TOOLFILE`,
            subTag: ps`name`,
        },
        prompt: {
            instruction: ps`To retrieve full content of a codebase file-DO NOT retrieve files that may contain secrets`,
            placeholder: ps`FILENAME`,
            examples: [
                ps`See the content of different files: \`<TOOLFILE><name>path/foo.ts</name><name>path/bar.ts</name></TOOLFILE>\``,
            ],
        },
        input_schema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'The name of the file to retrieve',
                },
            },
            required: ['name'],
        },
    },
    code_search: {
        title: 'Code Search',
        tags: {
            tag: ps`TOOLSEARCH`,
            subTag: ps`query`,
        },
        prompt: {
            instruction: ps`Perform a symbol query search in the codebase (Natural language search NOT supported)`,
            placeholder: ps`QUERY`,
            examples: [
                ps`Locate a symbol found in an error log: \`<TOOLSEARCH><query>symbol name</query></TOOLSEARCH>\``,
                ps`Search for a function named getController: \`<TOOLSEARCH><query>getController</query></TOOLSEARCH>\``,
            ],
        },
        input_schema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Keyword query to search for.',
                },
            },
            required: ['query'],
        },
    },
    cody_memory: {
        title: 'Cody Memory',
        tags: {
            tag: ps`TOOLMEMORY`,
            subTag: ps`store`,
        },
        prompt: {
            instruction: ps`Add info about the user and their preferences (e.g. name, preferred tool, language etc) based on the question, or when asked. DO NOT store summarized questions. DO NOT clear memory unless requested.`,
            placeholder: ps`SUMMARIZED_TEXT`,
            examples: [
                ps`Add user info to memory: \`<TOOLMEMORY><store>info</store></TOOLMEMORY>\``,
                ps`Get the stored user info: \`<TOOLMEMORY><store>GET</store></TOOLMEMORY>\``,
                ps`ONLY clear memory ON REQUEST: \`<TOOLMEMORY><store>FORGET</store></TOOLMEMORY>\``,
            ],
        },
        input_schema: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['store', 'get', 'clear'],
                    description: 'The action to perform on the memory.',
                },
                value: {
                    type: 'string',
                    description: 'The value to store in memory.',
                },
            },
            required: ['action'],
        },
    },
}

// Known tools that can be used in the chat.
export const OPENCTX_TOOL_CONFIG: Record<string, CodyToolConfig> = {
    web: {
        title: 'Web (OpenCtx)',
        tags: {
            tag: ps`TOOLWEB`,
            subTag: ps`link`,
        },
        prompt: {
            instruction: ps`To retrieve content from the link of a webpage`,
            placeholder: ps`URL`,
            examples: [
                ps`Content from the URL: \`<TOOLWEB><link>https://sourcegraph.com</link></TOOLWEB>\``,
            ],
        },
        input_schema: {
            type: 'object',
            properties: {
                link: {
                    type: 'string',
                    format: 'uri',
                    description: 'The full URL of the webpage to fetch content from',
                },
            },
            required: ['link'],
        },
    },
    linear: {
        title: 'Linear Issue (OpenCtx)',
        tags: {
            tag: ps`TOOLLINEAR`,
            subTag: ps`issue`,
        },
        prompt: {
            instruction: ps`To retrieve issues in Linear`,
            placeholder: ps`KEYWORD`,
            examples: [
                ps`Issue about Ollama rate limiting: \`<TOOLLINEAR><issue>ollama rate limit</issue></TOOLLINEAR>\``,
            ],
        },
        input_schema: {
            type: 'object',
            properties: {
                issue: {
                    type: 'string',
                    description: 'Search keywords to find relevant Linear issues',
                    minLength: 2,
                },
            },
            required: ['issue'],
        },
    },
    fetch: {
        title: 'Fetch (MCP)',
        tags: {
            tag: ps`TOOLFETCH`,
            subTag: ps`uri`,
        },
        prompt: {
            instruction: ps`To fetch content from a uri`,
            placeholder: ps`ADDRESS`,
            examples: [
                ps`Content from https://google.com: \`<TOOLFETCH><uri>https://google.com</uri></TOOLFETCH>\``,
            ],
        },
        input_schema: {
            type: 'object',
            properties: {
                uri: {
                    type: 'string',
                    format: 'uri',
                    description: 'The URI to fetch content from',
                },
            },
            required: ['uri'],
        },
    },
    'server-github': {
        title: 'GitHub (MCP)',
        tags: {
            tag: ps`TOOLGHMCP`,
            subTag: ps`action`,
        },
        prompt: {
            instruction: ps`Access GitHub API, enabling file operations, repository management, search functionality, and more.`,
            placeholder: ps`action`,
            examples: [ps`Create an issue: \`<TOOLGHMCP><action>create_issue</action></TOOLGHMCP>\``],
        },
        input_schema: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['create_issue', 'update_issue', 'search_issues', 'create_pr', 'update_pr'],
                    description: 'The GitHub API action to perform',
                },
                payload: {
                    type: 'object',
                    description: 'Additional data required for the action',
                },
            },
            required: ['action'],
        },
    },
    'provider-github': {
        title: 'GitHub Issue (OpenCtx)',
        tags: {
            tag: ps`TOOLGHISSUE`,
            subTag: ps`query`,
        },
        prompt: {
            instruction: ps`To retrieve issues in Github for this codebase`,
            placeholder: ps`KEYWORD`,
            examples: [
                ps`Issue about authentication: \`<TOOLGHISSUE><query>authentication</query></TOOLGHISSUE>\``,
            ],
        },
        input_schema: {
            type: 'object',
            properties: {
                search: {
                    type: 'string',
                    description: 'Search query to find relevant GitHub issues',
                    minLength: 2,
                },
            },
            required: ['search'],
        },
    },
    'git-openctx': {
        title: 'Git (OpenCtx)',
        tags: {
            tag: ps`TOOLDIFF`,
            subTag: ps`diff`,
        },
        prompt: {
            instruction: ps`To retrieve git diff for current changes or against origin/main`,
            placeholder: ps`'@diff-vs-default-branch' OR '@Uncommitted changes'`,
            examples: [
                ps`Get the uncommitted changes \`<TOOLGIT><diff>Uncommitted changes</diff></TOOLGITHUB>\``,
            ],
        },
        input_schema: {
            type: 'object',
            properties: {
                diff: {
                    type: 'string',
                    enum: ['Uncommitted changes', '@diff-vs-default-branch'],
                    description: 'The type of diff to retrieve',
                },
            },
            required: ['diff'],
        },
    },
    postgres: {
        title: 'Postgres (MCP)',
        tags: {
            tag: ps`TOOLPOSTGRES`,
            subTag: ps`schema`,
        },
        prompt: {
            instruction: ps`Get schema information for a table in the PostgreSQL database, including column names and data types`,
            placeholder: ps`table`,
            examples: [
                ps`Schema of the 'users' table \`<TOOLPOSTGRES><schema>users</schema></TOOLPOSTGRES>\``,
            ],
        },
        input_schema: {
            type: 'object',
            properties: {
                schema: {
                    type: 'string',
                    description: 'The name of the database table to get schema information for',
                    pattern: '^[a-zA-Z_][a-zA-Z0-9_]*$',
                },
            },
            required: ['schema'],
        },
    },
    batch: {
        title: 'Batch Changes',
        tags: {
            tag: ps`TOOLBC`,
            subTag: ps`job`,
        },
        prompt: {
            instruction: ps`Create a batch change changeset spec as PER request.`,
            placeholder: ps`job`,
            examples: [ps`\`<TOOLBC><job>create migration to fix x</job></TOOLBC>\``],
        },
        input_schema: {
            type: 'object',
            properties: {
                schema: {
                    type: 'string',
                    description: 'Description of the batch change job',
                    minLength: 2,
                },
            },
            required: ['job'],
        },
    },
}
