@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated;

data class OpenAICompatible(
  val stopSequences: List<String>? = null,
  val endOfText: String? = null,
  val contextSizeHintTotalCharacters: Int? = null,
  val contextSizeHintPrefixCharacters: Int? = null,
  val contextSizeHintSuffixCharacters: Int? = null,
  val chatPreInstruction: String? = null,
  val editPostInstruction: String? = null,
  val autocompleteSinglelineTimeout: Int? = null,
  val autocompleteMultilineTimeout: Int? = null,
  val chatTopK: Int? = null,
  val chatTopP: Int? = null,
  val chatTemperature: Int? = null,
  val chatMaxTokens: Int? = null,
  val autoCompleteTopK: Int? = null,
  val autoCompleteTopP: Int? = null,
  val autoCompleteTemperature: Int? = null,
  val autoCompleteSinglelineMaxTokens: Int? = null,
  val autoCompleteMultilineMaxTokens: Int? = null,
  val editTopK: Int? = null,
  val editTopP: Int? = null,
  val editTemperature: Int? = null,
  val editMaxTokens: Int? = null,
)

