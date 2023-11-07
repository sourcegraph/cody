package com.sourcegraph.cody.agent.protocol

data class ContextMessage(
    override val speaker: Speaker,
    override val text: String,
    val file: ContextFile?
) : Message
