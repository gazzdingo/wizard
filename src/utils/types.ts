export type PostHogProjectData = Record<string, unknown>;

export type PreselectedProject = {
  project: PostHogProjectData;
  authToken: string;
};

export type WizardOptions = {
  /**
   * Controls whether the wizard should send telemetry data to PostHog.
   */
  telemetryEnabled: boolean;

  /**
   * Whether to enable debug mode.
   */
  debug: boolean;

  /**
   * Whether to force install the SDK package to continue with the installation in case
   * any package manager checks are failing (e.g. peer dependency versions).
   *
   * Use with caution and only if you know what you're doing.
   *
   * Does not apply to all wizard flows (currently NPM only)
   */
  forceInstall: boolean;

  /**
   * The directory to run the wizard in.
   */
  installDir: string;
};

export interface Feature {
  id: string;
  prompt: string;
  enabledHint?: string;
  disabledHint?: string;
}
