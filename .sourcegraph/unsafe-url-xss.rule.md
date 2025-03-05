---
title: Unsafe URL Handling
description:  Unsafe URL handling occurs when an application processes or uses URLs in a way that allows malicious actors to manipulate or inject harmful code, potentially leading to vulnerabilities like open redirects, cross-site scripting (XSS), or server-side request forgery (SSRF).
tags: ["security", "xss"]
---

When reviewing code, identify the following issues:

- Direct use of user-provided URLs without validation
- Insufficient encoding of URL parameters

Example:
```java
// Java: Unsafe URL handling
String redirectUrl = request.getParameter("redirect");
response.sendRedirect(redirectUrl);
```
