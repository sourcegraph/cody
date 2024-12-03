package com.sourcegraph.cody.util

import com.sourcegraph.config.ConfigUtil

// See instructions in CONTRIBUTING.MD
// for how to update the `redacted` tokens when the access token changes.
data class TestingCredentials(
    val token: String?,
    val redactedToken: String,
    val serverEndpoint: String
) {
  companion object {
    val dotcom =
        TestingCredentials(
            token = System.getenv("SRC_DOTCOM_PRO_ACCESS_TOKEN"),
            redactedToken =
                "REDACTED_3dd704711f82a44ff6aba261b53b61a03fb8edba658774639148630d838c2d1d",
            serverEndpoint = ConfigUtil.DOTCOM_URL)
    val dotcomProUserRateLimited =
        TestingCredentials(
            token = System.getenv("SRC_DOTCOM_PRO_RATE_LIMIT_ACCESS_TOKEN"),
            redactedToken =
                "REDACTED_8c77b24d9f3d0e679509263c553887f2887d67d33c4e3544039c1889484644f5",
            serverEndpoint = ConfigUtil.DOTCOM_URL)
    val enterprise =
        TestingCredentials(
            token = System.getenv("SRC_ENTERPRISE_ACCESS_TOKEN"),
            redactedToken =
                "REDACTED_b20717265e7ab1d132874d8ff0be053ab9c1dacccec8dce0bbba76888b6a0a69",
            serverEndpoint = "https://demo.sourcegraph.com/")
    val s2 =
        TestingCredentials(
            token = System.getenv("SRC_S2_ACCESS_TOKEN"),
            redactedToken =
                "REDACTED_964f5256e709a8c5c151a63d8696d5c7ac81604d179405864d88ff48a9232364",
            serverEndpoint = "https://sourcegraph.sourcegraph.com/")
  }
}
