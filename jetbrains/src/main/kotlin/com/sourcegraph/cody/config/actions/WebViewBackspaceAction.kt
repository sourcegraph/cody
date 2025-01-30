package com.sourcegraph.cody.config.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.sourcegraph.common.ui.DumbAwareEDTAction
import com.intellij.openapi.diagnostic.Logger

private val logger = Logger.getInstance(WebViewBackspaceAction::class.java)

class WebViewBackspaceAction : DumbAwareEDTAction() {
    override fun actionPerformed(e: AnActionEvent) {
    }

    override fun update(e: AnActionEvent) {
        // Only enable this in webview context
        e.presentation.isEnabledAndVisible = false
    }
}