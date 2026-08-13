i want to make coding agent harness with multi/sub agent support, tools, skills, guardrails. it should contain layers like
multi provider support -> gemini and open router
TUI -> a good terminal interface just like claude code
command support with tui -> /session -> showing different session,/help, /new -> make new session, /compact -> summarizing key points to 
reduce context window, @file tagging, @agent call, @loading skill.
ther will be some builtint agents like plan. 
can be called with @plan-agent or or /plan command.

support parallel work -> can call agent in bg.

execution loop -> plan, act, observe, repeat
tool registry -> Registered capabilities the agent can invoke
.bubbletea -> only in machine root -> just like ~/.claude that give option to add skills and agent, and mcp tools, lifecycle hooks.

state store -> persistent memory across turns and sessions.

lifecycle -> pre/post interceptors, guardrails, validators.

evaluation interface -> how agent output are verified, scored and  imporoved.


we are not gonna build a very complex version, lets try to build a version that shows good understanding of harness engineering.
first figure out small sub problems/module we need to build. and the correct order to build them. then we will build them one by one to
not get lost in the repo.

resarch it all and dump your finding in artifacts/implementation-process.md 
