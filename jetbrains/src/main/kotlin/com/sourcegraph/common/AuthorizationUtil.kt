package com.sourcegraph.common

object AuthorizationUtil {
  fun isValidAccessToken(accessToken: String): Boolean {
    return accessToken.isEmpty() || (accessToken.length == 61 && accessToken.startsWith("sgp_"))
  }
}
