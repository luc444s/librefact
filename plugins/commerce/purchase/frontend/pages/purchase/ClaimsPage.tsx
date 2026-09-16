import { useEffect, useRef, useState } from "react";

import { Link } from "../../../../../../apps/web/src/lib/router";
import { Alert } from "@systutor/shell/ui/alert";
import { Button } from "@systutor/shell/ui/button";
import { CommerceSection } from "../../../../frontend/components";
import { ClaimsPanel, type ClaimsPanelHandle } from "./ClaimsPanel";

export function ClaimsPage() {
  const claimsRef = useRef<ClaimsPanelHandle>(null);
  const [error, setError] = useState<string | null>(null);
  const orderId = new URLSearchParams(window.location.search).get("orderId");

  useEffect(() => {
    if (!orderId) return;
    claimsRef.current?.openClaimsDialog(orderId);
  }, [orderId]);

  return (
    <>
      <CommerceSection
        title="Reclamaciones al proveedor"
        description="Entrada dedicada para registrar y seguir reclamaciones por orden."
        actions={
          <Link to="/app/commerce/purchase-orders">
            <Button variant="secondary">Volver a órdenes</Button>
          </Link>
        }
      >
        {!orderId ? <Alert title="Selecciona una orden">Abre esta pantalla desde Órdenes de compra.</Alert> : null}
        {error ? <Alert title="Error">{error}</Alert> : null}
      </CommerceSection>

      <ClaimsPanel ref={claimsRef} setError={setError} />
    </>
  );
}
