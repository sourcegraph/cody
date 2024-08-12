@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class Webview_CreateWebviewPanelParams(
  val handle: String,
  val viewType: String,
  val title: String,
  val showOptions: ShowOptionsParams,
  val options: WebviewCreateWebviewPanelOptions,
)

