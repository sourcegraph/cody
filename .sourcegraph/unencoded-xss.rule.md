---
title: Unencoded Output
description: Unencoded output occurs when data received from a user or another source is displayed or used in a web page without proper encoding, allowing attackers to inject malicious code.
tags: ["security", "xss"]
---

When reviewing code, identify the following issues:

- Direct insertion of user-controlled data into HTML
- Lack of encoding in JavaScript string concatenation

Examples:
```php
// PHP: Reflected XSS vulnerability
echo \"<div>Welcome, \" . $_GET['name'] . \"!</div>\";
```

```javascript
// JavaScript: DOM-based XSS vulnerability
document.getElementById('greeting').innerHTML = 'Hello, ' + userName;
```
