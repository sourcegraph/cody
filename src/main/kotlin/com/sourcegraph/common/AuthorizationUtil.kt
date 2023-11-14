package com.sourcegraph.common

object AuthorizationUtil {
  fun isValidAccessToken(accessToken: String): Boolean {
    // Sourcegraph access token formats: https://docs.sourcegraph.com/dev/security/secret_formats
    return accessToken.isEmpty() || accessToken.length == 40 || accessToken.startsWith("sgp_")
  }
}
