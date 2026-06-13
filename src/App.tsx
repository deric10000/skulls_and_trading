function App() {
  const displayedText =
    "Jeff is a bitch and he has a small weener";

  return (
    <main className="app-shell">
      <section className="hero" aria-labelledby="hero-title">
        <p className="eyebrow">Skulls and Trading</p>
        <h1 id="hero-title">Hello World</h1>
        <p className="lede">
          Your React starter is ready, using Vite, TypeScript, and the latest stable React packages.
        </p>
        <div className="copy-slot" aria-label="Editable display text">
          <p className="copy-slot-text">{displayedText}</p>
        </div>
      </section>
    </main>
  );
}

export default App;
