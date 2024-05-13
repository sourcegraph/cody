package com.sourcegraph.cody.api

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.progress.EmptyProgressIndicator
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.util.ThrowableConvertor
import com.intellij.util.concurrency.annotations.RequiresBackgroundThread
import com.intellij.util.io.HttpRequests
import com.intellij.util.io.HttpSecurityUtil
import com.intellij.util.io.RequestBuilder
import com.sourcegraph.cody.config.SourcegraphServerPath
import java.io.IOException
import java.io.InputStream
import java.io.InputStreamReader
import java.io.Reader
import java.net.HttpURLConnection
import java.net.URI
import java.util.zip.GZIPInputStream
import org.jetbrains.annotations.CalledInAny
import org.jetbrains.annotations.TestOnly

class SourcegraphApiRequestExecutor
private constructor(
    val server: SourcegraphServerPath,
    val token: String,
    private val useProxy: Boolean
) {

  @RequiresBackgroundThread
  @Throws(IOException::class, ProcessCanceledException::class)
  fun <T> execute(indicator: ProgressIndicator, request: SourcegraphApiRequest<T>): T {
    indicator.checkCanceled()
    return createRequestBuilder(request)
        .tuner { connection ->
          if (URI.create(request.url).host == URI.create(server.url).host) {
            request.additionalHeaders.forEach(connection::addRequestProperty)
            connection.addRequestProperty(
                HttpSecurityUtil.AUTHORIZATION_HEADER_NAME, "token $token")
          }
        }
        .useProxy(useProxy)
        .execute(request, indicator)
  }

  @TestOnly
  @RequiresBackgroundThread
  @Throws(IOException::class, ProcessCanceledException::class)
  fun <T> execute(request: SourcegraphApiRequest<T>): T = execute(EmptyProgressIndicator(), request)

  private fun <T> RequestBuilder.execute(
      request: SourcegraphApiRequest<T>,
      indicator: ProgressIndicator
  ): T {
    indicator.checkCanceled()
    try {
      LOG.debug("Request: ${request.url} ${request.operationName} : Connecting")
      return connect {
        val connection = it.connection as HttpURLConnection

        if (request is SourcegraphApiRequest.Post) {
          LOG.debug(
              "Request: ${connection.requestMethod} ${connection.url} with body:\n${request.body} : Connected")
          request.body.let { body -> it.write(body) }
        } else {
          LOG.debug("Request: ${connection.requestMethod} ${connection.url} : Connected")
        }

        checkResponseCode(connection)

        indicator.checkCanceled()

        request.extractResult(createResponse(it, indicator)).apply {
          LOG.debug("Request: ${connection.requestMethod} ${connection.url} : Result extracted")
        }
      }
    } catch (e: SourcegraphStatusCodeException) {
      throw e
    } catch (e: SourcegraphConfusingException) {
      if (request.operationName != null) {
        val errorText = "Can't ${request.operationName}"
        e.setDetails(errorText)
        LOG.debug(errorText, e)
      }
      throw e
    }
  }

  private fun createRequestBuilder(request: SourcegraphApiRequest<*>): RequestBuilder {
    return when (request) {
          is SourcegraphApiRequest.Get -> HttpRequests.request(request.url)
          is SourcegraphApiRequest.Post -> HttpRequests.post(request.url, request.bodyMimeType)
        }
        .userAgent("Cody")
        .throwStatusCodeException(false)
        .forceHttps(false)
  }

  @Throws(IOException::class)
  private fun checkResponseCode(connection: HttpURLConnection) {
    if (connection.responseCode < 400) return
    val statusLine = "${connection.responseCode} ${connection.responseMessage}"
    val errorText = getErrorText(connection)
    LOG.debug(
        "Request: ${connection.requestMethod} ${connection.url} : Error $statusLine body:\n${errorText}")

    throw when (connection.responseCode) {
      HttpURLConnection.HTTP_UNAUTHORIZED,
      HttpURLConnection.HTTP_FORBIDDEN ->
          SourcegraphAuthenticationException("Request response: " + (errorText ?: statusLine))
      else -> SourcegraphStatusCodeException("$statusLine - $errorText", connection.responseCode)
    }
  }

  private fun getErrorText(connection: HttpURLConnection): String? {
    val errorStream = connection.errorStream ?: return null
    val stream =
        if (connection.contentEncoding == "gzip") GZIPInputStream(errorStream) else errorStream
    return InputStreamReader(stream, Charsets.UTF_8).use { it.readText() }
  }

  private fun createResponse(
      request: HttpRequests.Request,
      indicator: ProgressIndicator
  ): SourcegraphApiResponse {
    return object : SourcegraphApiResponse {
      override fun findHeader(headerName: String): String? =
          request.connection.getHeaderField(headerName)

      override fun <T> readBody(converter: ThrowableConvertor<Reader, T, IOException>): T =
          request.getReader(indicator).use { converter.convert(it) }

      override fun <T> handleBody(converter: ThrowableConvertor<InputStream, T, IOException>): T =
          request.inputStream.use { converter.convert(it) }
    }
  }

  @Service
  class Factory {
    @CalledInAny
    fun create(server: SourcegraphServerPath, token: String): SourcegraphApiRequestExecutor {
      return SourcegraphApiRequestExecutor(server, token, true)
    }

    companion object {
      @JvmStatic
      val instance: Factory
        get() = service()
    }
  }

  companion object {
    private val LOG = logger<SourcegraphApiRequestExecutor>()
  }
}
