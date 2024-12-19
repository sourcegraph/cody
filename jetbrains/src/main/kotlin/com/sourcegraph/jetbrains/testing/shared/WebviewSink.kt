package com.sourcegraph.jetbrains.testing.shared

import com.intellij.ui.jcef.JBCefBrowser

interface WebviewSink {
    fun didCreateBrowser(viewType: String, browser: JBCefBrowser)
}
