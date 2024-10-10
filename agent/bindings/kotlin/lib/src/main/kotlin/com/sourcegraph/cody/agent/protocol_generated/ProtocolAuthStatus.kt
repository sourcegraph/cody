@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;
import com.google.gson.Gson;
import com.google.gson.JsonDeserializationContext;
import com.google.gson.JsonDeserializer;
import com.google.gson.JsonElement;
import java.lang.reflect.Type;

sealed class ProtocolAuthStatus {
  companion object {
    val deserializer: JsonDeserializer<ProtocolAuthStatus> =
      JsonDeserializer { element: JsonElement, _: Type, context: JsonDeserializationContext ->
        when (element.getAsJsonObject().get("status").getAsString()) {
          "authenticated" -> context.deserialize<ProtocolAuthenticatedAuthStatus>(element, ProtocolAuthenticatedAuthStatus::class.java)
          "unauthenticated" -> context.deserialize<ProtocolUnauthenticatedAuthStatus>(element, ProtocolUnauthenticatedAuthStatus::class.java)
          else -> throw Exception("Unknown discriminator ${element}")
        }
      }
  }
}

data class ProtocolAuthenticatedAuthStatus(
  val status: StatusEnum, // Oneof: authenticated
  val authenticated: Boolean,
  val endpoint: String,
  val username: String,
  val isFireworksTracingEnabled: Boolean? = null,
  val hasVerifiedEmail: Boolean? = null,
  val requiresVerifiedEmail: Boolean? = null,
  val primaryEmail: String? = null,
  val displayName: String? = null,
  val avatarURL: String? = null,
  val pendingValidation: Boolean,
  val organizations: List<OrganizationsParams>? = null,
) : ProtocolAuthStatus() {

  enum class StatusEnum {
    @SerializedName("authenticated") Authenticated,
  }
}

data class ProtocolUnauthenticatedAuthStatus(
  val status: StatusEnum, // Oneof: unauthenticated
  val authenticated: Boolean,
  val endpoint: String,
  val showNetworkError: Boolean? = null,
  val showInvalidAccessTokenError: Boolean? = null,
  val pendingValidation: Boolean,
) : ProtocolAuthStatus() {

  enum class StatusEnum {
    @SerializedName("unauthenticated") Unauthenticated,
  }
}

