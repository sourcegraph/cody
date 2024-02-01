package com.sourcegraph.cody.chat

import com.intellij.util.concurrency.annotations.RequiresEdt
import com.sourcegraph.cody.agent.ExtensionMessage
import com.sourcegraph.cody.vscode.CancellationToken

typealias SessionId = String

interface ChatSession {
  @RequiresEdt fun sendMessage(text: String)

  fun receiveMessage(extensionMessage: ExtensionMessage)

  fun getCancellationToken(): CancellationToken

  fun getInternalId(): String
}
