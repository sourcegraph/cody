package com.sourcegraph.cody.agent.protocol

data class IgnoreTestParams(val uri: String)

data class IgnoreTestResponse(
    val policy: String // "use" or "ignore"
)

data class TestingIgnoreOverridePolicy(val uriRe: String, val repoRe: String)
