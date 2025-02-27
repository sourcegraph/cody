import { spawn } from "node:child_process";
import type { SpawnOptions } from "node:child_process";
import type {
    MessageParam,
    Tool,
    ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources";
import {
    type ChatClient,
    type ContextItem,
    ProcessType,
    type PromptMixin,
    PromptString,
    type SerializedPromptEditorState,
    currentSiteVersion,
    firstResultFromOperation,
    newPromptMixin,
    wrapInActiveSpan,
} from "@sourcegraph/cody-shared";
import type { SubMessage } from "@sourcegraph/cody-shared/src/chat/transcript/messages";
import { isError } from "lodash";
import * as vscode from "vscode";
import { getCategorizedMentions } from "../../../prompt-builder/utils";
import { ChatBuilder } from "../ChatBuilder";
import type { ChatControllerOptions } from "../ChatController";
import type { ContextRetriever } from "../ContextRetriever";
import type { HumanInput } from "../context";
import { DefaultPrompter, type PromptInfo } from "../prompt";
import { computeContextAlternatives } from "./ChatHandler";
import type {
    AgentHandler,
    AgentHandlerDelegate,
    AgentRequest,
} from "./interfaces";

interface CodyTool {
    spec: Tool;
    invoke: (input: any) => Promise<string>;
}

interface ToolCall {
    id: string;
    name: string;
    input: any;
}

const allTools: CodyTool[] = [
    {
        spec: {
            name: "get_file",
            description: "Get the file contents.",
            input_schema: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "The path to the file.",
                    },
                },
                required: ["path"],
            },
        },
        invoke: async (input: { path: string }) => {
            // check if input is of type string
            if (typeof input.path !== "string") {
                throw new Error(
                    `get_file argument must be a string, value was ${JSON.stringify(input)}`,
                );
            }
            const { path: relativeFilePath } = input;
            try {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (!workspaceFolder) {
                    throw new Error("No workspace folder found");
                }
                const uri = vscode.Uri.joinPath(
                    workspaceFolder.uri,
                    relativeFilePath,
                );

                const content = await vscode.workspace.fs.readFile(uri);
                return Buffer.from(content).toString("utf-8");
            } catch (error) {
                throw new Error(`Failed to read file ${input.path}: ${error}`);
            }
        },
    },
    {
        spec: {
            name: "run_terminal_command",
            description:
                "Run an arbitrary terminal command at the root of the users project. ",
            input_schema: {
                type: "object",
                properties: {
                    command: {
                        type: "string",
                        description:
                            "The command to run in the root of the users project. Must be shell escaped.",
                    },
                },
                required: ["command"],
            },
        },
        invoke: async (input: { command: string }) => {
            if (typeof input.command !== "string") {
                throw new Error(
                    `run_terminal_command argument must be a string, value was ${JSON.stringify(input)}`,
                );
            }

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error("No workspace folder found");
            }

            try {
                const commandResult = await runShellCommand(input.command, {
                    cwd: workspaceFolder.uri.path,
                });
                return commandResult.stdout;
            } catch (error) {
                throw new Error(
                    `Failed to run terminal command: ${input.command}: ${error}`,
                );
            }
        },
    },
];

export class ExperimentalToolHandler implements AgentHandler {
    constructor(
        private chatClient: Pick<ChatClient, "chat">,
        protected contextRetriever: Pick<
            ContextRetriever,
            "retrieveContext" | "computeDidYouMean"
        >,
        protected readonly editor: ChatControllerOptions["editor"],
    ) {}

    protected createToolMixin(tools: CodyTool[]): PromptMixin {
        // Extract instructions from each tool
        const toolInstructions = tools.map(
            (tool) =>
                `- ${tool.spec.name}: ${tool.spec.description}
             Input schema: ${JSON.stringify(tool.spec.input_schema)}`,
        );

        // Create the tool instruction prompt
        const toolPrompt = `
    You have access to the following tools:
    ${toolInstructions.join("\n")}

    When you need to use a tool, use the following format:
    <tool_call>
    {
      "name": "tool_name",
      "input": {
        "param1": "value1",
        "param2": "value2"
      }
    }
    </tool_call>

    Wait for the tool result before continuing.
    `;

        // Return as a prompt mixin
        return newPromptMixin(PromptString.unsafe_fromLLMResponse(toolPrompt));
    }

