package com.sourcegraph.cody.util

// See instructions in CONTRIBUTING.MD
// for how to update the `redacted` tokens when the access token changes.
data class TestingCredentials(
    val token: String?,
    val redactedToken: String,
    val serverEndpoint: String
) {
  companion object {
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
