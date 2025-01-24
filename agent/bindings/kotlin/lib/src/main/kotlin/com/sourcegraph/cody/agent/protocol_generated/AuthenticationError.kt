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
          "network-error" -> context.deserialize<NetworkAuthError>(element, NetworkAuthError::class.java)
          "invalid-access-token" -> context.deserialize<InvalidAccessTokenError>(element, InvalidAccessTokenError::class.java)
          "enterprise-user-logged-into-dotcom" -> context.deserialize<EnterpriseUserDotComError>(element, EnterpriseUserDotComError::class.java)
          "auth-config-error" -> context.deserialize<AuthConfigError>(element, AuthConfigError::class.java)
          else -> throw Exception("Unknown discriminator ${element}")
        }
      }
  }
}

data class NetworkAuthError(
  val type: TypeEnum, // Oneof: network-error
) : AuthenticationError() {

  enum class TypeEnum {
    @SerializedName("network-error") `Network-error`,
  }
}

data class InvalidAccessTokenError(
  val type: TypeEnum, // Oneof: invalid-access-token
) : AuthenticationError() {

  enum class TypeEnum {
    @SerializedName("invalid-access-token") `Invalid-access-token`,
  }
}

data class EnterpriseUserDotComError(
  val type: TypeEnum, // Oneof: enterprise-user-logged-into-dotcom
  val enterprise: String,
) : AuthenticationError() {

  enum class TypeEnum {
    @SerializedName("enterprise-user-logged-into-dotcom") `Enterprise-user-logged-into-dotcom`,
  }
}

data class AuthConfigError(
  val title: String? = null,
  val message: String,
  val type: TypeEnum, // Oneof: auth-config-error
) : AuthenticationError() {

  enum class TypeEnum {
    @SerializedName("auth-config-error") `Auth-config-error`,
  }
}

