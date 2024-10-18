import type { Meta, StoryObj } from '@storybook/react'

import {
    type ClientCapabilitiesWithLegacyFields,
    CodyIDE,
    type LegacyWebviewConfig,
} from '@sourcegraph/cody-shared'
import { ExtensionAPIProviderForTestsOnly, MOCK_API } from '@sourcegraph/prompt-editor'
import { Observable } from 'observable-fns'
import type { ComponentProps } from 'react'
import { AuthPage } from './AuthPage'
import { VSCodeWebview } from './storybook/VSCodeStoryDecorator'
import type { VSCodeWrapper } from './utils/VSCodeApi'

const vscodeAPI: VSCodeWrapper = {
    postMessage: () => {},
    onMessage: () => () => {},
    getState: () => ({}),
    setState: () => {},
}

const meta: Meta<
    ComponentProps<typeof AuthPage> & { clientCapabilities: ClientCapabilitiesWithLegacyFields }
> = {
    title: 'cody/AuthPage',
    component: AuthPage,
    decorators: [VSCodeWebview],
    args: {
        simplifiedLoginRedirect: () => {},
        uiKindIsWeb: false,
        vscodeAPI: vscodeAPI,
    },
    render: args => (
        <ExtensionAPIProviderForTestsOnly
            value={{
                ...MOCK_API,
                legacyConfig: () =>
                    Observable.of({
                        config: {} as any,
                        clientCapabilities: args.clientCapabilities,
                    } satisfies Partial<LegacyWebviewConfig> as LegacyWebviewConfig),
            }}
        >
            <AuthPage {...args} />
        </ExtensionAPIProviderForTestsOnly>
    ),
}

export default meta

type Story = StoryObj<typeof meta>

export const VSCodeDesktop: Story = {
    args: {
        uiKindIsWeb: false,
        clientCapabilities: { agentIDE: CodyIDE.VSCode, isVSCode: true, isCodyWeb: false },
    },
}

export const VSCodeWeb: Story = {
    args: {
        uiKindIsWeb: true,
        clientCapabilities: { agentIDE: CodyIDE.VSCode, isVSCode: true, isCodyWeb: false },
    },
}

export const SourcegraphWeb: Story = {
    args: {
        uiKindIsWeb: true,
        clientCapabilities: { agentIDE: CodyIDE.Web, isVSCode: false, isCodyWeb: true },
    },
}

export const JetBrainsDesktop: Story = {
    args: {
        uiKindIsWeb: false,
        clientCapabilities: { agentIDE: CodyIDE.JetBrains, isVSCode: false, isCodyWeb: false },
    },
}
