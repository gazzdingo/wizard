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
   * Force-install the SDK package to continue with the installation in case
   * any package manager checks are failing (e.g. peer dependency versions).
   *
   * Use with caution and only if you know what you're doing.
   *
   * Does not apply to all wizard flows (currently NPM only)
   */
  forceInstall?: boolean;

  /**
   * Whether the wizard should be run for PostHog Cloud or not.
   */
  cloud?: boolean;

  /**
   * Url of the PostHog instance to use.
   */
  url?: string;
};

export interface Feature {
  id: string;
  prompt: string;
  enabledHint?: string;
  disabledHint?: string;
}
