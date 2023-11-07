package com.sourcegraph.cody.api

import com.intellij.collaboration.api.dto.GraphQLErrorDTO
import com.intellij.collaboration.api.dto.GraphQLRequestDTO
import com.intellij.collaboration.api.dto.GraphQLResponseDTO
import java.io.IOException

sealed class SourcegraphApiRequest<out T>(val url: String) {
  var operationName: String? = null

  val additionalHeaders = mutableMapOf<String, String>()

  @Throws(IOException::class) abstract fun extractResult(response: SourcegraphApiResponse): T

  abstract class Get<T>(url: String) : SourcegraphApiRequest<T>(url)

  abstract class Post<out T>(url: String, val bodyMimeType: String) :
      SourcegraphApiRequest<T>(url) {
    abstract val body: String

    class GQLQuery<out T>(
        url: String,
        private val queryName: String,
        private val variablesObject: Any?,
        private val clazz: Class<T>
    ) : Post<T>(url, SourcegraphApiContentHelper.JSON_MIME_TYPE) {

      override val body: String
        get() {
          val query = SourcegraphGQLQueryLoader.loadQuery(queryName)
          val request = GraphQLRequestDTO(query, variablesObject)
          return SourcegraphApiContentHelper.toJson(request, true)
        }

      private fun throwException(errors: List<GraphQLErrorDTO>): Nothing {
        if (errors.size == 1) throw SourcegraphConfusingException(errors.single().toString())
        throw SourcegraphConfusingException(errors.toString())
      }

      override fun extractResult(response: SourcegraphApiResponse): T {
        val result: GraphQLResponseDTO<out T, GraphQLErrorDTO> =
            response.readBody {
              @Suppress("UNCHECKED_CAST")
              SourcegraphApiContentHelper.readJsonObject(
                  it,
                  GraphQLResponseDTO::class.java,
                  clazz,
                  GraphQLErrorDTO::class.java,
                  gqlNaming = true) as GraphQLResponseDTO<T, GraphQLErrorDTO>
            }
        val data = result.data
        if (data != null) return data

        val errors = result.errors
        if (errors == null) error("Undefined request state - both result and errors are null")
        else throwException(errors)
      }
    }
  }
}
