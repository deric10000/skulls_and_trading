export function ShipPrivacyNotice() {
  return (
    <section className="panel ship-privacy" aria-labelledby="ship-privacy-title">
      <div className="panel-head">
        <h2 id="ship-privacy-title">Crew Privacy</h2>
        <span className="chip status--positive">Private by default</span>
      </div>
      <p>
        You control what your crew can see. Portfolio values, holdings, broker data,
        and trade size stay private unless you choose to share them. Ships rank
        discipline and habits — never profit.
      </p>
    </section>
  );
}
