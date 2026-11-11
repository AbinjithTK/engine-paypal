import { Brain } from "lucide-react";

import { FeaturePlaceholder } from "@/components/feature-placeholder";

export default function BrainPage() {
  return (
    <FeaturePlaceholder
      icon={Brain}
      title="Brain"
      line="Add what your company is, who it's for, and how it sounds. Every brief after this writes itself."
      action="Add context"
    />
  );
}
