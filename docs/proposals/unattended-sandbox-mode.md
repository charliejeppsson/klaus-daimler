# Unattended Sandbox Mode

Klaus currently uses Claude Code's interactive permission flow. That is acceptable for visible local use, but it makes `--parallel N` noisy because every pane can ask for approvals.

The desired future is a sandboxed mode where Controller Klaus can launch agents with fewer manual approvals. The sandbox choice is intentionally open; Docker, platform-native sandboxing, or Claude Code's own capabilities may all be viable depending on what is reliable and portable enough.

The controller should not enable bypass-style permissions until file-system and command execution boundaries are clear.
