# /board — Jira board implementation loop

Pull the oldest "To Do" ticket from the Jira project, implement it fully, transition it to Done, then repeat until the board is empty.

## Required environment variables

```
JIRA_BASE_URL=https://hobeyenterprises.atlassian.net
JIRA_EMAIL=hobeybennett@gmail.com
JIRA_API_TOKEN=<from https://id.atlassian.com/manage-profile/security/api-tokens>
JIRA_PROJECT_KEY=HB
```

If any variable is unset, stop immediately and tell the user which one is missing.

## Loop — repeat until no "To Do" tickets remain

---

### Step 1 — Check env vars

Run:
```bash
echo "BASE=${JIRA_BASE_URL} EMAIL=${JIRA_EMAIL} TOKEN=${JIRA_API_TOKEN:+set} KEY=${JIRA_PROJECT_KEY}"
```

Abort with a clear message if any are empty.

---

### Step 2 — Fetch the oldest "To Do" ticket

```bash
curl -s \
  -u "${JIRA_EMAIL}:${JIRA_API_TOKEN}" \
  -H "Accept: application/json" \
  "${JIRA_BASE_URL}/rest/api/3/search?jql=project%3D${JIRA_PROJECT_KEY}%20AND%20status%3D%22To%20Do%22%20ORDER%20BY%20created%20ASC&maxResults=1&fields=summary,description,key"
```

Parse the JSON response:
- If `total` is `0` → print **"Board is empty — all done."** and stop the loop.
- Otherwise extract:
  - `KEY` = `issues[0].key` (e.g. `HB-12`)
  - `SUMMARY` = `issues[0].fields.summary`
  - `SPEC` = plain text extracted from `issues[0].fields.description` (Atlassian Document Format).
    Walk all `content` arrays recursively and concatenate every node where `type == "text"`, joined with newlines.
    If description is null, use the summary alone as the spec.

Print: **"→ Picked up [KEY]: [SUMMARY]"**

---

### Step 3 — Transition to "In Progress"

Fetch available transitions:
```bash
curl -s \
  -u "${JIRA_EMAIL}:${JIRA_API_TOKEN}" \
  -H "Accept: application/json" \
  "${JIRA_BASE_URL}/rest/api/3/issue/${KEY}/transitions"
```

Find the transition whose `name` matches **"In Progress"** (case-insensitive). Extract its `id`.

POST the transition:
```bash
curl -s -X POST \
  -u "${JIRA_EMAIL}:${JIRA_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"transition\":{\"id\":\"${IN_PROGRESS_ID}\"}}" \
  "${JIRA_BASE_URL}/rest/api/3/issue/${KEY}/transitions"
```

---

### Step 4 — Implement the ticket

Use `SUMMARY` and `SPEC` as the feature spec. Execute the full ship loop:

1. **Explore** — read the relevant source files to understand the codebase area the ticket touches.
2. **Implement** — write or edit files to deliver the feature described in the spec. Keep changes minimal and focused; no gold-plating.
3. **Test** — run `npm test`. If tests fail, diagnose and fix, then re-run. Repeat until all tests pass.
4. **Type-check** — run `npx tsc --noEmit`. Fix any TypeScript errors.
5. **Commit** — stage only the files you changed and commit with:
   ```
   feat(${KEY}): ${SUMMARY}
   ```

If after three full implement→test cycles the tests still fail, transition the ticket back to **"To Do"** (reverse step 3), leave a Jira comment explaining what's blocking, and move on to the next ticket rather than spinning indefinitely.

---

### Step 5 — Transition to "Done"

Fetch transitions again and POST the one whose `name` matches **"Done"** (case-insensitive):
```bash
curl -s -X POST \
  -u "${JIRA_EMAIL}:${JIRA_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"transition\":{\"id\":\"${DONE_ID}\"}}" \
  "${JIRA_BASE_URL}/rest/api/3/issue/${KEY}/transitions"
```

Print: **"✓ [KEY] done."**

---

### Step 6 — Push and loop

Push the current branch:
```bash
git push -u origin $(git rev-parse --abbrev-ref HEAD)
```

Then go back to **Step 2** and pick the next "To Do" ticket.
