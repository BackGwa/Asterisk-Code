import { type Plugin, tool } from "@opencode-ai/plugin"

const BUILDER_AGENT = "Asterisk-Builder"

export default (async () => {
  return {
    tool: {
      asterisk_session_bridge: tool({
        description: "Request user approval to hand an approved Asterisk-Planner plan to Asterisk-Builder without modifying the plan text.",
        args: {
          plan: tool.schema.string().min(1).describe("The exact plan text to pass to Asterisk-Builder."),
        },
        async execute(args, context) {
          context.metadata({
            title: "Asterisk Builder handoff",
            metadata: {
              targetAgent: BUILDER_AGENT,
            },
          })

          await context.ask({
            permission: "asterisk_session_bridge",
            patterns: [BUILDER_AGENT],
            always: [],
            metadata: {
              targetAgent: BUILDER_AGENT,
            },
          })

          return {
            title: "Asterisk Builder handoff approved",
            output: args.plan,
            metadata: {
              targetAgent: BUILDER_AGENT,
            },
          }
        },
      }),
    },
  }
}) satisfies Plugin
