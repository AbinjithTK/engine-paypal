import { Wallet } from "lucide-react";

import { FeaturePlaceholder } from "@/components/feature-placeholder";

export default function MoneyPage() {
  return (
    <FeaturePlaceholder
      icon={Wallet}
      title="Money"
      line="Invoices generate from finished tasks. Payments settle in USDC the moment work passes."
      action="Connect a wallet"
    />
  );
}
