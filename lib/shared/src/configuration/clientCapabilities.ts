import { type ClientConfiguration, CodyIDE } from '../configuration'

/**
 * The capabilities of the client, such as the editor that Cody is being used with (directly for VS
 * Code or via the agent for other editors) or the CLI.
 */
export interface ClientCapabilities {
    /**
     * The `agentIDE` value, which is the editor that Cody is being used with. If not set, it
     * defaults to {@link CodyIDE.VSCode} to match the previous behavior.
     *
     * @deprecated Use one of the other {@link ClientCapabilities} fields instead to assert based on
     * the client's actual capabilities at runtime and not your assumptions about their current
     * capabilities, and to support future clients that are not in the {@link CodyIDE} enum. If you
     * are truly interested in whether the editor is VS Code, such as to use the right link to
     * documentation or describe the VS Code user interface, then it is OK to use this field.
     */
    agentIDE: CodyIDE

    /**
     * @deprecated For the same reason as {@link ClientCapabilities.agentIDE}.
     */
    isVSCode: boolean

    /**
     * @deprecated For the same reason as {@link ClientCapabilities.agentIDE}.
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
 * Get the {@link ClientCapabilities} for the current client.
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
export function clientCapabilities(): ClientCapabilities {
    if (_mockValue) {
        return _mockValue
    }
    if (!_configuration) {
        throw new Error(
            'clientCapabilities called before configuration was set with setClientCapabilitiesFromConfiguration'
        )
    }
    return {
        agentIDE: _configuration.agentIDE ?? CodyIDE.VSCode,
        isVSCode: !_configuration.agentIDE || _configuration.agentIDE === CodyIDE.VSCode,
        isCodyWeb: _configuration.agentIDE === CodyIDE.Web,
        agentExtensionVersion: _configuration.agentExtensionVersion ?? _extensionVersion,
        agentIDEVersion: _configuration.agentIDEVersion,
        telemetryClientName: _configuration.telemetryClientName,
    }
}

let _configuration:
    | Pick<
          ClientConfiguration,
          'agentExtensionVersion' | 'agentIDE' | 'agentIDEVersion' | 'telemetryClientName'
      >
    | undefined

/**
 * Set the {@link ClientCapabilities} value from the {@link ResolvedConfiguration.configuration}.
 */
export function setClientCapabilitiesFromConfiguration(
    configuration: NonNullable<typeof _configuration>
): void {
    _configuration = configuration
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

let _mockValue: ClientCapabilities | undefined

/**
 * Mock the {@link clientCapabilities} result.
 *
 * For use in tests only.
 */
export function mockClientCapabilities(value: ClientCapabilities | undefined): void {
    _mockValue = value
}

export const CLIENT_CAPABILITIES_FIXTURE: ClientCapabilities = {
    agentIDE: CodyIDE.VSCode,
    isVSCode: true,
    isCodyWeb: false,
    agentExtensionVersion: '1.2.3',
    agentIDEVersion: '4.5.6',
}
