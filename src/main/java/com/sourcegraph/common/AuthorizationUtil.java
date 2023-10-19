package com.sourcegraph.common;

import org.jetbrains.annotations.NotNull;

public class AuthorizationUtil {
  public static boolean isValidAccessToken(@NotNull String accessToken) {
    return accessToken.isEmpty()
        || accessToken.length() == 40
        || (accessToken.startsWith("sgp_") && accessToken.length() == 44)
        // See https://docs.google.com/document/d/1aC4gHB8Q5lurwVhc8SCxznR0blNJMKo7yIkpP7WShno
        || (accessToken.startsWith("sgp_") && accessToken.length() == 61)
        || (accessToken.startsWith("sgph_") && accessToken.length() == 62);
  }
}
