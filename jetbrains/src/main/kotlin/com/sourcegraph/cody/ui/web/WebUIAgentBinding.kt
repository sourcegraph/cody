package com.sourcegraph.cody.ui.web

import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.protocol_generated.Webview_CreateWebviewPanelParams
import com.sourcegraph.cody.agent.protocol_generated.Webview_PostMessageStringEncodedParams
import com.sourcegraph.cody.agent.protocol_generated.Webview_RegisterWebviewViewProviderParams
import com.sourcegraph.cody.agent.protocol_generated.Webview_SetHtmlParams
import com.sourcegraph.cody.agent.protocol_generated.Webview_SetOptionsParams
import com.sourcegraph.cody.agent.protocol_generated.Webview_SetTitleParams

/// The subset of the Agent client interface that relates to webviews.
interface NativeWebviewProvider {
  fun createPanel(params: Webview_CreateWebviewPanelParams)

  fun receivedPostMessage(params: Webview_PostMessageStringEncodedParams)

  fun registerViewProvider(params: Webview_RegisterWebviewViewProviderParams)

  fun setHtml(params: Webview_SetHtmlParams)

  fun setOptions(params: Webview_SetOptionsParams)

  fun setTitle(params: Webview_SetTitleParams)
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

  override fun createPanel(params: Webview_CreateWebviewPanelParams) = withProjectNotDisposed {
    createWebviewPanel(params)
  }

  override fun receivedPostMessage(params: Webview_PostMessageStringEncodedParams) =
      withProjectNotDisposed {
        postMessageHostToWebview(params.id, params.stringEncodedMessage)
      }

  override fun registerViewProvider(params: Webview_RegisterWebviewViewProviderParams) =
      withProjectNotDisposed {
        views.registerProvider(params.viewId, params.retainContextWhenHidden)
      }

  override fun setHtml(params: Webview_SetHtmlParams) = withProjectNotDisposed {
    setHtml(params.handle, params.html)
  }

  override fun setOptions(params: Webview_SetOptionsParams) = withProjectNotDisposed {
    setOptions(params.handle, params.options)
  }

  override fun setTitle(params: Webview_SetTitleParams) = withProjectNotDisposed {
    setTitle(params.handle, params.title)
  }
}
