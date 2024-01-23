package com.sourcegraph.cody.chat

enum class CommandId(val displayName: String) {
  Explain("Explain Code"),
  Smell("Smell Code"),
  Test("Generate Test")
}
