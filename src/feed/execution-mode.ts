/** Feed connectors never expose deterministic fixture data in ordinary builds. */
export function connectorFixtureAllowed(): boolean {
  return process.env.NODE_ENV === "test" && process.env.GOALBOARD_FEED_CONNECTOR_FIXTURE === "1";
}
