import Image from "next/image";

export function Logo({
  className = "",
  alt = "GDGC logo",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <Image
      src="/LOGO.png"
      alt={alt}
      className={className}
      width={40}
      height={40}
    />
  );
}
