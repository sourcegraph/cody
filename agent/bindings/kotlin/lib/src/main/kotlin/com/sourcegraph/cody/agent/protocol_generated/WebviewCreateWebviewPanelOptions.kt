@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class WebviewCreateWebviewPanelOptions(
  val enableScripts: Boolean,
  val enableForms: Boolean,
  val enableOnlyCommandUris: List<String>? = null,
  val localResourceRoots: List<String>? = null,
  val portMapping: List<PortMappingParams>,
  val enableFindWidget: Boolean,
  val retainContextWhenHidden: Boolean,
)

