import { ps } from '@sourcegraph/cody-shared'
import type { CodyToolConfig } from './CodyTool'

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
    },
    fetch: {
        title: 'Fetch (MCP)',
        tags: {
            tag: ps`TOOLFETCH`,
            subTag: ps`uri`,
        },
        prompt: {
            instruction: ps`To fetch content from a uri`,
            placeholder: ps`HTTP ADDRESS`,
            examples: [
                ps`Content from https://google.com: \`<TOOLFETCH><uri>https://google.com</uri></TOOLFETCH>\``,
            ],
        },
    },
    'server-github': {
        title: 'GitHub (MCP)',
        tags: {
            tag: ps`TOOLGITHUBAPI`,
            subTag: ps`action`,
        },
        prompt: {
            instruction: ps`Access GitHub API, enabling file operations, repository management, search functionality, and more.`,
            placeholder: ps`action`,
            examples: [ps`Create an issue: \`<TOOLGITHUB><action>create_issue</action></TOOLGITHUB>\``],
        },
    },
    'provider-github': {
        title: 'GitHub Issue (OpenCtx)',
        tags: {
            tag: ps`TOOLGITHUBISSUE`,
            subTag: ps`search`,
        },
        prompt: {
            instruction: ps`To retrieve issues in Github for this codebase`,
            placeholder: ps`KEYWORD`,
            examples: [
                ps`Issue about authentication: \`<TOOLGITHUBISSUE><search>authentication</search></TOOLGITHUBISSUE>\``,
            ],
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
    },
}
