import type { HTMLAttributes } from "react";

/** Trimmed IG-style paper plane from Dallas-provided glyph (transparent fold cut). */
const PLANE_MASK =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADcAAAA4CAQAAADzhKgYAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAACYktHRAD/h4/MvwAAAAd0SU1FB+oIBQALCwiDKfQAAAAtdEVYdENyZWF0aW9uIFRpbWUAVHVlIDA0IEF1ZyAyMDI2IDA4OjA5OjExIFBNIEFTVOhG9ZoAAAAldEVYdGRhdGU6Y3JlYXRlADIwMjYtMDgtMDVUMDA6MTE6MTErMDA6MDBJBEM1AAAAJXRFWHRkYXRlOm1vZGlmeQAyMDI2LTA4LTA1VDAwOjExOjExKzAwOjAwOFn7iQAAACh0RVh0ZGF0ZTp0aW1lc3RhbXAAMjAyNi0wOC0wNVQwMDoxMToxMSswMDowMG9M2lYAAAAZdEVYdFNvZnR3YXJlAGdub21lLXNjcmVlbnNob3TvA78+AAACT0lEQVRYw72YO2tUQRiGn1lX8dK4BBQEjRjFSksLL/gDYiOaKIIIFoKVYCBYC+oviH06STpxxUJBsYmViAgKYiGsYLNFzAYU1tdC9+ye+1zOeL5mZ/iGh++ZOWdmx4i4z4CuXjLkLJfMFlC02OCRLmhn0nFGP+LgBqykQKO4HbuidEw1C5orBf0NE7+iyTikdsiq26SrVbpsWuaf910qA1Zq1eVj7X+BEJrWbxxkuqrLPhcxdjL9K0qrVB2uGdBIpcplhqorVEnUirIqMzLjgMYqE5lNqytRCaLH1SgV5VUKvnMgMmqsUrTu62skgQUqab2IDoO55Fc77KwyxU3gIf2KnGlOmKRxK2BO9uqDhHhembWgcSNgqYxgYr3yW7g2iRM95tUKgIllq1X5DyfEO806wfbofQJ7pu2WKlMfsVc61TgsrTK3AT3WsUZhaZUF+92QZR1sCJZVWbK9/mRJ+xqAZVVW7OYbPNDuQFhWZc3hoc+idnjD8iprzyqixw21vWDojTtOiE9cm4A9tYTlVVriJsO2siKVzjh7WJFKR9xbB1iRStFy2d2Omo517ngHTz1uMpeCVDrP3S9mAlQ6yoSt3A1R6f4iDDnurdLjvRNPvFU6ywSYNad9Vfr9N39dc2VRptJLphBVJ5tylV4yAe5VDKxQ6X8ndsVDpbdM8Zltziq9ZcIM191Vhlww9tjlqDJAphB3HFUG4vp0Ml0Lqh7hPXcAHRYzPZfrhoRUJwYcnmieU11+IE584aQQMprXem22aeJi/6O+ccTst8j8A1XFLXQg0qRSAAAAAElFTkSuQmCC";

type IgPaperPlaneIconProps = HTMLAttributes<HTMLSpanElement> & {
  size?: number | string;
};

/**
 * Instagram-style filled paper plane for feed share.
 * CSS mask picks up currentColor like Lucide fills.
 */
export function IgPaperPlaneIcon({
  className,
  size,
  style,
  ...props
}: IgPaperPlaneIconProps) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: "inline-block",
        width: size ?? "1em",
        height: size ?? "1em",
        flexShrink: 0,
        backgroundColor: "currentColor",
        WebkitMaskImage: `url(${PLANE_MASK})`,
        maskImage: `url(${PLANE_MASK})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        ...style,
      }}
      {...props}
    />
  );
}
