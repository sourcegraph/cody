@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class CompletionBookkeepingEvent(
  val id: CompletionLogID,
  val startedAt: Long,
  val networkRequestStartedAt: Long? = null,
  val startLoggedAt: Long? = null,
  val loadedAt: Long? = null,
  val suggestedAt: Long? = null,
  val suggestionLoggedAt: Long? = null,
  val suggestionAnalyticsLoggedAt: Long? = null,
  val acceptedAt: Long? = null,
  val items: List<CompletionItemInfo>,
  val loggedPartialAcceptedLength: Long,
  val read: Boolean,
)

