import { useState } from "react";
import { DISCOVER_SHIPS, SHIP_MEMBERS, SHIP_MEMBERSHIPS } from "../data";
import { ComingSoonOverlay } from "../components/ComingSoonOverlay";
import { CreateShipForm } from "../components/ships/CreateShipForm";
import { InviteMemberModal } from "../components/ships/InviteMemberModal";
import { JoinShipForm } from "../components/ships/JoinShipForm";
import { MemberCard } from "../components/ships/MemberCard";
import { SharedLogCard } from "../components/ships/SharedLogCard";
import { ShipBadgeCard } from "../components/ships/ShipBadgeCard";
import { ShipCard } from "../components/ships/ShipCard";
import { ShipLeaderboardCard } from "../components/ships/ShipLeaderboardCard";
import { ShipPrivacyNotice } from "../components/ships/ShipPrivacyNotice";
import { WeeklyReviewCard } from "../components/ships/WeeklyReviewCard";
import type { Ship } from "../types";

export function ShipsPage() {
  const [inviteOpen, setInviteOpen] = useState(false);

  // My Ships derives from membership mock; map into the Ship shape for ShipCard.
  const myShips: Ship[] = SHIP_MEMBERSHIPS.map((membership) => ({
    id: membership.id,
    name: membership.name,
    blurb: membership.blurb,
    members: membership.members,
    privacy: "Invite Only",
    focus: membership.role,
  }));

  return (
    <ComingSoonOverlay>
    <div className="page ships-page">
      <header className="page-head">
        <h1>Ships</h1>
        <p className="page-subtitle">
          Sail with a crew that keeps you disciplined. Ships compare habits — rules
          followed, reviews done, risk kept — never profit.
        </p>
      </header>

      <section className="ships-section" aria-labelledby="my-ships-title">
        <div className="ships-section-head">
          <h2 id="my-ships-title">My Ships</h2>
          <button
            type="button"
            className="btn btn--small btn--primary"
            onClick={() => setInviteOpen(true)}
          >
            Invite a member
          </button>
        </div>
        <div className="ship-grid">
          {myShips.map((ship) => (
            <ShipCard key={ship.id} ship={ship} actionLabel="Open ship" />
          ))}
        </div>
      </section>

      <section className="ships-section" aria-labelledby="discover-title">
        <h2 id="discover-title" className="ships-section-title">
          Join a Ship
        </h2>
        <div className="ship-grid">
          {DISCOVER_SHIPS.map((ship) => (
            <ShipCard key={ship.id} ship={ship} actionLabel="Request to board" />
          ))}
        </div>
        <div className="ships-forms">
          <JoinShipForm />
          <CreateShipForm />
        </div>
      </section>

      <section className="ships-section" aria-labelledby="members-title">
        <h2 id="members-title" className="ships-section-title">
          Members · Iron Tide
        </h2>
        <div className="member-grid">
          {SHIP_MEMBERS.map((member) => (
            <MemberCard key={member.id} member={member} />
          ))}
        </div>
      </section>

      <div className="ships-grid">
        <ShipLeaderboardCard />
        <WeeklyReviewCard />
        <SharedLogCard />
        <ShipBadgeCard />
      </div>

      <ShipPrivacyNotice />

      <InviteMemberModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
    </ComingSoonOverlay>
  );
}
