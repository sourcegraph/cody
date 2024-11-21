package com.sourcegraph.cody.auth

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.util.Url
import com.intellij.util.Urls
import java.util.concurrent.CompletableFuture
import org.jetbrains.ide.BuiltInServerManager

@Service
internal class SourcegraphAuthService : AuthServiceBase() {

  override val name: String
    get() = SERVICE_NAME

  fun authorize(server: String, authMethod: SsoAuthMethod): CompletableFuture<String> {
    return authorize(SourcegraphAuthRequest(name, server, authMethod))
  }

  private class SourcegraphAuthRequest(
      override val serviceName: String,
      val server: String,
      val authMethod: SsoAuthMethod
  ) : AuthRequest {
    private val port: Int
      get() = BuiltInServerManager.getInstance().port

    override val authUrlWithParameters: Url = createUrl()

    private fun createUrl() =
        when (authMethod) {
          SsoAuthMethod.GITHUB -> {
            val end =
                ".auth/openidconnect/login?prompt_auth=github&pc=sams&redirect=/user/settings/tokens/new/callback?requestFrom=JETBRAINS-$port"
            Urls.newFromEncoded(server + end)
          }
          SsoAuthMethod.GITLAB -> {
            val end =
                ".auth/openidconnect/login?prompt_auth=gitlab&pc=sams&redirect=/user/settings/tokens/new/callback?requestFrom=JETBRAINS-$port"
            Urls.newFromEncoded(server + end)
          }
          SsoAuthMethod.GOOGLE -> {
            val end =
                ".auth/openidconnect/login?prompt_auth=google&pc=sams&redirect=/user/settings/tokens/new/callback?requestFrom=JETBRAINS-$port"
            Urls.newFromEncoded(server + end)
          }
          else ->
              serviceUrl(server)
                  .addParameters(mapOf("requestFrom" to "JETBRAINS", "port" to port.toString()))
        }
  }

  companion object {
    private const val SERVICE_NAME = "sourcegraph"

    @JvmStatic
    val instance: SourcegraphAuthService
      get() = service()

    @JvmStatic
    fun serviceUrl(server: String): Url =
        Urls.newFromEncoded(server + "user/settings/tokens/new/callback")
  }
}
