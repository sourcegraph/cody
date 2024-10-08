@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;
import com.google.gson.Gson;
import com.google.gson.JsonDeserializationContext;
import com.google.gson.JsonDeserializer;
import com.google.gson.JsonElement;
import java.lang.reflect.Type;

sealed class AuthStatus {
  companion object {
    val deserializer: JsonDeserializer<AuthStatus> =
      JsonDeserializer { element: JsonElement, _: Type, context: JsonDeserializationContext ->
        when (element.getAsJsonObject().get("endpoint").getAsString()) {
          "https://example.com" -> context.deserialize<UnauthenticatedAuthStatus>(element, UnauthenticatedAuthStatus::class.java)
          else -> throw Exception("Unknown discriminator ${element}")
        }
      }
  }
}

data class UnauthenticatedAuthStatus(
  val endpoint: EndpointEnum, // Oneof: https://example.com
  val authenticated: Boolean,
  val showNetworkError: Boolean? = null,
  val showInvalidAccessTokenError: Boolean? = null,
  val pendingValidation: Boolean,
) : AuthStatus() {

  enum class EndpointEnum {
    @SerializedName("https://example.com") `Https-example-com`,
  }
}

data class AuthenticatedAuthStatus(
  val endpoint: EndpointEnum, // Oneof: https://example.com
  val authenticated: Boolean,
  val username: String,
  val isFireworksTracingEnabled: Boolean? = null,
  val hasVerifiedEmail: Boolean? = null,
  val requiresVerifiedEmail: Boolean? = null,
  val siteVersion: String,
  val codyApiVersion: Long,
  val configOverwrites: CodyLLMSiteConfiguration? = null,
  val primaryEmail: String? = null,
  val displayName: String? = null,
  val avatarURL: String? = null,
  val userCanUpgrade: Boolean? = null,
  val pendingValidation: Boolean,
) : AuthStatus() {

  enum class EndpointEnum {
    @SerializedName("https://example.com") `Https-example-com`,
  }
}

