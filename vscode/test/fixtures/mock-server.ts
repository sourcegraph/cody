import type { Socket } from "node:net";

import { PubSub } from "@google-cloud/pubsub";
import express from "express";
import * as uuid from "uuid";

import type { ServerModelConfiguration } from "@sourcegraph/cody-shared";
import type { TelemetryEventInput } from "@sourcegraph/telemetry";

// create interface for the request
interface MockRequest {
    headers: {
        authorization: string;
    };
    body: {
        messages: {
            text: string;
            speaker?: string;
        }[];
    };
}

const SERVER_PORT = 49300;

export const SERVER_URL = "http://localhost:49300";
export const VALID_TOKEN = "sgp_1234567890123456789012345678901234567890";

const responses = {
    chat: "hello from the assistant",
    chatWithSnippet: [
        "Hello! Here is a code snippet:",
        "",
        "```",
        "def fib(n):",
        "  if n < 0:",
        "    return n",
        "  else:",
        "    return fib(n-1) + fib(n-2)",
        "```",
        "",
        "Hope this helps!",
    ].join("\n"),
    fixup: "<CODE5711>interface Fruit {\n    bananaName: string\n    bananaAge: number\n}</CODE5711>",
    code: {
        template: { completion: "", stopReason: "stop_sequence" },
        mockResponses: ["myFirstCompletion", "myNotFirstCompletion"],
    },
    document: `
    /**
     * Mocked doc string
     */
    `,
    lorem: `\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.\n\n
    \`\`\`
    // Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aenean blandit erat egestas, malesuada urna id, congue sem.
    export interface Animal {
            name: string
            makeAnimalSound(): string
            isMammal: boolean
            printName(): void {
                console.log(this.name);
            }
        }
    }
    \`\`\`
    \n\n
    `,
};

const FIXUP_PROMPT_TAG = "<SELECTEDCODE7662>";
const NON_STOP_FIXUP_PROMPT_TAG = "<CODE5711>";

const pubSubClient = new PubSub({
    projectId: "sourcegraph-telligent-testing",
});

const topicPublisher = pubSubClient.topic("projects/sourcegraph-telligent-testing/topics/e2e-testing", {
    gaxOpts: {
        timeout: 120000,
    },
});

//#region GraphQL Mocks

// This is a primitive system for injecting GraphQL responses per-test, instead
// of adding every possible GraphQL response to the mock server directly.

type GraphQlMockResponse =
    | {
          kind: "json";
          json: string;
      }
    | {
          kind: "status";
          status: number;
          message: string | undefined;
      };

class GraphQlMock {
    private response: GraphQlMockResponse = {
        kind: "status",
        status: 400,
        message: "unhandled GraphQL operation",
    };
    private nextMock: GraphQlMock | undefined = undefined;

    constructor(
        private readonly container: MockServer,
        private readonly operation: string,
    ) {}

    public replyJson(json: any): GraphQlMock {
        this.response = {
            kind: "json",
            json: JSON.stringify(json),
        };
        return this;
    }

    public replyStatus(code: number, message?: string): GraphQlMock {
        this.response = {
            kind: "status",
            status: code,
            message,
        };
        return this;
    }

    public next(): GraphQlMock {
        this.nextMock = new GraphQlMock(this.container, this.operation);
        return this.nextMock;
    }

    handleRequest(res: express.Response): void {
        switch (this.response.kind) {
            case "json":
                res.send(this.response.json);
                break;
            case "status":
                res.status(this.response.status);
                if (this.response.message) {
                    res.statusMessage = this.response.message;
                }
                break;
        }
        if (this.nextMock) {
            this.container.graphQlMocks.set(this.operation, this.nextMock);
        }
    }
}

//#endregion

// Lets the test change the behavior of the mock server.
export class MockServer {
    graphQlMocks: Map<string, GraphQlMock> = new Map();
    availableLLMs: ServerModelConfiguration | undefined;

    constructor(public readonly express: express.Express) {}

    public onGraphQl(operation: string): GraphQlMock {
        let mock = this.graphQlMocks.get(operation);
        if (!mock) {
            mock = new GraphQlMock(this, operation);
            this.graphQlMocks.set(operation, mock);
        }
        return mock;
    }

    public setAvailableLLMs(config: ServerModelConfiguration) {
        this.availableLLMs = config;
    }

