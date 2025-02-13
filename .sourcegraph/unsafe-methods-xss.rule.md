---
title: Unsafe JavaScript Methods
description: Unsafe JavaScript methods are functions or techniques in JavaScript that can introduce security vulnerabilities, such as cross-site scripting (XSS) or code injection, if not handled properly.
tags: ["security", "xss"]
lang: ["javascript", "typescript"]
---

When reviewing code, identify the following issues:

- Use of dangerous functions like innerHTML with user input
- Directly writing user input to document.write()

Example:
```typescript
// JS/TS: Unsafe DOM manipulation
function showUserProfile(profile: any) {
    const profileDiv = document.getElementById('profile');
    profileDiv.innerHTML = `<h2>${profile.name}</h2><p>${profile.bio}</p>`;
}
```
