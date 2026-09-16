import { useQuery } from "../../../../../../apps/web/src/lib/react-query";
import { useEffect, useRef, useState } from "react";

import { Link } from "../../../../../../apps/web/src/lib/router";
import { Alert } from "@systutor/shell/ui/alert";
import { Button } from "@systutor/shell/ui/button";
import { CommerceSection } from "../../../../frontend/components";
import { listAllProducts } from "../../../../../productos/frontend/api";
import {
  MerchandiseReturnDialog,
  type MerchandiseReturnDialogHandle,
} from "./MerchandiseReturnDialog";

export function ReturnsPage() {
  const returnsRef = useRef<MerchandiseReturnDialogHandle>(null);
  const [error, setError] = useState<string | null>(null);
  const productsQuery = useQuery({
    queryKey: ["productos", "all-active"],
    queryFn: () => listAllProducts({ is_active: true }),
  });
  const products = productsQuery.data ?? [];
  const orderId = new URLSearchParams(window.location.search).get("orderId");

  useEffect(() => {
    if (!orderId) return;
    returnsRef.current?.openReturnsDialog(orderId);
  }, [orderId]);

  return (
    <>
      <CommerceSection
        title="Devoluciones al proveedor"
        description="Entrada dedicada para registrar devoluciones por orden."
        actions={
          <Link to="/app/commerce/purchase-orders">
            <Button variant="secondary">Volver a órdenes</Button>
          </Link>
        }
      >
        {!orderId ? <Alert title="Selecciona una orden">Abre esta pantalla desde Órdenes de compra.</Alert> : null}
        {error ? <Alert title="Error">{error}</Alert> : null}
      </CommerceSection>

      <MerchandiseReturnDialog ref={returnsRef} products={products} />
    </>
  );
}
