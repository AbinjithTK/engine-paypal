"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useEngine } from "../_ui/use-engine";

export default function Unlock() {
  const { post, toast } = useEngine();
  const router = useRouter();
  const [key, setKey] = useState("");

  return (
    <div style={{ maxWidth: 520 }}>
      <p className="label">Owner access</p>
      <h1 className="h1">
        Unlock the <em>owner</em> controls
      </h1>
      <p className="soft" style={{ marginBottom: 18 }}>
        Funding, signing off and changing the Brain need the owner key for this deployment.
      </p>
      <form
        className="card pad stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await post("/api/engine/unlock", { key });
          if (r) {
            toast("Unlocked.");
            router.push("/app");
          }
        }}
      >
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Owner key" placeholder="Owner key" autoFocus />
        <div>
          <button className="btn p" disabled={!key}>
            Unlock
          </button>
        </div>
      </form>
    </div>
  );
}
