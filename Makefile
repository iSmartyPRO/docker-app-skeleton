.DEFAULT_GOAL := help

.PHONY: help env secrets network setup info ready version sync-version
.PHONY: bump-patch bump-minor bump-major _bump
.PHONY: build up start down stop restart rebuild rebuild-clean
.PHONY: ps status health monitor monitor-watch logs logs-tail shell
.PHONY: setup-status api-status
.PHONY: dev dev-build dev-down dev-restart dev-rebuild
.PHONY: dev-ps dev-status dev-health dev-logs dev-logs-tail dev-shell
.PHONY: postgres-up postgres-down postgres-health postgres-wait
.PHONY: db-setup db-create db-drop user-create user-drop
.PHONY: psql sql dbs users
.PHONY: install build-local test seed-demo clean clean-image

# ── Configuration ───────────────────────────────────────────────────────────
COMPOSE      ?= docker compose
COMPOSE_PROD := $(COMPOSE) -f docker-compose.yml
COMPOSE_DEV  := $(COMPOSE) -f docker-compose.dev.yml
SERVICE      := app
POSTGRES_DIR ?= /dockers/postgres

-include .env
export

PROJECT_ROOT := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
CONTAINER    := $(or $(DOCKER_NAME),docker-app-skeleton)
DEV_CONTAINER := $(CONTAINER)-dev
HOST_PORT    := $(or $(DOCKER_PORT),8092)
DEV_FE_PORT  := 3020
DEV_BE_PORT  := 3021
HEALTH_URL   := http://127.0.0.1:$(HOST_PORT)/health
DEV_HEALTH_URL := http://127.0.0.1:$(DEV_BE_PORT)/health
SETUP_URL    := http://127.0.0.1:$(HOST_PORT)/api/setup/status
API_STATUS_URL := http://127.0.0.1:$(HOST_PORT)/api/status
READY_URL    := http://127.0.0.1:$(HOST_PORT)/ready
APP_VERSION  := $(shell tr -d ' \t\n\r' < "$(PROJECT_ROOT)VERSION" 2>/dev/null || echo 0.0.1)
export APP_VERSION

# USER from the environment is the OS login — only honor command-line USER=
ifeq ($(origin USER),command line)
  PG_USER := $(USER)
else
  PG_USER := $(or $(PG_USER),$(POSTGRES_USER),docker_app_skeleton)
endif
PG_PASSWORD := $(or $(PG_PASSWORD),$(PASSWORD),$(POSTGRES_PASSWORD))
PG_DB       := $(or $(PG_DB),$(DB),$(POSTGRES_DB),docker_app_skeleton)
PG_OWNER    := $(or $(OWNER),$(PG_USER))

help: ## Show available commands
	@echo ""
	@echo "  docker-app-skeleton v$(APP_VERSION) — project commands"
	@echo "  ─────────────────────────────────────────────────────────────"
	@grep -E '^[a-zA-Z0-9_-]+: ## ' $(PROJECT_ROOT)Makefile | \
		awk 'BEGIN {FS = ": ## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "  .env: DOCKER_NAME=$(CONTAINER)  DOCKER_PORT=$(HOST_PORT)"
	@echo "  Prod: http://127.0.0.1:$(HOST_PORT)   Dev: :$(DEV_FE_PORT) (UI)  :$(DEV_BE_PORT) (API)"
	@echo "  Postgres: $(PG_USER)@$(or $(POSTGRES_HOST),postgres-18)/$(PG_DB)"
	@echo ""
	@echo "  Examples:"
	@echo "    make setup && make postgres-up && make db-setup PASSWORD='secret'"
	@echo "    make up && make health"
	@echo "    make logs-tail LINES=200"
	@echo "    make sql SQL=\"SELECT id, username, role FROM users;\""
	@echo ""

