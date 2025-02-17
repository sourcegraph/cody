---
title: Insufficient Content Security Policy (CSP)
description:  An insufficient Content Security Policy (CSP) fails to adequately restrict the sources from which a web page can load resources, creating vulnerabilities to attacks like cross-site scripting (XSS) and clickjacking.
tags: ["security", "xss"]
---

When reviewing code, identify the following issues:

- Missing or weak CSP headers
- Overly permissive CSP directives

Example:
```python
# Python (Flask): Weak CSP header
@app.after_request
def add_security_headers(response):
    response.headers['Content-Security-Policy'] = "default-src 'self' 'unsafe-inline'"
    return response
```
