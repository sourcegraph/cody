@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class ClientCapabilities(
  val authentication: AuthenticationEnum? = null, // Oneof: enabled, none
  val completions: CompletionsEnum? = null, // Oneof: none
  val chat: ChatEnum? = null, // Oneof: none, streaming
  val git: GitEnum? = null, // Oneof: none, enabled
  val progressBars: ProgressBarsEnum? = null, // Oneof: none, enabled
  val edit: EditEnum? = null, // Oneof: none, enabled
  val editWorkspace: EditWorkspaceEnum? = null, // Oneof: none, enabled
  val untitledDocuments: UntitledDocumentsEnum? = null, // Oneof: none, enabled
  val showDocument: ShowDocumentEnum? = null, // Oneof: none, enabled
  val codeLenses: CodeLensesEnum? = null, // Oneof: none, enabled
  val showWindowMessage: ShowWindowMessageEnum? = null, // Oneof: notification, request
  val ignore: IgnoreEnum? = null, // Oneof: none, enabled
  val codeActions: CodeActionsEnum? = null, // Oneof: none, enabled
  val disabledMentionsProviders: List<ContextMentionProviderID>? = null,
  val accountSwitchingInWebview: AccountSwitchingInWebviewEnum? = null, // Oneof: none, enabled
  val webviewMessages: WebviewMessagesEnum? = null, // Oneof: object-encoded, string-encoded
  val globalState: GlobalStateEnum? = null, // Oneof: stateless, server-managed, client-managed
  val secrets: SecretsEnum? = null, // Oneof: stateless, client-managed
  val webview: WebviewEnum? = null, // Oneof: agentic, native
  val webviewNativeConfig: WebviewNativeConfig? = null,
) {

  enum class AuthenticationEnum {
    @SerializedName("enabled") Enabled,
    @SerializedName("none") None,
  }

  enum class CompletionsEnum {
    @SerializedName("none") None,
  }

  enum class ChatEnum {
    @SerializedName("none") None,
    @SerializedName("streaming") Streaming,
  }

  enum class GitEnum {
    @SerializedName("none") None,
    @SerializedName("enabled") Enabled,
  }

  enum class ProgressBarsEnum {
    @SerializedName("none") None,
    @SerializedName("enabled") Enabled,
  }

  enum class EditEnum {
    @SerializedName("none") None,
    @SerializedName("enabled") Enabled,
  }

  enum class EditWorkspaceEnum {
    @SerializedName("none") None,
    @SerializedName("enabled") Enabled,
  }

  enum class UntitledDocumentsEnum {
    @SerializedName("none") None,
    @SerializedName("enabled") Enabled,
  }

  enum class ShowDocumentEnum {
    @SerializedName("none") None,
    @SerializedName("enabled") Enabled,
  }

  enum class CodeLensesEnum {
    @SerializedName("none") None,
    @SerializedName("enabled") Enabled,
  }

  enum class ShowWindowMessageEnum {
    @SerializedName("notification") Notification,
    @SerializedName("request") Request,
  }

  enum class IgnoreEnum {
    @SerializedName("none") None,
    @SerializedName("enabled") Enabled,
  }

  enum class CodeActionsEnum {
    @SerializedName("none") None,
    @SerializedName("enabled") Enabled,
  }

  enum class AccountSwitchingInWebviewEnum {
    @SerializedName("none") None,
    @SerializedName("enabled") Enabled,
  }

  enum class WebviewMessagesEnum {
    @SerializedName("object-encoded") `Object-encoded`,
    @SerializedName("string-encoded") `String-encoded`,
  }

  enum class GlobalStateEnum {
    @SerializedName("stateless") Stateless,
    @SerializedName("server-managed") `Server-managed`,
    @SerializedName("client-managed") `Client-managed`,
  }

  enum class SecretsEnum {
    @SerializedName("stateless") Stateless,
    @SerializedName("client-managed") `Client-managed`,
  }

  enum class WebviewEnum {
    @SerializedName("agentic") Agentic,
    @SerializedName("native") Native,
  }
}

