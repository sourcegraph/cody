@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;
import com.google.gson.Gson;
import com.google.gson.JsonDeserializationContext;
import com.google.gson.JsonDeserializer;
import com.google.gson.JsonElement;
import java.lang.reflect.Type;

sealed class AutocompleteItem {
  companion object {
    val deserializer: JsonDeserializer<AutocompleteItem> =
      JsonDeserializer { element: JsonElement, _: Type, context: JsonDeserializationContext ->
        when (element.getAsJsonObject().get("type").getAsString()) {
          "completion" -> context.deserialize<AutocompleteCompletionItem>(element, AutocompleteCompletionItem::class.java)
          "edit" -> context.deserialize<AutocompleteEditItem>(element, AutocompleteEditItem::class.java)
          else -> throw Exception("Unknown discriminator ${element}")
        }
      }
  }
}

data class AutocompleteCompletionItem(
  val id: String,
  val range: Range,
  val insertText: String,
  val type: TypeEnum, // Oneof: completion
) : AutocompleteItem() {

  enum class TypeEnum {
    @SerializedName("completion") Completion,
  }
}

data class AutocompleteEditItem(
  val id: String,
  val range: Range,
  val insertText: String,
  val type: TypeEnum, // Oneof: edit
  val originalText: String,
  val render: RenderParams,
) : AutocompleteItem() {

  enum class TypeEnum {
    @SerializedName("edit") Edit,
  }
}

