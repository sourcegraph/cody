package com.sourcegraph.cody.commands

enum class CommandId(val id: String, val displayName: String) {
  Explain("cody.command.Explain", "Explain Code"),
  Smell("cody.command.Smell", "Smell Code"),
}
