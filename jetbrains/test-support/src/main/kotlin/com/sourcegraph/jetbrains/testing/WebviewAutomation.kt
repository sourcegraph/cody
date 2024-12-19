package com.sourcegraph.jetbrains.testing

import com.intellij.openapi.components.service
import com.intellij.ui.jcef.JBCefBrowser
import com.sourcegraph.jetbrains.testing.shared.WebviewSink

class WebviewAutomation : WebviewSink {
    override fun didCreateBrowser(viewType: String, browser: JBCefBrowser) {
        service<ChromeDevToolsProtocolForwarder>().didCreateBrowser(viewType, browser)
    }
}
