import { useEffect, useState } from "react";

interface Listing {
  id: string;
  name: string;
  description: string;
  author: string;
  category: string;
  tags: string[];
  install_count: number;
  rating: number;
  review: string;
}

export function Marketplace() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    async function fetchListings() {
      const token = localStorage.getItem("ALPHA_token");
      if (!token) { window.location.href = "/login"; return; }
      try {
        const resp = await fetch("/v1/marketplace", { headers: { Authorization: `Bearer ${token}` } });
        if (resp.ok) {
          const data = await resp.json();
          setListings(data.listings ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchListings();
  }, []);

  const filtered = filter
    ? listings.filter((l) =>
        l.name.toLowerCase().includes(filter.toLowerCase()) ||
        l.description.toLowerCase().includes(filter.toLowerCase()) ||
        l.tags.some((t) => t.toLowerCase().includes(filter.toLowerCase())),
      )
    : listings;

  if (loading) return <div className="muted">Loading...</div>;

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>Skills Marketplace</h1>
      <div className="card">
        <input
          type="text"
          placeholder="Search skills..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="grid">
        {filtered.map((listing) => (
          <div key={listing.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <h2>{listing.name}</h2>
              <span style={{
                padding: "0.25rem 0.5rem",
                borderRadius: "4px",
                fontSize: "0.75rem",
                background: listing.review === "verified" ? "#238636" : listing.review === "reviewed" ? "#1f6feb" : "var(--border)",
                color: "white",
              }}>{listing.review}</span>
            </div>
            <p className="muted" style={{ fontSize: "0.875rem", margin: "0.5rem 0" }}>by {listing.author}</p>
            <p style={{ fontSize: "0.875rem", margin: "0.5rem 0 1rem" }}>{listing.description}</p>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
              {listing.tags.map((tag) => (
                <span key={tag} style={{
                  padding: "0.125rem 0.5rem",
                  borderRadius: "4px",
                  fontSize: "0.75rem",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                }}>{tag}</span>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="muted" style={{ fontSize: "0.8125rem" }}>
                {listing.install_count} installs · ★ {listing.rating}
              </span>
              <button className="btn btn-secondary">Install</button>
            </div>
          </div>
        ))}
      </div>
      {filtered.length === 0 && !loading && (
        <div className="card" style={{ textAlign: "center" }}>
          <p className="muted">No skills found. Try a different search.</p>
        </div>
      )}
    </div>
  );
}
