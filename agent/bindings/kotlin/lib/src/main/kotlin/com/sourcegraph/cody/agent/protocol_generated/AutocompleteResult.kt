@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;
import com.google.gson.Gson;
import com.google.gson.JsonDeserializationContext;
import com.google.gson.JsonDeserializer;
import com.google.gson.JsonElement;
import java.lang.reflect.Type;

sealed class AutocompleteResult {
  companion object {
    val deserializer: JsonDeserializer<AutocompleteResult> =
      JsonDeserializer { element: JsonElement, _: Type, context: JsonDeserializationContext ->
        when (element.getAsJsonObject().get("type").getAsString()) {
          "completion" -> context.deserialize<AutocompleteCompletionResult>(element, AutocompleteCompletionResult::class.java)
          "edit" -> context.deserialize<AutocompleteEditResult>(element, AutocompleteEditResult::class.java)
          else -> throw Exception("Unknown discriminator ${element}")
        }
      }
  }
}

data class AutocompleteCompletionResult(
  val type: TypeEnum, // Oneof: completion
  val items: List<AutocompleteItem>,
  val completionEvent: CompletionBookkeepingEvent? = null,
) : AutocompleteResult() {

  enum class TypeEnum {
    @SerializedName("completion") Completion,
  }
}

data class AutocompleteEditResult(
  val type: TypeEnum, // Oneof: edit
  val range: Range,
  val originalText: String,
  val prediction: String,
  val decorations: DecorationsParams,
  val items: List<AutocompleteItem>,
  val completionEvent: CompletionBookkeepingEvent? = null,
) : AutocompleteResult() {

  enum class TypeEnum {
    @SerializedName("edit") Edit,
  }
}

