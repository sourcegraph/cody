package com.sourcegraph.cody.ui.web

import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.WebviewPostMessageStringEncodedParams
import com.sourcegraph.cody.agent.WebviewRegisterWebviewViewProviderParams
import com.sourcegraph.cody.agent.WebviewSetHtmlParams
import com.sourcegraph.cody.agent.WebviewSetOptionsParams
import com.sourcegraph.cody.agent.WebviewSetTitleParams
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

  // The notifications triggering these methods are handled in BGT.
  // We need to ensure that the project is not disposed before calling the WebUIService.
  private fun withProjectNotDisposed(runnable: WebUIService.() -> Unit) {
    if (!project.isDisposed) {
      WebUIService.getInstance(project).runnable()
    }
  }

  override fun createPanel(params: WebviewCreateWebviewPanelParams) = withProjectNotDisposed {
    createWebviewPanel(params)
  }

  override fun receivedPostMessage(params: WebviewPostMessageStringEncodedParams) =
      withProjectNotDisposed {
        postMessageHostToWebview(params.id, params.stringEncodedMessage)
      }

  override fun registerViewProvider(params: WebviewRegisterWebviewViewProviderParams) =
      withProjectNotDisposed {
        views.registerProvider(params.viewId, params.retainContextWhenHidden)
      }

  override fun setHtml(params: WebviewSetHtmlParams) = withProjectNotDisposed {
    setHtml(params.handle, params.html)
  }

  override fun setOptions(params: WebviewSetOptionsParams) = withProjectNotDisposed {
    setOptions(params.handle, params.options)
  }

  override fun setTitle(params: WebviewSetTitleParams) = withProjectNotDisposed {
    setTitle(params.handle, params.title)
  }
}
