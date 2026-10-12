// Records the options the SDK passes to posthog.init.
export const inits: Array<[string, any]> = [];
const engine = {
  init(key: string, options: any) {
    inits.push([key, options]);
    options?.loaded?.(engine);
  },
  capture() {},
  identify() {},
  get_session_id: () => "ph_session",
  sessionRecordingStarted: () => true,
};
export default engine;
