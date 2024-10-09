@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class InlineCompletionItemProviderConfig(
  val firstCompletionTimeout: Long,
  val statusBar: CodyStatusBar,
  val isRunningInsideAgent: Boolean? = null,
  val formatOnAccept: Boolean? = null,
  val disableInsideComments: Boolean? = null,
  val triggerDelay: Long,
  val completeSuggestWidgetSelection: Boolean? = null,
)

