package com.sourcegraph.common

object AuthorizationUtil {
  fun isValidAccessToken(accessToken: String): Boolean {
    return accessToken.isEmpty() || (accessToken.length == 40 && accessToken.startsWith("sgp_"))
  }
}
