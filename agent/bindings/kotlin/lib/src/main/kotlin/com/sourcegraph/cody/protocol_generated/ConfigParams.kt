@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated;

data class ConfigParams(
  val experimentalNoodle: Boolean,
  val agentIDE: CodyIDE? = null, // Oneof: VSCode, JetBrains, Neovim, Emacs
  val agentExtensionVersion: String? = null,
  val serverEndpoint: String,
  val uiKindIsWeb: Boolean,
)

