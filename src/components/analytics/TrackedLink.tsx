"use client";

import Link from "next/link";
import * as React from "react";
import { trackClick, trackFeatureUsed } from "@/lib/analytics/client";

type TrackedLinkProps = React.ComponentProps<typeof Link> & {
  trackingId?: string;
  trackingLabel?: string;
  trackingFeature?: string;
  trackingMetadata?: Record<string, unknown>;
};

export default function TrackedLink({
  trackingId,
  trackingLabel,
  trackingFeature,
  trackingMetadata,
  onClick,
  href,
  ...props
}: TrackedLinkProps) {
  const hrefText =
    typeof href === "string"
      ? href
      : `${href.pathname ?? ""}${href.search ?? ""}${href.hash ?? ""}` || "/";

  return (
    <Link
      {...props}
      href={href}
      data-analytics-id={trackingId}
      data-analytics-label={trackingLabel}
      data-analytics-feature={trackingFeature}
      onClick={(event) => {
        trackClick(
          {
            type: "link",
            id: trackingId,
            text: trackingLabel,
            href: hrefText,
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
