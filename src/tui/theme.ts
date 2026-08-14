/**
 * Shared color palette for the TUI, pulled from the bubble-tea mascot
 * artwork (bear + boba cup): coffee brown, caramel, gold lid band, cream
 * tea body. One source of truth so Mascot/MessageStream/StatusBar/InputBox
 * don't each pick their own ad-hoc colors.
 */
export const theme = {
  gold: "#F2C14E", // lid band — user's own voice, the brightest/warmest accent
  caramel: "#D98E4A", // bear fur — the agent's voice
  cream: "#E8D5B7", // tea body — tool output / secondary text
  brown: "#8B5E3C", // deep coffee brown — borders, dim chrome
  error: "#E5484D", // unchanged, red is the universal "something broke" signal
} as const;
