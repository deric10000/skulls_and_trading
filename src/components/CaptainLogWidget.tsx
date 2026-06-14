import { useEffect, useState } from "react";
import { useAppState } from "../state/AppState";

export function CaptainLogWidget() {
  const { selectedTicker, logsByTicker, addLog, updateLog, deleteLog } =
    useAppState();
  const entries = selectedTicker ? logsByTicker[selectedTicker] ?? [] : [];

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");

  // Reset the editor whenever the selected ticker changes.
  useEffect(() => {
    setIsOpen(false);
    setEditingId(null);
    setTitle("");
    setNote("");
  }, [selectedTicker]);

  function startAdd() {
    setEditingId(null);
    setTitle("");
    setNote("");
    setIsOpen(true);
  }

  function startEdit(id: string, currentTitle: string, currentNote: string) {
    setEditingId(id);
    setTitle(currentTitle);
    setNote(currentNote);
    setIsOpen(true);
  }

  function cancel() {
    setIsOpen(false);
    setEditingId(null);
    setTitle("");
    setNote("");
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedNote = note.trim();
    if (!trimmedTitle || !trimmedNote || !selectedTicker) return;

    if (editingId) {
      updateLog(selectedTicker, editingId, {
        title: trimmedTitle,
        note: trimmedNote,
      });
    } else {
      addLog(selectedTicker, { title: trimmedTitle, note: trimmedNote });
    }
    cancel();
  }

  return (
    <section className="panel captain-log" aria-labelledby="log-title">
      <div className="panel-head">
        <h2 id="log-title">Captain's Log</h2>
        <span className="panel-tag">{selectedTicker || "—"}</span>
      </div>

      {selectedTicker ? (
        <button type="button" className="btn btn--small" onClick={startAdd}>
          New note
        </button>
      ) : null}

      {isOpen ? (
        <form className="log-form" onSubmit={handleSubmit}>
          <label className="visually-hidden" htmlFor="log-title-input">
            Note title
          </label>
          <input
            id="log-title-input"
            className="input"
            placeholder="Title (e.g. Watching breakout setup)"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <label className="visually-hidden" htmlFor="log-note-input">
            Note
          </label>
          <textarea
            id="log-note-input"
            className="input log-textarea"
            placeholder="What changed, why it matters, and your next action."
            value={note}
            rows={3}
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="log-form-actions">
            <button
              type="submit"
              className="btn btn--small btn--primary"
              disabled={!title.trim() || !note.trim()}
            >
              {editingId ? "Save changes" : "Add note"}
            </button>
            <button type="button" className="btn btn--small btn--ghost" onClick={cancel}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {entries.length > 0 ? (
        <ul className="log-list">
          {entries.map((entry) => (
            <li key={entry.id} className="log-card">
              <div className="log-card-head">
                <span className="log-card-title">{entry.title}</span>
                <span className="log-timestamp">{entry.timestamp}</span>
              </div>
              {entry.strategy ? (
                <span className="chip log-strategy">{entry.strategy}</span>
              ) : null}
              <p className="log-card-note">{entry.note}</p>
              <div className="log-card-actions">
                <button
                  type="button"
                  className="log-action"
                  onClick={() => startEdit(entry.id, entry.title, entry.note)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="log-action log-action--danger"
                  onClick={() => deleteLog(selectedTicker, entry.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="log-empty">
          No log entry for <strong>{selectedTicker || "this ticker"}</strong> yet.
          Start the thesis: why you're watching, what would change your mind, and
          your next action.
        </p>
      )}
    </section>
  );
}
