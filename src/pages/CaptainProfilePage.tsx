import { BadgeShowcase } from "../components/badges/BadgeShowcase";
import { AvatarCard } from "../components/profile/AvatarCard";
import { PortfolioLinkStatusCard } from "../components/profile/PortfolioLinkStatusCard";
import { PrivacyModeSelector } from "../components/profile/PrivacyModeSelector";
import { RiskProfileSelector } from "../components/profile/RiskProfileSelector";
import { ShipMembershipCard } from "../components/profile/ShipMembershipCard";
import { StyleSelector } from "../components/profile/StyleSelector";
import { ScoreSummary } from "../components/scores/ScoreSummary";

export function CaptainProfilePage() {
  return (
    <div className="page profile-page">
      <header className="page-head">
        <h1>Captain Profile</h1>
        <p className="page-subtitle">
          Define who you are at the helm. Your identity, style, and rules shape how
          the command deck reviews every name — and what your crew can see.
        </p>
      </header>

      <div className="profile-grid">
        <div className="profile-col profile-col-main">
          <AvatarCard />
          <StyleSelector />
          <RiskProfileSelector />
          <PrivacyModeSelector />
        </div>
        <div className="profile-col profile-col-side">
          <ScoreSummary compact />
          <PortfolioLinkStatusCard />
          <ShipMembershipCard />
        </div>
      </div>

      <BadgeShowcase />
    </div>
  );
}
