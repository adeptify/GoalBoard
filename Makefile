PNPM ?= pnpm

.PHONY: test build typecheck install check

install:
	$(PNPM) install

build:
	$(PNPM) build

typecheck:
	$(PNPM) typecheck

test:
	$(PNPM) test

check: test
