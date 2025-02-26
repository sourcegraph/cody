---
title: Check repo permissions in handlers
description: Ensure that data returned by db.Reviews() methods is checked to ensure the actor has permissions to the reviews' repositories.
tags: ["security", "api"]
lang: go
---

For any data returned from a call to `(database.DB).Reviews()` methods, such as `db.Reviews().List(ctx, options)`, ensure that there is a repository permissions check that ensures the actor is authorized to view or operate on that review.

For example:

```go
reviews, err := db.Reviews().List(ctx, options)
// handle err
for _, review := range reviews {
    // Ensure the actor can view the repository, raise error if not
    if err := db.Repos().Get(ctx, review.RepoID); err != nil {
        return nil, err
    }
}
```

Each element in the `reviews` slice must be checked with a call to `db.Repos().Get` or `db.Repos().GetByName` to ensure the actor can view that review's repository.
