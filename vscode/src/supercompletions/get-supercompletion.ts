import { type ChatClient, type Message, getSimplePreamble } from '@sourcegraph/cody-shared'
import levenshtein from 'js-levenshtein'
import parseGitDiff from 'parse-git-diff'
import * as vscode from 'vscode'
import type { RecentEditsRetriever } from './recent-edits/recent-edits-retriever'
export interface SuperCompletionsParams {
    document: vscode.TextDocument
    abortSignal: AbortSignal

    // Context
    recentEditsRetriever: RecentEditsRetriever
    chat: ChatClient
}

interface Supercompletion {
    location: vscode.Location
    content: string
}

const MODEL = 'anthropic/claude-3-opus-20240229'

export async function getSupercompletions({
    document,
    abortSignal,

    recentEditsRetriever,
    chat,
}: SuperCompletionsParams): Promise<Supercompletion[] | null> {
    const diff = recentEditsRetriever.getDiff(document.uri)
    if (diff === null) {
        return null
    }

    const messages = buildInteraction(document, diff)
    const { topic, nextChanges } = await getRawResponse(chat, messages)

    const parsedDiff = parseGitDiff('diff --git a/rename.md b/rename.md' + nextChanges)

    if (!parsedDiff) {
        return null
    }
    if (!parsedDiff.files[0]) {
        return null
    }

    const chunks = parsedDiff.files[0].chunks

    const edits: Supercompletion[] = []
    for (const chunk of chunks) {
        if (chunk.type !== 'Chunk') {
            continue
        }
        const prev = chunk.changes
            .filter(c => c.type !== 'AddedLine')
            .map(c => c.content)
            .join('\n')
        const next = chunk.changes
            .filter(c => c.type === 'DeletedLine')
            .map(c => c.content)
            .join('\n')

        const location = fuzzyFindLocation(document, prev)

        if (!location) {
            continue
        }

        edits.push({
            location,
            content: next,
        })
    }

    return edits
}

async function getRawResponse(
    chat: ChatClient,
    messages: Message[]
): Promise<{ topic: string; nextChanges: string }> {
    return {
        topic: 'Adding support for the UUID data type in the schema.',
        nextChanges: `
--- a/lib/shared/src/schema.ts
+++ b/lib/shared/src/schema.ts
@@ -40,6 +40,9 @@ export function inferType(value: unknown): { type: Type; nullable: boolean } {
   if (typeof value === "string") {
     // String need to be non-nullable so we can use an ngram index
     return { type: "String", nullable: false };
+  }
+  if (typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
+    return { type: "UUID", nullable: true };
   }
   throw new Error(\`Unsupported type $\{typeof value}\`);
 }
@@ -83,6 +86,7 @@ export async function schemaFromDescribeTable(
       case "Float64":
       case "String":
       case "DateTime64":
+      case "UUID":
         schema[name] = {
           type: normalizedType,
           nullable: !!nullable,
@@ -185,6 +189,7 @@ export function defaultIndexType(type: Type): string {
     case "DateTime64":
     case "Float64":
       return "minmax GRANULARITY 4";
+    case "UUID":
     case "String":
       return "ngrambf_v1(3, 256, 3, 0) GRANULARITY 2";
     default:
`,
    }
    // const abortController = new AbortController()
    // const stream = chat.chat(
    //     messages,
    //     { model: MODEL, stopSequences: ['</next-changes>'] },
    //     abortController.signal
    // )

    // let completion = ''
    // for await (const message of stream) {
    //     switch (message.type) {
    //         case 'change': {
    //             completion = message.text
    //             break
    //         }
    //         case 'complete': {
    //             break
    //         }
    //         case 'error': {
    //             if (isAbortError(message.error)) {
    //                 break
    //             }

    //             console.error(`Supercompletion request failed: ${message.error.message}`)
    //             break
    //         }
    //     }
    // }

    // const topic = completion.match(/<topic>(.*)<\/topic>?/)?.[1]
    // const nextChanges = completion.match(/<next-changes>(.*)$/s)?.[1]

    // return { topic: topic ?? '', nextChanges: nextChanges ?? '' }
}

function buildInteraction(document: vscode.TextDocument, diff: string): Message[] {
    const system = `You are an expert at editing code. You will receive a source file inside <source></source> tags and a list of recent changes in git diff format inside <changes></changes> tags.

Your task is to do two things:

1. Infer the action the user is trying to do and summarize it inside <topic></topic> tags.
2. Prepare the next edits for the user as git diffs inside <next-changes></next-changes> tags.

Example question:

<source file="magic.ts">
export function getMagicNumber(): string {
  return "1337";
}
</source>
<changes>
--- a/magic.ts
+++ b/magic.ts
@@ -1,3 +1,3 @@
-export function getMagicNumber(): string {
+export function getMagicNumber(): number {
   return "1337";
 }
</changes>

Example response:

<topic>Changing the return type of the \`getMagicNumber()\` function from \`string\` to \`number\`.</topic>
<next-changes>
--- a/magic.ts
+++ b/magic.ts
@@ -1,3 +1,3 @@
 export function getMagicNumber(): number {
-  return "1337";
+  return 1337;
 }
</next-changes>
`
    const preamble = getSimplePreamble(MODEL, system)

    const source = `<source file="${vscode.workspace.asRelativePath(document.uri.path)}">
${document.getText()}
</source>\n`

    const changes = `<changes>
${diff}
</changes>`

    return [...preamble, { speaker: 'human', text: source + changes }]
}

function fuzzyFindLocation(document: vscode.TextDocument, snippet: string): vscode.Location | null {
    const lines = document.getText().split('\n')
    const snippetLines = snippet.split('\n')

    const candidates: [number, number][] = []
    for (let i = 0; i < lines.length - snippetLines.length; i++) {
        const window = lines.slice(i, i + snippetLines.length).join('\n')
        const distance = levenshtein(window, snippet)
        candidates.push([distance, i])
    }

    const sortedCandidates = candidates.sort((a, b) => a[0] - b[0])
    if (sortedCandidates.length === 0) {
        return null
    }
    const [, index] = sortedCandidates[0]

    const startLine = index
    const endLine = index + snippetLines.length - 1
    const start = new vscode.Position(startLine, 0)
    const end = new vscode.Position(endLine, lines[endLine].length)

    return new vscode.Location(document.uri, new vscode.Range(start, end))
}
