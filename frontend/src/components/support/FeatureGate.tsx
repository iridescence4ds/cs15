// Page-level disabled state — rendered when a user navigates to a
// /support/* URL while the experimental feature flag is off. Keeps
// the URL stable so admins can re-enable and refresh without losing
// the user's place.

import React from 'react';
import { useFeatureFlag } from '../../context/FeatureFlagContext';

export function FeatureDisabledPanel({ feature }: { feature: string }): React.ReactElement {
  return (
    <div className="max-w-md mx-auto mt-12 sm:mt-20 text-center px-4">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-cream text-ink-faint mb-3">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <p className="font-serif text-xl text-ink">This feature is currently off</p>
      <p className="text-sm text-ink-soft mt-2">
        An admin hasn't enabled {feature} for this site yet. If you think this is
        a mistake, please ask an admin to flip the switch — they can do it from
        <span className="font-mono text-xs mx-1 px-1.5 py-0.5 rounded bg-cream">/admin/features</span>.
      </p>
    </div>
  );
}

/** Page-level guard. Wrap a page's content; shows the disabled panel
 *  when the named feature is off. Use `loadingFallback` to render a
 *  spinner while the flag list is still loading. */
export function FeatureGate({
  featureKey,
  children,
  featureLabel,
  loadingFallback,
}: {
  featureKey: string;
  featureLabel: string;
  children: React.ReactNode;
  loadingFallback?: React.ReactNode;
}): React.ReactElement {
  const enabled = useFeatureFlag(featureKey);
  if (enabled === undefined) {
    return <>{loadingFallback ?? <div className="min-h-[40vh]" />}</>;
  }
  if (!enabled) {
    return <FeatureDisabledPanel feature={featureLabel} />;
  }
  return <>{children}</>;
}
