package com.sourcegraph.cody.agent

class CodyAgentException : Exception {
  constructor(message: String?) : super(message)

  constructor(message: String?, e: Exception?) : super(message, e)

  override fun fillInStackTrace(): Throwable {
    // don't fill in stack trace
    return this
  }
}
