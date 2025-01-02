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
                "REDACTED_fc324d3667e841181b0779375f26dedc911d26b303d23b29b1a2d7ee63dc77eb",
            serverEndpoint = ConfigUtil.DOTCOM_URL)
    val dotcomProUserRateLimited =
        TestingCredentials(
            token = System.getenv("SRC_DOTCOM_PRO_RATE_LIMIT_ACCESS_TOKEN"),
            redactedToken =
                "REDACTED_c31e1e5cbed2b06911f09e4e9766c7df227fb23b80cb364c1fe289a845667b4e",
            serverEndpoint = ConfigUtil.DOTCOM_URL)
    val enterprise =
        TestingCredentials(
            token = System.getenv("SRC_ENTERPRISE_ACCESS_TOKEN"),
            redactedToken =
                "REDACTED_69e9f79ce29352d014eeb80b56510341844eb82ad9abac7cab3631c7e873e4ce",
            serverEndpoint = "https://demo.sourcegraph.com/")
    val s2 =
        TestingCredentials(
            token = System.getenv("SRC_S2_ACCESS_TOKEN"),
            redactedToken =
                "REDACTED_1858aad0e1ff07ae26d4042086acb9da455866ad617afd2cb9ab9419e1be1104",
            serverEndpoint = "https://sourcegraph.sourcegraph.com/")
  }
}
