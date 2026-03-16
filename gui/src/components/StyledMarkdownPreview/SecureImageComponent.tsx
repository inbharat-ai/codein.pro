import React, { useState } from "react";

interface SecureImageComponentProps {
  src?: string;
  alt?: string;
  title?: string;
  className?: string;
}

export const SecureImageComponent: React.FC<SecureImageComponentProps> = ({
  src,
  alt,
  title,
  className,
}) => {
  const [showImage, setShowImage] = useState(false);
  const [imageError, setImageError] = useState(false);

  if (!src) {
    return <span>[Invalid image: no source]</span>;
  }

  // Parse URL to check for query parameters
  let queryParams: Record<string, string> = {};
  let hasQueryParams = false;

  try {
    const url = new URL(src, window.location.href);
    const params = new URLSearchParams(url.search);
    params.forEach((value, key) => {
      queryParams[key] = value;
      hasQueryParams = true;
    });
  } catch (e) {
    // If URL parsing fails, treat src as a relative path
    const queryIndex = src.indexOf("?");
    if (queryIndex > -1) {
      hasQueryParams = true;
      const params = new URLSearchParams(src.substring(queryIndex));
      params.forEach((value, key) => {
        queryParams[key] = value;
      });
    }
  }

  if (showImage && !imageError) {
    return (
      /* ImageContainer */
      <div className={`inline-block max-w-full ${className ?? ""}`}>
        <img
          src={src}
          alt={alt || ""}
          title={title}
          className="block h-auto max-w-full"
          onError={() => {
            setImageError(true);
            setShowImage(false);
          }}
        />
      </div>
    );
  }

  return (
    /* ImagePlaceholder */
    <div
      className="my-2 inline-block max-w-full rounded p-3"
      style={{
        border: "1px solid var(--codin-border, #2a2845)",
        backgroundColor: "var(--codin-bg-primary, #0f0e17)",
      }}
    >
      {/* WarningText */}
      <div
        className="mb-2 text-xs"
        style={{ color: "var(--codin-fg-muted, #8b88ad)" }}
      >
        Image blocked for security. External images can leak data through URL
        parameters. Click to load if you trust the source.
      </div>

      {/* UrlDisplay */}
      <div
        className="my-2 break-all rounded p-2 text-xs"
        style={{
          fontFamily: "var(--codin-font-mono, monospace)",
          color: "var(--codin-fg-primary, #e8e6f0)",
          backgroundColor: "rgba(0, 0, 0, 0.1)",
          borderRadius: "3px",
        }}
      >
        <strong>URL:</strong> {src}
      </div>

      {hasQueryParams && (
        /* QueryParamsDisplay */
        <div
          className="my-2 p-2 text-xs"
          style={{
            fontFamily: "var(--codin-font-mono, monospace)",
            fontSize: "11px",
            color: "var(--codin-fg-primary, #e8e6f0)",
            backgroundColor: "rgba(128, 128, 128, 0.1)",
            borderRadius: "3px",
            border: "1px solid var(--codin-fg-muted, #8b88ad)",
          }}
        >
          <strong>Warning: URL contains query parameters:</strong>
          <pre style={{ margin: "4px 0", fontSize: "11px" }}>
            {JSON.stringify(queryParams, null, 2)}
          </pre>
        </div>
      )}

      {imageError && (
        <div
          className="mt-2 text-xs"
          style={{ color: "var(--codin-fg-muted, #8b88ad)" }}
        >
          Failed to load image. The URL may be invalid or inaccessible.
        </div>
      )}

      {/* LoadButton */}
      <button
        className="mt-2 cursor-pointer rounded px-3 py-1.5 text-xs hover:opacity-90 active:translate-y-px"
        style={{
          backgroundColor: "var(--codin-accent-primary, #4338ca)",
          color: "#ffffff",
          border: "1px solid var(--codin-border, #2a2845)",
          borderRadius: "3px",
        }}
        onClick={() => setShowImage(true)}
      >
        Load Image
      </button>
    </div>
  );
};
