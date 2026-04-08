# Task / Agent (`task`)

Launches a specialized sub-agent to handle a complex, multi-step task autonomously.

## Parameters

| Parameter           | Required | Description                                                   |
| ------------------- | -------- | ------------------------------------------------------------- |
| `description`       | Yes      | Short (3-5 word) description for tracking                     |
| `prompt`            | Yes      | Detailed instructions for the agent                           |
| `subagent_type`     | Yes      | Agent type (e.g. `general-purpose`, `Explore`, `coordinator`) |
| `run_in_background` | No       | `true` to run concurrently without blocking                   |
| `multi_sample`      | No       | `true` to enable multi-sample retry on failure                |

## Built-in agent types

| Type              | Purpose                                                  |
| ----------------- | -------------------------------------------------------- |
| `general-purpose` | Complex multi-step tasks, code search                    |
| `Explore`         | Fast codebase search and analysis                        |
| `verify`          | Review changes for correctness                           |
| `coordinator`     | Orchestrate multi-agent work (spawns its own sub-agents) |
| `plan`            | Design implementation plans                              |

Custom agents defined in `.proto/agents/` or `~/.proto/agents/` are also available.

## Background execution

Set `run_in_background: true` to run the agent concurrently. The main conversation continues while the agent works. A completion notification is injected at the next tool boundary.

## Multi-sample retry

Set `multi_sample: true` for high-stakes tasks. The harness retries up to 2 more times with escalating temperatures if the first attempt fails, and returns the best result. Use for complex implementation tasks, not for searches.

## How it works

1. The sub-agent receives the prompt with its tool allowlist.
2. It runs to completion using its available tools.
3. The result is returned as a message to the parent agent.
4. Sub-agents are stateless and single-use.

Sub-agents inherit tools from their parent unless an explicit `tools` allowlist is defined in the agent config. See [Guides → Use Sub-Agents](../../guides/use-sub-agents) for configuration details.
