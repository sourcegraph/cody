import './autoedit-debug/autoedit-debug.css'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import type {
    AutoeditDebugMessageFromExtension,
    VSCodeAutoeditDebugWrapper,
} from '../src/autoedits/debug-panel/debug-protocol'
import type { AutoeditRequestDebugState } from '../src/autoedits/debug-panel/debug-store'

import { AutoeditDebugPanel } from './autoedit-debug/AutoeditDebugPanel'
import { getVSCodeAPI } from './utils/VSCodeApi'

/**
 * Transforms array-formatted VS Code Range objects back into proper Range objects with start and end properties.
 *
 * @param obj The object to transform, which may contain Range objects that were converted to arrays.
 * @returns A new object with any Range arrays converted back to objects with start and end properties.
 */
function transformRanges(obj: any): any {
    if (obj === null || obj === undefined) {
        return obj
    }

    if (Array.isArray(obj)) {
        // Check if it's a serialized Range in the format [{"line":1,"character":0},{"line":1,"character":4}]
        if (
            obj.length === 2 &&
            typeof obj[0] === 'object' &&
            obj[0] !== null &&
            'line' in obj[0] &&
            'character' in obj[0] &&
            typeof obj[1] === 'object' &&
            obj[1] !== null &&
            'line' in obj[1] &&
            'character' in obj[1]
        ) {
            return {
                start: { line: obj[0].line, character: obj[0].character },
                end: { line: obj[1].line, character: obj[1].character },
            }
        }
        // Otherwise, process each element of the array
        return obj.map(item => transformRanges(item))
    }

    if (typeof obj === 'object') {
        const result: Record<string, any> = {}
        for (const key in obj) {
            result[key] = transformRanges(obj[key])
        }
        return result
    }

    return obj
}

const vscode = getVSCodeAPI() as unknown as VSCodeAutoeditDebugWrapper

function App() {
    const [entries, setEntries] = useState<AutoeditRequestDebugState[]>([])

    useEffect(() => {
        // Listen for messages from VS Code
        const handleMessage = (event: MessageEvent) => {
            const message = event.data as AutoeditDebugMessageFromExtension
            if (message.type === 'updateEntries') {
                // Transform any Range arrays back to objects with start and end properties
                const processedEntries = message.entries.map(entry => transformRanges(entry))

                // Sort entries by updatedAt in descending order (newest first)
                const sortedEntries = [...processedEntries].sort((a, b) => b.updatedAt - a.updatedAt)
                setEntries(sortedEntries)
            }
        }

        window.addEventListener('message', handleMessage)

        // Request initial data
        vscode.postMessage({ type: 'ready' })

        return () => {
            window.removeEventListener('message', handleMessage)
        }
    }, [])

    return (
        <div className="tw-h-full tw-w-full tw-p-4">
            <AutoeditDebugPanel entries={entries} />
        </div>
    )
}

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
