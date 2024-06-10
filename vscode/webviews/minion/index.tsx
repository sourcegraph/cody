import React from 'react'

import ReactDOM from 'react-dom/client'

import '../index.css'

import { getGenericVSCodeAPI } from '../utils/VSCodeApi'
import { MinionApp } from './MinionApp'
import type { MinionExtensionMessage, MinionWebviewMessage } from './webview_protocol'

ReactDOM.createRoot(document.querySelector('#root') as HTMLElement).render(
    <React.StrictMode>
        <MinionApp vscodeAPI={getGenericVSCodeAPI<MinionWebviewMessage, MinionExtensionMessage>()} />
    </React.StrictMode>
)
