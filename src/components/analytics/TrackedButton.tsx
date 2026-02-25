"use client";

import * as React from "react";
import { trackClick, trackFeatureUsed } from "@/lib/analytics/client";

type TrackedButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  trackingId?: string;
  trackingLabel?: string;
  trackingFeature?: string;
  trackingMetadata?: Record<string, unknown>;
};

export default function TrackedButton({
  trackingId,
  trackingLabel,
  trackingFeature,
  trackingMetadata,
  onClick,
  ...props
}: TrackedButtonProps) {
  return (
    <button
      {...props}
      data-analytics-id={trackingId ?? props.id}
      data-analytics-label={trackingLabel}
      data-analytics-feature={trackingFeature}
      onClick={(event) => {
        trackClick(
          {
            type: "button",
            id: trackingId ?? props.id,
            text: trackingLabel,
          },
          trackingMetadata
        );

        if (trackingFeature) {
          trackFeatureUsed(trackingFeature, trackingMetadata);
        }

        onClick?.(event);
      }}
    />
  );
}
