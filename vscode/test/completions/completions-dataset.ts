import dedent from 'dedent'

export const CURSOR = '️🔥'

export interface Sample {
    context: { fileName: string; content: string }[]
    fileName: string
    languageId: string
    content: string
}

export const completionsDataset: Sample[] = [
    {
        context: [],
        fileName: 'logger.ts',
        languageId: 'typescript',
        content: `
            import signale from 'signale'

            function logMessage(message: string) {
                ${CURSOR}
            }`,
    },
    {
        context: [],
        fileName: 'writer.ts',
        languageId: 'typescript',
        content: `
            import path from 'path'

            function writeDateToDisk() {
                ${CURSOR}
            }`,
    },
    {
        context: [],
        fileName: 'text-document.ts',
        languageId: 'typescript',
        content: `
            class TextDocument implements vscode.TextDocument {
                private text: string

                constructor(public uri: vscode.Uri, text: string) {
                    this.text = text.replace(/\r\n/gm, '\n') // normalize end of line
                }

                private get lines(): string[] {
                    return this.text.split('\n')
                }

                lineAt(position: number | vscode.Position): vscode.TextLine {
                    ${CURSOR}
                }
            }`,
    },
    {
        context: [],
        fileName: 'getOs.ts',
        languageId: 'typescript',
        content: `
            import { execFileSync } from 'child_process'

            function getOSName(): string | null {
                if (typeof window === 'undefined') {
                ${CURSOR}
            }`,
    },
    {
        context: [],
        fileName: 'isDarkColorScheme.ts',
        languageId: 'typescript',
        content: `
            function isDarkColorScheme(): boolean {
                return window.match${CURSOR}
            }`,
    },
    {
        context: [],
        fileName: 'isLocalhost.ts',
        languageId: 'typescript',
        content: `
            function isLocalhost(): boolean {
                return window.location.host${CURSOR}
            }`,
    },
    {
        // prettier-ignore
        context: [
            {'fileName':'lib/parser/excerpt.ts','content':'export function excerpt(text: string, limit: number = 144) {\n  let result = "";\n\n  for (const word of text.split(" ")) {\n    if (result.length + word.length + 1 <= limit) {\n      result += " " + word;\n    } else {\n      // Fix trailing comma. Might need a more generic solution at some point :D\n      if (result.endsWith(",")) {\n        result = result.slice(0, -1);\n      }\n      result += "…";\n      break;\n    }\n  }\n\n  return result;\n}\n'},
            {'fileName':'lib/parser/post.ts','content':'\nimport format from "date-fns/format";\nimport fs from "fs/promises";\nimport path from "path";\nimport { parseMarkdown } from "./markdown";\n\ninterface ExternalPost {\n  type: "external";\n  id: string;\n  title: string;\n  excerpt: string;\n  formattedDate: string;\n  readingTime: string;\n  contentHtml: string;\n  external: string;\n  date: string;\n}\nexport interface BlogPost {\n  type: "blog";\n  id: string;\n  title: string;\n  excerpt: string;\n  formattedDate: string;\n  readingTime: string;\n  contentHtml: string;\n  date: string;\n}\n\nexport type Post = ExternalPost | BlogPost;\n\nexport async function getPost(id: string): Promise<Post> {\n  // Read markdown file as string\n  const fullPath = path.join(postsDirectory, id + ".md");\n  const fileContents = await fs.readFile(fullPath, "utf8");\n\n  const { data, readingTime, contentHtml, excerpt } = await parseMarkdown(\n    fileContents\n  );\n\n  return {\n    id,\n    ...data,\n    type: data.external ? "external" : "blog",\n    excerpt,\n    formattedDate: format(new Date(data.date), "LLLL d, Y"),\n    readingTime,\n    contentHtml,\n  } as Post;\n}\n'},
            {'fileName':'lib/parser/posts.ts','content':'import fs from "fs/promises";\nimport path from "path";\nimport { getPost, Post } from "./post";\n\nexport const postsDirectory = path.join(process.cwd(), "posts");\n\nexport async function getPosts(): Promise<Post[]> {\n  // Get file names under /posts\n  const dirs = await fs.readdir(postsDirectory);\n\n  let allPostsData: Post[] = [];\n  for (const fileName of dirs) {\n    if (fileName.indexOf(".md") === -1) {\n      continue;\n    }\n    const stat = await fs.stat(path.join(postsDirectory, fileName));\n    if (stat.isDirectory()) {\n      continue;\n    }\n\n    // Remove ".md" from file name to get the page slug\n    const id = fileName.replace(/\\.md$/, "");\n\n    allPostsData.push(await getPost(id));\n  }\n\n  // Sort posts by date\n  return allPostsData.sort(({ date: a }, { date: b }) => {\n    if (a < b) {\n      return 1;\n    } else if (a > b) {\n      return -1;\n    } else {\n      return 0;\n    }\n  });\n}\n'},
            {'fileName':'lib/parser/markdown.ts','content':"import { remark } from \"remark\";\n\nimport html from \"remark-html\";\nimport prism from \"remark-prism\";\nimport matter from \"gray-matter\";\nimport remarkFootnotes from \"remark-footnotes\";\nimport { excerpt } from \"./excerpt\";\nimport readingTime from \"reading-time\";\n\nexport async function parseMarkdown(markdown: string): Promise<{\n  data: any;\n  excerpt: string;\n  contentHtml: string;\n  readingTime: string;\n}> {\n  // Use gray-matter to parse the post metadata section\n  const matterResult = matter(markdown);\n  let { content, data } = matterResult;\n\n  content = content\n    .replaceAll(/\\[x\\]/g, \"<input type='checkbox' checked disabled />\")\n    .replaceAll(/\\[.?\\]/g, \"<input type='checkbox' disabled />\");\n\n  const processedContent = await remark()\n    .use(html, { sanitize: false })\n    .use(prism)\n    .use(remarkFootnotes)\n    .process(content);\n  const contentHtml = processedContent.toString();\n\n  return {\n    data,\n    contentHtml,\n    excerpt: excerpt(content),\n    readingTime: readingTime(content).text,\n  };\n}\n"},
        ],
        fileName: 'lib/parser/notes.ts',
        languageId: 'typescript',
        content: `
            import format from "date-fns/format";
            import { parseMarkdown } from "./markdown";

            export interface Note {
                title: string;
                id: string;
                formattedDate: string;
                date: string;
                category: string[];
                contentHtml: string;
            }

            const TOKEN = process.env.GITHUB_TOKEN;
            const GRAPHQL_URL = "https://api.github.com/graphql";
            const HIDDEN_FILES = new Set(["README.md"]);
            const HIDDEN_DIRS = new Set(["Unlisted"]);

            // No-op, used only for syntax highlighting in the IDE
            function gql(strings: TemplateStringsArray) {
                return strings.raw.join("");
            }

            const headers = {
                Authorization: \`Bearer $\{TOKEN}\`,
            };

            const CONTENTS_QUERY = gql\`
            {
                repository(name: "philipp-spiess", owner: "philipp-spiess") {
                    ref(qualifiedName: "main") {
                        target {
                            ... on Commit {
                                tree {
                                    entries {
                                        ...MyTreeEntry
                                        object {
                                            ... on Tree {
                                                entries {
                                                ...MyTreeEntry
                                                    object {
                                                        ... on Tree {
                                                            entries {
                                                                ...MyTreeEntry
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            fragment MyTreeEntry on TreeEntry {
                    path
                    type
                    blob: object {
                    ... on Blob {
                        text
                    }
                }
            }
            \`;

            export async function getNotes(): Promise<Note[]> {
                let notes: Note[] = [];
                const rawNotes = (await fetchNotes()) as any;

                for (const rawNote of rawNotes) {
                    const { data, contentHtml } = await parseMarkdown(rawNote.content);

                    const date = data.date instanceof Date ? data.date.toISOString() : null;

                    notes.push({
                        title: rawNote.path.split("/").pop().replace(".md", ""),
                        id: getId(rawNote.path),
                        date,
                        formattedDate: format(new Date(date), "LLLL d, Y"),
                        category: rawNote.path.split("/").slice(0, -1),
                        contentHtml,
                    });
                }

                // Sort posts by date
                return notes.sort(({ date: a }, { date: b }) => {
                    if (a < b) {
                        return 1;
                    } else if (a > b) {
                        return -1;
                    } else {
                        return 0;
                    }
                });
            }

            interface RawNote {
                path: string;
                content: string;
            }
            async function fetchNotes(dir: string = ""): Promise<RawNote[]> {
                const res = await fetch(GRAPHQL_URL, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ query: CONTENTS_QUERY }),
                }).then((r) => r.json());

                return recursivelyResolveEntries(res.data.repository.ref.target.tree);
            }

            interface GitHubTree {
                entries: Array<
                    | {
                        path: string;
                        type: "blob";
                        blob: {
                        text: string;
                        };
                    }
                    | {
                        path: string;
                        type: "tree";
                        object: GitHubTree;
                    }
                >;
            }
            function recursivelyResolveEntries(tree: GitHubTree): RawNote[] {
                let result: RawNote[] = [];
                for (let entry of tree.entries) {
                    if (entry.type == "blob") {
                        if (!entry.path.endsWith(".md") || HIDDEN_FILES.has(entry.path)) {
                            continue;
                        }

                        result.push({
                            path: entry.path,
                            content: entry.blob.text,
                        });
                    } else {
                        if (HIDDEN_DIRS.has(entry.path)) {
                            continue;
                        }

                        result = result.concat(recursivelyResolveEntries(entry.object));
                    }
                }
                return result;
            }

            function getId(text: string): string {
                return text.replace(".md", "").split("/").map(getSlug).join("/");
            }

            function getSlug(text: string): string {
                ${CURSOR}
            }`,
    },
].map(sample => ({ ...sample, content: dedent(sample.content) }))
