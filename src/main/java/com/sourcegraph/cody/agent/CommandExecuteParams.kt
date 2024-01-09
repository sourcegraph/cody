package com.sourcegraph.cody.agent

data class CommandExecuteParams(val command: String, val args: List<String>)
