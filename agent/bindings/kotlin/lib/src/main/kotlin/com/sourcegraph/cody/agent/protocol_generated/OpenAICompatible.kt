@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class OpenAICompatible(
  val stopSequences: List<String>? = null,
  val endOfText: String? = null,
  val contextSizeHintTotalCharacters: Long? = null,
  val contextSizeHintPrefixCharacters: Long? = null,
  val contextSizeHintSuffixCharacters: Long? = null,
  val chatPreInstruction: String? = null,
  val editPostInstruction: String? = null,
  val autocompleteSinglelineTimeout: Long? = null,
  val autocompleteMultilineTimeout: Long? = null,
  val chatTopK: Long? = null,
  val chatTopP: Long? = null,
  val chatTemperature: Long? = null,
  val chatMaxTokens: Long? = null,
  val autoCompleteTopK: Long? = null,
  val autoCompleteTopP: Long? = null,
  val autoCompleteTemperature: Long? = null,
  val autoCompleteSinglelineMaxTokens: Long? = null,
  val autoCompleteMultilineMaxTokens: Long? = null,
  val editTopK: Long? = null,
  val editTopP: Long? = null,
  val editTemperature: Long? = null,
  val editMaxTokens: Long? = null,
)

