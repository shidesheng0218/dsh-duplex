/**
 * dsh-duplex — Host half.
 *
 * v0.0.1 is a pure client plugin: speech synthesis, speech recognition and the
 * composer/approval UI all live in the browser half (client/client.js). This
 * entry exists so the bundle mounts cleanly and gives the Host half a home for
 * the planned work:
 *
 *   - v0.1  subscribe to approval / user-question events and forward "speak this"
 *           notices to the client (see docs/PLAN.md, milestone P0.1)
 *   - v0.2  condensed tool-result summaries (rule-based, optional small model)
 *   - v0.3  voice session settings persisted through the Host config service
 *
 * Keep this module side-effect free and register any future resource inside
 * apply() with ctx.effect / ctx.on so uninstall leaves no trace.
 */

export const name = 'dsh-duplex'

export function apply(_ctx, _config) {
  // Intentionally empty in v0.0.1.
}
