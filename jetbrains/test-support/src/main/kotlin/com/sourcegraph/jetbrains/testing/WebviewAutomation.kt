package com.sourcegraph.jetbrains.testing

import com.sourcegraph.jetbrains.testing.shared.WebviewSink

class WebviewAutomation : WebviewSink {
    override fun greet(message: String) {
        println("test support plugin got message: $message")
    }
}
