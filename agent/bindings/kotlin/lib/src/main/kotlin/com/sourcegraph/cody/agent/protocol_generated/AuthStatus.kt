/*
 * Generated file - DO NOT EDIT MANUALLY
 * They are copied from the cody agent project using the copyProtocol gradle task.
 * This is only a temporary solution before we fully migrate to generated protocol messages.
 */
/*
 * Generated file - DO NOT EDIT MANUALLY
 * They are copied from the cody agent project using the copyProtocol gradle task.
 * This is only a temporary solution before we fully migrate to generated protocol messages.
 */
@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;
import com.google.gson.Gson;
import com.google.gson.JsonDeserializationContext;
import com.google.gson.JsonDeserializer;
import com.google.gson.JsonElement;
import java.lang.reflect.Type;

// TODO (CODY-3089 ): This was edited manually due to deficiencies in the codegen.
// Please re-generate after CODY-3809 is done
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
    val endpoint: String, // Oneof: https://example.com
    val authenticated: Boolean,
    val showNetworkError: Boolean? = null,
    val showInvalidAccessTokenError: Boolean? = null,
    val pendingValidation: Boolean,
) : AuthStatus() {}

data class AuthenticatedAuthStatus(
    val endpoint: String, // Oneof: https://example.com
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
) : AuthStatus() {}
