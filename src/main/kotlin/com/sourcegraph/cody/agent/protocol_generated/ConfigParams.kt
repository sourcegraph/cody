/*
 * Generated file - DO NOT EDIT MANUALLY
 * They are copied from the cody agent project using the copyProtocol gradle task.
 * This is only a temporary solution before we fully migrate to generated protocol messages.
 */
@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class ConfigParams(
  val experimentalNoodle: Boolean,
  val agentIDE: CodyIDE? = null, // Oneof: VSCode, JetBrains, Neovim, Emacs, Web, VisualStudio
  val agentExtensionVersion: String? = null,
  val serverEndpoint: String,
  val experimentalUnitTest: Boolean,
  val uiKindIsWeb: Boolean,
)