    protected async buildPrompt(
        prompter: DefaultPrompter,
        chatBuilder: ChatBuilder,
        abortSignal: AbortSignal,
        codyApiVersion: number,
        tools: CodyTool[],
    ): Promise<PromptInfo> {
        // Create mixins array, starting with any existing mixins
        const mixins: PromptMixin[] = [];

        // Add the tool mixin if we have tools
        if (tools.length > 0) {
            mixins.push(this.createToolMixin(tools));
        }
        const { prompt, context } = await prompter.makePrompt(
            chatBuilder,
            codyApiVersion,
            mixins,
        );

        abortSignal.throwIfAborted();
        chatBuilder.setLastMessageContext([
            ...context.used,
            ...context.ignored,
        ]);

        return { prompt, context };
    }

    protected async computeContext(
        _requestID: string,
        { text, mentions }: HumanInput,
        editorState: SerializedPromptEditorState | null,
        _chatBuilder: ChatBuilder,
        _delegate: AgentHandlerDelegate,
        signal?: AbortSignal,
        skipQueryRewrite = false,
    ): Promise<{
        contextItems?: ContextItem[];
        error?: Error;
        abort?: boolean;
    }> {
        try {
            return wrapInActiveSpan("chat.computeContext", async (span) => {
                const contextAlternatives = await computeContextAlternatives(
                    this.contextRetriever,
                    this.editor,
                    { text, mentions },
                    editorState,
                    span,
                    signal,
                    skipQueryRewrite,
                );
                return { contextItems: contextAlternatives[0].items };
            });
        } catch (e) {
            return {
                error: new Error(
                    `Unexpected error computing context, no context was used: ${e}`,
                ),
            };
        }
    }

    // Helper method to process messages of any type
    private processMessage(
        message: any,
        toolCalls: ToolCall[],
        subViewTranscript: SubMessage[],
        subTranscript: Array<MessageParam>,
        delegate: AgentHandlerDelegate,
        lastContent: string,
    ): void {
        let messageInProgress: SubMessage | undefined;

        switch (message.type) {
            case "change":
                if (message.text) {
                    messageInProgress = {
                        text: PromptString.unsafe_fromLLMResponse(message.text),
                    };
                    delegate.experimentalPostMessageInProgress([
                        ...subViewTranscript,
                        messageInProgress,
                    ]);

                    // Process any tool calls in the text if needed
                    this.processToolCalls(
                        message.text,
                        toolCalls,
                        subViewTranscript,
                    );
                }
                break;

            case "complete":
                // Add the final message to transcript if needed
                if (lastContent) {
                    subTranscript.push({
                        role: "assistant",
                        content: lastContent,
                    });
                }
                break;

            case "error":
                throw new Error(message.error.message);

            // Handle content block messages for backward compatibility
            case "contentBlock":
                if (message.contentBlock) {
                    const contentBlock = message.contentBlock;
                    switch (contentBlock.type) {
                        case "tool_use":
                            toolCalls.push({
                                id: contentBlock.id,
                                name: contentBlock.name,
                                input: contentBlock.input,
                            });
                            subViewTranscript.push({
                                step: {
                                    id: contentBlock.name,
                                    content: `Invoking tool ${contentBlock.name}(${JSON.stringify(
                                        contentBlock.input,
                                    )})`,
                                    state: "pending",
                                    type: ProcessType.Tool,
                                },
                            });
                            break;

                        case "text":
                            subViewTranscript.push({
                                text: PromptString.unsafe_fromLLMResponse(
                                    contentBlock.text,
                                ),
                            });
                            break;
                    }
                }
                break;

            // Handle Anthropic-specific message types
            case "content_block_start":
                if (message.content_block) {
                    const block = message.content_block;
                    if (block.type === "tool_use") {
                        toolCalls.push({
                            id: block.id,
                            name: block.name,
                            input: block.input,
                        });
                        subViewTranscript.push({
                            step: {
                                id: block.name,
                                content: `Invoking tool ${block.name}(${JSON.stringify(
                                    block.input,
                                )})`,
                                state: "pending",
                                type: ProcessType.Tool,
                            },
                        });
                    }
                }
                break;

            case "content_block_delta":
                if (message.delta?.text && message.id) {
                    messageInProgress = {
                        text: PromptString.unsafe_fromLLMResponse(
                            message.delta.text,
                        ),
                    };
                    delegate.experimentalPostMessageInProgress([
                        ...subViewTranscript,
                        messageInProgress,
                    ]);
                }
                break;

            case "content_block_stop":
                if (
                    message.content_block?.type === "text" &&
                    message.content_block?.text
                ) {
                    subViewTranscript.push({
                        text: PromptString.unsafe_fromLLMResponse(
                            message.content_block.text,
                        ),
                    });
                }
                break;

            // For any other message types, log them but don't process
            default:
                console.log("Unhandled message type:", message.type);
                break;
        }
    }

