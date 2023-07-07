import React from 'react'

import ReactDOM from 'react-dom/client'

import { languagePromptMixin, PromptMixin } from '@sourcegraph/cody-shared/src/prompt/prompt-mixin'

import { App } from './App'

import './index.css'

PromptMixin.add(languagePromptMixin(navigator.language))
ReactDOM.createRoot(document.querySelector('#root') as HTMLElement).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
)
