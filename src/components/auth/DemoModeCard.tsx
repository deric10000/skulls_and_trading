import { AuthButton } from "./AuthButton";

export function DemoModeCard({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="demo-card">
      <div className="demo-card-head">
        <h3>Just exploring?</h3>
        <span className="chip status--neutral">No account needed</span>
      </div>
      <p>
        Step aboard with sample data to tour the command deck. Nothing is saved and
        no trades are ever placed.
      </p>
      <AuthButton variant="ghost" onClick={onContinue}>
        Continue as Demo Captain
      </AuthButton>
    </div>
  );
}