    // Helper method to extract tool calls from text
    private processToolCalls(
        text: string,
        toolCalls: ToolCall[],
        subViewTranscript: SubMessage[],
    ): void {
        // Look for tool_call format in the text: <tool_call>{ ... }</tool_call>
        const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
        let match = toolCallRegex.exec(text);

        while (match !== null) {
            try {
                const toolCallContent = match[1].trim();
                const toolCallData = JSON.parse(toolCallContent);

                if (toolCallData.name && toolCallData.input) {
                    const id = crypto.randomUUID();
                    toolCalls.push({
                        id,
                        name: toolCallData.name,
                        input: toolCallData.input,
                    });

                    subViewTranscript.push({
                        step: {
                            id: toolCallData.name,
                            content: `Invoking tool ${toolCallData.name}(${JSON.stringify(
                                toolCallData.input,
                            )})`,
                            state: "pending",
                            type: ProcessType.Tool,
                        },
                    });
                }
            } catch (e) {
                // Skip invalid tool call formats
                console.warn("Failed to parse tool call:", e);
            }
            match = toolCallRegex.exec(text);
        }
    }
    public async handle(
        {
            // requestID,
            inputText,
            mentions,
            editorState,
            signal,
            chatBuilder,
            // recorder,
            // span,
        }: AgentRequest,
        delegate: AgentHandlerDelegate,
    ): Promise<void> {
        const maxTurns = 10;
        let turns = 0;
        const content = inputText.toString().trim();
        if (!content) {
            throw new Error("Input text cannot be empty");
        }
        const subTranscript: Array<MessageParam> = [
            {
                role: "user",
                content,
            },
        ];
        const subViewTranscript: SubMessage[] = [];
        const toolCalls: ToolCall[] = [];

        // Track active content blocks by ID
        // const activeContentBlocks = new Map<
        //     string,
        //     { type: string; name?: string; text?: string }
        // >();
        // let messageInProgress: SubMessage | undefined;

        while (true) {
            toolCalls.length = 0; // Clear the array for each iteration
            try {
                const requestID = crypto.randomUUID();

                console.log(
                    "Debug - subTranscript before message creation:",
                    JSON.stringify(subTranscript),
                );
                // Validate subTranscript before creating message
                if (!subTranscript.length) {
                    console.error("Debug - subTranscript is empty");
                    throw new Error("subTranscript cannot be empty");
                }

                for (const msg of subTranscript) {
                    if (
                        !msg.content ||
                        (typeof msg.content === "string" && !msg.content.trim())
                    ) {
                        console.error(
                            "Debug - Found empty message in subTranscript:",
                            msg,
                        );
                        throw new Error("Found empty message in subTranscript");
                    }
                }

                console.log(
                    "Debug - subTranscript validation passed:",
                    JSON.stringify(subTranscript),
                );
                const message = [
                    {
                        speaker: "human" as const,
                        messages: subTranscript,
                        stream: true,
                        model: "anthropic::2023-06-01::claude-3.5-sonnet",
                        max_tokens: 8192,
                        tools: allTools.map((tool) => tool.spec),
                    },
                ];
                console.log(
                    "Debug - message being sent:",
                    JSON.stringify(message),
                );

                const contextResult = await this.computeContext(
                    requestID,
                    { text: inputText, mentions },
                    editorState,
                    chatBuilder,
                    delegate,
                    signal,
                );

                if (contextResult.error) {
                    delegate.postError(contextResult.error, "transcript");
                }
                if (contextResult.abort) {
                    delegate.postDone({ abort: contextResult.abort });
                    return;
                }
                const corpusContext = contextResult.contextItems ?? [];
                signal.throwIfAborted();

                const { explicitMentions, implicitMentions } =
                    getCategorizedMentions(corpusContext);
                const prompter = new DefaultPrompter(
                    explicitMentions,
                    implicitMentions,
                    false,
                );

                const versions = await currentSiteVersion();
                if (isError(versions)) {
                    delegate.postError(versions, "transcript");
                    return;
                }
                const { prompt } = await this.buildPrompt(
                    prompter,
                    chatBuilder,
                    signal,
                    versions.codyAPIVersion,
                    allTools,
                );

                const contextWindow = await firstResultFromOperation(
                    ChatBuilder.contextWindowForChat(chatBuilder),
                );

                const stream = await this.chatClient.chat(
                    prompt,
                    {
                        model: "anthropic::2023-06-01::claude-3.5-sonnet",
                        maxTokensToSample: contextWindow.output,
                    },
                    signal,
                    requestID,
                );
                let lastContent = "";

                console.log("Debug - stream created successfully");
                for await (const message of stream) {
                    // Handle message based on type
                    if (typeof message === "string") {
                        // Handle string messages by parsing them first
                        try {
                            const parsedMessage = JSON.parse(message);
                            this.processMessage(
                                parsedMessage,
                                toolCalls,
                                subViewTranscript,
                                subTranscript,
                                delegate,
                                lastContent,
                            );
                            if (
                                parsedMessage.type === "change" &&
                                parsedMessage.text
                            ) {
                                lastContent = parsedMessage.text;
                            }
                        } catch (e) {
                            // If can't parse as JSON, just log the error
                            console.error(
                                "Failed to parse message as JSON:",
                                e,
                            );
                        }
                    } else {
                        this.processMessage(
                            message,
                            toolCalls,
                            subViewTranscript,
                            subTranscript,
                            delegate,
                            lastContent,
                        );
                        if (message.type === "change" && message.text) {
                            lastContent = message.text;
                        }
                    }
                }

                if (toolCalls.length === 0) {
                    break;
                }

                // Process tool calls as before
                const toolResults: ToolResultBlockParam[] = [];
                for (const toolCall of toolCalls) {
                    console.log("Debug - Processing tool call:", toolCall);
                    const tool = allTools.find(
                        (tool) => tool.spec.name === toolCall.name,
                    );
                    if (!tool) {
                        console.error("Debug - Tool not found:", toolCall.name);
                        continue;
                    }

                    try {
                        const output = await tool.invoke(toolCall.input);
                        console.log("Debug - Tool output:", output);
                        if (!output?.trim()) {
                            console.warn(
                                "Debug - Empty tool output for:",
                                toolCall.name,
                            );
                            continue;
                        }
                        toolResults.push({
                            type: "tool_result",
                            tool_use_id: toolCall.id,
                            content: output,
                        });
                    } catch (error) {
                        console.error(
                            "Debug - Error invoking tool:",
                            toolCall.name,
                            error,
                        );
                    }
                }

                subTranscript.push({
                    role: "user",
                    content: toolResults,
                });

                turns++;
                if (turns > maxTurns) {
                    console.error("Max turns reached");
                    break;
                }
            } catch (e) {
                new Error(
                    `Unexpected error computing context, no context was used: ${e}`,
                );
            }
        }
        delegate.postDone();
    }
}