# ── Bootstrap ───────────────────────────────────────────────────────────────
env: ## Create .env from .env.example if missing and fill secrets
	@if [ ! -f "$(PROJECT_ROOT).env" ]; then \
		cp "$(PROJECT_ROOT).env.example" "$(PROJECT_ROOT).env"; \
		echo "Created .env from .env.example"; \
	else \
		echo ".env already exists"; \
	fi
	@$(MAKE) --no-print-directory secrets

secrets: ## Generate JWT_SECRET if empty
	@test -f "$(PROJECT_ROOT).env" || (echo "Missing .env — run make env"; exit 1)
	@current=$$(grep -E "^JWT_SECRET=" "$(PROJECT_ROOT).env" | head -1 | cut -d= -f2-); \
	if [ -z "$$current" ]; then \
		val=$$(openssl rand -hex 24); \
		if grep -qE "^JWT_SECRET=" "$(PROJECT_ROOT).env"; then \
			sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$$val/" "$(PROJECT_ROOT).env"; \
		else \
			printf '\nJWT_SECRET=%s\n' "$$val" >> "$(PROJECT_ROOT).env"; \
		fi; \
		echo "Generated JWT_SECRET"; \
	else \
		echo "JWT_SECRET already set"; \
	fi

network: ## Create docker-lan network if missing
	@docker network inspect docker-lan >/dev/null 2>&1 \
		|| (docker network create docker-lan && echo "Created network docker-lan")
	@echo "Network docker-lan ready."

setup: ## Prepare .env and docker-lan
	@$(MAKE) --no-print-directory env
	@$(MAKE) --no-print-directory network
	@echo ""
	@echo "Next steps:"
	@echo "  1. make postgres-up"
	@echo "  2. make db-setup PASSWORD='your-strong-password'"
	@echo "  3. make up"
	@echo "  4. open http://127.0.0.1:$(HOST_PORT)/setup"

info: ## Show resolved runtime configuration
	@echo "Version:       $(APP_VERSION)"
	@echo "Container:     $(CONTAINER)"
	@echo "Dev container: $(DEV_CONTAINER)"
	@echo "Host port:     $(HOST_PORT)"
	@echo "NODE_ENV:      $(or $(NODE_ENV),production)"
	@echo "Frontend URL:  $(or $(FRONTEND_URL),http://localhost:$(HOST_PORT))"
	@echo "Postgres host: $(or $(POSTGRES_HOST),postgres-18)"
	@echo "Postgres db:   $(PG_DB)"
	@echo "Postgres user: $(PG_USER)"
	@echo "Timezone:      $(or $(TZ),UTC)"
	@echo "Prod URL:      http://127.0.0.1:$(HOST_PORT)"
	@echo "Dev UI:        http://127.0.0.1:$(DEV_FE_PORT)"
	@echo "Dev API:       http://127.0.0.1:$(DEV_BE_PORT)"

# ── Versioning ──────────────────────────────────────────────────────────────
version: ## Show current app version
	@echo "$(APP_VERSION)"

sync-version: ## Copy VERSION into package.json / package-lock.json (UI reads VERSION at build)
	@ver="$(APP_VERSION)"; \
	test -n "$$ver" || { echo "VERSION file is empty"; exit 1; }; \
	for dir in "$(PROJECT_ROOT)src/frontend" "$(PROJECT_ROOT)src/backend"; do \
		sed -i 's/"version": "[^"]*"/"version": "'$$ver'"/' "$$dir/package.json"; \
		test -f "$$dir/package-lock.json" && sed -i '1,12s/"version": "[^"]*"/"version": "'$$ver'"/' "$$dir/package-lock.json"; \
	done; \
	echo "Synced version $$ver"

bump-patch: ## Bump patch version (x.y.Z)
	@$(MAKE) --no-print-directory _bump PART=patch

bump-minor: ## Bump minor version (x.Y.0)
	@$(MAKE) --no-print-directory _bump PART=minor

bump-major: ## Bump major version (X.0.0)
	@$(MAKE) --no-print-directory _bump PART=major

