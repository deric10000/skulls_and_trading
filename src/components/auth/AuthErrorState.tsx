export function AuthErrorState({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="auth-error" role="alert">
      <span className="auth-error-icon" aria-hidden="true">
        !
      </span>
      {message}
    </p>
  );
}
