import { cn } from "@/lib/utils";

// Original HIVE artwork, supplied in Drive folder 1rC2GpHIuaeT2E8zooEkSR8E0fLPe7Jf3.
// Copies in the app's Drive keep the source private while its image proxy serves the logos.
const LOGOS = {
  mark: { url: "/api/drive/image/1fN-bt5ZwhkSTCCFOkykU2s0LmF-RUDXT", ratio: 588 / 664 },
  lockup: { url: "/api/drive/image/1kMJHrBpI2XBsgPaOPPQA2WT4ow_s8ty-", ratio: 867 / 254 },
};
type BrandLogoProps = {
  variant?: "mark" | "lockup";
  className?: string;
  title?: string;
  size?: number;
};
export function BrandLogo({ variant = "mark", className, title = "HIVE Pilates Studio", size = 40 }: BrandLogoProps) {
  const logo = LOGOS[variant];
  // Use the original transparent silhouette, including its official lettering.
  // currentColor maintains contrast on every existing light/dark surface.
  return <span role="img" aria-label={title} className={cn("inline-block shrink-0 bg-current", className)} style={{
    width: Math.round(size * logo.ratio), height: size,
    maskImage: `url("${logo.url}")`, WebkitMaskImage: `url("${logo.url}")`,
    maskSize: "contain", WebkitMaskSize: "contain", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat",
    maskPosition: "center", WebkitMaskPosition: "center",
  }} />;
}
