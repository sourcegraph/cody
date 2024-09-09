package com.sourcegraph.cody.ui.web

import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.*
import com.sourcegraph.cody.agent.protocol.WebviewCreateWebviewPanelParams

/// The subset of the Agent client interface that relates to webviews.
interface NativeWebviewProvider {
  fun createPanel(params: WebviewCreateWebviewPanelParams)

  fun receivedPostMessage(params: WebviewPostMessageStringEncodedParams)

  fun registerViewProvider(params: WebviewRegisterWebviewViewProviderParams)

  fun setHtml(params: WebviewSetHtmlParams)

  fun setOptions(params: WebviewSetOptionsParams)

  fun setTitle(params: WebviewSetTitleParams)
}

/// A NativeWebviewProvider that thunks to WebUIService.
class WebUIServiceWebviewProvider(val project: Project) : NativeWebviewProvider {
  override fun createPanel(params: WebviewCreateWebviewPanelParams) =
      WebUIService.getInstance(project).createWebviewPanel(params)

  override fun receivedPostMessage(params: WebviewPostMessageStringEncodedParams) =
      WebUIService.getInstance(project)
          .postMessageHostToWebview(params.id, params.stringEncodedMessage)

  override fun registerViewProvider(params: WebviewRegisterWebviewViewProviderParams) =
      WebUIService.getInstance(project)
          .views
          .registerProvider(params.viewId, params.retainContextWhenHidden)

  override fun setHtml(params: WebviewSetHtmlParams) =
      WebUIService.getInstance(project).setHtml(params.handle, params.html)

  override fun setOptions(params: WebviewSetOptionsParams) =
      WebUIService.getInstance(project).setOptions(params.handle, params.options)

  override fun setTitle(params: WebviewSetTitleParams) =
      WebUIService.getInstance(project).setTitle(params.handle, params.title)
}
