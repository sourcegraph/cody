package com.sourcegraph.common;

import org.jetbrains.annotations.NotNull;

public class AuthorizationUtil {
  public static boolean isValidAccessToken(@NotNull String accessToken) {
    // Sourcegraph access token formats: https://docs.sourcegraph.com/dev/security/secret_formats
    return accessToken.isEmpty() || accessToken.length() == 40 || accessToken.startsWith("sgp_");
  }
}
