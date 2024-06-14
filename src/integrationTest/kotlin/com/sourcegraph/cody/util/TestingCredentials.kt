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
                "REDACTED_d5e0f0a37c9821e856b923fe14e67a605e3f6c0a517d5a4f46a4e35943ee0f6d",
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
