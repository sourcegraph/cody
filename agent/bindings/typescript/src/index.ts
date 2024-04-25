import * as cp from "node:child_process";
import * as rpc from "vscode-jsonrpc/node";

const childProcess = cp.spawn(

    "node", ["/Users/olafurpg/dev/sourcegraph/cody/agent/dist/index.js"]
);

// Use stdin and stdout for communication:
const connection = rpc.createMessageConnection(
    new rpc.StreamMessageReader(childProcess.stdout),
    new rpc.StreamMessageWriter(childProcess.stdin),
);

export interface ClientInfo {
    name: string;
    version: string;
    workspaceRootUri: string;

    /** @deprecated Use `workspaceRootUri` instead. */
    workspaceRootPath?: string;

    extensionConfiguration?: ExtensionConfiguration;
    capabilities?: ClientCapabilities;
}

export interface ExtensionConfiguration {
    serverEndpoint: string;
    proxy?: string | null;
    accessToken: string;
    customHeaders: Record<string, string>;

    /**
     * anonymousUserID is an important component of telemetry events that get
     * recorded. It is currently optional for backwards compatibility, but
     * it is strongly recommended to set this when connecting to Agent.
     */
    anonymousUserID?: string;

    autocompleteAdvancedProvider?: string;
    autocompleteAdvancedModel?: string | null;
    debug?: boolean;
    verboseDebug?: boolean;
    codebase?: string;

    customConfiguration?: Record<string, any>;
}

// The capability should match the name of the JSON-RPC methods.
interface ClientCapabilities {
    completions?: "none";
    //  When 'streaming', handles 'chat/updateMessageInProgress' streaming notifications.
    chat?: "none" | "streaming";
    git?: "none" | "disabled";
    // If 'enabled', the client must implement the progress/start,
    // progress/report, and progress/end notification endpoints.
    progressBars?: "none" | "enabled";
    edit?: "none" | "enabled";
    editWorkspace?: "none" | "enabled";
    untitledDocuments?: "none" | "enabled";
    showDocument?: "none" | "enabled";
    codeLenses?: "none" | "enabled";
    showWindowMessage?: "notification" | "request";
    ignore?: "none" | "enabled";
}

export interface ServerInfo {
    name: string;
    authenticated?: boolean;
    codyEnabled?: boolean;
    codyVersion?: string | null;
    authStatus?: AuthStatus;
}

export interface AuthStatus {
    username: string;
    endpoint: string | null;
    isDotCom: boolean;
    isLoggedIn: boolean;
    showInvalidAccessTokenError: boolean;
    authenticated: boolean;
    hasVerifiedEmail: boolean;
    requiresVerifiedEmail: boolean;
    siteHasCodyEnabled: boolean;
    siteVersion: string;
    codyApiVersion: number;
    showNetworkError?: boolean;
    primaryEmail: string;
    displayName?: string;
    avatarURL: string;
    userCanUpgrade: boolean;
}

const initialize = new rpc.RequestType<ClientInfo, ServerInfo, void>(
    "initialize",
);

async function main(): Promise<void> {
    connection.listen();
    const clientInto: ClientInfo = {
        name: "cody",
        version: "0.0.0",
        workspaceRootUri: "file:///Users/olafurpg/dev/sourcegraph/cody",
        extensionConfiguration: {
            accessToken: process.env.SRC_ACCESS_TOKEN ?? "invalid",
            serverEndpoint: process.env.SRC_NDPOINT ?? "invalid",
            customHeaders: {},
        },
    };
    const serverInfo = await connection.sendRequest(initialize, clientInto);
    console.log({ serverInfo });
}

main().catch((error) => {
    console.log(error);
});
