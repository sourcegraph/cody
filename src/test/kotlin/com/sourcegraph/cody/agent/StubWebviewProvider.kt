package com.sourcegraph.cody.agent

import com.sourcegraph.cody.agent.protocol.WebviewCreateWebviewPanelParams
import com.sourcegraph.cody.ui.NativeWebviewProvider

// A NativeWebviewProvider where every operation is a no-op.
class StubWebviewProvider : NativeWebviewProvider {
  override fun createPanel(params: WebviewCreateWebviewPanelParams) {}

  override fun receivedPostMessage(params: WebviewPostMessageStringEncodedParams) {}

  override fun registerViewProvider(params: WebviewRegisterWebviewViewProviderParams) {}

  override fun setHtml(params: WebviewSetHtmlParams) {}

  override fun setOptions(params: WebviewSetOptionsParams) {}

  override fun setTitle(params: WebviewSetTitleParams) {}
}
