import { useQuery } from "../../../../../../apps/web/src/lib/react-query";
import { useEffect, useRef, useState } from "react";

import { Link } from "../../../../../../apps/web/src/lib/router";
import { Alert } from "@systutor/shell/ui/alert";
import { Button } from "@systutor/shell/ui/button";
import { CommerceSection } from "../../../../frontend/components";
import { listAllProducts } from "../../../../../productos/frontend/api";
import { InvoicePanel, type InvoicePanelHandle } from "./InvoicePanel";

export function InvoicesPage() {
  const invoiceRef = useRef<InvoicePanelHandle>(null);
  const [error, setError] = useState<string | null>(null);
  const productsQuery = useQuery({
    queryKey: ["productos", "all-active"],
    queryFn: () => listAllProducts({ is_active: true }),
  });
  const products = productsQuery.data ?? [];
  const orderId = new URLSearchParams(window.location.search).get("orderId");

  useEffect(() => {
    if (!orderId) return;
    invoiceRef.current?.openInvoicesDialog(orderId);
  }, [orderId]);

  return (
    <>
      <CommerceSection
        title="Facturas de proveedor"
        description="Entrada dedicada para registrar facturas y conciliarlas por orden."
        actions={
          <Link to="/app/commerce/purchase-orders">
            <Button variant="secondary">Volver a órdenes</Button>
          </Link>
        }
      >
        {!orderId ? <Alert title="Selecciona una orden">Abre esta pantalla desde Órdenes de compra.</Alert> : null}
        {error ? <Alert title="Error">{error}</Alert> : null}
      </CommerceSection>

      <InvoicePanel ref={invoiceRef} setError={setError} products={products} />
    </>
  );
}
