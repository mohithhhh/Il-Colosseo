// Live research log, shown while a gladiator searches; cleared once their speech finishes.
export default function ResearchPanel({ research }) {
  if (!research) return null;
  const { queries, sources, wikipedia_anchor, claims } = research;
  const articles = (sources || []).filter((s) => !s.is_full_article);

  return (
    <div className="research">
      {queries?.map((q, i) => (
        <p key={i} className="research__query" style={{ animationDelay: `${i * 200}ms` }}>
          {i === 0 ? "Searching for " : "and "}“{q}”
        </p>
      ))}
      {(wikipedia_anchor || claims?.length > 0) && (
        <p className="research__meta">
          {[wikipedia_anchor && "Grounded in Wikipedia", claims?.length > 0 && `${claims.length} claims pulled from sources`]
            .filter(Boolean)
            .join(", ")}
        </p>
      )}
      {articles.length > 0 && (
        <ul>
          {articles.map((src, i) => (
            <li key={i} style={{ animationDelay: `${i * 250}ms` }}>Reading {src.title}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
