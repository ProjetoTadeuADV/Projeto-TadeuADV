interface BrandWordmarkProps {
  className?: string;
}

export function BrandWordmark({ className = "" }: BrandWordmarkProps) {
  const resolvedClassName = className ? `brand-wordmark ${className}` : "brand-wordmark";

  return (
    <span className={resolvedClassName}>
      Doutor<span className="brand-wordmark-eu">Eu</span>
    </span>
  );
}
