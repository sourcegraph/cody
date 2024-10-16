import { type ClientConfiguration, CodyIDE } from '../configuration'
import type { ContextMentionProviderID } from '../mentions/api'

/**
 * The capabilities of the client, such as the editor that Cody is being used with (directly for VS
 * Code or via the agent for other editors) or the CLI.
 *
 * The "legacy fields" this refers to are the fields like
 * {@link ClientCapabilitiesWithLegacyFields.agentIDE} that are inferred in an ad-hoc way from the
 * environment and aren't self-reported by the client.
 */
export interface ClientCapabilitiesWithLegacyFields {
    /**
     * The `agentIDE` value, which is the editor that Cody is being used with. If not set, it
     * defaults to {@link CodyIDE.VSCode} to match the previous behavior.
     *
     * @deprecated Use one of the other {@link ClientCapabilitiesWithLegacyFields} fields instead to
     * assert based on the client's actual capabilities at runtime and not your assumptions about
     * their current capabilities, and to support future clients that are not in the {@link CodyIDE}
     * enum. If you are truly interested in whether the editor is VS Code, such as to use the right
     * link to documentation or describe the VS Code user interface, then it is OK to use this
     * field.
     */
    agentIDE: CodyIDE

    /**
     * @deprecated For the same reason as {@link ClientCapabilitiesWithLegacyFields.agentIDE}.
     */
    isVSCode: boolean

    /**
     * @deprecated For the same reason as {@link ClientCapabilitiesWithLegacyFields.agentIDE}.
     */
    isCodyWeb: boolean

    /**
     * The `agentExtensionVersion` value, which is the version of Cody that is being used in the
     * agent (if set).
     *
     * @deprecated Be careful when using this. It is NOT set if using VS Code, and you need to use
     * the `/vscode/src/version.ts` module's `version` export. Soon this {@link ClientConfiguration}
     * value will expose that.
     */
    agentExtensionVersion?: string

    /**
     * The `agentIDEVersion` value, which is the version of the client editor (if set).
     */
    agentIDEVersion?: string

    /**
     * The `telemetryClientName` value, which if set should be used instead of a synthesized client
     * name when sending telemetry.
     */
    telemetryClientName?: string
}

/**
 * The capabilities of the client. The field names should match the names of the JSON-RPC methods in
 * the agent protocol.
 */
export interface ClientCapabilities {
    authentication?: 'enabled' | 'none' | undefined | null
    completions?: 'none' | undefined | null

    /**
     * When 'streaming', handles 'chat/updateMessageInProgress' streaming notifications.
     */
    chat?: 'none' | 'streaming' | undefined | null

    /**
     * TODO: allow clients to implement the necessary parts of the git extension.
     * https://github.com/sourcegraph/cody/issues/4165
     */
    git?: 'none' | 'enabled' | undefined | null

    /**
     * If 'enabled', the client must implement the progress/start, progress/report, and progress/end
     * notification endpoints.
     */
    progressBars?: 'none' | 'enabled' | undefined | null

    edit?: 'none' | 'enabled' | undefined | null
    editWorkspace?: 'none' | 'enabled' | undefined | null
    untitledDocuments?: 'none' | 'enabled' | undefined | null
    showDocument?: 'none' | 'enabled' | undefined | null
    codeLenses?: 'none' | 'enabled' | undefined | null
    showWindowMessage?: 'notification' | 'request' | undefined | null
    ignore?: 'none' | 'enabled' | undefined | null
    codeActions?: 'none' | 'enabled' | undefined | null
    disabledMentionsProviders?: ContextMentionProviderID[] | undefined | null

    /**
     * When 'object-encoded' (default), the server uses the `webview/postMessage` method to send
     * structured JSON objects.  When 'string-encoded', the server uses the
     * `webview/postMessageStringEncoded` method to send a JSON-encoded string. This is convenient
     * for clients that forward the string directly to an underlying webview container.
     */
    webviewMessages?: 'object-encoded' | 'string-encoded' | undefined | null

    /**
     * How to deal with vscode.ExtensionContext.globalState.
     * - Stateless: the state does not persist between agent processes. This means the client is
     *   responsible for features like managing chat history.
     * - Server managed: the server reads and writes the state without informing the client. The
     *   client can optionally customize the file path of the JSON config via
     *   `ClientInfo.globalStatePath: string`
     * - Client managed: not implemented yet. When implemented, clients will be able to implement a
     *   JSON-RPC request to handle the saving of the client state. This is needed to safely share
     *   state between concurrent agent processes (assuming there is one IDE client process managing
     *   multiple agent processes).
     */
    globalState?: 'stateless' | 'server-managed' | 'client-managed' | undefined | null