    // Runs a stub Cody service for testing.
    public static async run<T>(around: (server: MockServer) => Promise<T>): Promise<T> {
        const app = express();
        const controller = new MockServer(app);
        app.use(express.json());

        // Add connection issue middleware to simulate things going wrong. Right now it's very basic but we could extend this with specific
        // network issue, latencies or errors we see in broken deployments to ensure we robustly handle them in the client.
        const VALID_CONNECTION_ISSUES = ["ECONNREFUSED", "ENOTFOUND"] as const;
        // this gets set by calling /.test/connectionIssues/enable\disable
        let connectionIssue: (typeof VALID_CONNECTION_ISSUES)[number] | undefined = undefined;
        app.use((req, res, next) => {
            if (connectionIssue && !req.url.startsWith("/.test")) {
                switch (connectionIssue) {
                    default: {
                        //sending response like this prevents logging
                        res.statusMessage = connectionIssue;
                        res.status(500);
                        res.send(connectionIssue);
                    }
                }
            } else {
                next();
            }
        });
        app.post("/.test/connectionIssue/enable", (req, res) => {
            // get the 'issue' field from the request body and check that it's one of the valid connectionIssues
            const issue = req.query?.issue as unknown;
            if (issue && VALID_CONNECTION_ISSUES.includes(issue as any)) {
                connectionIssue = issue as (typeof VALID_CONNECTION_ISSUES)[number];
                res.sendStatus(200);
            } else {
                res.status(400).send(
                    `The issue <${issue}> must be one of [${VALID_CONNECTION_ISSUES.join(", ")}]`,
                );
            }
        });
        app.post("/.test/connectionIssue/disable", (req, res) => {
            connectionIssue = undefined;
            res.sendStatus(200);
        });

        // Deprecated, no longer used, connected to v1 telemetry
        // endpoint which will accept the data that you want to send in that you will add your pubsub code
        app.post("/.test/testLogging", (_, res) => {
            res.status(200);
        });

        // matches @sourcegraph/cody-shared't work, so hardcode it here.
        app.post("/.test/mockEventRecording", (req, res) => {
            const events = req.body as TelemetryEventInput[];
            for (const event of events) {
                void logTestingData(JSON.stringify(event));
                loggedV2Events.push(`${event.feature}:${event.action}`);
            }
            res.status(200);
        });

        /** Whether to simulate that rate limits have been hit */
        let chatRateLimited = false;
        /** Whether the user is Pro (true), Free (false) or not a dotCom user (undefined) */
        let chatRateLimitPro: boolean | undefined;
        app.post("/.api/completions/stream", (req, res) => {
            const apiVersion = Number.parseInt(req?.query?.["api-version"] as string ?? '1', 10)
            if (chatRateLimited) {
                res.set({
                    "retry-after": new Date().toString(),
                    "x-ratelimit-limit": "12345",
                    ...(chatRateLimitPro !== undefined && {
                        "x-is-cody-pro-user": `${chatRateLimitPro}`,
                    }),
                });
                res.sendStatus(429);
                return;
            }

            const request = req as MockRequest;
            const messages = request.body.messages;
            const lastHumanMessageIndex = messages.findLastIndex((msg) => msg?.speaker === "human");
            const lastMessageIndex =
                lastHumanMessageIndex >= 0 ? lastHumanMessageIndex : messages.length - 2;
            // NOTE: This could starts with the CONTEXT_PREAMBLE added by PromptMixin when context is added.
            const lastHumanMessageText = messages[lastMessageIndex].text;

            let response = responses.chat;

            // Use a switch statement for faster response selection
            switch (true) {
                case lastHumanMessageText.startsWith("Lorem ipsum"):
                    response = responses.lorem;
                    break;
                case lastHumanMessageText.includes("documentation comment"):
                    response = responses.document;
                    break;
                case lastHumanMessageText.includes(FIXUP_PROMPT_TAG) ||
                    lastHumanMessageText.includes(NON_STOP_FIXUP_PROMPT_TAG):
                    response = responses.fixup;
                    break;
                case lastHumanMessageText.includes("show me a code snippet"):
                    response = responses.chatWithSnippet;
                    break;
                case lastHumanMessageText.endsWith("delay"):
                    handleDelayedResponse(res);
                    return;
            }

            function handleDelayedResponse(res: express.Response): void {
                const r1 = responses.chatWithSnippet;
                const r2 = r1 + "\n\nDone";
                res.write(`event: completion\ndata: {"completion": ${JSON.stringify(r1)}}\n\n`);
                setTimeout(() => {
                    res.write(`event: completion\ndata: {"completion": ${JSON.stringify(r2)}}\n\n`);
                    res.write("event: done\ndata: {}\n\n");
                    res.end();
                }, 400);
            }

            function sendCompletionResponse(res: express.Response, response: string): void {
                const propertyName = apiVersion <= 1 ? 'completion' : 'deltaText'
                res.send(
                    `event: completion\ndata: {"${propertyName}": ${JSON.stringify(
                        response,
                    )}}\n\nevent: done\ndata: {}\n\n`,
                );
            }

            sendCompletionResponse(res, response);
        });

        app.post("/.test/completions/triggerRateLimit", (req, res) => {
            chatRateLimited = true;
            chatRateLimitPro = undefined;
            res.sendStatus(200);
        });
        app.post("/.test/completions/triggerRateLimit/free", (req, res) => {
            chatRateLimited = true;
            chatRateLimitPro = false;
            res.sendStatus(200);
        });
        app.post("/.test/completions/triggerRateLimit/pro", (req, res) => {
            chatRateLimited = true;
            chatRateLimitPro = true;
            res.sendStatus(200);
        });
        app.post("/.test/completions/triggerRateLimit/enterprise", (req, res) => {
            chatRateLimited = true;
            chatRateLimitPro = undefined;
            res.sendStatus(200);
        });
        app.post("/.api/completions/code", (req, res) => {
            const OPENING_CODE_TAG = "<CODE5711>";
            const request = req as MockRequest;

            // Extract the code from the last message.
            let completionPrefix = request.body.messages.at(-1)?.text;
            if (!completionPrefix?.startsWith(OPENING_CODE_TAG)) {
                throw new Error(
                    `Last completion message did not contain code starting with ${OPENING_CODE_TAG}`,
                );
            }
            completionPrefix = completionPrefix.slice(OPENING_CODE_TAG.length);

            // Trim to the last word since our mock responses are just completing words. If the
            // request has a trailing space, we won't provide anything since the user hasn't
            // started typing a word.
            completionPrefix = completionPrefix?.split(/\s/g).at(-1);

            // Find a matching mock response that is longer than what we've already
            // typed.
            const completion =
                responses.code.mockResponses
                    .find(
                        (candidate) =>
                            completionPrefix?.length &&
                            candidate.startsWith(completionPrefix) &&
                            candidate.length > completionPrefix.length,
                    )
                    ?.slice(completionPrefix?.length) ?? "";

            const response = { ...responses.code.template, completion };
            res.send(JSON.stringify(response));
        });

        let attribution = false;
        let codyPro = false;
        app.get("/.api/client-config", (req, res) => {
            if (req.headers.authorization !== `token ${VALID_TOKEN}`) {
                res.sendStatus(401);
                return;
            }
            res.send(
                JSON.stringify({
                    chatEnabled: true,
                    autoCompleteEnabled: true,
                    customCommandsEnabled: true,
                    attributionEnabled: attribution,
                    // When server-sent LLMs have been set, we enable the models api
                    modelsAPIEnabled: !!controller.availableLLMs,
                }),
            );
        });
        app.post("/.api/graphql", (req, res) => {
            const operation = new URL(req.url, "https://example.com").search.replace(/^\?/, "");
            if (
                req.headers.authorization !== `token ${VALID_TOKEN}` &&
                operation !== "SiteProductVersion"
            ) {
                res.sendStatus(401);
                return;
            }

            if (controller.graphQlMocks.has(operation)) {
                try {
                    controller.onGraphQl(operation).handleRequest(res);
                } catch (error) {
                    res.sendStatus(500);
                    res.statusMessage = (error as Error).message;
                }
            } else {
                switch (operation) {
                    case "CurrentUser":
                        res.send(
                            JSON.stringify({
                                data: {
                                    currentUser: {
                                        id: "u",
                                        hasVerifiedEmail: true,
                                        displayName: "Person",
                                        username: "person",
                                        avatarURL: "",
                                        primaryEmail: {
                                            email: "person@company.comp",
                                        },
                                    },
                                },
                            })
                        )
                        break
                    case 'CurrentUserCodySubscription':
                        res.send(
                            JSON.stringify({
                                data: {
                                    currentUser: {
                                        codySubscription: {
                                            status: "ACTIVE",
                                            plan: codyPro ? "PRO" : "FREE",
                                            applyProRateLimits: codyPro,
                                            currentPeriodStartAt: "2021-01-01T00:00:00Z",
                                            currentPeriodEndAt: "2022-01-01T00:00:00Z",
                                        },
                                    },
                                },
                            }),
                        );
                        break;
                    case "CurrentUserCodyProEnabled":
                        res.send(
                            JSON.stringify({
                                data: {
                                    currentUser: {
                                        codyProEnabled: codyPro,
                                    },
                                },
                            }),
                        );
                        break;
                    case "IsContextRequiredForChatQuery":
                        res.send(
                            JSON.stringify({
                                data: { isContextRequiredForChatQuery: false },
                            }),
                        );
                        break;
                    case "SiteIdentification":
                        res.send(
                            JSON.stringify({
                                data: {
                                    site: {
                                        siteID: "test-site-id",
                                        productSubscription: {
                                            license: { hashedKey: "mmm,hashedkey" },
                                        },
                                    },
                                },
                            }),
                        );
                        break;
                    case "SiteProductVersion":
                        res.send(
                            JSON.stringify({
                                data: { site: { productVersion: "dev" } },
                            }),
                        );
                        break;
                    case "SiteGraphQLFields":
                        res.send(
                            JSON.stringify({
                                data: {
                                    __type: {
                                        fields: [{ name: "id" }, { name: "isCodyEnabled" }],
                                    },
                                },
                            })
                        )
                        break
                    case 'SiteHasCodyEnabled':
                        res.send(JSON.stringify({ data: { site: { isCodyEnabled: true } } }))
                        break
                    case 'FeatureFlags':
                        res.send(JSON.stringify({ data: { evaluatedFeatureFlags: [{ name: 'git-mention-provider', value: true}]} }))
                        break
                    case 'EvaluateFeatureFlag':
                        res.send(JSON.stringify({ data: { evaluatedFeatureFlag: true } }))
                        break
                    case 'CurrentSiteCodyLlmProvider': {
                        res.send(
                            JSON.stringify({
                                data: {
                                    site: {
                                        codyLLMConfiguration: {
                                            provider: 'sourcegraph',
                                        },
                                    },
                                },
                            })
                        )
                        break
                    }
                    case 'CurrentSiteCodyLlmConfiguration': {
                        res.send(
                            JSON.stringify({
                                data: {
                                    site: {
                                        codyLLMConfiguration: {
                                            chatModel: 'foo/test-chat-default-model',
                                            completionModel: 'fireworks/starcoder',
                                            provider: 'sourcegraph',
                                        },
                                    },
                                },
                            })
                        )
                        break
                    }
                    case "CodyConfigFeaturesResponse": {
                        res.send(
                            JSON.stringify({
                                data: {
                                    site: {
                                        codyConfigFeatures: {
                                            chat: true,
                                            autoComplete: true,
                                            commands: true,
                                            attribution,
                                        },
                                    },
                                },
                            }),
                        );
                        break;
                    }
                    default:
                        res.status(400).send(
                            JSON.stringify({
                                errors: [
                                    {
                                        message: `Cannot query field "unknown" on type "${operation}".`,
                                        locations: [],
                                    },
                                ],
                            }),
                        );
                        break;
                }
            }
        });

        app.post("/.test/currentUser/codyProEnabled", (req, res) => {
            codyPro = true;
            res.sendStatus(200);
        });
        app.post("/.test/attribution/enable", (req, res) => {
            attribution = true;
            res.sendStatus(200);
        });
        app.post("/.test/attribution/disable", (req, res) => {
            attribution = false;
            res.sendStatus(200);
        });

        app.get("/.api/modelconfig/supported-models.json", (req, res) => {
            res.status(200).send(JSON.stringify(controller.availableLLMs));
        });

        const server = app.listen(SERVER_PORT);

        // Calling close() on the server only stops accepting new connections
        // and does not terminate existing connections. This can result in
        // tests reusing the previous tests server unless they are explicitly
        // closed, so track connections as they open.
        const sockets = new Set<Socket>();
        server.on("connection", (socket) => sockets.add(socket));

        const result = await around(controller);

        // Tell the server to stop accepting connections. The server won't shut down
        // and the callback won't be fired until all existing clients are closed.
        const serverClosed = new Promise((resolve) => server.close(resolve));

        // Close all the existing connections and wait for the server shutdown.
        for (const socket of sockets) {
            socket.destroy();
        }
        await serverClosed;

        return result;
    }
}

