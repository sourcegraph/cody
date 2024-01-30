package com.sourcegraph.cody.commands

enum class CommandId(val displayName: String) {
  Explain("Explain Code"),
  Smell("Smell Code"),
  Test("Generate Test")
}
