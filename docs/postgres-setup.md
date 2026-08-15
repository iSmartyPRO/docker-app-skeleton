# PostgreSQL setup (docker-lan)

Canonical guide: **[postgres.md](postgres.md)**.

This file remains as a short pointer for hosts that already run `/dockers/postgres`.

```bash
docker network create docker-lan
make postgres-up
make db-setup PASSWORD='your-strong-password'
make setup
make up
```

Wizard host: `postgres-18`. Database and role: `docker_app_skeleton` unless you changed `.env`.