const loggedTestRun: Record<string, boolean> = {};

export async function logTestingData(data: string, type?: string, testName?: string, testRunID?: string ): Promise<void> {
    if (process.env.CI === undefined || process.env.NO_LOG_TESTING_TELEMETRY_CALLS) {
        return;
    }

    if (testName) {
        currentTestName = testName
    }
    if (testRunID) {
        currentTestRunID = testRunID
    }
    const message = {
        type: type || 'v2-vscode-e2e',
        event: data,
        timestamp: new Date().getTime(),
        test_name: currentTestName,
        test_id: currentTestID,
        test_run_id: currentTestRunID,
        UID: uuid.v4(),
    };

    // Publishes the message as a string
    const dataBuffer = Buffer.from(JSON.stringify(message));

    await topicPublisher.publishMessage({ data: dataBuffer }).catch((error) => {
        console.error("Error publishing message:", error);
    });
    if (!loggedTestRun[currentTestRunID]) {
        console.log(
            `Messages published - TestRunId: ${currentTestRunID}, TestName: ${currentTestName}, TestID: ${currentTestID}`,
        );
        loggedTestRun[currentTestRunID] = true;
    }
}

let currentTestName: string;
let currentTestID: string;
let currentTestRunID: string;

export function sendTestInfo(testName: string, testID: string, testRunID: string): void {
    currentTestName = testName || "";
    currentTestID = testID || "";
    currentTestRunID = testRunID || "";
}

// Events recorded using the new event recorders
export let loggedV2Events: string[] = [];

export function resetLoggedEvents(): void {
   loggedV2Events = [];
}
