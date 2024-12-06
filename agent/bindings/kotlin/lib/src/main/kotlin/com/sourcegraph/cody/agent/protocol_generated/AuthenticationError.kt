@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;
import com.google.gson.Gson;
import com.google.gson.JsonDeserializationContext;
import com.google.gson.JsonDeserializer;
import com.google.gson.JsonElement;
import java.lang.reflect.Type;

sealed class AuthenticationError {
  companion object {
    val deserializer: JsonDeserializer<AuthenticationError> =
      JsonDeserializer { element: JsonElement, _: Type, context: JsonDeserializationContext ->
        when (element.getAsJsonObject().get("type").getAsString()) {
          "network-error" -> context.deserialize<`network-errorAuthenticationError`>(element, `network-errorAuthenticationError`::class.java)
          "invalid-access-token" -> context.deserialize<`invalid-access-tokenAuthenticationError`>(element, `invalid-access-tokenAuthenticationError`::class.java)
          "enterprise-user-logged-into-dotcom" -> context.deserialize<`enterprise-user-logged-into-dotcomAuthenticationError`>(element, `enterprise-user-logged-into-dotcomAuthenticationError`::class.java)
          else -> throw Exception("Unknown discriminator ${element}")
        }
      }
  }
}

data class `network-errorAuthenticationError`(
  val type: TypeEnum, // Oneof: network-error
) : AuthenticationError() {

  enum class TypeEnum {
    @SerializedName("network-error") `Network-error`,
  }
}

data class `invalid-access-tokenAuthenticationError`(
  val type: TypeEnum, // Oneof: invalid-access-token
) : AuthenticationError() {

  enum class TypeEnum {
    @SerializedName("invalid-access-token") `Invalid-access-token`,
  }
}

data class `enterprise-user-logged-into-dotcomAuthenticationError`(
  val type: TypeEnum, // Oneof: enterprise-user-logged-into-dotcom
  val enterprise: String,
) : AuthenticationError() {

  enum class TypeEnum {
    @SerializedName("enterprise-user-logged-into-dotcom") `Enterprise-user-logged-into-dotcom`,
  }
}

