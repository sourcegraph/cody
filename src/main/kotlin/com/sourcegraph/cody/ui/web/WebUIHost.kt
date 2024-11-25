package com.sourcegraph.cody.ui.web

import com.google.gson.Gson
import com.google.gson.JsonArray
import com.google.gson.JsonParser
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.actionSystem.impl.SimpleDataContext
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.WebviewOptions
import com.sourcegraph.cody.agent.protocol_generated.ExecuteCommandParams
import com.sourcegraph.cody.agent.protocol_generated.Webview_DidDisposeNativeParams
import com.sourcegraph.cody.agent.protocol_generated.Webview_ReceiveMessageStringEncodedParams
import com.sourcegraph.cody.config.ui.CodyConfigurable
import com.sourcegraph.utils.CodyEditorUtil
import java.net.URLDecoder

// TODO:
// - Use UiNotifyConnector to hook up visibility and push changes to
// WebviewPanel.visible/WebviewView.visible and fire onDidChangeViewState (panels) or
// onDidChangeVisibility (views)
// - Use ??? to hook up focus and push changes to WebviewPanel.active and fire onDidChangeViewState
// - Hook up webview/didDispose, etc.
// - Implement registerWebviewPanelSerializer and wire it to JetBrains panel saving to restore chats
// when JetBrains is reopened.
// - Implement enableFindDialog/ctrl-f find in page.

internal interface WebUIHost {
  // Provides, sinks Webview state from VSCode webview setState, getState API.
  var stateAsJSONString: String

  fun setOptions(options: WebviewOptions)

  fun setTitle(value: String)

  fun postMessageWebviewToHost(stringEncodedJsonMessage: String)

  fun onCommand(command: String)

  fun dispose()
}

internal class WebUIHostImpl(
    val project: Project,
    val handle: String,
    private var _options: WebviewOptions
) : WebUIHost {
  var view: WebviewViewDelegate? = null

  override var stateAsJSONString = "null"

  override fun postMessageWebviewToHost(stringEncodedJsonMessage: String) {
    // Some commands can be handled by the client and do not need to round-trip client -> Agent ->
    // client.
    val stringsOfInterest = listOf("auth", "command")
    val decodedJson =
        if (stringsOfInterest.any { stringEncodedJsonMessage.contains(it) }) {
          JsonParser.parseString(stringEncodedJsonMessage).asJsonObject
        } else {
          null
        }

    val command = decodedJson?.get("command")?.asString
    val isCommand = command == "command"
    val id = decodedJson?.get("id")?.asString
    val arg = decodedJson?.get("arg")?.asString

    if (isCommand && id == "cody.status-bar.interacted") {
      runInEdt {
        ShowSettingsUtil.getInstance().showSettingsDialog(project, CodyConfigurable::class.java)
      }
    } else if (isCommand && id == "cody.action.command" && arg == "edit") {
      // TODO: Delete this intercept when Cody edits UI is abstracted so JetBrains' native UI can be
      // invoked from the extension TypeScript side through Agent.
      runInEdt {
        // Invoke the Cody "edit" action in JetBrains directly.
        val actionManager = ActionManager.getInstance()
        val action = actionManager.getAction("cody.editCodeAction")
        val dataContext =
            CodyEditorUtil.getSelectedEditors(project).firstOrNull()?.let { editor ->
              SimpleDataContext.getSimpleContext(CommonDataKeys.EDITOR, editor)
            } ?: SimpleDataContext.EMPTY_CONTEXT

        action?.actionPerformed(AnActionEvent.createFromAnAction(action, null, "", dataContext))
      }
    } else {
      CodyAgentService.withAgent(project) {
        it.server.webview_receiveMessageStringEncoded(
            Webview_ReceiveMessageStringEncodedParams(handle, stringEncodedJsonMessage))
      }
    }
  }

  override fun setOptions(options: WebviewOptions) {
    // TODO:
    // When TypeScript uses these WebView options, implement them:
    // - retainContextWhenHidden: false and dispose the browser when hidden.
    // - localResourceRoots beyond just the extension distribution path.
    // - Non-empty portMapping.
    // - enableScripts: false, enableForms: false
    _options = options
  }

  override fun setTitle(value: String) {
    view?.setTitle(value)
  }

  override fun onCommand(command: String) {
    val regex = """^command:([^?]+)(?:\?(.+))?$""".toRegex()
    val matchResult = regex.find(command) ?: return
    val (commandName, encodedArguments) = matchResult.destructured
    val arguments =
        encodedArguments
            .takeIf { it.isNotEmpty() }
            ?.let { encoded ->
              val decoded = URLDecoder.decode(encoded, "UTF-8")
              try {
                Gson().fromJson(decoded, JsonArray::class.java).toList()
              } catch (e: Exception) {
                null
              }
            } ?: emptyList()
    if (_options.enableCommandUris == true ||
        (_options.enableCommandUris as List<*>).contains(commandName)) {
      CodyAgentService.withAgent(project) {
        it.server.command_execute(ExecuteCommandParams(commandName, arguments))
      }
    }
  }

  override fun dispose() {
    // TODO: Consider cleaning up the view.
    CodyAgentService.withAgent(project) {
      it.server.webview_didDisposeNative(Webview_DidDisposeNativeParams(handle))
    }
  }
}