interface CommandOptions {
    cwd?: string;
    env?: Record<string, string>;
}

interface CommandResult {
    stdout: string;
    stderr: string;
    code: number | null;
    signal: NodeJS.Signals | null;
}

class CommandError extends Error {
    constructor(
        message: string,
        public readonly result: CommandResult,
    ) {
        super(message);
        this.name = "CommandError";
    }
}

async function runShellCommand(
    command: string,
    options: CommandOptions = {},
): Promise<CommandResult> {
    const { cwd = process.cwd(), env = process.env } = options;

    const timeout = 10_000;
    const maxBuffer = 1024 * 1024 * 10;
    const encoding = "utf8";
    const spawnOptions: SpawnOptions = {
        shell: true,
        cwd,
        env,
        windowsHide: true,
    };

    return new Promise((resolve, reject) => {
        const process = spawn(command, [], spawnOptions);

        let stdout = "";
        let stderr = "";
        let killed = false;
        const timeoutId = setTimeout(() => {
            killed = true;
            process.kill();
            reject(new Error(`Command timed out after ${timeout}ms`));
        }, timeout);

        let stdoutLength = 0;
        let stderrLength = 0;

        if (process.stdout) {
            process.stdout.on("data", (data: Buffer) => {
                const chunk = data.toString(encoding);
                stdoutLength += chunk.length;
                if (stdoutLength > maxBuffer) {
                    killed = true;
                    process.kill();
                    reject(new Error("stdout maxBuffer exceeded"));
                    return;
                }
                stdout += chunk;
            });
        }

        if (process.stderr) {
            process.stderr.on("data", (data: Buffer) => {
                const chunk = data.toString(encoding);
                stderrLength += chunk.length;
                if (stderrLength > maxBuffer) {
                    killed = true;
                    process.kill();
                    reject(new Error("stderr maxBuffer exceeded"));
                    return;
                }
                stderr += chunk;
            });
        }

        process.on("error", (error: Error) => {
            if (timeoutId) clearTimeout(timeoutId);
            reject(new Error(`Failed to start process: ${error.message}`));
        });

        process.on(
            "close",
            (code: number | null, signal: NodeJS.Signals | null) => {
                if (timeoutId) clearTimeout(timeoutId);
                if (killed) return;

                const result: CommandResult = {
                    stdout,
                    stderr,
                    code,
                    signal,
                };

                if (code === 0) {
                    resolve(result);
                } else {
                    reject(
                        new CommandError(
                            `Command failed with exit code ${code}${stderr ? ": " + stderr : ""}`,
                            result,
                        ),
                    );
                }
            },
        );
    });
}