_bump:
	@ver="$(APP_VERSION)"; \
	echo "$$ver" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$$' || { echo "VERSION must be semver x.y.z, got: $$ver"; exit 1; }; \
	major=$${ver%%.*}; rest=$${ver#*.}; minor=$${rest%%.*}; patch=$${rest#*.}; \
	case "$(PART)" in \
		major) major=$$((major+1)); minor=0; patch=0 ;; \
		minor) minor=$$((minor+1)); patch=0 ;; \
		patch) patch=$$((patch+1)) ;; \
		*) echo "Unknown PART=$(PART)"; exit 1 ;; \
	esac; \
	next="$$major.$$minor.$$patch"; \
	printf '%s\n' "$$next" > "$(PROJECT_ROOT)VERSION"; \
	$(MAKE) --no-print-directory sync-version APP_VERSION=$$next; \
	echo "Bumped $(PART): $$ver -> $$next"

# ── Production (docker-compose.yml) ─────────────────────────────────────────
build: ## Build production image
	@$(MAKE) --no-print-directory env
	@$(MAKE) --no-print-directory network
	$(COMPOSE_PROD) build

up: ## Start production container
	@$(MAKE) --no-print-directory env
	@$(MAKE) --no-print-directory network
	$(COMPOSE_PROD) up -d --build
	@echo "App:    http://127.0.0.1:$(HOST_PORT)"
	@echo "Setup:  http://127.0.0.1:$(HOST_PORT)/setup"
	@echo "Health: $(HEALTH_URL)"

start: ## Alias: start production
	@$(MAKE) --no-print-directory up

down: ## Stop production container
	$(COMPOSE_PROD) down

stop: ## Alias: stop production
	@$(MAKE) --no-print-directory down

restart: ## Restart production (no rebuild)
	$(COMPOSE_PROD) restart $(SERVICE)

rebuild: ## Rebuild image and recreate production
	@$(MAKE) --no-print-directory env
	@$(MAKE) --no-print-directory network
	$(COMPOSE_PROD) up -d --build --force-recreate
	@$(MAKE) --no-print-directory prune-build

prune-build: ## Trim Docker build cache (keeps 4 GB) and untagged images, so rebuilds never fill the disk
	@docker builder prune -f --max-used-space 4gb >/dev/null 2>&1 || true
	@docker image prune -f >/dev/null 2>&1 || true
	@df -h / | awk 'NR==2 {print "Disk: " $$3 " used, " $$4 " free (" $$5 ")"}'

rebuild-clean: ## Rebuild production without Docker cache
	@$(MAKE) --no-print-directory env
	@$(MAKE) --no-print-directory network
	$(COMPOSE_PROD) build --no-cache
	$(COMPOSE_PROD) up -d --force-recreate

ps: ## Show production container status
	@$(COMPOSE_PROD) ps
	@echo ""
	@docker inspect $(CONTAINER) --format='Container: {{.Name}}  State: {{.State.Status}}  Started: {{.State.StartedAt}}' 2>/dev/null || \
		echo "Container $(CONTAINER) is not running."

status: ## Production status + healthcheck
	@$(MAKE) --no-print-directory ps
	@echo ""
	@$(MAKE) --no-print-directory health || true

health: ## Check production /health
	@printf "Healthcheck %s ... " "$(HEALTH_URL)"
	@if curl -fsS -m 5 "$(HEALTH_URL)"; then \
		echo ""; \
	else \
		echo "FAIL"; \
		exit 1; \
	fi

ready: ## Check production /ready (includes PostgreSQL)
	@printf "Ready %s ... " "$(READY_URL)"
	@if curl -fsS -m 5 "$(READY_URL)"; then \
		echo ""; \
	else \
		echo "FAIL"; \
		exit 1; \
	fi

setup-status: ## GET /api/setup/status
	@curl -fsS -m 5 "$(SETUP_URL)"; echo

api-status: ## GET /api/status (DB + app settings)
	@curl -fsS -m 5 "$(API_STATUS_URL)"; echo

