---
title: Insecure Cookie Settings
description:  Insecure cookie settings occur when cookies are configured without appropriate security attributes, making them vulnerable to attacks like cross-site scripting (XSS) and session hijacking.
tags: ["security", "xss"]
---

When reviewing code, identify the following issues:

- Missing HttpOnly flag on sensitive cookies
- Absence of Secure flag for cookies in HTTPS applications

Example:
```javascript
// JavaScript (Express.js): Insecure cookie settings
res.cookie('sessionId', sessionId, { httpOnly: false, secure: false });
```