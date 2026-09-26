import type { SVGProps } from "react";

export type IconName =
  | "arrow-left"
  | "download"
  | "external"
  | "file"
  | "link"
  | "search"
  | "upload"
  | "expand"
  | "alert"
  | "arrow-right"
  | "book"
  | "check"
  | "close"
  | "globe"
  | "help"
  | "home"
  | "lock"
  | "mail"
  | "menu"
  | "people"
  | "plus"
  | "spark"
  | "story"
  | "word";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  name: IconName;
};

/** Small inline icons keep the foundation dependency-free and themeable. */
export function Icon({ name, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      {...props}
    >
      {name === "arrow-left" && <path d="M19 12H5.5m5-5-5 5 5 5" />}
      {name === "download" && <path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4" />}
      {name === "upload" && <path d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4" />}
      {name === "external" && <path d="M14 4h6v6m0-6-9 9M10 4H4v16h16v-6" />}
      {name === "file" && <><path d="M13 3H5v18h14V9zM13 3v6h6M8 13h8M8 17h5" /></>}
      {name === "link" && <><path d="m10 14 4-4m-5-2 2-2a4 4 0 0 1 6 6l-2 2m-6-4-2 2a4 4 0 0 0 6 6l2-2" /></>}
      {name === "search" && <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>}
      {name === "expand" && <path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5" />}
      {name === "alert" && (
        <>
          <path d="M12 4 20 19H4z" />
          <path d="M12 9v4.25M12 16.25h.01" />
        </>
      )}
      {name === "arrow-right" && <path d="M5 12h13.5m-5-5 5 5-5 5" />}
      {name === "book" && (
        <>
          <path d="M4.5 5.75a2.25 2.25 0 0 1 2.25-2.25H20v16.75H6.75A2.25 2.25 0 0 0 4.5 22.5z" />
          <path d="M4.5 5.75v14.5" />
          <path d="M8 7.5h8" />
        </>
      )}
      {name === "check" && <path d="m5 12.5 4.25 4.25L19.5 6.5" />}
      {name === "close" && <path d="m6.5 6.5 11 11m0-11-11 11" />}
      {name === "globe" && (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.75 12h16.5M12 3.5c2.05 2.27 3.08 5.1 3.08 8.5S14.05 18.23 12 20.5c-2.05-2.27-3.08-5.1-3.08-8.5S9.95 5.77 12 3.5" />
        </>
      )}
      {name === "help" && (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M9.65 9.4a2.5 2.5 0 1 1 4.06 1.96c-.86.7-1.71 1.15-1.71 2.39" />
          <path d="M12 16.75h.01" />
        </>
      )}
      {name === "home" && (
        <>
          <path d="m3.75 10.75 8.25-6.5 8.25 6.5v8.5a1.25 1.25 0 0 1-1.25 1.25H5a1.25 1.25 0 0 1-1.25-1.25z" />
          <path d="M9.25 20.5v-5.75h5.5v5.75" />
        </>
      )}
      {name === "lock" && (
        <>
          <rect x="5.5" y="10.25" width="13" height="10" rx="1.7" />
          <path d="M8.5 10.25V7.8a3.5 3.5 0 0 1 7 0v2.45M12 14.2v2.35" />
        </>
      )}
      {name === "mail" && (
        <>
          <rect x="3.75" y="5.5" width="16.5" height="13" rx="1.6" />
          <path d="m4.5 7 7.5 5.5L19.5 7" />
        </>
      )}
      {name === "menu" && <path d="M4 7.25h16M4 12h16M4 16.75h16" />}
      {name === "people" && (
        <>
          <circle cx="9" cy="8.5" r="2.5" />
          <path d="M4.5 19.25c.55-3.1 2.08-4.65 4.5-4.65s3.95 1.55 4.5 4.65" />
          <path d="M15.15 6.55a2.5 2.5 0 0 1 0 4.83M16.2 14.75c1.75.55 2.8 2.05 3.1 4.5" />
        </>
      )}
      {name === "plus" && <path d="M12 5.25v13.5M5.25 12h13.5" />}
      {name === "spark" && (
        <>
          <path d="m12 3.5.95 4.1L17 8.5l-4.05.9L12 13.5l-.95-4.1L7 8.5l4.05-.9z" />
          <path d="m18.4 14.25.48 2.05 2.02.45-2.02.45-.48 2.05-.48-2.05-2.02-.45 2.02-.45zM5.5 15.25l.55 2.35 2.3.5-2.3.5-.55 2.35-.55-2.35-2.3-.5 2.3-.5z" />
        </>
      )}
      {name === "story" && (
        <>
          <path d="M5 5.25h14v11.5H9l-4 3v-14.5z" />
          <path d="M8.5 9h7M8.5 12.5h4.5" />
        </>
      )}
      {name === "word" && (
        <>
          <path d="M4.5 6.25h15v10.5h-9l-4.5 3.5v-14z" />
          <path d="M8 10h8M8 13h5" />
        </>
      )}
    </svg>
  );
}
