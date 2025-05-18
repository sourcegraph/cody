import { createController } from '@openctx/vscode-lib'
import { Agent } from '@sourcegraph/cody/src/agent'
import { CommandsProvider } from 'cody-ai/src/commands/services/provider'
import { createActivation } from 'cody-ai/src/extension.web'
import {
    BrowserMessageReader,
    BrowserMessageWriter,
    createMessageConnection,
} from 'vscode-jsonrpc/browser'
import { IndexDBStorage } from './index-db-storage'
// Import will be used when we need logging functionality
// import { withLogging } from './debug-message-logging'

const conn = createMessageConnection(new BrowserMessageReader(self), new BrowserMessageWriter(self))

const isDemo = self.name === 'demo'
const isSafari = self.navigator.userAgent.toLowerCase().includes('safari')

const agent = new Agent({
    conn,
    extensionActivate: createActivation({
        // Since agent is running within web-worker web sentry service will fail
        // since it relies on DOM API which is not available in web-worker
        createSentryService: undefined,

        // Workaround for IndexDBStorage bug which fail ąto initialize in Safari
        createStorage: isDemo && isSafari ? undefined : () => IndexDBStorage.create(),

        createCommandsProvider: () => new CommandsProvider(),

        // Import createController from openctx lib synchronously because
        // dynamic import don't work in web worker when we use it in direct
        // consumer like Sourcegraph repo. Pass it as platform context
        // because sync import breaks agent logic for other clients
        createOpenCtxController: createController,
    }),
})

agent.registerNotification('debug/message', params => {
    console.error(`debug/message: ${params.channel}: ${params.message}`)
})

// For debugging: Add transformer to inject thinking content into messages
// This helps test whether our thinking content extraction works

// Set to true to enable debug injection of thinking content
const ENABLE_THINKING_CONTENT_INJECTION = true;

if (ENABLE_THINKING_CONTENT_INJECTION) {
    console.log('Agent worker: Enabling thinking content injection for testing')
    const originalOnMessage = conn.onMessage
    conn.onMessage = handler => {
    return originalOnMessage(message => {
        // Only process transcript messages
        if (typeof message === 'object' && message && message.method === 'transcript/update') {
            const params = message.params
            if (params?.messages?.length > 0) {
                console.log('Agent worker: intercepting transcript message', params)
                
                // Look for assistant messages in progress
                if (params.isMessageInProgress) {
                    const lastMsgIndex = params.messages.length - 1
                    const lastMsg = params.messages[lastMsgIndex]
                    
                    // Check if this is an assistant message that should have thinking content
                    if (lastMsg && lastMsg.speaker === 'assistant') {
                        console.log('Agent worker: found assistant message, checking for thinking content')
                        
                        // If text property exists
                        if (lastMsg.text) {
                            // Only inject if there's no thinking content already
                            if (!lastMsg.text.includes('<think>')) {
                                console.log('Agent worker: injecting thinking content to text property')
                                
                                // Inject thinking tags at the beginning
                                const thinkText = '<think>This is injected thinking content to test the thinking UI. I am analyzing the request and formulating a response.</think> '
                                lastMsg.text = thinkText + lastMsg.text
                                
                                console.log('Agent worker: modified message text', lastMsg.text)
                            }
                        } 
                        // If text property doesn't exist, create it
                        else {
                            console.log('Agent worker: message has no text property, creating one with thinking content')
                            
                            // Create text property with thinking content
                            const thinkText = '<think>This is injected thinking content for a message without text property. I am analyzing the request and formulating a response.</think> '
                            const responseText = 'This is a test response for thinking content display.'
                            
                            // Set the text property
                            lastMsg.text = thinkText + responseText
                            
                            console.log('Agent worker: created text property with thinking content', lastMsg.text)
                        }
                    }
                }
            }
        }
        
        // Pass the possibly modified message to the original handler
        handler(message)
    })
  }
}

conn.listen()
