package com.sourcegraph.cody.agent.protocol

import com.sourcegraph.cody.agent.WebviewMessage

data class ChatSubmitMessageParams(val id: String, val message: WebviewMessage)
