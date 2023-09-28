/* eslint-disable no-template-curly-in-string */
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
        fileName: 'twoNums.ts',
        languageId: 'typescript',
        content: `
            function twoSum(a: number, b: number): number {
                const sum = a + b
                console.log(sum)
                return sum
            }

            function minNum(a: number, b: number): number {
                ${CURSOR}
                console.log(min)
                return min
            }

            function maxNum(a: number, b: number): number {
                const max = Math.max(a, b)
                console.log(max)
                return max
            }`,
    },
    {
        context: [],
        fileName: 'comment.ts',
        languageId: 'typescript',
        content: `
            // A function returns${CURSOR}
            function twoSum(a: number, b: number): number {
                return a + b
            }`,
    },
    {
        context: [],
        fileName: 'LineAfterCompletedComment.ts',
        languageId: 'typescript',
        content: `
            // Sort an array using bubble sort
            ${CURSOR}`,
    },
    {
        context: [],
        fileName: 'LineAfterIncompleteComment.ts',
        languageId: 'typescript',
        content: `
        // A function to calculate the sum of two numbers
        function twoSum(a: number, b: number): number {
            const sum = a + b
            return sum
        }

        // A function to
        ${CURSOR}

        // A function to get the min of two numbers
        function minNum(a: number, b: number): number {
            const min = Math.min(a, b)
            return min
        }`,
    },
    {
        context: [],
        fileName: 'LineAfterIncompleteCommentInEmptyDocs.ts',
        languageId: 'typescript',
        content: `
        // A function
        ${CURSOR}`,
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
        context: [],
        fileName: 'interface.ts',
        languageId: 'typescript',
        content: `
            interface CacheRequest {
                /**
                 * The prefix (up to the cursor) of the source file where the completion was requested
                 */
                prefix: string
                /**
                 * Wether to ${CURSOR}
                 */
                trim: boolean
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
    {
        // prettier-ignore
        context: [
            {'fileName':'internal/completions/httpapi/handler.go','content':'package httpapi\n\nimport (\n\t"context"\n\t"encoding/json"\n\t"fmt"\n\t"net/http"\n\t"strconv"\n\t"time"\n\n\t"github.com/sourcegraph/sourcegraph/internal/cody"\n\t"github.com/sourcegraph/sourcegraph/internal/completions/client"\n\t"github.com/sourcegraph/sourcegraph/internal/completions/types"\n\t"github.com/sourcegraph/sourcegraph/internal/conf"\n\t"github.com/sourcegraph/sourcegraph/internal/conf/conftypes"\n)\n\n// maxRequestDuration is the maximum amount of time a request can take before\n// being cancelled.\nconst maxRequestDuration = time.Minute\n\nfunc newCompletionsHandler(\n\trl RateLimiter,\n\ttraceFamily string,\n\tgetModel func(types.CodyCompletionRequestParameters, *conftypes.CompletionsConfig) string,\n\thandle func(context.Context, types.CompletionRequestParameters, types.CompletionsClient, http.ResponseWriter),\n) http.Handler {\n\treturn http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {\n\t\tif r.Method != "POST" {\n\t\t\thttp.Error(w, fmt.Sprintf("unsupported method %s", r.Method), http.StatusMethodNotAllowed)\n\t\t\treturn\n\t\t}\n\n\t\tctx, cancel := context.WithTimeout(r.Context(), maxRequestDuration)\n\t\tdefer cancel()\n\n\t\tif isEnabled := cody.IsCodyEnabled(ctx); !isEnabled {\n\t\t\thttp.Error(w, "cody experimental feature flag is not enabled for current user", http.StatusUnauthorized)\n\t\t\treturn\n\t\t}\n\n\t\tcompletionsConfig := conf.GetCompletionsConfig(conf.Get().SiteConfig())\n\t\tif completionsConfig == nil {\n\t\t\thttp.Error(w, "completions are not configured or disabled", http.StatusInternalServerError)\n\t\t}\n\n\t\tvar requestParams types.CodyCompletionRequestParameters\n\t\tif err := json.NewDecoder(r.Body).Decode(&requestParams); err != nil {\n\t\t\thttp.Error(w, "could not decode request body", http.StatusBadRequest)\n\t\t\treturn'},
            {'fileName':'internal/completions/client/anthropic/anthropic.go','content':'package anthropic\n\nimport (\n\t"bytes"\n\t"context"\n\t"encoding/json"\n\t"net/http"\n\n\t"github.com/sourcegraph/sourcegraph/internal/completions/types"\n\t"github.com/sourcegraph/sourcegraph/internal/httpcli"\n\t"github.com/sourcegraph/sourcegraph/lib/errors"\n)\n\nfunc NewClient(cli httpcli.Doer, apiURL, accessToken string) types.CompletionsClient {\n\treturn &anthropicClient{\n\t\tcli:         cli,\n\t\taccessToken: accessToken,\n\t\tapiURL:      apiURL,\n\t}\n}\n\nconst (\n\tclientID = "sourcegraph/1.0"\n)\n\ntype anthropicClient struct {\n\tcli         httpcli.Doer\n\taccessToken string\n\tapiURL      string\n}\n\nfunc (a *anthropicClient) Complete(\n\tctx context.Context,\n\tfeature types.CompletionsFeature,\n\trequestParams types.CompletionRequestParameters,\n) (*types.CompletionResponse, error) {\n\tresp, err := a.makeRequest(ctx, requestParams, false)\n\tif err != nil {\n\t\treturn nil, err\n\t}\n\tdefer resp.Body.Close()\n\n\tvar response anthropicCompletionResponse\n\tif err := json.NewDecoder(resp.Body).Decode(&response); err != nil {\n\t\treturn nil, err\n\t}\n\treturn &types.CompletionResponse{\n\t\tCompletion: response.Completion,\n\t\tStopReason: response.StopReason,\n\t}, nil'},
            {'fileName':'internal/completions/client/codygateway/codygateway.go','content':"package codygateway\n\nimport (\n\t\"context\"\n\t\"fmt\"\n\t\"net/http\"\n\t\"net/url\"\n\t\"strings\"\n\n\t\"go.opentelemetry.io/otel/attribute\"\n\t\"go.opentelemetry.io/otel/trace\"\n\n\t\"github.com/sourcegraph/sourcegraph/internal/codygateway\"\n\t\"github.com/sourcegraph/sourcegraph/internal/completions/client/anthropic\"\n\t\"github.com/sourcegraph/sourcegraph/internal/completions/client/openai\"\n\t\"github.com/sourcegraph/sourcegraph/internal/completions/types\"\n\t\"github.com/sourcegraph/sourcegraph/internal/conf/conftypes\"\n\t\"github.com/sourcegraph/sourcegraph/internal/httpcli\"\n\t\"github.com/sourcegraph/sourcegraph/lib/errors\"\n)\n\n// NewClient instantiates a completions provider backed by Sourcegraph's managed\n// Cody Gateway service.\nfunc NewClient(cli httpcli.Doer, endpoint, accessToken string) (types.CompletionsClient, error) {\n\tgatewayURL, err := url.Parse(endpoint)\n\tif err != nil {\n\t\treturn nil, err\n\t}\n\treturn &codyGatewayClient{\n\t\tupstream:    cli,\n\t\tgatewayURL:  gatewayURL,\n\t\taccessToken: accessToken,\n\t}, nil\n}\n\ntype codyGatewayClient struct {\n\tupstream    httpcli.Doer\n\tgatewayURL  *url.URL\n\taccessToken string\n}\n\nfunc (c *codyGatewayClient) Stream(ctx context.Context, feature types.CompletionsFeature, requestParams types.CompletionRequestParameters, sendEvent types.SendCompletionEvent) error {\n\tcc, err := c.clientForParams(feature, &requestParams)\n\tif err != nil {\n\t\treturn err\n\t}\n\treturn overwriteErrSource(cc.Stream(ctx, feature, requestParams, sendEvent))\n}\n\nfunc (c *codyGatewayClient) Complete(ctx context.Context, feature types.CompletionsFeature, requestParams types.CompletionRequestParameters) (*types.CompletionResponse, error) {"},
            {'fileName':'internal/completions/httpapi/codecompletion.go','content':'\nimport (\n\t"context"\n\t"encoding/json"\n\t"net/http"\n\n\t"github.com/sourcegraph/log"\n\n\t"github.com/sourcegraph/sourcegraph/internal/completions/types"\n\t"github.com/sourcegraph/sourcegraph/internal/conf/conftypes"\n\t"github.com/sourcegraph/sourcegraph/internal/database"\n\t"github.com/sourcegraph/sourcegraph/internal/redispool"\n\t"github.com/sourcegraph/sourcegraph/internal/trace"\n)\n\n// NewCodeCompletionsHandler is an http handler which sends back code completion results\nfunc NewCodeCompletionsHandler(logger log.Logger, db database.DB) http.Handler {\n\tlogger = logger.Scoped("code", "code completions handler")\n\n\trl := NewRateLimiter(db, redispool.Store, types.CompletionsFeatureCode)\n\treturn newCompletionsHandler(rl, "code", func(requestParams types.CodyCompletionRequestParameters, c *conftypes.CompletionsConfig) string {\n\t\t// No user defined models for now.\n\t\t// TODO(eseliger): Look into reviving this, but it was unused so far.\n\t\treturn c.CompletionModel\n\t}, func(ctx context.Context, requestParams types.CompletionRequestParameters, cc types.CompletionsClient, w http.ResponseWriter) {\n\t\tcompletion, err := cc.Complete(ctx, types.CompletionsFeatureCode, requestParams)\n\t\tif err != nil {\n\t\t\tlogFields := []log.Field{log.Error(err)}\n\n\t\t\t// Propagate the upstream headers to the client if available.\n\t\t\tif errNotOK, ok := types.IsErrStatusNotOK(err); ok {\n\t\t\t\terrNotOK.WriteHeader(w)\n\t\t\t\tif tc := errNotOK.SourceTraceContext; tc != nil {\n\t\t\t\t\tlogFields = append(logFields,\n\t\t\t\t\t\tlog.String("sourceTraceContext.traceID", tc.TraceID),\n\t\t\t\t\t\tlog.String("sourceTraceContext.spanID", tc.SpanID))\n\t\t\t\t}\n\t\t\t} else {\n\t\t\t\tw.WriteHeader(http.StatusInternalServerError)\n\t\t\t}\n\t\t\t_, _ = w.Write([]byte(err.Error()))\n\n\t\t\ttrace.Logger(ctx, logger).Error("error on completion", logFields...)\n\t\t\treturn\n\t\t}\n\n\t\tcompletionBytes, err := json.Marshal(completion)\n\t\tif err != nil {\n\t\t\thttp.Error(w, err.Error(), http.StatusInternalServerError)\n\t\t\treturn'},
        ],
        fileName: 'internal/completions/client/anthropic/anthropic_test.go',
        languageId: 'go',
        content: `
            package anthropic

            import (
                "bytes"
                "context"
                "fmt"
                "io"
                "net/http"
                "testing"

                "github.com/hexops/autogold/v2"
                "github.com/stretchr/testify/assert"
                "github.com/stretchr/testify/require"

                "github.com/sourcegraph/sourcegraph/internal/completions/types"
            )

            type mockDoer struct {
                do func(*http.Request) (*http.Response, error)
            }

            func (c *mockDoer) Do(r *http.Request) (*http.Response, error) {
                return c.do(r)
            }

            func linesToResponse(lines []string) []byte {
                responseBytes := []byte{}
                for _, line := range lines {
                    responseBytes = append(responseBytes, []byte(fmt.Sprintf("data: %s", line))...)
                    responseBytes = append(responseBytes, []byte("\\r\\n\\r\\n")...)
                }
                return responseBytes
            }

            func getMockClient(responseBody []byte) types.CompletionsClient {
                return NewClient(&mockDoer{
                    func(r *http.Request) (*http.Response, error) {
                        return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader(responseBody))}, nil
                    },
                }, "", "")
            }

            func TestValidAnthropicStream(t *testing.T) {
                ${CURSOR}
            func TestInvalidAnthropicStream(t *testing.T) {
                var mockAnthropicInvalidResponseLines = []string{\`{]\`}

                mockClient := getMockClient(linesToResponse(mockAnthropicInvalidResponseLines))
                err := mockClient.Stream(context.Background(), types.CompletionsFeatureChat, types.CompletionRequestParameters{}, func(event types.CompletionResponse) error { return nil })
                if err == nil {
                    t.Fatal("expected error, got nil")
                }
                assert.Contains(t, err.Error(), "failed to decode event payload")
            }

            func TestErrStatusNotOK(t *testing.T) {
                mockClient := NewClient(&mockDoer{
                    func(r *http.Request) (*http.Response, error) {
                        return &http.Response{
                            StatusCode: http.StatusTooManyRequests,`,
    },
    {
        // prettier-ignore
        context: [
            {'fileName':'libs/langchain/langchain/utilities/github.py','content':'"""Util that calls GitHub."""\nimport json\nfrom typing import Any, Dict, List, Optional\n\nfrom github.Issue import Issue\nfrom pydantic import BaseModel, Extra, root_validator\n\nfrom langchain.utils import get_from_dict_or_env\n\n\nclass GitHubAPIWrapper(BaseModel):\n    """Wrapper for GitHub API."""\n\n    github: Any  #: :meta private:\n    github_repo_instance: Any  #: :meta private:\n    github_repository: Optional[str] = None\n    github_app_id: Optional[str] = None\n    github_app_private_key: Optional[str] = None\n    github_branch: Optional[str] = None\n\n    class Config:\n        """Configuration for this pydantic object."""\n\n        extra = Extra.forbid\n\n    @root_validator()\n    def validate_environment(cls, values: Dict) -> Dict:\n        """Validate that api key and python package exists in environment."""\n        github_repository = get_from_dict_or_env(\n            values, "github_repository", "GITHUB_REPOSITORY"\n        )\n\n        github_app_id = get_from_dict_or_env(values, "github_app_id", "GITHUB_APP_ID")\n\n        github_app_private_key = get_from_dict_or_env(\n            values, "github_app_private_key", "GITHUB_APP_PRIVATE_KEY"\n        )\n\n        github_branch = get_from_dict_or_env(\n            values, "github_branch", "GITHUB_BRANCH", default="master"\n        )\n\n        try:\n            from github import Auth, GithubIntegration\n\n        except ImportError:\n            raise ImportError(\n                "PyGithub is not installed. "\n                "Please install it with `pip install PyGithub`"\n            )'},
            {'fileName':'libs/langchain/langchain/agents/agent_toolkits/github/toolkit.py','content':'"""GitHub Toolkit."""\nfrom typing import Dict, List\n\nfrom langchain.agents.agent_toolkits.base import BaseToolkit\nfrom langchain.tools import BaseTool\nfrom langchain.tools.github.prompt import (\n    COMMENT_ON_ISSUE_PROMPT,\n    CREATE_FILE_PROMPT,\n    DELETE_FILE_PROMPT,\n    GET_ISSUE_PROMPT,\n    GET_ISSUES_PROMPT,\n    READ_FILE_PROMPT,\n    UPDATE_FILE_PROMPT,\n)\nfrom langchain.tools.github.tool import GitHubAction\nfrom langchain.utilities.github import GitHubAPIWrapper\n\n\nclass GitHubToolkit(BaseToolkit):\n    """GitHub Toolkit."""\n\n    tools: List[BaseTool] = []\n\n    @classmethod\n    def from_github_api_wrapper(\n        cls, github_api_wrapper: GitHubAPIWrapper\n    ) -> "GitHubToolkit":\n        operations: List[Dict] = [\n            {\n                "mode": "get_issues",\n                "name": "Get Issues",\n                "description": GET_ISSUES_PROMPT,\n            },\n            {\n                "mode": "get_issue",\n                "name": "Get Issue",\n                "description": GET_ISSUE_PROMPT,\n            },\n            {\n                "mode": "comment_on_issue",\n                "name": "Comment on Issue",\n                "description": COMMENT_ON_ISSUE_PROMPT,\n            },\n            {\n                "mode": "create_file",\n                "name": "Create File",\n                "description": CREATE_FILE_PROMPT,\n            },\n            {\n                "mode": "read_file",'},
            {'fileName':'libs/langchain/langchain/agents/chat/base.py','content':'from typing import Any, List, Optional, Sequence, Tuple\n\nfrom pydantic import Field\n\nfrom langchain.agents.agent import Agent, AgentOutputParser\nfrom langchain.agents.chat.output_parser import ChatOutputParser\nfrom langchain.agents.chat.prompt import (\n    FORMAT_INSTRUCTIONS,\n    HUMAN_MESSAGE,\n    SYSTEM_MESSAGE_PREFIX,\n    SYSTEM_MESSAGE_SUFFIX,\n)\nfrom langchain.agents.utils import validate_tools_single_input\nfrom langchain.callbacks.base import BaseCallbackManager\nfrom langchain.chains.llm import LLMChain\nfrom langchain.prompts.chat import (\n    ChatPromptTemplate,\n    HumanMessagePromptTemplate,\n    SystemMessagePromptTemplate,\n)\nfrom langchain.schema import AgentAction, BasePromptTemplate\nfrom langchain.schema.language_model import BaseLanguageModel\nfrom langchain.tools.base import BaseTool\n\n\nclass ChatAgent(Agent):\n    """Chat Agent."""\n\n    output_parser: AgentOutputParser = Field(default_factory=ChatOutputParser)\n    """Output parser for the agent."""\n\n    @property\n    def observation_prefix(self) -> str:\n        """Prefix to append the observation with."""\n        return "Observation: "\n\n    @property\n    def llm_prefix(self) -> str:\n        """Prefix to append the llm call with."""\n        return "Thought:"\n\n    def _construct_scratchpad(\n        self, intermediate_steps: List[Tuple[AgentAction, str]]\n    ) -> str:\n        agent_scratchpad = super()._construct_scratchpad(intermediate_steps)\n        if not isinstance(agent_scratchpad, str):\n            raise ValueError("agent_scratchpad should be of type string.")\n        if agent_scratchpad:\n            return (\n                f"This was your previous work "'},
            {'fileName':'libs/langchain/langchain/agents/conversational/base.py','content':'from __future__ import annotations\n\nfrom typing import Any, List, Optional, Sequence\n\nfrom pydantic import Field\n\nfrom langchain.agents.agent import Agent, AgentOutputParser\nfrom langchain.agents.agent_types import AgentType\nfrom langchain.agents.conversational.output_parser import ConvoOutputParser\nfrom langchain.agents.conversational.prompt import FORMAT_INSTRUCTIONS, PREFIX, SUFFIX\nfrom langchain.agents.utils import validate_tools_single_input\nfrom langchain.callbacks.base import BaseCallbackManager\nfrom langchain.chains import LLMChain\nfrom langchain.prompts import PromptTemplate\nfrom langchain.schema.language_model import BaseLanguageModel\nfrom langchain.tools.base import BaseTool\n\n\nclass ConversationalAgent(Agent):\n    """An agent that holds a conversation in addition to using tools."""\n\n    ai_prefix: str = "AI"\n    """Prefix to use before AI output."""\n    output_parser: AgentOutputParser = Field(default_factory=ConvoOutputParser)\n    """Output parser for the agent."""\n\n    @classmethod\n    def _get_default_output_parser(\n        cls, ai_prefix: str = "AI", **kwargs: Any\n    ) -> AgentOutputParser:\n        return ConvoOutputParser(ai_prefix=ai_prefix)\n\n    @property\n    def _agent_type(self) -> str:\n        """Return Identifier of agent type."""\n        return AgentType.CONVERSATIONAL_REACT_DESCRIPTION\n\n    @property\n    def observation_prefix(self) -> str:\n        """Prefix to append the observation with."""\n        return "Observation: "\n\n    @property\n    def llm_prefix(self) -> str:\n        """Prefix to append the llm call with."""\n        return "Thought:"\n\n    @classmethod\n    def create_prompt(\n        cls,'},
            {'fileName':'libs/langchain/langchain/agents/agent_toolkits/github/__init__.py','content':'"""GitHub Toolkit."""\n'},
        ],
        fileName: 'libs/langchain/tests/integration_tests/utilities/test_github.py',
        languageId: 'python',
        content: `
            """Integration test for Github Wrapper."""
            import pytest

            from langchain.utilities.github import GitHubAPIWrapper

            # Make sure you have set the following env variables:
            # GITHUB_REPOSITORY
            # GITHUB_BRANCH
            # GITHUB_APP_ID
            # GITHUB_PRIVATE_KEY

            @pytest.fixture
            def api_client() -> GitHubAPIWrapper:
                return GitHubAPIWrapper()

            def test_get_open_issues(api_client: GitHubAPIWrapper) -> None:
                ${CURSOR}
            `,
    },
    {
        // prettier-ignore
        context: [
            {'fileName':'libs/langchain/langchain/tools/playwright/click.py','content':"from __future__ import annotations\n\nfrom typing import Optional, Type\n\nfrom pydantic import BaseModel, Field\n\nfrom langchain.callbacks.manager import (\n    AsyncCallbackManagerForToolRun,\n    CallbackManagerForToolRun,\n)\nfrom langchain.tools.playwright.base import BaseBrowserTool\nfrom langchain.tools.playwright.utils import (\n    aget_current_page,\n    get_current_page,\n)\n\n\nclass ClickToolInput(BaseModel):\n    \"\"\"Input for ClickTool.\"\"\"\n\n    selector: str = Field(..., description=\"CSS selector for the element to click\")\n\n\nclass ClickTool(BaseBrowserTool):\n    \"\"\"Tool for clicking on an element with the given CSS selector.\"\"\"\n\n    name: str = \"click_element\"\n    description: str = \"Click on an element with the given CSS selector\"\n    args_schema: Type[BaseModel] = ClickToolInput\n\n    visible_only: bool = True\n    \"\"\"Whether to consider only visible elements.\"\"\"\n    playwright_strict: bool = False\n    \"\"\"Whether to employ Playwright's strict mode when clicking on elements.\"\"\"\n    playwright_timeout: float = 1_000\n    \"\"\"Timeout (in ms) for Playwright to wait for element to be ready.\"\"\"\n\n    def _selector_effective(self, selector: str) -> str:\n        if not self.visible_only:\n            return selector\n        return f\"{selector} >> visible=1\"\n\n    def _run(\n        self,\n        selector: str,\n        run_manager: Optional[CallbackManagerForToolRun] = None,\n    ) -> str:\n        \"\"\"Use the tool.\"\"\"\n        if self.sync_browser is None:\n            raise ValueError(f\"Synchronous browser not provided to {self.name}\")"},
            {'fileName':'libs/langchain/langchain/document_loaders/url_playwright.py','content':'"""\nimport logging\nfrom typing import List, Optional\n\nfrom langchain.docstore.document import Document\nfrom langchain.document_loaders.base import BaseLoader\n\nlogger = logging.getLogger(__name__)\n\n\nclass PlaywrightURLLoader(BaseLoader):\n    """Loader that uses Playwright and to load a page and unstructured to load the html.\n    This is useful for loading pages that require javascript to render.\n\n    Attributes:\n        urls (List[str]): List of URLs to load.\n        continue_on_failure (bool): If True, continue loading other URLs on failure.\n        headless (bool): If True, the browser will run in headless mode.\n    """\n\n    def __init__(\n        self,\n        urls: List[str],\n        continue_on_failure: bool = True,\n        headless: bool = True,\n        remove_selectors: Optional[List[str]] = None,\n    ):\n        """Load a list of URLs using Playwright and unstructured."""\n        try:\n            import playwright  # noqa:F401\n        except ImportError:\n            raise ImportError(\n                "playwright package not found, please install it with "\n                "`pip install playwright`"\n            )\n\n        try:\n            import unstructured  # noqa:F401\n        except ImportError:\n            raise ValueError(\n                "unstructured package not found, please install it with "\n                "`pip install unstructured`"\n            )\n\n        self.urls = urls\n        self.continue_on_failure = continue_on_failure\n        self.headless = headless\n        self.remove_selectors = remove_selectors\n\n    def load(self) -> List[Document]:'},
            {'fileName':'libs/langchain/langchain/agents/agent_toolkits/playwright/__init__.py','content':'"""Playwright browser toolkit."""\nfrom langchain.agents.agent_toolkits.playwright.toolkit import PlayWrightBrowserToolkit\n\n__all__ = ["PlayWrightBrowserToolkit"]\n'}
        ],
        fileName: 'libs/langchain/langchain/agents/agent_toolkits/playwright/toolkit.py',
        languageId: 'python',
        content: `
            """Playwright web browser toolkit."""
            from __future__ import annotations

            from typing import TYPE_CHECKING, List, Optional, Type, cast

            from pydantic import Extra, root_validator

            from langchain.agents.agent_toolkits.base import BaseToolkit
            from langchain.tools.base import BaseTool
            from langchain.tools.playwright.base import (
                BaseBrowserTool,
                lazy_import_playwright_browsers,
            )
            from langchain.tools.playwright.click import ClickTool
            from langchain.tools.playwright.current_page import CurrentWebPageTool
            from langchain.tools.playwright.extract_hyperlinks import ExtractHyperlinksTool
            from langchain.tools.playwright.extract_text import ExtractTextTool
            from langchain.tools.playwright.get_elements import GetElementsTool
            from langchain.tools.playwright.navigate import NavigateTool
            from langchain.tools.playwright.navigate_back import NavigateBackTool

            if TYPE_CHECKING:
                from playwright.async_api import Browser as AsyncBrowser
                from playwright.sync_api import Browser as SyncBrowser
            else:
                try:
                    # We do this so pydantic can resolve the types when instantiating
                    from playwright.async_api import Browser as AsyncBrowser
                    from playwright.sync_api import Browser as SyncBrowser
                except ImportError:
                    pass

            class PlayWrightBrowserToolkit(BaseToolkit):
                """Toolkit for PlayWright browser tools."""

                sync_browser: Optional["SyncBrowser"] = None
                async_browser: Optional["AsyncBrowser"] = None

                class Config:
                    """Configuration for this pydantic object."""

                    extra = Extra.forbid
                    arbitrary_types_allowed = True

                @root_validator
                def validate_imports_and_browser_provided(cls, values: dict) -> dict:
                    """Check that the arguments are valid."""
                    lazy_import_playwright_browsers()
                    if values.get("async_browser") is None and values.get("sync_browser") is None:
                        raise ValueError("Either async_browser or sync_browser must be specified.")
                    return values

                def get_tools(self) -> List[BaseTool]:
                    """Get the tools in the toolkit."""
                    tool_classes: List[Type[BaseBrowserTool]] = [
                        ClickTool,
                        NavigateTool,
                        NavigateBackTool,
                        ExtractTextTool,
                        ExtractHyperlinksTool,
                        GetElementsTool,
                        CurrentWebPageTool,
                    ]

                    tools = [
                        tool_cls.${CURSOR}
                        for tool_cls in tool_classes
                    ]
                    return cast(List[BaseTool], tools)

                @classmethod
                def from_browser(
                    cls,
                    sync_browser: Optional[SyncBrowser] = None,
                    async_browser: Optional[AsyncBrowser] = None,
                ) -> PlayWrightBrowserToolkit:
                    """Instantiate the toolkit."""
                    # This is to raise a better error than the forward ref ones Pydantic would have
                    lazy_import_playwright_browsers()
                    return cls(sync_browser=sync_browser, async_browser=async_browser)
            `,
    },
    {
        // prettier-ignore
        context: [
            {'fileName':'src/completions/index.ts','content':'        this.abortOpenCompletions = () => {\n            previousAbort()\n            stopLoading()\n        }\n\n        const completions = await this.requestManager.request(\n            document.uri.toString(),\n            logId,\n            prefix,\n            completers,\n            contextResult.context,\n            abortController.signal\n        )\n\n        // Shared post-processing logic\n        const processedCompletions = processCompletions(completions, prefix, suffix, multiline, document.languageId)\n        stopLoading()\n\n        if (processedCompletions.length > 0) {\n            CompletionLogger.suggest(logId)\n            return toInlineCompletionItems(logId, document, position, processedCompletions)\n        }\n\n        CompletionLogger.noResponse(logId)\n        return { items: [] }\n    }\n}\n\nexport interface Completion {\n    prefix: string\n    content: string\n    stopReason?: string\n}\n\nfunction handleCacheHit(\n    cachedCompletions: CachedCompletions,\n    document: vscode.TextDocument,\n    position: vscode.Position,\n    prefix: string,\n    suffix: string,\n    multiline: boolean,\n    languageId: string\n): vscode.InlineCompletionList {\n    const results = processCompletions(cachedCompletions.completions, prefix, suffix, multiline, languageId)\n    return toInlineCompletionItems(cachedCompletions.logId, document, position, results)\n}\n\nfunction processCompletions(\n    completions: Completion[],\n    prefix: string,'},
            {'fileName':'src/completions/document.ts','content':"import * as vscode from 'vscode'\n\n/**\n * Get the current document context based on the cursor position in the current document.\n *\n * This function is meant to provide a context around the current position in the document,\n * including a prefix, a suffix, the previous line, the previous non-empty line, and the next non-empty line.\n * The prefix and suffix are obtained by looking around the current position up to a max length\n * defined by `maxPrefixLength` and `maxSuffixLength` respectively. If the length of the entire\n * document content in either direction is smaller than these parameters, the entire content will be used.\n *w\n *\n * @param document - A `vscode.TextDocument` object, the document in which to find the context.\n * @param position - A `vscode.Position` object, the position in the document from which to find the context.\n * @param maxPrefixLength - A number representing the maximum length of the prefix to get from the document.\n * @param maxSuffixLength - A number representing the maximum length of the suffix to get from the document.\n *\n * @returns An object containing the current document context or null if there are no lines in the document.\n */\nexport function getCurrentDocContext(\n    document: vscode.TextDocument,\n    position: vscode.Position,\n    maxPrefixLength: number,\n    maxSuffixLength: number\n): {\n    prefix: string\n    suffix: string\n    prevLine: string\n    prevNonEmptyLine: string\n    nextNonEmptyLine: string\n} | null {\n    const offset = document.offsetAt(position)\n\n    const prefixLines = document.getText(new vscode.Range(new vscode.Position(0, 0), position)).split('\\n')\n\n    if (prefixLines.length === 0) {\n        console.error('no lines')\n        return null\n    }\n\n    const suffixLines = document\n        .getText(new vscode.Range(position, document.positionAt(document.getText().length)))\n        .split('\\n')\n\n    let nextNonEmptyLine = ''\n    if (suffixLines.length > 0) {\n        for (const line of suffixLines) {\n            if (line.trim().length > 0) {\n                nextNonEmptyLine = line\n                break"},
            {'fileName':'src/completions/docprovider.ts','content':"\n    public addCompletions(uri: vscode.Uri, lang: string, completions: Completion[], debug?: Meta): void {\n        if (!this.completionsByUri[uri.toString()]) {\n            this.completionsByUri[uri.toString()] = []\n        }\n\n        this.completionsByUri[uri.toString()].push({\n            lang,\n            completions,\n            meta: debug,\n        })\n        this.fireDocumentChanged(uri)\n    }\n\n    public onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>()\n    public onDidChange = this.onDidChangeEmitter.event\n\n    public provideTextDocumentContent(uri: vscode.Uri): string {\n        const completionGroups = this.completionsByUri[uri.toString()]\n        if (!completionGroups) {\n            return 'Loading...'\n        }\n\n        return completionGroups\n            .map(({ completions, lang }) =>\n                completions\n                    .map(({ content, stopReason: finishReason }, index) => {\n                        const completionText = `\\`\\`\\`${lang}\\n${content}\\n\\`\\`\\``\n                        const headerComponents = [`${index + 1} / ${completions.length}`]\n                        if (finishReason) {\n                            headerComponents.push(`finish_reason:${finishReason}`)\n                        }\n                        return headerize(headerComponents.join(', '), 80) + '\\n' + completionText\n                    })\n                    .filter(t => t)\n                    .join('\\n\\n')\n            )\n            .join('\\n\\n')\n    }\n}\n\nfunction headerize(label: string, width: number): string {\n    const prefix = '# ======= '\n    let buffer = width - label.length - prefix.length - 1\n    if (buffer < 0) {\n        buffer = 0\n    }\n    return `${prefix}${label} ${'='.repeat(buffer)}`\n}\n"},
            {'fileName':'src/completions/history.ts','content':"        if (register) {\n            const disposable = register()\n            if (disposable) {\n                this.subscriptions.push(disposable)\n            }\n        }\n    }\n\n    public dispose(): void {\n        vscode.Disposable.from(...this.subscriptions).dispose()\n    }\n\n    public addItem(newItem: HistoryItem): void {\n        if (newItem.document.uri.scheme === 'codegen') {\n            return\n        }\n        const foundIndex = this.history.findIndex(\n            item => item.document.uri.toString() === newItem.document.uri.toString()\n        )\n        if (foundIndex >= 0) {\n            this.history = [...this.history.slice(0, foundIndex), ...this.history.slice(foundIndex + 1)]\n        }\n        this.history.push(newItem)\n        if (this.history.length > this.window) {\n            this.history.shift()\n        }\n    }\n\n    /**\n     * Returns the last n items of history in reverse chronological order (latest item at the front)\n     */\n    public lastN(n: number, languageId?: string, ignoreUris?: vscode.Uri[]): HistoryItem[] {\n        const ret: HistoryItem[] = []\n        const ignoreSet = new Set(ignoreUris || [])\n        for (let i = this.history.length - 1; i >= 0; i--) {\n            const item = this.history[i]\n            if (ret.length > n) {\n                break\n            }\n            if (ignoreSet.has(item.document.uri)) {\n                continue\n            }\n            if (languageId && languageId !== item.document.languageId) {\n                continue\n            }\n            ret.push(item)\n        }\n        return ret\n    }\n}"},
        ],
        fileName: 'src/completions/completion.test.ts',
        languageId: 'typescript',
        content: `
            import { beforeEach, describe, expect, it, vi } from 'vitest'
        import type * as vscode from 'vscode'
        import { URI } from 'vscode-uri'

        import {
            CompletionParameters,
            CompletionResponse,
        } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

        import { vsCodeMocks } from '../testutils/mocks'

        import { CodyCompletionItemProvider } from '.'
        import { History } from './history'
        import { createProviderConfig } from './providers/anthropic'

        vi.mock('vscode', () => ({
            ...vsCodeMocks,
            InlineCompletionTriggerKind: {
                Invoke: 0,
                Automatic: 1,
            },
            workspace: {
                ...vsCodeMocks.workspace,
                asRelativePath(path: string) {
                    return path
                },
                onDidChangeTextDocument() {
                    return null
                },
            },
            window: {
                ...vsCodeMocks.window,
                visibleTextEditors: [],
                tabGroups: { all: [] },
            },
        }))

        function createCompletionResponse(completion: string): CompletionResponse {
            return {
                completion: truncateMultilineString(completion),
                stopReason: 'unknown',
            }
        }

        const noopStatusBar = {
            startLoading: () => () => {},
        } as any

        const CURSOR_MARKER = '<cursor>'

        /**
         * A helper function used so that the below code example can be intended in code but will have their
         * prefix stripped. This is similar to what Vitest snapshots use but without the prettier hack so that
         * the starting \` is always in the same line as the function name :shrug:
         */
        function truncateMultilineString(string: string): string {
            const lines = string.split('\n')

            if (lines.length <= 1) {
                return string
            }

            if (lines[0] !== '') {
                return string
            }

            const regex = lines[1].match(/^ */)

            const indentation = regex ? regex[0] : ''
            return lines
                .map(line => (line.startsWith(indentation) ? line.replace(indentation, '') : line))
                .slice(1)
                .join('\n')
        }

        describe('Cody completions', () => {
            /**
             * A test helper to trigger a completion request. The code example must include
             * a pipe character to denote the current cursor position.
             *
             * @example
             *   complete(\`
             * async function foo() {
             *   $\{CURSOR_MARKER}
             * }\`)
             */
            let complete: (
                code: string,
                responses?: CompletionResponse[] | 'stall',
                languageId?: string,
                context?: vscode.InlineCompletionContext,
            ) => Promise<{
                requests: CompletionParameters[]
                completions: vscode.InlineCompletionItem[]
            }>
            beforeEach(() => {
                complete = async (
                    code: string,
                    responses?: CompletionResponse[] | 'stall',
                    languageId: string = 'typescript',
                    context: vscode.InlineCompletionContext = { triggerKind: 1, selectedCompletionInfo: undefined },
                ): Promise<{
                    requests: CompletionParameters[]
                    completions: vscode.InlineCompletionItem[]
                }> => {
                    code = truncateMultilineString(code)

                    const requests: CompletionParameters[] = []
                    let requestCounter = 0
                    const completionsClient: any = {
                        complete(params: CompletionParameters): Promise<CompletionResponse> {
                            requests.push(params)
                            if (responses === 'stall') {
                                // Creates a stalling request that never responds
                                return new Promise(() => {})
                            }
                            return Promise.resolve(responses?.[requestCounter++] || { completion: '', stopReason: 'unknown' })
                        },
                    }
                    const providerConfig = createProviderConfig({
                        completionsClient,
                        maxContextTokens: 2048,
                    })
                    const completionProvider = new CodyCompletionItemProvider({
                        ${CURSOR}
                    })

                    if (!code.includes(CURSOR_MARKER)) {
                        throw new Error('The test code must include a | to denote the cursor position')
                    }

                    const cursorIndex = code.indexOf(CURSOR_MARKER)
                    const prefix = code.slice(0, cursorIndex)
                    const suffix = code.slice(cursorIndex + CURSOR_MARKER.length)

                    const codeWithoutCursor = prefix + suffix

                    const token: any = {
                        onCancellationRequested() {
                            return null
                        },
                    }
                    const document: any = {
                        filename: 'test.ts',
                        uri: URI.parse('file:///test.ts'),
                        languageId,`,
    },
].map(sample => ({ ...sample, content: dedent(sample.content) }))
