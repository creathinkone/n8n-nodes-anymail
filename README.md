# n8n-nodes-anymail

n8n community nodes for [anymail](https://anymail.watch), a cold email platform.

- **anymail** node: create or update a prospect, get one by email, search; add a prospect to a campaign, start, pause, resume, stop a campaign; add an email or domain to the suppression list.
- **anymail Trigger** node: instant triggers for new replies, interested / maybe later / not interested, auto-replies, bounces, unsubscribes, link clicks, opens, new prospects, campaign paused and completed.

## Install

In n8n open **Settings, Community nodes, Install** and enter `n8n-nodes-anymail`.

## Credentials

In anymail open **Settings, Integrations, API keys** and create a key with the `read` and `write` scopes (it starts with `sgn_`). Paste it into the **anymail API** credential. Guide: https://developers.anymail.watch/n8n/

`Campaign: Start` sends real email. Ask a person before it runs in an unattended workflow.

## Develop

```bash
npm install
npm test
```

MIT licensed.
