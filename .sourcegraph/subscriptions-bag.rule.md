---
title: Subscription Bag for Cleanup
description: Use a Subscription bag to manage and unsubscribe from RxJS subscriptions and other cleanup tasks.
lang: typescript
---

In TypeScript, Subscriptions (and other cleanup functions) should be added to a `Subscription` object (acting as a bag) and unsubscribed together when a component or class instance is no longer needed.

For example, instead of:

```typescript
class MyComponent extends React.Component {
  componentDidMount() {
    someObservable.subscribe(value => this.setState({ value }));
  }

  componentWillUnmount() {
    // Forgot to unsubscribe!
  }
}
```

Use this:

```typescript
class MyComponent extends React.Component {
  private subscriptions = new Subscription();

  componentDidMount() {
    this.subscriptions.add(
      someObservable.subscribe(value => this.setState({ value }))
    );
    // ...
  }

  componentWillUnmount() {
    this.subscriptions.unsubscribe();
  }
}
```
