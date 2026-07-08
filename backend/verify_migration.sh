#!/usr/bin/env bash
# Run from your backend/ root: bash verify_migration.sh
# Checks that every change from both migration passes (original routing
# migration + this session's Step 5b/6/7 + document_retriever wiring)
# is actually present in your files. Prints PASS/FAIL per check, exits
# non-zero if anything is missing.

set -uo pipefail
APP=app
fail=0

check() {
  local file="$1" pattern="$2" label="$3"
  if [ ! -f "$file" ]; then
    echo "FAIL  [$label] — file not found: $file"
    fail=1
    return
  fi
  if grep -qF "$pattern" "$file"; then
    echo "PASS  [$label]"
  else
    echo "FAIL  [$label] — pattern not found in $file"
    fail=1
  fi
}

echo "== Original routing migration =="
check "$APP/services/routing/conversation_router.py" "class ConversationRouter" "router class exists"
check "$APP/services/routing/schemas.py" "VALID_CATEGORIES" "router schema exists"
check "$APP/services/confidence.py" "LOW_CONFIDENCE_THRESHOLD" "confidence thresholds exist"
check "$APP/services/rag_pipeline.py" "self.router.route(" "RAGPipeline routes before planner"
check "$APP/services/new_pipeline/pipeline.py" "def _route(self, question" "Pipeline._route exists"
check "$APP/services/new_pipeline/pipeline.py" "assess_rerank_confidence(top_chunks)" "Pipeline confidence gate wired"
check "$APP/api/chats.py" "get_recent_messages" "chats.py fetches history"
check "$APP/services/memory_manager.py" "def build_context(self" "token-budgeted build_context exists"

echo ""
echo "== Step 5b: memory summarization wired in =="
check "$APP/services/memory_manager.py" "def summarize_if_needed(" "summarize_if_needed exists"
check "$APP/services/memory_manager.py" "def build_context_with_summary(" "build_context_with_summary exists"
check "$APP/services/rag_pipeline.py" "build_context_with_summary(" "RAGPipeline calls summary-aware builder"
check "$APP/services/new_pipeline/pipeline.py" "build_context_with_summary(" "Pipeline._route calls summary-aware builder"

echo ""
echo "== Step 6: retriever consolidation =="
check "$APP/services/retrieval/policy_retriever.py" "class PolicyRetriever" "PolicyRetriever exists"
check "$APP/services/rag_pipeline.py" "from app.services.retrieval.policy_retriever import PolicyRetriever" "RAGPipeline imports PolicyRetriever"
check "$APP/services/rag_pipeline.py" "self.retriever = PolicyRetriever()" "RAGPipeline instantiates PolicyRetriever"
if grep -q "from app.adapters.retriever import Retriever" "$APP/services/rag_pipeline.py" 2>/dev/null; then
  echo "FAIL  [old brute-force Retriever import removed] — still importing adapters.retriever in rag_pipeline.py"
  fail=1
else
  echo "PASS  [old brute-force Retriever import removed]"
fi

echo ""
echo "== Step 7: Planner tool_calls schema =="
check "$APP/services/planner.py" "AVAILABLE_TOOLS" "tool registry exists"
check "$APP/services/planner.py" "\"tool_calls\"" "planner prompt requests tool_calls"
check "$APP/services/planner.py" "def _normalize(" "backward-compat normalize() exists"
check "$APP/services/planner.py" "parsed[\"needs_retrieval\"]" "needs_retrieval still derived for old callers"

echo ""
echo "== Document-upload path routed + confidence-gated =="
check "$APP/services/confidence.py" "LOW_CONFIDENCE_FUZZ_THRESHOLD" "fuzzy threshold exists"
check "$APP/services/confidence.py" "def assess_fuzzy_confidence(" "assess_fuzzy_confidence exists"
check "$APP/api/chats.py" "from app.services.confidence import assess_fuzzy_confidence" "chats.py imports fuzzy gate"
check "$APP/api/chats.py" "route = pipeline.router.route(question, memory_context)" "file-upload branch routes before retrieval"
check "$APP/api/chats.py" "assess_fuzzy_confidence(retrieved)" "file-upload branch confidence-gated"

echo ""
echo "== Sanity: everything still imports (syntax-level) =="
python3 -m py_compile \
  "$APP/services/memory_manager.py" \
  "$APP/services/planner.py" \
  "$APP/services/confidence.py" \
  "$APP/services/rag_pipeline.py" \
  "$APP/services/retrieval/policy_retriever.py" \
  "$APP/services/new_pipeline/pipeline.py" \
  "$APP/api/chats.py" \
  && echo "PASS  [py_compile — no syntax errors]" \
  || { echo "FAIL  [py_compile]"; fail=1; }

echo ""
if [ "$fail" -eq 0 ]; then
  echo "ALL CHECKS PASSED"
else
  echo "SOME CHECKS FAILED — see FAIL lines above"
fi
exit $fail
