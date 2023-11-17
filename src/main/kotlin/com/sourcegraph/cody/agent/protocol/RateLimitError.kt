package com.sourcegraph.cody.agent.protocol

import com.google.gson.GsonBuilder
import com.google.gson.JsonDeserializationContext
import com.google.gson.JsonDeserializer
import com.google.gson.JsonElement
import com.google.gson.JsonPrimitive
import java.lang.reflect.Type
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import org.eclipse.lsp4j.jsonrpc.ResponseErrorException

data class RateLimitError(val limit: Int?, val retryAfter: OffsetDateTime?) {

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
        val retryAfter = errorObject["retryAfter"]?.asString?.let(::parseOffsetDateTime)

        return RateLimitError(limit, retryAfter)
      }

      private fun parseOffsetDateTime(dateTimeString: String): OffsetDateTime {
        return OffsetDateTime.parse(dateTimeString, DateTimeFormatter.ISO_DATE_TIME)
      }
    }
  }
}
