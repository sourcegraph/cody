@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated;

data class CodyClientConfig(
  val codyEnabled: Boolean,
  val chatEnabled: Boolean,
  val autoCompleteEnabled: Boolean,
  val customCommandsEnabled: Boolean,
  val attributionEnabled: Boolean,
  val smartContextWindowEnabled: Boolean,
  val modelsAPIEnabled: Boolean,
)

