---
title: Asynchronous and synchronous functions
description: Incorrect usage synchronous and asynchonous functions and methods
tags: ["bug", "logic"]
---

Identify the following issues:

- Missing use of async/await where appropriate
- Absence of Promises or Tasks for asynchronous operations
- Incorrect use of synchronous and asynchonous functions

Example:

```javascript
// JavaScript: Not using Promises for asynchronous operations
function fetchData(callback) {
    setTimeout(() => {
        const data = { id: 1, name: 'John' };
        callback(data);
    }, 1000);
}

fetchData((data) => {
    console.log(data);
    // Nested callbacks can lead to "callback hell"
});
```
