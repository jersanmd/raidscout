// ai-review.mjs — Called by ai-review.yml workflow
// Sends PR diff to OpenAI and posts a review comment

import { readFileSync } from "fs";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GH_REPO = process.env.GITHUB_REPOSITORY; // owner/repo
const PR_NUMBER = process.env.PR_NUMBER;

if (!GITHUB_TOKEN || !OPENAI_API_KEY || !GH_REPO || !PR_NUMBER) {
  console.error("Missing required env vars");
  process.exit(1);
}

const diff = readFileSync("diff_trimmed.txt", "utf-8");

if (!diff.trim()) {
  console.log("Empty diff — nothing to review.");
  process.exit(0);
}

const SYSTEM_PROMPT = `You are a senior code reviewer. Review the following git diff and provide concise, actionable feedback. Focus on:

* Bugs, logic errors, or edge cases
* Security vulnerabilities (XSS, injection, auth bypass, exposed secrets)
* Performance issues (unnecessary re-renders in React, N+1 queries, missing indexes)
* TypeScript type safety issues
* Breaking changes that could affect other parts of the codebase

Ignore: formatting, stylistic preferences, nitpicks about naming, and anything that would be caught by a linter.

Format your response as a markdown list with a one-line heading per finding, like:
* **Bug:** description
* **Security:** description
* **Perf:** description
Keep each finding to 2-3 sentences. If the diff looks fine, just say "✅ No issues found." Be brief.`;

const response = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Review this PR diff:\n\n\`\`\`diff\n${diff}\n\`\`\`` },
    ],
    max_tokens: 1500,
    temperature: 0.3,
  }),
});

const data = await response.json();

if (data.error) {
  console.error("OpenAI error:", JSON.stringify(data.error));
  process.exit(1);
}

const review = data.choices[0].message.content;

// Post as PR comment
const commentRes = await fetch(
  `https://api.github.com/repos/${GH_REPO}/issues/${PR_NUMBER}/comments`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ body: `## 🤖 AI Code Review\n\n${review}` }),
  }
);

if (!commentRes.ok) {
  console.error("Failed to post comment:", commentRes.status, await commentRes.text());
  process.exit(1);
}

console.log("✅ Review posted successfully.");
