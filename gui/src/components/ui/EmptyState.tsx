export interface EmptyStateProps {
  message?: string;
  title?: string;
  description?: string;
}

export function EmptyState({ message, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-1">
      {title && <h3 className="mb-1 text-sm font-semibold">{title}</h3>}
      {(message || description) && (
        <span className="text-description text-sm">
          {message ?? description}
        </span>
      )}
    </div>
  );
}
