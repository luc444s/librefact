import type { PluginFrontendContext, PluginFrontendRegistration } from "@systutor/sdk/frontend";
import { PurchaseOrdersPage } from "./pages/PurchaseOrdersPage";
import { InvoicesPage } from "./pages/purchase/InvoicesPage";
import { ClaimsPage } from "./pages/purchase/ClaimsPage";
import { ReturnsPage } from "./pages/purchase/ReturnsPage";

export function registerPlugin(ctx: PluginFrontendContext): PluginFrontendRegistration {
  return {
    pluginId: "compras",
    routes: [
      {
        path: "commerce/purchase-orders",
        title: "Compras",
        component: PurchaseOrdersPage,
        requiredPermissions: ["compras.order.read"],
      },
      {
        path: "commerce/purchase-orders/facturas",
        title: "Facturas de proveedor",
        component: InvoicesPage,
        requiredPermissions: ["compras.order.read"],
      },
      {
        path: "commerce/purchase-orders/reclamaciones",
        title: "Reclamaciones al proveedor",
        component: ClaimsPage,
        requiredPermissions: ["compras.order.read"],
      },
      {
        path: "commerce/purchase-orders/devoluciones",
        title: "Devoluciones al proveedor",
        component: ReturnsPage,
        requiredPermissions: ["compras.order.read"],
      },
    ],
    navigation: [
      {
        to: `${ctx.appBasePath}/commerce/purchase-orders`,
        label: "Compras",
        requiredPermissions: ["compras.order.read"],
        group: "Gestión Comercial",
      },
    ],
    widgets: [],
  };
}
