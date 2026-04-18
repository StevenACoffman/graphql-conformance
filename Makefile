.PHONY: build test test-core gen-corpus prepare-smoke-corpus run-conformer run-conformer-smoke run-impl diff-impl serve-site ci-smoke clean clean-results clean-corpus clean-ci

SMOKE_CORPUS_DIR ?= $(CURDIR)/.tmp/corpus-smoke
SMOKE_RESULTS_DIR ?= $(CURDIR)/.tmp/ci-results
SMOKE_SITE_DATA_DIR ?= $(CURDIR)/.tmp/site-data

build:
	$(MAKE) -C conformer build
	$(MAKE) -C corpus-gen build

test:
	node --test site/build.test.js
	$(MAKE) -C results test
	$(MAKE) -C corpus-gen test
	$(MAKE) -C conformer test
	$(MAKE) -C impls test

test-core:
	node --test site/build.test.js
	$(MAKE) -C results test
	$(MAKE) -C corpus-gen test
	$(MAKE) -C conformer test

gen-corpus:
	$(MAKE) -C corpus-gen gen

run-conformer:
	$(MAKE) -C conformer run
	node site/build.js results/data

prepare-smoke-corpus:
	node scripts/prepare-smoke-corpus.js $(SMOKE_CORPUS_DIR)

run-conformer-smoke: prepare-smoke-corpus
	rm -rf $(SMOKE_RESULTS_DIR) $(SMOKE_SITE_DATA_DIR)
	mkdir -p $(SMOKE_RESULTS_DIR) $(SMOKE_SITE_DATA_DIR)
	CORPUS_DIR=$(SMOKE_CORPUS_DIR) RESULTS_DIR=$(SMOKE_RESULTS_DIR) node conformer/src/index.js
	SITE_DATA_DIR=$(SMOKE_SITE_DATA_DIR) node site/build.js $(SMOKE_RESULTS_DIR)

run-impl:
	@test -n "$(IMPL)" -a -n "$(TEST)" || { echo "Usage: make run-impl IMPL=<name> TEST=<corpus-path>"; exit 1; }
	@node conformer/src/run-impl.js $(IMPL) $(TEST)

diff-impl:
	@test -n "$(IMPL)" -a -n "$(TEST)" || { echo "Usage: make diff-impl IMPL=<name> TEST=<corpus-path>"; exit 1; }
	@node conformer/src/diff-impl.js $(IMPL) $(TEST)

serve-site:
	node site/build.js results/data
	@python3 -m http.server 8000 -d site & \
		PID=$$!; \
		trap "kill $$PID 2>/dev/null" EXIT; \
		sleep 0.5; \
		echo "Serving site at http://localhost:8000 (pid $$PID)"; \
		open http://localhost:8000; \
		wait $$PID

ci-smoke:
	$(MAKE) build
	$(MAKE) test-core
	$(MAKE) run-conformer-smoke

clean-corpus:
	@find corpus -mindepth 1 -maxdepth 1 -type d ! -name '0' -exec rm -rf {} +

clean-results:
	rm -rf results/data

clean:
	$(MAKE) -C conformer clean
	$(MAKE) -C corpus-gen clean
	$(MAKE) -C impls clean

clean-ci:
	rm -rf .tmp
