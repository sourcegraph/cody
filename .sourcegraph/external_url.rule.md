---
lang: go
---

Check for incorrect access patterns of `conf.Get().ExternalURL`:

- The external URL should always be retrieved from the database
- Correct pattern: db.Conf().GetExternalURL(ctx)
- The external URL should never be retrieved from the conf package
- Incorrect pattern: conf.SiteConfig().ExternalURL
- Explain that this is a requirement for Enterprise Starter (aka. Multitenant) because the external URL depends on the current tenant
