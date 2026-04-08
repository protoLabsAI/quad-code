# Exit Plan Mode (`exit_plan_mode`)

Presents an implementation plan to the user and requests approval to transition from plan mode to implementation mode.

## Parameters

| Parameter | Required | Description                                           |
| --------- | -------- | ----------------------------------------------------- |
| `plan`    | Yes      | The implementation plan (concise, Markdown-formatted) |

## User response options

| Option             | Effect                                            |
| ------------------ | ------------------------------------------------- |
| **Proceed Once**   | Approve this plan for the current session         |
| **Proceed Always** | Approve and enable auto-approval for future edits |
| **Cancel**         | Reject the plan; stay in plan mode                |

## When to use this tool

Use `exit_plan_mode` when:

- You are in plan mode (`/approval-mode plan`)
- You have finished exploring the codebase and designed an implementation approach
- You are ready to present the plan and ask for approval before writing code

**Do not use** for research tasks or information gathering — only for transitions from planning to implementation.

## When NOT to use this tool

- In plan mode when you still have unresolved questions — use `ask_user_question` first
- To ask "Is this plan okay?" — this tool does that implicitly
- Outside of plan mode
