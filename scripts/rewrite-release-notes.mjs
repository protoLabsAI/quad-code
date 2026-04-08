/**
 * Rewrites raw git commits into polished release notes via Claude,
 * then posts a Discord embed to DISCORD_RELEASE_WEBHOOK.
 *
 * Usage:
 *   node scripts/rewrite-release-notes.mjs [version] [prev-version] [--post-discord] [--dry-run]
 *
 * When called with no args, auto-detects the two most recent semver tags.
 */

import { execSync } from 'node:child_process';

// ─── Git helpers ─────────────────────────────────────────────────────────────

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

function getTags() {
  const tags = run('git tag --sort=-v:refname').split('\n').filter(Boolean);
  return { latest: tags[0], previous: tags[1] };
}

function getCommitsBetween(fromTag, toTag) {
  const log = run(`git log ${fromTag}..${toTag} --pretty=format:"%s"`);
  return log
    .split('\n')
    .map((line) => line.replace(/^"|"$/g, '').trim())
    .filter(Boolean);
}

// ─── Prompt ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a technical writer for protoLabs, a developer tools company.
Your job is to transform raw git commit messages into polished release notes.

Voice: technical, direct, pragmatic. Speak to builders — assume they understand code.

Rules:
- Group into 2–4 themed sections with bold markdown headers (e.g. **Performance**, **Developer Experience**)
- One sentence per bullet, present tense, user-facing impact only
- Skip: merge commits, version bumps, CI config, internal chores, "promote" commits
- No marketing language, no AI hype words ("revolutionary", "game-changing", "powerful")
- No emojis anywhere
- Max 300 words total
- Output: one-line intro sentence, then the sections with bullets
- Do not include a version number in the output`;

function buildUserPrompt(version, previousVersion, commits) {
  const filtered = commits.filter((c) => {
    const lower = c.toLowerCase();
    return (
      !lower.startsWith('merge ') &&
      !lower.startsWith('chore: release') &&
      !lower.startsWith('promote') &&
      !lower.startsWith('chore: bump') &&
      c.length > 0
    );
  });

  const bulletList = filtered.map((c) => `- ${c}`).join('\n');

  return `Write release notes for ${version} (previous: ${previousVersion}).

Raw commits:
${bulletList}`;
}

// ─── Claude API ──────────────────────────────────────────────────────────────

async function callClaude(userPrompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

// ─── Discord ──────────────────────────────────────────────────────────────────

async function postToDiscord(version, notes) {
  const webhook = process.env.DISCORD_RELEASE_WEBHOOK;
  if (!webhook) throw new Error('DISCORD_RELEASE_WEBHOOK is not set');

  const releaseUrl = `https://github.com/protoLabsAI/protoCLI/releases/tag/${version}`;
  const truncated = notes.length > 3900 ? notes.slice(0, 3900) + '\n...' : notes;

  const payload = {
    embeds: [
      {
        title: `${version}`,
        url: releaseUrl,
        description: truncated,
        color: 5763719, // #5865F2 blurple
        footer: { text: 'protoLabs · protoCLI' },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const delays = [0, 3000, 10000];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) {
      await new Promise((r) => setTimeout(r, delays[attempt]));
      console.log(`Retrying Discord post (attempt ${attempt + 1})...`);
    }
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      console.log(`Posted to Discord: ${version}`);
      return;
    }
    const err = await res.text();
    if (attempt === delays.length - 1) {
      throw new Error(`Discord webhook error ${res.status}: ${err}`);
    }
    console.warn(`Discord post failed (${res.status}), retrying...`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const postDiscord = args.includes('--post-discord');
const dryRun = args.includes('--dry-run');
const positional = args.filter((a) => !a.startsWith('--'));

let version = positional[0];
let previousVersion = positional[1];

if (!version || !previousVersion) {
  const tags = getTags();
  version = version ?? tags.latest;
  previousVersion = previousVersion ?? tags.previous;
}

if (!version || !previousVersion) {
  console.error('Could not determine version tags. Pass them explicitly.');
  process.exit(1);
}

console.log(`Generating release notes: ${previousVersion} → ${version}`);

const commits = getCommitsBetween(previousVersion, version);
console.log(`Found ${commits.length} commits`);

const userPrompt = buildUserPrompt(version, previousVersion, commits);

if (dryRun) {
  console.log('\n── System Prompt ──\n', SYSTEM_PROMPT);
  console.log('\n── User Prompt ──\n', userPrompt);
  process.exit(0);
}

const notes = await callClaude(userPrompt);
console.log('\n── Release Notes ──\n');
console.log(notes);

if (postDiscord) {
  await postToDiscord(version, notes);
}