    /**
     * Secrets controls how the agent should handle storing secrets.
     * - Stateless: the secrets are not persisted between agent processes.
     * - Client managed: the client must implement the 'secrets/get', 'secrets/store', and
     *   'secrets/delete' requests.
     */
    secrets?: 'stateless' | 'client-managed' | undefined | null

    /**
     * Whether the client supports the VSCode WebView API. If 'agentic', uses AgentWebViewPanel
     * which just delegates bidirectional postMessage over the Agent protocol. If 'native',
     * implements a larger subset of the VSCode WebView API and expects the client to run web
     * content in the webview, which effectively means both sidebar and custom editor chat views are
     * supported. Defaults to 'agentic'.
     */
    webview?: 'agentic' | 'native' | undefined | null

    /**
     * If webview === 'native', describes how the client has configured webview resources.
     */
    webviewNativeConfig?: WebviewNativeConfig | undefined | null
}

export interface WebviewNativeConfig {
    /**
     * Set the view to 'single' when the client only supports a single chat view (e.g. sidebar
     * chat).
     */
    view: 'multiple' | 'single'

    /**
     * cspSource is passed to the extension as the Webview cspSource property.
     */
    cspSource?: string

    /**
     * webviewBundleServingPrefix is prepended to resource paths under 'dist' in
     * asWebviewUri (note, multiple prefixes are not yet implemented.)
     */
    webviewBundleServingPrefix?: string | undefined | null

    /**
     * When true, resource paths are not relativized, and the client must
     * handle serving the resources relative to the webview.
     */
    skipResourceRelativization?: boolean | undefined | null

    /**
     * Script to be injected into the webview.
     */
    injectScript?: string | undefined | null

    /**
     * Style to be injected into the webview.
     */
    injectStyle?: string | undefined | null
}

/**
 * Get the {@link ClientCapabilitiesWithLegacyFields} for the current client.
 *
 * This is the only place you should fetch these values. Previously, there were many ways that the
 * logic for determining client capabilities was implemented, and you needed to remember that none
 * of the values were set for VS Code and apply the right default. That was error-prone. The
 * solution is this centralized accessor for the client capabilities.
 *
 * The return value does not change. However, it is only available after the configuration has been
 * set, and this function throws if it's not available. This means that it can't be used at
 * initialization time.
 */
export function clientCapabilities(): ClientCapabilitiesWithLegacyFields {
    if (_mockValue) {
        return _mockValue
    }
    if (!_value) {
        throw new Error(
            'clientCapabilities called before configuration was set with setClientCapabilitiesFromConfiguration'
        )
    }
    return {
        ..._value.agentCapabilities,
        agentIDE: _value.configuration.agentIDE ?? CodyIDE.VSCode,
        isVSCode: !_value.configuration.agentIDE || _value.configuration.agentIDE === CodyIDE.VSCode,
        isCodyWeb: _value.configuration.agentIDE === CodyIDE.Web,
        agentExtensionVersion: _value.configuration.agentExtensionVersion ?? _extensionVersion,
        agentIDEVersion: _value.configuration.agentIDEVersion,
        telemetryClientName: _value.configuration.telemetryClientName,
    }
}

let _value:
    | {
          configuration: Pick<
              ClientConfiguration,
              'agentExtensionVersion' | 'agentIDE' | 'agentIDEVersion' | 'telemetryClientName'
          >
          agentCapabilities: ClientCapabilities | undefined
      }
    | undefined

/**
 * Set the {@link ClientCapabilitiesWithLegacyFields} value from the
 * {@link ResolvedConfiguration.configuration} and the agent's
 * {@link ClientCapabilitiesWithLegacyFields}.
 *
 * Unlike the other global observables (such as {@link resolvedConfig} and {@link authStatus}), this
 * value does not change over the lifetime of the process, so we do not need to use an observable
 * here.
 */
export function setClientCapabilities(value: NonNullable<typeof _value>): void {
    _value = value
}

let _extensionVersion: string | undefined

/**
 * Set the extension version number, which is the version of Cody that is being used. This is the VS
 * Code extension version if running in VS Code, or else the `vscode/package.json` version number.
 * It must be set externally because this package is not able to determine the VS Code runtime
 * extension version, which is the only way to handle pre-release versions properly.
 */
export function setExtensionVersion(version: string): void {
    _extensionVersion = version
}

let _mockValue: ClientCapabilitiesWithLegacyFields | undefined

/**
 * Mock the {@link clientCapabilities} result.
 *
 * For use in tests only.
 */
export function mockClientCapabilities(value: ClientCapabilitiesWithLegacyFields | undefined): void {
    _mockValue = value
}

export const CLIENT_CAPABILITIES_FIXTURE: ClientCapabilitiesWithLegacyFields = {
    agentIDE: CodyIDE.VSCode,
    isVSCode: true,
    isCodyWeb: false,
    agentExtensionVersion: '1.2.3',
    agentIDEVersion: '4.5.6',
}
