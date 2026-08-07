import { useEffect, useState } from "react";

interface Plan {
  id: string;
  name: string;
  price: number;
  features: string[];
}

export function Billing() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currentPlan, setCurrentPlan] = useState<string>("free");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPlans() {
      const token = localStorage.getItem("alpha_token");
      if (!token) { window.location.href = "/login"; return; }
      try {
        const resp = await fetch("/v1/billing/plans", { headers: { Authorization: `Bearer ${token}` } });
        if (resp.ok) {
          const data = await resp.json();
          setPlans(data.plans ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchPlans();
  }, []);

  async function upgrade(planId: string) {
    const token = localStorage.getItem("alpha_token");
    const resp = await fetch("/v1/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ plan: planId }),
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.url) window.location.href = data.url;
    }
  }

  if (loading) return <div className="muted">Loading...</div>;

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>Billing</h1>
      <div className="card">
        <h2>Current Plan</h2>
        <p style={{ fontSize: "1.25rem", fontWeight: 600, textTransform: "capitalize" }}>{currentPlan}</p>
      </div>
      <div className="grid">
        {plans.map((plan) => (
          <div key={plan.id} className="card">
            <h2>{plan.name}</h2>
            <div style={{ fontSize: "2rem", fontWeight: 700, margin: "0.5rem 0" }}>
              ${plan.price}<span className="muted" style={{ fontSize: "0.875rem" }}>/mo</span>
            </div>
            <ul style={{ listStyle: "none", margin: "1rem 0", padding: 0 }}>
              {plan.features.map((f, i) => (
                <li key={i} style={{ padding: "0.25rem 0", fontSize: "0.875rem" }}>✓ {f}</li>
              ))}
            </ul>
            {plan.id === currentPlan ? (
              <button className="btn btn-secondary" disabled>Current Plan</button>
            ) : (
              <button className="btn" onClick={() => upgrade(plan.id)}>Upgrade to {plan.name}</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
