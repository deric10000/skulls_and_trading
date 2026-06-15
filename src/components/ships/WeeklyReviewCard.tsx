import { WEEKLY_REVIEW } from "../../data";

export function WeeklyReviewCard() {
  const open = WEEKLY_REVIEW.filter((item) => item.status === "Open").length;

  return (
    <section className="panel weekly-review" aria-labelledby="weekly-review-title">
      <div className="panel-head">
        <h2 id="weekly-review-title">Weekly Review</h2>
        <span className="panel-tag">{open} open</span>
      </div>
      <ul className="weekly-review-list">
        {WEEKLY_REVIEW.map((item) => (
          <li key={item.id} className="weekly-review-item">
            <span
              className={
                item.status === "Submitted"
                  ? "weekly-review-status weekly-review-status--done"
                  : "weekly-review-status"
              }
              aria-hidden="true"
            />
            <span className="weekly-review-prompt">{item.prompt}</span>
            <span className="weekly-review-tag">{item.status}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
