package com.sourcegraph.jetbrains.testing

import com.intellij.openapi.components.service
import com.intellij.ui.jcef.JBCefBrowser
import com.sourcegraph.jetbrains.testing.shared.WebviewSink

class WebviewAutomation : WebviewSink {
    override fun didCreateBrowser(viewType: String, browser: JBCefBrowser) {
        // TODO: Restore this when we are not examining the native webview on the wire.
        // service<ChromeDevToolsProtocolForwarder>().didCreateBrowser(viewType, browser)
    }
}
