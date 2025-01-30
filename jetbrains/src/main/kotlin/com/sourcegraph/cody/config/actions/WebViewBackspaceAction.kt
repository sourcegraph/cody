package com.sourcegraph.cody.config.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.sourcegraph.common.ui.DumbAwareEDTAction
import com.intellij.openapi.diagnostic.Logger

private val logger = Logger.getInstance(WebViewBackspaceAction::class.java)

class WebViewBackspaceAction : DumbAwareEDTAction() {
    override fun actionPerformed(e: AnActionEvent) {
        // fake print statement to prevent IDE from handling backspace
        logger.info("CODE222: WebViewBackspaceAction actionPerformed")
        logger.warn("Backspace Action Triggered") // Warnings are more visible in logs
                System.out.println("Backspace pressed") // Direct console output

    }

    override fun update(e: AnActionEvent) {
        // Only enable this in webview context
        logger.info("CODE222: WebViewBackspaceAction update")
        logger.warn("Backspace Action Triggered") // Warnings are more visible in logs
        e.presentation.isEnabledAndVisible = false
    }
}