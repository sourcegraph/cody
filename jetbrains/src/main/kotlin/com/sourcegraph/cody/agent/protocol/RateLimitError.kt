package com.sourcegraph.cody.agent.protocol

import com.google.gson.*
import java.lang.reflect.Type
import org.eclipse.lsp4j.jsonrpc.ResponseErrorException

data class RateLimitError(val upgradeIsAvailable: Boolean, val limit: Int?) {

  companion object {
    fun ResponseErrorException.toRateLimitError(): RateLimitError {
      val data = responseError.data as JsonPrimitive
      val gsonBuilder = GsonBuilder()
      gsonBuilder.registerTypeAdapter(RateLimitError::class.java, RateLimitErrorDeserializer())
      val gson = gsonBuilder.create()
      return gson.fromJson(data.asString, RateLimitError::class.java)
    }

    class RateLimitErrorDeserializer : JsonDeserializer<RateLimitError> {
      override fun deserialize(
          json: JsonElement,
          typeOfT: Type?,
          context: JsonDeserializationContext?
      ): RateLimitError {
        val jsonObject = json.asJsonObject
        val errorObject = jsonObject["error"].asJsonObject
        val limit = errorObject["limit"]?.asInt
        val upgradeIsAvailable = errorObject["upgradeIsAvailable"]?.asBoolean

        return RateLimitError(upgradeIsAvailable ?: false, limit)
      }
    }
  }
}
