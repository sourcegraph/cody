package com.sourcegraph.cody.agent.protocol

import org.eclipse.lsp4j.jsonrpc.ResponseErrorException

enum class ErrorCode(val code: Int) {
  ParseError(-32700),
  InvalidRequest(-32600),
  MethodNotFound(-32601),
  InvalidParams(-32602),
  InternalError(-32603),
  RateLimitError(-32000)
}

object ErrorCodeUtils {
  fun ResponseErrorException.toErrorCode(): ErrorCode? =
      ErrorCode.values().find { it.code == responseError.code }
}
