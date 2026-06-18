import { useAppState } from "../../state/AppState";
import { AuthButton } from "./AuthButton";

export function DemoModeCard() {
  const { continueAsDemo } = useAppState();

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
      <AuthButton variant="ghost" onClick={continueAsDemo}>
        Continue as Demo Captain
      </AuthButton>
    </div>
  );
}
