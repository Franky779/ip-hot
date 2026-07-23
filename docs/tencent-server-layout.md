# Tencent server layout

The server keeps one shared web entry point and isolates each application by Linux user, directory, port, database, and timer unit.

## Directory layout

```text
/srv/
  apps/
    ip-hot/
      current/                 # deployed Next.js release
      shared/
        .env.production.local  # application secrets, mode 0600
        curl-auth.conf         # private curl header for systemd timers, mode 0600
  jobs/                        # future standalone scheduled scripts
    <job-name>/
  www/                         # future static HTML tools
    <tool-name>/public/
  backups/
    postgresql/                # daily custom-format pg_dump files
/var/log/
  ip-hot/                      # systemd-managed application logs
/etc/nginx/conf.d/
  ip-hot.conf                  # one virtual host file per domain
/etc/systemd/system/
  ip-hot-*.service
  ip-hot-*.timer
```

Future Next.js or API applications should use a separate system user, PostgreSQL database, and loopback port (`3102`, `3103`, and so on). Static HTML tools do not need Node.js; point an Nginx virtual host directly at `/srv/www/<tool>/public`. Scheduled scripts belong in `/srv/jobs/<job-name>` and get their own systemd service/timer rather than sharing the IP Hot process.

## Disk budget

The current 70 GB XFS root filesystem should not be repartitioned. Repartitioning adds risk and provides no performance benefit for this workload. Use these operating budgets instead:

- OS, packages, and panel: 12 GB
- application releases and build cache: 10 GB
- PostgreSQL data: 25 GB
- database backups: 15 GB
- logs, temporary files, and free reserve: 8 GB

Alert at 70% disk usage and investigate at 80%. PostgreSQL remains bound to `127.0.0.1:5432`; it must never be opened in the Tencent security group.

## Public ports

- `22/tcp`: SSH, preferably restricted to the administrator IP
- `80/tcp`: HTTP and certificate validation
- `443/tcp`: HTTPS
- `8888/tcp`: BaoTa panel; restrict to the administrator IP or VPN

Application ports (`3101+`) and PostgreSQL (`5432`) stay on loopback and are never public.

## Backups and rollback

- PostgreSQL: daily `pg_dump` custom-format backup, seven-day local retention
- Application: keep the previous release directory until the new release passes the health checks
- Off-server copy: add a weekly encrypted copy to COS or another machine; local backups alone do not protect against disk loss
- DNS cutover: keep the former Vercel deployment intact until the Tencent deployment has passed 24 hours of checks
- Routine releases never import migration archives. Database import is an explicit, one-time operation.
- Each release is activated only after Nginx validation and is rolled back automatically if the application health check fails.
- A systemd timer checks the home page, sources API, and authenticated monitor API every five minutes.

## Update workflow

1. Make each change in `D:\claudecode\[2]工作项目\[10]IP-HOT咨询聚合网站源代码`.
2. Run the checks and start a local preview URL for acceptance.
3. Wait for the user to confirm that the preview is correct.
4. Deploy the same committed revision to Tencent Cloud and run production health checks.
5. Push that revision to GitHub as the source backup.

Do not deploy or push a code change before the local preview has been accepted.