monitor: ## Status, health, and container resources
	@$(MAKE) --no-print-directory ps
	@echo ""
	@$(MAKE) --no-print-directory health || true
	@echo ""
	@if docker inspect $(CONTAINER) >/dev/null 2>&1; then \
		echo "Resources:"; \
		docker stats --no-stream --format '  CPU {{.CPUPerc}}  MEM {{.MemUsage}}  NET {{.NetIO}}  PIDS {{.PIDs}}' $(CONTAINER); \
	else \
		echo "Container $(CONTAINER) not running — skip docker stats."; \
	fi

monitor-watch: ## Refresh monitor every 5 seconds (Ctrl+C to stop)
	@while true; do \
		clear; \
		date; \
		echo ""; \
		$(MAKE) --no-print-directory monitor; \
		sleep 5; \
	done

logs: ## Follow production logs
	$(COMPOSE_PROD) logs -f $(SERVICE)

logs-tail: ## Last N log lines: make logs-tail LINES=100
	$(COMPOSE_PROD) logs --tail=$(or $(LINES),100) $(SERVICE)

shell: ## Shell inside production container
	$(COMPOSE_PROD) exec $(SERVICE) sh

# ── Development (docker-compose.dev.yml) ────────────────────────────────────
dev-build: ## Build development image
	@$(MAKE) --no-print-directory env
	@$(MAKE) --no-print-directory network
	$(COMPOSE_DEV) build

dev: ## Start development (Vite :3020, API :3021)
	@$(MAKE) --no-print-directory env
	@$(MAKE) --no-print-directory network
	$(COMPOSE_DEV) up -d --build
	@echo "Frontend: http://127.0.0.1:$(DEV_FE_PORT)"
	@echo "Backend:  http://127.0.0.1:$(DEV_BE_PORT)"
	@echo "Health:   $(DEV_HEALTH_URL)"

dev-down: ## Stop development container
	$(COMPOSE_DEV) down

dev-restart: ## Restart development (no rebuild)
	$(COMPOSE_DEV) restart $(SERVICE)

dev-rebuild: ## Rebuild and recreate development
	@$(MAKE) --no-print-directory env
	@$(MAKE) --no-print-directory network
	$(COMPOSE_DEV) up -d --build --force-recreate

dev-ps: ## Show development container status
	@$(COMPOSE_DEV) ps
	@echo ""
	@docker inspect $(DEV_CONTAINER) --format='Container: {{.Name}}  State: {{.State.Status}}  Started: {{.State.StartedAt}}' 2>/dev/null || \
		echo "Container $(DEV_CONTAINER) is not running."

dev-status: ## Development status + healthcheck
	@$(MAKE) --no-print-directory dev-ps
	@echo ""
	@$(MAKE) --no-print-directory dev-health || true

dev-health: ## Check development /health
	@printf "Healthcheck %s ... " "$(DEV_HEALTH_URL)"
	@if curl -fsS -m 5 "$(DEV_HEALTH_URL)"; then \
		echo ""; \
	else \
		echo "FAIL"; \
		exit 1; \
	fi

dev-logs: ## Follow development logs
	$(COMPOSE_DEV) logs -f $(SERVICE)

dev-logs-tail: ## Last N dev log lines: make dev-logs-tail LINES=100
	$(COMPOSE_DEV) logs --tail=$(or $(LINES),100) $(SERVICE)

dev-shell: ## Shell inside development container
	$(COMPOSE_DEV) exec $(SERVICE) sh

# ── PostgreSQL (delegates to /dockers/postgres) ─────────────────────────────
postgres-up: ## Start shared PostgreSQL stack
	@$(MAKE) -C $(POSTGRES_DIR) up
	@$(MAKE) -C $(POSTGRES_DIR) wait

postgres-down: ## Stop shared PostgreSQL stack
	@$(MAKE) -C $(POSTGRES_DIR) down

postgres-health: ## Check PostgreSQL readiness
	@$(MAKE) -C $(POSTGRES_DIR) health

postgres-wait: ## Wait until PostgreSQL is ready
	@$(MAKE) -C $(POSTGRES_DIR) wait

