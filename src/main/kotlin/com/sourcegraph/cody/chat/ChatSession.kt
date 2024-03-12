package com.sourcegraph.cody.chat

import com.intellij.util.concurrency.annotations.RequiresEdt
import com.sourcegraph.cody.agent.ExtensionMessage
import com.sourcegraph.cody.agent.WebviewMessage
import com.sourcegraph.cody.agent.protocol.ContextItem
import com.sourcegraph.cody.vscode.CancellationToken

typealias ConnectionId = String

interface ChatSession {

  fun getConnectionId(): ConnectionId?

  fun sendWebviewMessage(message: WebviewMessage)

  @RequiresEdt fun sendMessage(text: String, contextItems: List<ContextItem>)

  fun receiveMessage(extensionMessage: ExtensionMessage)

  fun getCancellationToken(): CancellationToken

  fun getInternalId(): String
}
