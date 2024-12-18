package com.sourcegraph.jetbrains.testing

import com.intellij.openapi.application.EDT
import com.intellij.openapi.application.invokeLater
import com.intellij.ui.jcef.JBCefBrowser
import com.sourcegraph.jetbrains.testing.shared.WebviewSink
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class WebviewAutomation : WebviewSink {
    override fun didCreateBrowser(browser: JBCefBrowser) {
        // Store a weak reference to the browser.
        // Configure CDP
        println("*** created a browser $browser")
        invokeLater {
            checkDevTools(browser)
        }
    }

    var openedDevtools = false

    // Example flow for connecting to DevTools:
    // - Wait for cefBrowser.devToolsClient to be non-null
    // - Wait for isClosed to be false
    // - Send a command, for example "Browser.getVersion", "{}" and inspect the result
    // - Add a listener and log events. Note, send e.g. Log.enable to enable the events for the domain.
    fun checkDevTools(browser: JBCefBrowser) {
        val devtoolsClient = browser.cefBrowser.devToolsClient
        println("*** devtools client? $devtoolsClient")
        if (devtoolsClient != null) {
            if (devtoolsClient.isClosed && !openedDevtools) {
                println("*** opening devtools")
                // browser.openDevtools()
                openedDevtools = true
                invokeLater {
                    checkDevTools(browser)
                }
            } else if (devtoolsClient.isClosed && openedDevtools) {
                // wait
                invokeLater {
                    checkDevTools(browser)
                }
            } else {
                devtoolsClient.addEventListener { eventName, messageAsJson ->
                    println("*** devtools client event, $eventName : $messageAsJson")
                }
                devtoolsClient.executeDevToolsMethod(
                    "Browser.getVersion",
                    "{}"
                ).thenApply {
                    println("*** executed command $it")
                }
                devtoolsClient.executeDevToolsMethod(
                    "Log.enable",
                    "{}"
                ).thenApply {
                    println("*** enabled logging $it")
                }
            }
        } else {
            invokeLater {
                checkDevTools(browser)
            }
        }
    }
}
