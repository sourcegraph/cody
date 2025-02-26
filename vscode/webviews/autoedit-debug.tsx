import './autoedit-debug/autoedit-debug.css'
import { createRoot } from 'react-dom/client'
import { AutoeditDebugContent } from './autoedit-debug/AutoeditDebugContent'
import { getVSCodeAPI } from './utils/VSCodeApi'

import type {
    AutoeditDebugMessageFromExtension,
    VSCodeAutoeditDebugWrapper,
} from '../src/autoedits/debugging/debug-protocol'

const vscode = getVSCodeAPI() as unknown as VSCodeAutoeditDebugWrapper

// Create a React root and render initial component
const root = document.getElementById('root')
if (root) {
    const reactRoot = createRoot(root)

    // Initialize with empty entries
    reactRoot.render(<AutoeditDebugContent entries={[]} />)

    // Setup message handler to receive updated entries
    window.addEventListener('message', event => {
        const message = event.data as AutoeditDebugMessageFromExtension
        if (message.type === 'updateEntries') {
            reactRoot.render(<AutoeditDebugContent entries={message.entries} />)
        }
    })

    // Tell the extension we're ready to receive data
    vscode.postMessage({ type: 'ready' })
}