db-setup: ## Create app role + database (PASSWORD= or POSTGRES_PASSWORD)
	@if [ -z "$(PG_PASSWORD)" ]; then \
		echo "Set POSTGRES_PASSWORD in .env or pass PASSWORD='...' / PG_PASSWORD='...'"; \
		exit 1; \
	fi
	@$(MAKE) -C $(POSTGRES_DIR) user-create USER="$(PG_USER)" PASSWORD="$(PG_PASSWORD)"
	@$(MAKE) -C $(POSTGRES_DIR) db-create DB="$(PG_DB)" OWNER="$(PG_OWNER)"
	@echo "Role $(PG_USER) and database $(PG_DB) are ready."
	@echo "Put the same credentials into .env (or finish /setup)."

user-create: ## Create Postgres role: make user-create USER=docker_app_skeleton PASSWORD='secret'
	@if [ -z "$(PG_PASSWORD)" ]; then \
		echo "Usage: make user-create USER=$(PG_USER) PASSWORD='secret'"; \
		exit 1; \
	fi
	@$(MAKE) -C $(POSTGRES_DIR) user-create USER="$(PG_USER)" PASSWORD="$(PG_PASSWORD)"

user-drop: ## Drop Postgres role: make user-drop USER=docker_app_skeleton FORCE=1
	@$(MAKE) -C $(POSTGRES_DIR) user-drop USER="$(PG_USER)" FORCE="$(FORCE)"

db-create: ## Create database: make db-create DB=docker_app_skeleton [OWNER=docker_app_skeleton]
	@$(MAKE) -C $(POSTGRES_DIR) db-create DB="$(PG_DB)" OWNER="$(PG_OWNER)"

db-drop: ## Drop database: make db-drop DB=docker_app_skeleton FORCE=1
	@$(MAKE) -C $(POSTGRES_DIR) db-drop DB="$(PG_DB)" FORCE="$(FORCE)"

psql: ## Interactive psql as postgres admin (DB=docker_app_skeleton)
	@$(MAKE) -C $(POSTGRES_DIR) psql DB="$(PG_DB)"

sql: ## Run SQL: make sql SQL="SELECT 1" [DB=docker_app_skeleton]
	@if [ -z "$(SQL)" ]; then echo "Usage: make sql SQL='SELECT 1' [DB=$(PG_DB)]"; exit 1; fi
	@$(MAKE) -C $(POSTGRES_DIR) sql DB="$(PG_DB)" SQL="$(SQL)"

dbs: ## List PostgreSQL databases
	@$(MAKE) -C $(POSTGRES_DIR) dbs

users: ## List PostgreSQL roles
	@$(MAKE) -C $(POSTGRES_DIR) users

# ── Local host helpers ──────────────────────────────────────────────────────
install: ## Install npm dependencies on the host
	@echo "Installing backend dependencies..."
	@cd "$(PROJECT_ROOT)src/backend" && npm ci
	@echo "Installing frontend dependencies..."
	@cd "$(PROJECT_ROOT)src/frontend" && npm ci
	@echo "Done."

seed-demo: ## Add sample users (no passwords) to the running production database
	docker exec -w /app/backend $(CONTAINER) node scripts/seed-demo.js

test: ## Run backend unit tests and a frontend build on the host
	@cd "$(PROJECT_ROOT)src/backend" && npm test
	@cd "$(PROJECT_ROOT)src/frontend" && npm run build

build-local: ## Build frontend on the host (no Docker)
	@cd "$(PROJECT_ROOT)src/frontend" && npm run build
	@echo "Local frontend build complete."

# ── Cleanup ─────────────────────────────────────────────────────────────────
clean: ## Stop production and development containers
	@$(COMPOSE_PROD) down
	@$(COMPOSE_DEV) down
	@echo "Clean complete."

clean-image: ## Stop stacks and remove local images
	@$(COMPOSE_PROD) down --rmi local 2>/dev/null || true
	@$(COMPOSE_DEV) down --rmi local 2>/dev/null || true
	@echo "Local images removed."
