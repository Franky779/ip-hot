# RSSHub for Disney X timeline

This configuration runs a private RSSHub instance for IP-HOT. It listens only
on the Tencent server loopback interface and is not exposed through Nginx or a
public firewall port.

## Security boundary

- Use a dedicated, low-privilege X account. It does not need to own or manage
  the Disney account.
- Never put the X password or `TWITTER_AUTH_TOKEN` in this repository, an
  IP-HOT source URL, a screenshot, or a chat message.
- Store the token only in `/srv/apps/rsshub/shared/rsshub.env`, owned by
  `root:root` with mode `0600`.
- The image is pinned to the linux/amd64 manifest verified on 2026-07-27.
  Resolve and review a new digest explicitly before upgrading.

## Server layout

```text
/srv/apps/rsshub/compose.yaml
/srv/apps/rsshub/shared/rsshub.env
```

The environment file contains exactly one line:

```text
TWITTER_AUTH_TOKEN=<dedicated X account auth_token cookie value>
```

## Deployment

Run these commands as root after the environment file has been installed:

```bash
cd /srv/apps/rsshub
docker compose --env-file shared/rsshub.env config --quiet
docker compose --env-file shared/rsshub.env pull
docker compose --env-file shared/rsshub.env up -d
```

No Redis or browser container is included in the pilot. The Twitter user route
does not require a browser, and one source can use RSSHub's in-process cache.

## Acceptance checks

```bash
docker compose --env-file shared/rsshub.env ps
curl --fail --silent --show-error http://127.0.0.1:1200/healthz
curl --fail --silent --show-error http://127.0.0.1:1200/twitter/user/Disney
docker compose --env-file shared/rsshub.env logs --tail 100 rsshub
```

The Disney route must return non-empty RSS or Atom XML with X post links. A
healthy container alone is not sufficient: authentication, item count, dates,
and links must also be checked.

## IP-HOT source

Add the source in a paused state first, then test it before enabling cloud
fetching.

```text
Name: Disney 官方 X（Twitter）
URL: http://127.0.0.1:1200/twitter/user/Disney
Region: overseas
Section ID: overseas-licensing
Section title: 海外IP授权 / 玩具 / 潮玩
Fetch type: rss
Execution mode: paused, then cloud after a successful test
Schedule: daily
```

After the source test succeeds, run one explicit source fetch and verify its
`source_fetch_runs` result and the IP-HOT monitor before relying on automation.

## Rollback

Pause the Disney source in IP-HOT, then stop the isolated container:

```bash
cd /srv/apps/rsshub
docker compose --env-file shared/rsshub.env down
```

This does not modify or remove IP-HOT, PostgreSQL, Nginx, or the existing
`we-mp-rss` container. Keep the root-only environment file until diagnosis is
complete; revoke the X token if the pilot is abandoned or the credential may
have been exposed.
