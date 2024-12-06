package com.sourcegraph.cody.agent

import com.sourcegraph.cody.agent.protocol.WebviewOptions

data class WebviewRegisterWebviewViewProviderParams(
    val viewId: String,
    val retainContextWhenHidden: Boolean
)

data class WebviewPostMessageStringEncodedParams(val id: String, val stringEncodedMessage: String)

data class WebviewSetHtmlParams(val handle: String, val html: String)

data class WebviewSetIconPathParams(val handle: String, val iconPathUri: String?)

data class WebviewSetOptionsParams(val handle: String, val options: WebviewOptions)

data class WebviewSetTitleParams(val handle: String, val title: String)

data class WebviewRevealParams(val handle: String, val viewColumn: Int, val preserveFocus: Boolean)

// When the server initiates dispose, this is sent to the client.
data class WebviewDisposeParams(val handle: String)

data class ConfigFeatures(val serverSentModels: Boolean)
