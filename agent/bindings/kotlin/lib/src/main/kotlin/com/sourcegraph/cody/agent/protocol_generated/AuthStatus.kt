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
          if (element.getAsJsonObject().get("username") == null) {
              context.deserialize<UnauthenticatedAuthStatus>(element, UnauthenticatedAuthStatus::class.java)
          } else {
              context.deserialize<AuthenticatedAuthStatus>(element, AuthenticatedAuthStatus::class.java)
          }
      }
  }
}

data class UnauthenticatedAuthStatus(
  val endpoint: String,
  val authenticated: Boolean,
  val showNetworkError: Boolean? = null,
  val showInvalidAccessTokenError: Boolean? = null,
  val pendingValidation: Boolean,
) : AuthStatus() {
}

data class AuthenticatedAuthStatus(
  val endpoint: String,
  val authenticated: Boolean,
  val username: String,
  val isFireworksTracingEnabled: Boolean? = null,
  val hasVerifiedEmail: Boolean? = null,
  val requiresVerifiedEmail: Boolean? = null,
  val configOverwrites: CodyLLMSiteConfiguration? = null,
  val primaryEmail: String? = null,
  val displayName: String? = null,
  val avatarURL: String? = null,
  val pendingValidation: Boolean,
) : AuthStatus() {
}

