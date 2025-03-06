import { FIXTURE_MODELS } from '@sourcegraph/cody-shared'
import { render as render_ } from '@testing-library/react'
import React from 'react'
import { describe, expect, test, vi } from 'vitest'
import { AppWrapperForTest } from '../AppWrapperForTest'
import { FIXTURE_USER_ACCOUNT_INFO } from '../chat/fixtures'
import { TabsBar } from './TabsBar'
import { View } from './types'

// Mock VSCodeAPI
vi.mock('../utils/VSCodeApi', () => ({
    getVSCodeAPI: vi.fn().mockReturnValue({
        postMessage: vi.fn(),
        onMessage: vi.fn(),
    }),
}))

// Mock the useExtensionAPI hook if needed
vi.mock('@sourcegraph/prompt-editor', async importOriginal => {
    // Import the original module to get the real ExtensionAPIProviderForTestsOnly
    const original = await importOriginal<typeof import('@sourcegraph/prompt-editor')>()

    return {
        ...original,
        // Mock the specific functions we need to override
        PromptEditorConfigProvider: ({ children }: { children: React.ReactNode }) => children,
        useExtensionAPI: vi.fn().mockReturnValue({
            setChatModel: vi.fn().mockReturnValue({
                subscribe: vi.fn(callback => callback()),
            }),
        }),
    }
})

// Mock the useClientConfig hook
vi.mock('../utils/useClientConfig', () => ({
    useClientConfig: vi.fn().mockReturnValue({
        modelsAPIEnabled: true,
    }),
}))

// Mock Tooltip components
vi.mock('../components/shadcn/ui/tooltip', async () => {
    const Tooltip = ({ children }: { children: React.ReactNode }) => <>{children}</>
    
    const TooltipTrigger = React.forwardRef<HTMLSpanElement, { 
        children: React.ReactNode; 
        asChild?: boolean;
        [key: string]: any;
    }>(({ children, asChild, ...props }, ref) => <span ref={ref}>{children}</span>)
    
    const TooltipContent = React.forwardRef<HTMLDivElement, {
        children: React.ReactNode;
        [key: string]: any;
    }>(({ children, ...props }, ref) => <div ref={ref}>{children}</div>)
    
    const TooltipProvider = ({ children, disableHoverableContent, delayDuration }: { 
        children: React.ReactNode;
        disableHoverableContent?: boolean;
        delayDuration?: number;
    }) => <>{children}</>
    
    return {
        Tooltip,
        TooltipTrigger,
        TooltipContent,
        TooltipProvider,
    }
})

// Mock Popover components
vi.mock('../components/shadcn/ui/popover', () => {
    const Popover = ({ children, open, onOpenChange, defaultOpen }: { 
        children: React.ReactNode; 
        open?: boolean; 
        onOpenChange?: (open: boolean) => void; 
        defaultOpen?: boolean 
    }) => <>{children}</>
    
    const PopoverTrigger = React.forwardRef<HTMLSpanElement, {
        children: React.ReactNode; 
        asChild?: boolean;
        [key: string]: any;
    }>(({ children, asChild, ...props }, ref) => <span ref={ref}>{children}</span>)
    
    // Using forwardRef to avoid the warning about refs on function components
    const PopoverContent = React.forwardRef<HTMLDivElement, {
        children: React.ReactNode; 
        align?: string; 
        onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
        [key: string]: any;
    }>(({ 
        children, 
        align, 
        onKeyDown, 
        ...props 
    }, ref) => <div ref={ref}>{children}</div>)
    
    return {
        Popover,
        PopoverTrigger,
        PopoverContent,
    }
})

// Mock Radix UI's Tabs component if needed
vi.mock('@radix-ui/react-tabs', () => {
    const TabsRoot = ({
        children,
        defaultValue,
    }: { children: React.ReactNode; defaultValue: string }) => (
        <div data-testid="mocked-tabs" data-default-value={defaultValue}>
            {children}
        </div>
    )
    const TabsList = ({ children }: { children: React.ReactNode }) => (
        <div data-testid="mocked-tabs-list">{children}</div>
    )
    const TabsTrigger = ({ children, value, asChild }: { children: React.ReactNode; value: string; asChild?: boolean }) => (
        <div data-testid="mocked-tabs-trigger" data-value={value}>
            {children}
        </div>
    )
    const TabsContent = ({ children, value }: { children: React.ReactNode; value: string }) => (
        <div data-testid="mocked-tabs-content" data-value={value}>
            {children}
        </div>
    )
    // Assign nested components to the main Tabs component
    TabsRoot.List = TabsList
    TabsRoot.Trigger = TabsTrigger
    TabsRoot.Content = TabsContent

    // Return both the main component and individual exports
    return {
        Tabs: TabsRoot,
        Root: TabsRoot,
        List: TabsList,
        Trigger: TabsTrigger,
        Content: TabsContent,
    }
})

function render(element: JSX.Element) {
    return render_(element, { wrapper: AppWrapperForTest })
}

describe('TabsBar', () => {
    test('renders with model selector', () => {
        const setView = vi.fn()

        const { container } = render(
            <TabsBar
                models={FIXTURE_MODELS}
                user={FIXTURE_USER_ACCOUNT_INFO}
                currentView={View.Chat}
                setView={setView}
                endpointHistory={[]}
            />
        )

        // Check if the TabsBar is rendered
        expect(container.querySelector('[class*="tabsRoot"]')).not.toBeNull()

        // Check if the model selector is rendered
        const modelSelector = container.querySelector('[data-testid="chat-model-selector"]')
        expect(modelSelector).not.toBeNull()

        // Check if the current model title is displayed
        expect(modelSelector?.textContent).toContain(FIXTURE_MODELS[0].title)
    })
})
