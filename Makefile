# local dev stack. see hex_map-local-stack.md for what each piece is.
# supabase -> rust backend (:8080) -> vite frontend (:5173)
.DEFAULT_GOAL := help
STACK := bash scripts/dev-stack.sh

.PHONY: help up down restart status logs wipe

help: ## show this help
	@grep -E '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | sort | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-9s\033[0m %s\n", $$1, $$2}'

up: ## start the whole stack in the right order, wait for each to be healthy
	@$(STACK) up

down: ## stop frontend + backend, stop supabase (keeps db data)
	@$(STACK) down

restart: ## down then up
	@$(STACK) restart

status: ## is each of the three up?
	@$(STACK) status

logs: ## tail backend + frontend logs
	@$(STACK) logs

wipe: ## stop everything and wipe local supabase data (fresh migrations + seed next up)
	@$(STACK) wipe
