import React from 'react'

import ReactDOM from 'react-dom/client'

import { AppWrapper } from '../../vscode/webviews/AppWrapper'
import { App } from './App'

import './index.css'

ReactDOM.createRoot(document.querySelector('#root') as HTMLElement).render(
    <React.StrictMode>
        <AppWrapper>
            <App />
        </AppWrapper>
    </React.StrictMode>
)
